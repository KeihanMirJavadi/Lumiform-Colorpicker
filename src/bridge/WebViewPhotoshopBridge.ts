import { RGBColor } from '../core/types';
import { rgbToHex, hexToRgb } from '../core/color';
import { DEFAULT_ALBEDO_HEX } from '../core/defaults';
import { IPhotoshopBridge, ColorChangeEvent } from './IPhotoshopBridge';

/**
 * Messages exchanged with the UXP host panel (`plugin/main.js`).
 *
 * The web app runs inside a Photoshop UXP WebView. It has no access to the
 * Photoshop DOM, so it talks to the host panel over the WebView message
 * bridge. Keeping the protocol in one place makes it obvious which side owns
 * which operation.
 */
export interface WebToHostMessage {
  source: 'lumiform-web';
  type: 'ready' | 'set-foreground' | 'get-foreground' | 'open-url';
  requestId?: number;
  rgb?: RGBColor;
  hex?: string;
  url?: string;
}

export interface HostToWebMessage {
  source: 'lumiform-host';
  type: 'status' | 'foreground' | 'error';
  status?: string;
  connected?: boolean;
  requestId?: number;
  rgb?: RGBColor;
  hex?: string;
  message?: string;
}

interface UxpHost {
  postMessage: (message: WebToHostMessage) => void;
}

function getUxpHost(): UxpHost | null {
  const host = (window as Window & { uxpHost?: Partial<UxpHost> }).uxpHost;
  if (host && typeof host.postMessage === 'function') {
    return host as UxpHost;
  }
  return null;
}

export function isUxpWebView(): boolean {
  return getUxpHost() !== null;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeRgb(color: RGBColor | string): RGBColor | null {
  if (typeof color === 'string') {
    return hexToRgb(color);
  }
  if (!color || typeof color.r !== 'number' || typeof color.g !== 'number' || typeof color.b !== 'number') {
    return null;
  }
  return {
    r: clampChannel(color.r),
    g: clampChannel(color.g),
    b: clampChannel(color.b),
  };
}

/**
 * Bridge used when the app is hosted in the Photoshop UXP panel's WebView.
 *
 * Writes are fire-and-forget (the host coalesces rapid eyedropper samples),
 * while reads are request/response so callers can await the current Photoshop
 * foreground. Photoshop-side changes are pushed back by the host's poller and
 * surface through `onColorChange`.
 */
export class WebViewPhotoshopBridge implements IPhotoshopBridge {
  readonly name = 'UXPPhotoshopBridge';

  private host: UxpHost | null;
  private _status = 'Connecting to Photoshop…';
  private _connected = false;
  private _currentColor: RGBColor = hexToRgb(DEFAULT_ALBEDO_HEX) ?? { r: 227, g: 227, b: 227 };
  private _statusListeners: Set<(status: string) => void> = new Set();
  private _colorListeners: Set<(event: ColorChangeEvent) => void> = new Set();
  private _pendingReads: Map<number, (color: RGBColor | null) => void> = new Map();
  private _nextRequestId = 1;
  private _handshakeTimer: number | null = null;

  constructor() {
    this.host = getUxpHost();
    window.addEventListener('message', this.handleHostMessage);

    if (this.host) {
      this.post({ source: 'lumiform-web', type: 'ready' });
      this._handshakeTimer = window.setTimeout(() => {
        if (!this._connected) {
          this.setStatus('Photoshop host did not answer; using local color state', false);
        }
      }, 2500);
    } else {
      this.setStatus('Photoshop bridge unavailable', false);
    }
  }

  get isConnected(): boolean {
    return this._connected;
  }

  get currentStatus(): string {
    return this._status;
  }

  async setForegroundColor(color: RGBColor | string): Promise<void> {
    const rgb = normalizeRgb(color);
    if (!rgb) {
      console.warn(`[UXPBridge] Invalid color provided: ${String(color)}`);
      return;
    }

    this.applyColor(rgb);
    this.post({ source: 'lumiform-web', type: 'set-foreground', rgb });
  }

  async openUrl(url: string): Promise<void> {
    if (!/^https:\/\//i.test(url)) {
      console.warn(`[UXPBridge] Refusing to open a non-https URL: ${url}`);
      return;
    }
    this.post({ source: 'lumiform-web', type: 'open-url', url });
  }

  async getForegroundColor(): Promise<RGBColor | null> {
    if (!this.host) {
      return { ...this._currentColor };
    }

    const requestId = this._nextRequestId++;
    return new Promise<RGBColor | null>((resolve) => {
      let settled = false;
      const finish = (color: RGBColor | null) => {
        if (settled) return;
        settled = true;
        this._pendingReads.delete(requestId);
        resolve(color);
      };

      this._pendingReads.set(requestId, finish);
      window.setTimeout(() => finish(null), 1500);
      this.post({ source: 'lumiform-web', type: 'get-foreground', requestId });
    });
  }

  onStatusChange(callback: (status: string) => void): () => void {
    this._statusListeners.add(callback);
    callback(this._status);
    return () => {
      this._statusListeners.delete(callback);
    };
  }

  onColorChange(callback: (event: ColorChangeEvent) => void): () => void {
    this._colorListeners.add(callback);
    callback({ rgb: { ...this._currentColor }, hex: rgbToHex(this._currentColor) });
    return () => {
      this._colorListeners.delete(callback);
    };
  }

  private post(message: WebToHostMessage): void {
    if (!this.host) return;
    try {
      this.host.postMessage(message);
    } catch (error) {
      console.warn('[UXPBridge] Failed to post message to Photoshop:', error);
      this.setStatus('Photoshop bridge error', false);
    }
  }

  private readonly handleHostMessage = (event: MessageEvent<HostToWebMessage>): void => {
    const data = event.data;
    if (!data || data.source !== 'lumiform-host') return;

    if (data.type === 'status') {
      this.clearHandshake();
      this.setStatus(data.status ?? 'Photoshop connected', data.connected !== false);
      return;
    }

    if (data.type === 'error') {
      this.clearHandshake();
      this.setStatus(data.message ?? 'Photoshop bridge error', false);
      return;
    }

    if (data.type === 'foreground') {
      this.clearHandshake();
      if (data.rgb) {
        const rgb = normalizeRgb(data.rgb);
        if (rgb) {
          this.applyColor(rgb);
          if (typeof data.requestId === 'number') {
            this._pendingReads.get(data.requestId)?.(rgb);
          }
        }
      }
      this.markConnected();
    }
  };

  private applyColor(rgb: RGBColor): void {
    this._currentColor = { ...rgb };
    const event: ColorChangeEvent = { rgb: { ...rgb }, hex: rgbToHex(rgb) };
    this._colorListeners.forEach((cb) => cb(event));
  }

  private setStatus(status: string, connected: boolean): void {
    this._status = status;
    this._connected = connected;
    this._statusListeners.forEach((cb) => cb(status));
  }

  private markConnected(): void {
    if (!this._connected || this._status !== 'Connected to Photoshop') {
      this.setStatus('Connected to Photoshop', true);
    }
  }

  private clearHandshake(): void {
    if (this._handshakeTimer !== null) {
      window.clearTimeout(this._handshakeTimer);
      this._handshakeTimer = null;
    }
  }
}
