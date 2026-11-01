import { RGBColor } from '../core/types';

export interface ColorChangeEvent {
  rgb: RGBColor;
  hex: string;
}

/** A key press forwarded from the WebView to the Photoshop host. */
export interface ShortcutPayload {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
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
   * Returns keyboard focus to the Photoshop document after a canvas drag.
   *
   * A UXP WebView owns the keyboard while the pointer is inside it, so global
   * Photoshop shortcuts (brush size, tool keys) are swallowed until the user
   * clicks the document. The host calls `app.bringToFront()` to hand focus back.
   */
  focusPhotoshop(): void;

  /**
   * Forwards a Photoshop shortcut from the WebView to the host. On Windows a
   * WebView keeps keyboard focus, so the host re-executes the action directly.
   */
  sendShortcut(payload: ShortcutPayload): void;

  /**
   * Ends the host's open shortcut session so Photoshop regains its normal UI
   * before the pointer moves to the canvas.
   */
  endShortcutSession(): void;

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
