"use strict";

/**
 * Lumiform Colorpicker — Photoshop UXP host.
 *
 * The renderer is a Three.js WebGL app, and UXP panels do not expose WebGL.
 * The panel therefore hosts the built web app inside a local UXP WebView and
 * relays its color requests to Photoshop through the Photoshop DOM.
 *
 * Protocol (see src/bridge/WebViewPhotoshopBridge.ts):
 *   web  -> host : ready | set-foreground | get-foreground | open-url
 *   host -> web  : status | foreground | error
 */

const WEB_SOURCE = "lumiform-web";
const HOST_SOURCE = "lumiform-host";
const POLL_INTERVAL_MS = 900;

let webview = null;
let loadingOverlay = null;
let errorOverlay = null;
let errorTitle = null;
let errorMessage = null;
let reloadButton = null;

let photoshopApp = null;
let photoshopCore = null;
let SolidColor = null;
let hostReady = false;

let lastObservedHex = "";
let queuedColor = null;
let writeInFlight = false;
let pollTimer = null;
let lastWriteAt = 0;
let lastStatusConnected = null;

function log(...args) {
  console.log("[Lumiform]", ...args);
}

function clampChannel(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(255, Math.round(number)));
}

function normalizeRgb(rgb) {
  if (!rgb || typeof rgb !== "object") return null;
  return {
    r: clampChannel(rgb.r),
    g: clampChannel(rgb.g),
    b: clampChannel(rgb.b),
  };
}

function rgbToHex(rgb) {
  const toHex = (value) => clampChannel(value).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
}

function send(message) {
  if (!webview) return;
  try {
    webview.postMessage({ source: HOST_SOURCE, ...message });
  } catch (error) {
    log("Failed to post message to the WebView:", error);
  }
}

function sendStatus(status, connected) {
  lastStatusConnected = connected;
  send({ type: "status", status, connected });
}

function sendError(message) {
  send({ type: "error", message });
  log("Error:", message);
}

/**
 * Opens an external link in the system browser. WebView `window.open` is not
 * reliable, so every external link is relayed here (D22). Only https is
 * accepted, both here and in the web bridge.
 */
async function openExternalUrl(url) {
  try {
    const uxp = require("uxp");
    await uxp.shell.openExternal(url);
  } catch (error) {
    sendError(`Could not open the link: ${error.message || error}`);
  }
}

function showLoading() {
  if (loadingOverlay) loadingOverlay.classList.remove("hidden");
  if (errorOverlay) errorOverlay.classList.add("hidden");
}

function hideLoading() {
  if (loadingOverlay) loadingOverlay.classList.add("hidden");
}

function showError(title, message) {
  hideLoading();
  if (errorOverlay) errorOverlay.classList.remove("hidden");
  if (errorTitle) errorTitle.textContent = title;
  if (errorMessage) errorMessage.textContent = message;
}

function readForegroundColor() {
  if (!photoshopApp) return null;
  const color = photoshopApp.foregroundColor;
  if (!color || !color.rgb) return null;

  return {
    r: clampChannel(color.rgb.red),
    g: clampChannel(color.rgb.green),
    b: clampChannel(color.rgb.blue),
  };
}

async function writeForegroundColor(rgb) {
  if (!photoshopApp || !SolidColor) {
    throw new Error("Photoshop API is unavailable");
  }

  const apply = () => {
    const color = new SolidColor();
    color.rgb.red = clampChannel(rgb.r);
    color.rgb.green = clampChannel(rgb.g);
    color.rgb.blue = clampChannel(rgb.b);
    photoshopApp.foregroundColor = color;
  };

  try {
    apply();
  } catch (error) {
    // Some Photoshop builds gate the color setter behind the modal scope.
    // Prefer the direct property write (fast, no progress UI) and only fall
    // back to a modal command when the runtime demands it.
    if (!photoshopCore || typeof photoshopCore.executeAsModal !== "function") {
      throw error;
    }
    await photoshopCore.executeAsModal(apply, {
      commandName: "Set Lumiform foreground color",
    });
  }
}

/**
 * Coalesces rapid eyedropper samples into one Photoshop write at a time.
 * Without this, dragging the color target would queue dozens of writes and
 * make the brush color lag behind the cursor.
 */
async function flushColorQueue() {
  if (writeInFlight) return;
  writeInFlight = true;

  try {
    while (queuedColor) {
      const rgb = queuedColor;
      queuedColor = null;
      await writeForegroundColor(rgb);
      lastWriteAt = Date.now();
      lastObservedHex = rgbToHex(rgb);
      if (lastStatusConnected === false) {
        sendStatus("Connected to Photoshop", true);
      }
      send({ type: "foreground", rgb, hex: lastObservedHex });
    }
  } catch (error) {
    sendStatus("Photoshop rejected the color update", false);
    sendError(`Could not update the Photoshop foreground color: ${error.message || error}`);
  } finally {
    writeInFlight = false;
    if (queuedColor) void flushColorQueue();
  }
}

