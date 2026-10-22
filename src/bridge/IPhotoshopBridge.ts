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
   * Subscribes to bridge status changes.
   */
  onStatusChange(callback: (status: string) => void): () => void;

  /**
   * Subscribes to color updates dispatched through the bridge.
   */
  onColorChange(callback: (event: ColorChangeEvent) => void): () => void;
}
