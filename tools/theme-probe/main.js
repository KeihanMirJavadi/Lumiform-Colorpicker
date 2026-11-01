"use strict";

/**
 * Lumiform theme probe - temporary UXP panel for Stage 4 task 4.1.
 *
 * Purpose: find out what Photoshop actually reports before the V1.2 reskin is
 * written. The probe reads three independent sources and never writes to
 * Photoshop:
 *
 *   1. `document.theme` - `getCurrent()` plus `onUpdated` live changes. This
 *      API is not documented for Photoshop, so every access is guarded.
 *   2. `--uxp-host-*` custom properties - the host palette that UXP exposes to
 *      plugin panels.
 *   3. `app.appSkinInfo` - the Photoshop DOM's own skin colours, used as a
 *      cross-check for the host variables.
 *
 * The probe is a throwaway diagnostic. It is not part of the shipped panel and
 * shares no code with it.
 */

const PROBE_VERSION = "1.0.0";
const HOST_VAR_PREFIX = "--uxp-host-";
const MAX_EVENTS = 24;
const POLL_INTERVAL_MS = 1200;

/**
 * Seeds for the variable scan. The host only exposes a handful, and the exact
 * set differs per Photoshop build, so the probe seeds known names and then
 * adds everything else it finds in the host stylesheets. Empty values are
 * dropped from the report.
 */
const CANDIDATE_VARS = [
  "--uxp-host-background-color",
  "--uxp-host-text-color",
  "--uxp-host-border-color",
  "--uxp-host-label-text-color",
  "--uxp-host-link-text-color",
  "--uxp-host-highlight-color",
  "--uxp-host-disabled-text-color",
  "--uxp-host-widget-background-color",
  "--uxp-host-widget-text-color",
  "--uxp-host-widget-border-color",
  "--uxp-host-statusbar-background-color",
  "--uxp-host-statusbar-text-color",
  "--uxp-host-toolbar-background-color",
  "--uxp-host-appbar-background-color",
];

/**
 * `Object.keys()` on the native `appSkinInfo` object can return nothing, so
 * these names are always probed as well.
 */
const SKIN_CANDIDATES = [
  "appBarBackgroundColor",
  "baseBackgroundColor",
  "inactivePanelBackgroundColor",
  "panelBackgroundColor",
  "panelBorderColor",
  "panelTitleColor",
  "panelTitleTextColor",
];

const state = {
  theme: null,
  themeSource: "checking…",
  apiSummary: "unknown",
  listenerKind: "none",
  listenerAttached: false,
  apiError: null,
  subscribeError: null,
  requireError: null,
  hostVariables: [],
  styleSheetCount: 0,
  skin: { available: false, rows: [], error: null },
  environment: [],
  events: [],
  updateCount: 0,
  defaultHint: "",
};

const dom = {};

/* ------------------------------------------------------------------ helpers */

function messageOf(error) {
  if (!error) return "unknown error";
  return error.message ? String(error.message) : String(error);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function nowTime() {
  const now = new Date();
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
}

function toHex(red, green, blue) {
  const channel = (value) => {
    const number = Math.max(0, Math.min(255, Math.round(Number(value))));
    return number.toString(16).padStart(2, "0");
  };
  return `#${channel(red)}${channel(green)}${channel(blue)}`.toUpperCase();
}

/**
 * Parses `#rgb`, `#rrggbb`, `rgb()` and `rgba()` strings into uppercase hex.
 * Fully transparent colours return null so the report never claims a colour
 * the host did not actually expose.
 */
function hexFromCssText(text) {
  if (typeof text !== "string") return null;
  const value = text.trim();
  if (!value) return null;

  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  if (short) {
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase();
  }

  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (long) {
    return `#${long[1]}${long[2]}${long[3]}`.toUpperCase();
  }

  const rgb = /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)$/i.exec(value);
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
    if (!Number.isFinite(alpha) || alpha <= 0) return null;
    return toHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
  }

  return null;
}