function queueColor(rgb) {
  const normalized = normalizeRgb(rgb);
  if (!normalized) return;
  queuedColor = normalized;
  void flushColorQueue();
}

function broadcastForeground(rgb, requestId) {
  if (!rgb) return;
  const hex = rgbToHex(rgb);
  lastObservedHex = hex;
  send({ type: "foreground", rgb, hex, requestId });
}

function pollForeground() {
  // Do not read while a write is pending: a stale read could overwrite the
  // color the user just picked in the panel.
  if (writeInFlight || queuedColor) return;
  if (Date.now() - lastWriteAt < 250) return;

  try {
    const rgb = readForegroundColor();
    if (!rgb) return;
    const hex = rgbToHex(rgb);
    if (hex !== lastObservedHex) {
      lastObservedHex = hex;
      send({ type: "foreground", rgb, hex });
    }
  } catch (error) {
    log("Foreground poll failed:", error);
  }
}

function startPolling() {
  if (pollTimer !== null) return;
  pollTimer = setInterval(pollForeground, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer === null) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

function announceReady() {
  if (!hostReady) {
    hostReady = true;
    hideLoading();
    log("WebView bridge ready");
  }

  if (!photoshopApp) {
    sendStatus("Photoshop API unavailable", false);
    return;
  }

  sendStatus("Connected to Photoshop", true);

  try {
    broadcastForeground(readForegroundColor());
  } catch (error) {
    sendError(`Could not read the Photoshop foreground color: ${error.message || error}`);
  }
}

function handleWebMessage(event) {
  // UXP reports the originating WebView as event.source. Be permissive when
  // the runtime omits it, but never accept messages from another source.
  if (event.source && event.source !== webview) return;

  const data = event.data;
  if (!data || data.source !== WEB_SOURCE) return;

  if (data.type === "ready") {
    announceReady();
    return;
  }

  if (data.type === "set-foreground") {
    queueColor(data.rgb);
    return;
  }

  if (data.type === "get-foreground") {
    try {
      broadcastForeground(readForegroundColor(), data.requestId);
    } catch (error) {
      sendError(`Could not read the Photoshop foreground color: ${error.message || error}`);
    }
    return;
  }

  if (data.type === "open-url") {
    const url = typeof data.url === "string" ? data.url : "";
    if (!/^https:\/\//i.test(url)) {
      sendError("Refused to open a non-https URL.");
      return;
    }
    void openExternalUrl(url);
  }
}

function bindView() {
  webview = document.getElementById("lumiformView");
  loadingOverlay = document.getElementById("loadingOverlay");
  errorOverlay = document.getElementById("errorOverlay");
  errorTitle = document.getElementById("errorTitle");
  errorMessage = document.getElementById("errorMessage");
  reloadButton = document.getElementById("reloadButton");

  if (!webview) {
    log("Fatal: the WebView element is missing from index.html");
    return;
  }

  webview.addEventListener("loadstart", () => {
    log("WebView load started");
    hostReady = false;
    showLoading();
  });

  webview.addEventListener("loadstop", () => {
    log("WebView document loaded");
    // The app also sends a ready message; this fallback covers a missed
    // handshake without hiding a genuine load error.
    window.setTimeout(() => {
      if (!hostReady) {
        announceReady();
      }
    }, 500);
  });

  webview.addEventListener("loaderror", (event) => {
    const message = `The local Lumiform page failed to load (${event.code}): ${event.message}`;
    log(message, event.url || "");
    showError("Lumiform could not load", message);
  });

  if (reloadButton) {
    reloadButton.addEventListener("click", () => {
      hostReady = false;
      showLoading();
      if (!photoshopApp) {
        connectPhotoshop();
      }
      webview.src = `plugin:/web/index.html?reload=${Date.now()}`;
    });
  }

  window.addEventListener("message", handleWebMessage);
  window.addEventListener("unload", stopPolling);

  // If the WebView never reports in, do not leave the panel covered forever.
  window.setTimeout(() => {
    if (!hostReady) hideLoading();
  }, 6000);
}

function connectPhotoshop() {
  try {
    const photoshop = require("photoshop");
    photoshopApp = photoshop.app;
    photoshopCore = photoshop.core;
    SolidColor = photoshop.app.SolidColor;
    log("Photoshop DOM connected");
    startPolling();
  } catch (error) {
    const message =
      "Lumiform must be opened from Photoshop's Plugins menu. The Photoshop API is not available in this context.";
    log(message, error);
    showError("Photoshop API unavailable", message);
  }
}

function init() {
  bindView();
  connectPhotoshop();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
