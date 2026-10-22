import * as THREE from 'three';
import { RGBColor } from '../core/types';
import { rgbToHex } from '../core/color';

export interface EyedropperSampleEvent {
  rgb: RGBColor;
  hex: string;
  clientX: number;
  clientY: number;
}

export class EyedropperController {
  private renderer: THREE.WebGLRenderer;
  private canvas: HTMLCanvasElement;
  private pixelBuffer: Uint8Array = new Uint8Array(4);
  private scheduledRaf: number | null = null;
  private pendingCoord: { clientX: number; clientY: number } | null = null;
  private isSampling = false;
  private listeners: Set<(event: EyedropperSampleEvent) => void> = new Set();

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.canvas = renderer.domElement;
  }

  public startSampling(clientX: number, clientY: number): void {
    this.isSampling = true;
    this.sampleImmediate(clientX, clientY);
  }

  public updateSampling(clientX: number, clientY: number): void {
    if (!this.isSampling) return;

    this.pendingCoord = { clientX, clientY };

    if (this.scheduledRaf === null) {
      this.scheduledRaf = requestAnimationFrame(() => {
        this.scheduledRaf = null;
        if (this.pendingCoord && this.isSampling) {
          this.executeSample(this.pendingCoord.clientX, this.pendingCoord.clientY);
          this.pendingCoord = null;
        }
      });
    }
  }

  public stopSampling(): void {
    this.isSampling = false;
    this.pendingCoord = null;
    if (this.scheduledRaf !== null) {
      cancelAnimationFrame(this.scheduledRaf);
      this.scheduledRaf = null;
    }
  }

  public get active(): boolean {
    return this.isSampling;
  }

  public sampleImmediate(clientX: number, clientY: number): EyedropperSampleEvent | null {
    return this.executeSample(clientX, clientY);
  }

  private executeSample(clientX: number, clientY: number): EyedropperSampleEvent | null {
    const gl = this.renderer.getContext();
    const rect = this.canvas.getBoundingClientRect();

    if (rect.width === 0 || rect.height === 0) return null;

    // Convert client CSS pixels to WebGL physical framebuffer pixels
    const dpr = this.renderer.getPixelRatio();
    const x = Math.floor((clientX - rect.left) * dpr);
    // In WebGL, Y=0 is bottom
    const y = Math.floor((rect.bottom - clientY) * dpr);

    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    if (x < 0 || x >= canvasWidth || y < 0 || y >= canvasHeight) {
      return null;
    }

    try {
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pixelBuffer);
    } catch (e) {
      console.warn('[Eyedropper] WebGL readPixels readback warning:', e);
      return null;
    }

    const rgb: RGBColor = {
      r: this.pixelBuffer[0],
      g: this.pixelBuffer[1],
      b: this.pixelBuffer[2],
    };

    const hex = rgbToHex(rgb);
    const event: EyedropperSampleEvent = { rgb, hex, clientX, clientY };

    this.listeners.forEach((cb) => cb(event));
    return event;
  }

  public onSample(callback: (event: EyedropperSampleEvent) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  public dispose(): void {
    this.stopSampling();
    this.listeners.clear();
  }
}