/**
 * Extracts a colour from a Photoshop colour object without assuming a single
 * shape: UXP has returned both `{ rgb: { red, green, blue } }` and flat
 * `{ red, green, blue }` objects across versions.
 */
function colorFromObject(value) {
  if (!value || typeof value !== "object") return null;

  const candidates = [value.rgb, value].filter((entry) => entry && typeof entry === "object");
  for (const source of candidates) {
    const red = source.red !== undefined ? source.red : source.r;
    const green = source.green !== undefined ? source.green : source.g;
    const blue = source.blue !== undefined ? source.blue : source.b;
    if (
      typeof red === "number" &&
      typeof green === "number" &&
      typeof blue === "number" &&
      Number.isFinite(red) &&
      Number.isFinite(green) &&
      Number.isFinite(blue)
    ) {
      return {
        hex: toHex(red, green, blue),
        rgbText: `rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)})`,
      };
    }
  }

  if (typeof value.hex === "string") {
    const hex = hexFromCssText(value.hex);
    if (hex) return { hex, rgbText: value.hex };
  }

  return null;
}

function describeValue(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  const type = typeof value;
  if (type === "string") return value;
  if (type === "number" || type === "boolean") return String(value);

  const color = colorFromObject(value);
  if (color) return color.hex;

  try {
    const json = JSON.stringify(value);
    if (json && json !== "{}") {
      return json.length > 42 ? `${json.slice(0, 39)}…` : json;
    }
  } catch (error) {
    // Circular native objects fall through to the key listing.
  }

  try {
    const keys = Object.keys(value);
    return keys.length > 0 ? `{${keys.slice(0, 5).join(", ")}}` : "object";
  } catch (error) {
    return Object.prototype.toString.call(value);
  }
}

/* ---------------------------------------------------------------- host APIs */

function getThemeApi() {
  try {
    const api = document.theme || null;
    state.apiError = null;
    return api;
  } catch (error) {
    state.apiError = `document.theme threw: ${messageOf(error)}`;
    return null;
  }
}

function getPhotoshop() {
  try {
    const photoshop = require("photoshop");
    state.requireError = null;
    return photoshop;
  } catch (error) {
    state.requireError = `require("photoshop") failed: ${messageOf(error)}`;
    return null;
  }
}

function normalizeTheme(value) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";

  const keys = ["theme", "colorTheme", "newTheme", "current", "value", "color"];
  for (const key of keys) {
    if (typeof value[key] === "string" && value[key].trim()) {
      return value[key].trim();
    }
  }
  return "";
}

function describePayload(payload) {
  const theme = normalizeTheme(payload);
  if (theme) return theme;

  if (typeof payload === "string") return payload;
  try {
    const json = JSON.stringify(payload);
    if (json && json !== "{}") return json.length > 32 ? `${json.slice(0, 29)}…` : json;
  } catch (error) {
    // Ignore and fall back to a plain string conversion.
  }
  return String(payload);
}

function describeThemeApi(api) {
  if (!api) return "document.theme missing";
  const parts = [];
  parts.push(`getCurrent:${typeof api.getCurrent}`);
  if (api.onUpdated) {
    const bus = api.onUpdated;
    if (typeof bus.addListener === "function") parts.push("onUpdated.addListener");
    else if (typeof bus.add === "function") parts.push("onUpdated.add");
    else if (typeof bus.on === "function") parts.push("onUpdated.on");
    else parts.push(`onUpdated:${typeof bus}`);
  } else {
    parts.push("onUpdated:missing");
  }
  return parts.join(" ");
}

/* ------------------------------------------------------------------- theme */

