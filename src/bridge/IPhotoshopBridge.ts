import { RGBColor } from '../core/types';

export interface ColorChangeEvent {
  rgb: RGBColor;
  hex: string;
}

export interface IPhotoshopBridge {
  readonly name: string;
  readonly isConnected: boolean;
  readonly currentStatus: string;

  /**
   * Dispatches the active foreground brush color.
   */
  setForegroundColor(color: RGBColor | string): Promise<void>;

  /**
   * Retrieves the current foreground brush color if available.
   */
  getForegroundColor(): Promise<RGBColor | null>;

  /**
   * Opens an https URL in the system browser. The host rejects other schemes.
   */
  openUrl(url: string): Promise<void>;

  /**
   * Subscribes to bridge status changes.
   */
  onStatusChange(callback: (status: string) => void): () => void;

  /**
   * Subscribes to color updates dispatched through the bridge.
   */
  onColorChange(callback: (event: ColorChangeEvent) => void): () => void;

  /**
   * Subscribes to the host's Photoshop theme token (`darkest`, `dark`,
   * `light`, `lightest`). The callback receives the current value immediately,
   * or null when the host has not reported one.
   */
  onThemeChange(callback: (hostTheme: string | null) => void): () => void;
}
