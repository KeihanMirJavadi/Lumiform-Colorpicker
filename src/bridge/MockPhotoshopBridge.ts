import { RGBColor } from '../core/types';
import { rgbToHex, hexToRgb } from '../core/color';
import { DEFAULT_ALBEDO_HEX } from '../core/defaults';
import { IPhotoshopBridge, ColorChangeEvent } from './IPhotoshopBridge';

export class MockPhotoshopBridge implements IPhotoshopBridge {
  readonly name = 'MockPhotoshopBridge';
  private _isConnected = true;
  private _status = 'Connected (Browser Dev Mode)';
  private _currentColor: RGBColor = hexToRgb(DEFAULT_ALBEDO_HEX) ?? { r: 227, g: 227, b: 227 };
  private _statusListeners: Set<(status: string) => void> = new Set();
  private _colorListeners: Set<(event: ColorChangeEvent) => void> = new Set();
  private _themeListeners: Set<(hostTheme: string | null) => void> = new Set();
  private _hostTheme: string | null = 'dark';

  constructor() {
    // Browser dev mirrors the host: ?theme=<token> bootstraps the simulation,
    // and Dark Gray is the default when no parameter is present.
    try {
      const bootstrap = new URLSearchParams(window.location.search).get('theme');
      if (bootstrap && bootstrap.trim()) this._hostTheme = bootstrap.trim();
    } catch (error) {
      // Keep the default.
    }

    // Browser-dev hook: simulate Photoshop theme switches without Photoshop.
    const devWindow = window as Window & {
      __lumiformMockTheme?: (theme: string | null) => void;
    };
    devWindow.__lumiformMockTheme = (theme) => this.setHostTheme(theme);
  }

  /** Updates the simulated host token; used by browser development. */
  setHostTheme(theme: string | null): void {
    this._hostTheme = theme;
    this._themeListeners.forEach((cb) => cb(theme));
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  get currentStatus(): string {
    return this._status;
  }

  async setForegroundColor(color: RGBColor | string): Promise<void> {
    let resolvedRgb: RGBColor;
    if (typeof color === 'string') {
      const parsed = hexToRgb(color);
      if (!parsed) {
        console.warn(`[MockBridge] Invalid color format provided: ${color}`);
        return;
      }
      resolvedRgb = parsed;
    } else {
      resolvedRgb = {
        r: Math.max(0, Math.min(255, Math.round(color.r))),
        g: Math.max(0, Math.min(255, Math.round(color.g))),
        b: Math.max(0, Math.min(255, Math.round(color.b))),
      };
    }

    this._currentColor = resolvedRgb;
    const hex = rgbToHex(resolvedRgb);

    const event: ColorChangeEvent = { rgb: resolvedRgb, hex };
    this._colorListeners.forEach((cb) => cb(event));

    console.debug(`[MockBridge] Active brush foreground updated: ${hex} rgb(${resolvedRgb.r}, ${resolvedRgb.g}, ${resolvedRgb.b})`);
  }

  async getForegroundColor(): Promise<RGBColor | null> {
    return { ...this._currentColor };
  }

  async openUrl(url: string): Promise<void> {
    if (!/^https:\/\//i.test(url)) {
      console.warn(`[MockBridge] Refusing to open a non-https URL: ${url}`);
      return;
    }
    window.open(url, '_blank', 'noopener');
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
    callback({
      rgb: { ...this._currentColor },
      hex: rgbToHex(this._currentColor),
    });
    return () => {
      this._colorListeners.delete(callback);
    };
  }

  onThemeChange(callback: (hostTheme: string | null) => void): () => void {
    this._themeListeners.add(callback);
    callback(this._hostTheme);
    return () => {
      this._themeListeners.delete(callback);
    };
  }
}