function readTheme(api) {
  if (!api) {
    return { theme: null, source: "document.theme missing" };
  }

  if (typeof api.getCurrent === "function") {
    try {
      const value = api.getCurrent();
      const theme = normalizeTheme(value);
      return {
        theme,
        source: theme ? "getCurrent()" : `getCurrent() -> ${describePayload(value)}`,
      };
    } catch (error) {
      return { theme: null, source: `getCurrent() threw: ${messageOf(error)}` };
    }
  }

  if (typeof api.getCurrent === "string" && api.getCurrent.trim()) {
    return { theme: api.getCurrent.trim(), source: "getCurrent property" };
  }

  let keys = "";
  try {
    keys = Object.keys(api).join(", ");
  } catch (error) {
    keys = "unreadable";
  }
  return { theme: null, source: `no getCurrent (keys: ${keys || "none"})` };
}

function recordEvent(value, kind) {
  state.events.unshift({ at: nowTime(), value: String(value), kind });
  state.events = state.events.slice(0, MAX_EVENTS);
}

function handleThemeUpdate(payload) {
  const theme = normalizeTheme(payload);
  state.updateCount += 1;
  recordEvent(theme || describePayload(payload), "live");
  if (theme) state.theme = theme;

  // A live event is the strongest signal: refresh everything so the palette
  // snapshot belongs to the new theme.
  refresh("onUpdated");
  renderEvents();
}

/**
 * Attaches the live listener once. `addListener` is the documented UXP event
 * shape; `add`/`on` and a bare callable are accepted because the API is
 * undocumented for Photoshop and has changed shape before.
 */
function ensureListener(api) {
  if (state.listenerAttached) return;
  if (!api) return;

  const bus = api.onUpdated;
  if (!bus) {
    state.listenerKind = "onUpdated missing";
    return;
  }

  try {
    if (typeof bus.addListener === "function") {
      bus.addListener(handleThemeUpdate);
      state.listenerKind = "onUpdated.addListener";
    } else if (typeof bus.add === "function") {
      bus.add(handleThemeUpdate);
      state.listenerKind = "onUpdated.add";
    } else if (typeof bus.on === "function") {
      bus.on(handleThemeUpdate);
      state.listenerKind = "onUpdated.on";
    } else if (typeof bus === "function") {
      bus(handleThemeUpdate);
      state.listenerKind = "onUpdated()";
    } else {
      state.listenerKind = `onUpdated unusable:${typeof bus}`;
      return;
    }
    state.listenerAttached = true;
    state.subscribeError = null;
  } catch (error) {
    state.subscribeError = `Could not subscribe: ${messageOf(error)}`;
  }
}

/**
 * Safety net for builds where `onUpdated` never fires: poll `getCurrent()` and
 * treat a changed value as a change event.
 */
function pollTheme() {
  const api = getThemeApi();
  ensureListener(api);

  const read = readTheme(api);
  state.themeSource = read.source;
  if (!read.theme) return;
  if (read.theme === state.theme) return;

  state.theme = read.theme;
  state.updateCount += 1;
  recordEvent(read.theme, "poll");
  refresh("poll");
  renderEvents();
}

/* -------------------------------------------------------------- host colours */

function collectDeclarationNames(declaration, names) {
  if (!declaration) return;
  try {
    for (let index = 0; index < declaration.length; index += 1) {
      const property = declaration.item ? declaration.item(index) : declaration[index];
      if (typeof property === "string" && property.indexOf(HOST_VAR_PREFIX) === 0) {
        names.add(property);
      }
    }
  } catch (error) {
    // A native declaration can reject enumeration; skip it.
  }
}

function walkRules(rules, names, depth) {
  if (!rules || depth > 6) return;
  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    if (!rule) continue;
    try {
      if (rule.style) collectDeclarationNames(rule.style, names);
      if (rule.cssRules) walkRules(rule.cssRules, names, depth + 1);
    } catch (error) {
      // Ignore a rule that cannot be read.
    }
  }
}

function collectHostVariableNames() {
  const names = new Set(CANDIDATE_VARS);

  try {
    if (document.documentElement && document.documentElement.style) {
      collectDeclarationNames(document.documentElement.style, names);
    }
  } catch (error) {
    // Ignore.
  }

  try {
    if (document.body && document.body.style) {
      collectDeclarationNames(document.body.style, names);
    }
  } catch (error) {
    // Ignore.
  }

  let sheetsSeen = 0;
  try {
    const sheets = document.styleSheets;
    for (let index = 0; sheets && index < sheets.length; index += 1) {
      try {
        const rules = sheets[index].cssRules;
        if (!rules) continue;
        sheetsSeen += 1;
        walkRules(rules, names, 0);
      } catch (error) {
        // Cross-origin or host-owned sheet: not enumerable.
      }
    }
  } catch (error) {
    // No styleSheets collection in this runtime.
  }

  state.styleSheetCount = sheetsSeen;
  return names;
}

function readCustomProperty(name, declarations) {
  for (const declaration of declarations) {
    try {
      const value = declaration.getPropertyValue(name);
      if (value && value.trim()) return value.trim();
    } catch (error) {
      // Ignore this declaration and try the next.
    }
  }
  return "";
}

/**
 * Resolves any CSS colour expression (including `var(...)` and system colour
 * keywords) through a hidden element, so the probe reports the colour the host
 * actually paints rather than the raw token.
 */
function resolveColor(raw) {
  const direct = hexFromCssText(raw);
  if (direct) return direct;
  if (!document.body) return null;

  const canvas = document.createElement("div");
  canvas.style.display = "none";
  try {
    canvas.style.backgroundColor = raw;
    document.body.appendChild(canvas);
    const computed = getComputedStyle(canvas).backgroundColor;
    return hexFromCssText(computed);
  } catch (error) {
    return null;
  } finally {
    try {
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    } catch (error) {
      // Ignore cleanup failures.
    }
  }
}

function readHostVariables() {
  const names = collectHostVariableNames();
  const declarations = [];
  try {
    declarations.push(getComputedStyle(document.documentElement));
  } catch (error) {
    // Ignore.
  }
  try {
    declarations.push(getComputedStyle(document.body));
  } catch (error) {
    // Ignore.
  }

  const rows = [];
  names.forEach((name) => {
    const raw = readCustomProperty(name, declarations);
    if (!raw) return;
    rows.push({
      name,
      raw,
      hex: resolveColor(raw),
    });
  });

  rows.sort((left, right) => left.name.localeCompare(right.name));
  return rows;
}

/* ------------------------------------------------------------- host skin info */

function readSkinInfo() {
  const photoshop = getPhotoshop();
  let info = null;

  try {
    info = photoshop && photoshop.app ? photoshop.app.appSkinInfo : null;
  } catch (error) {
    return { available: false, rows: [], error: `appSkinInfo threw: ${messageOf(error)}` };
  }

  if (!info) {
    return { available: false, rows: [], error: null };
  }

  const names = new Set(SKIN_CANDIDATES);
  try {
    Object.keys(info).forEach((key) => names.add(key));
  } catch (error) {
    // Native objects can refuse enumeration; the seed list still applies.
  }

  const rows = [];
  names.forEach((name) => {
    let value;
    try {
      value = info[name];
    } catch (error) {
      rows.push({ name, value: "unreadable", hex: null });
      return;
    }
    if (value === undefined) return;

    const color = colorFromObject(value);
    rows.push({
      name,
      value: color ? color.hex : describeValue(value),
      hex: color ? color.hex : null,
    });
  });

  rows.sort((left, right) => left.name.localeCompare(right.name));
  return { available: rows.length > 0, rows, error: null };
}

/* -------------------------------------------------------------- environment */

function readColorScheme() {
  try {
    if (typeof window.matchMedia !== "function") return "matchMedia missing";
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
    return "unspecified";
  } catch (error) {
    return "error";
  }
}

function readUxpVersion() {
  try {
    const uxp = require("uxp");
    if (uxp && uxp.versions && uxp.versions.uxp) return String(uxp.versions.uxp);
    if (uxp && uxp.host && uxp.host.version) return String(uxp.host.version);
  } catch (error) {
    return "unavailable";
  }
  return "unknown";
}

function readEnvironment() {
  const api = getThemeApi();
  const photoshop = getPhotoshop();
  const rows = [];
  const add = (name, value) => rows.push({ name, value: String(value), plain: true });

  add("document.theme", api ? "present" : "missing");
  add("getCurrent()", api ? typeof api.getCurrent : "-");
  add("onUpdated", api && api.onUpdated ? typeof api.onUpdated : "-");
  add(
    "onUpdated.addListener",
    api && api.onUpdated && typeof api.onUpdated.addListener === "function" ? "yes" : "no",
  );
  add("prefers-color-scheme", readColorScheme());

  try {
    add("Photoshop", photoshop && photoshop.app ? String(photoshop.app.version) : "unavailable");
  } catch (error) {
    add("Photoshop", "error");
  }

  add("UXP", readUxpVersion());
  add("Probe", PROBE_VERSION);
  return rows;
}

/* ---------------------------------------------------------------- rendering */

function buildRow(row) {
  const element = document.createElement("div");
  element.className = row.plain ? "row plain" : "row";

  if (!row.plain) {
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    if (row.hex) {
      swatch.style.backgroundColor = row.hex;
    } else if (row.varName) {
      swatch.style.backgroundColor = `var(${row.varName})`;
    } else {
      swatch.classList.add("is-empty");
    }
    element.appendChild(swatch);
  }

  const name = document.createElement("span");
  name.className = "row-name";
  name.textContent = row.name;
  element.appendChild(name);

  const value = document.createElement("span");
  value.className = "row-value";
  value.textContent = row.value;
  element.appendChild(value);

  return element;
}

function renderRows(container, rows, emptyElement) {
  if (!container) return;
  container.textContent = "";
  rows.forEach((row) => container.appendChild(buildRow(row)));
  if (emptyElement) emptyElement.classList.toggle("hidden", rows.length > 0);
}

function renderHero() {
  if (dom.themeValue) {
    dom.themeValue.textContent = state.theme || "not reported";
  }
  if (dom.themeSource) {
    dom.themeSource.textContent = `source: ${state.themeSource}`;
  }
  if (dom.listenerState) {
    dom.listenerState.textContent = `listener: ${state.listenerKind}`;
  }
  if (dom.updateCount) {
    dom.updateCount.textContent = `${state.updateCount} changes`;
  }
  if (dom.listenerError) {
    const problem = state.apiError || state.subscribeError || state.requireError;
    dom.listenerError.textContent = problem || "";
    dom.listenerError.classList.toggle("hidden", !problem);
  }
}

function renderHostVariables() {
  if (dom.hostVarCount) {
    dom.hostVarCount.textContent = `${state.hostVariables.length} vars`;
  }
  const rows = state.hostVariables.map((entry) => ({
    name: entry.name,
    value: entry.hex || entry.raw,
    hex: entry.hex,
    varName: entry.name,
  }));
  renderRows(dom.hostVarList, rows, dom.hostVarEmpty);
}

function renderSkin() {
  if (dom.skinState) {
    dom.skinState.textContent = state.skin.available ? "available" : "unavailable";
  }
  const rows = (state.skin.rows || []).map((entry) => ({
    name: entry.name,
    value: entry.value,
    hex: entry.hex,
  }));
  renderRows(dom.skinList, rows, dom.skinEmpty);
  if (dom.skinEmpty && state.skin.error) {
    dom.skinEmpty.textContent = state.skin.error;
  }
}

function renderEnvironment() {
  renderRows(dom.envList, state.environment, null);
}

function renderEvents() {
  if (dom.eventCount) {
    dom.eventCount.textContent = `${state.events.length} events`;
  }
  const labels = { live: "live", poll: "poll", start: "start" };
  const rows = state.events.map((entry) => ({
    name: entry.at,
    value: `${entry.value} · ${labels[entry.kind] || entry.kind}`,
    plain: true,
  }));
  renderRows(dom.eventList, rows, dom.eventEmpty);
}

function render() {
  renderHero();
  renderHostVariables();
  renderSkin();
  renderEnvironment();
  renderEvents();
}

/* ------------------------------------------------------------------ reports */

function buildSnapshot() {
  return {
    probe: PROBE_VERSION,
    capturedAt: new Date().toISOString(),
    theme: state.theme,
    themeSource: state.themeSource,
    themeApi: state.apiSummary,
    listener: state.listenerKind,
    errors: {
      api: state.apiError,
      subscribe: state.subscribeError,
      require: state.requireError,
    },
    changes: state.updateCount,
    hostVariables: state.hostVariables.map((entry) => ({
      name: entry.name,
      raw: entry.raw,
      hex: entry.hex,
    })),
    appSkinInfo: state.skin.rows,
    environment: state.environment.map((entry) => ({ name: entry.name, value: entry.value })),
    events: state.events,
  };
}

function flash(message) {
  if (!dom.copyState) return;
  dom.copyState.textContent = message;
  window.setTimeout(() => {
    if (dom.copyState) dom.copyState.textContent = state.defaultHint;
  }, 5000);
}

async function copyReport() {
  const text = JSON.stringify(buildSnapshot(), null, 2);

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      flash("Report JSON copied to the clipboard.");
      return;
    }
  } catch (error) {
    // Fall through to the UXP clipboard.
  }

  try {
    const uxp = require("uxp");
    if (uxp && uxp.clipboard && typeof uxp.clipboard.copy === "function") {
      uxp.clipboard.copy(text);
      flash("Report JSON copied to the clipboard.");
      return;
    }
  } catch (error) {
    // Fall through to the message below.
  }

  flash("Clipboard is unavailable in this build - use the screenshots instead.");
}

/* --------------------------------------------------------------------- init */

function refresh() {
  const api = getThemeApi();
  state.apiSummary = describeThemeApi(api);
  ensureListener(api);

  const read = readTheme(api);
  state.themeSource = read.source;
  if (read.theme) state.theme = read.theme;

  state.hostVariables = readHostVariables();
  state.skin = readSkinInfo();
  state.environment = readEnvironment();
  render();
}

function cacheDom() {
  dom.themeValue = document.getElementById("themeValue");
  dom.themeSource = document.getElementById("themeSource");
  dom.listenerState = document.getElementById("listenerState");
  dom.updateCount = document.getElementById("updateCount");
  dom.listenerError = document.getElementById("listenerError");
  dom.hostVarCount = document.getElementById("hostVarCount");
  dom.hostVarList = document.getElementById("hostVarList");
  dom.hostVarEmpty = document.getElementById("hostVarEmpty");
  dom.skinState = document.getElementById("skinState");
  dom.skinList = document.getElementById("skinList");
  dom.skinEmpty = document.getElementById("skinEmpty");
  dom.envList = document.getElementById("envList");
  dom.eventCount = document.getElementById("eventCount");
  dom.eventList = document.getElementById("eventList");
  dom.eventEmpty = document.getElementById("eventEmpty");
  dom.probeVersion = document.getElementById("probeVersion");
  dom.copyState = document.getElementById("copyState");
  dom.refreshButton = document.getElementById("refreshButton");
  dom.copyButton = document.getElementById("copyButton");
}

function wireButtons() {
  if (dom.refreshButton) {
    dom.refreshButton.addEventListener("click", () => {
      refresh();
      flash("Refreshed.");
    });
  }
  if (dom.copyButton) {
    dom.copyButton.addEventListener("click", () => {
      void copyReport();
    });
  }
}

function init() {
  cacheDom();

  if (dom.probeVersion) dom.probeVersion.textContent = PROBE_VERSION;
  if (dom.copyState) state.defaultHint = dom.copyState.textContent.trim();

  wireButtons();
  refresh();

  if (state.events.length === 0) {
    recordEvent(state.theme || "not reported", "start");
    renderEvents();
  }

  window.setInterval(pollTheme, POLL_INTERVAL_MS);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
