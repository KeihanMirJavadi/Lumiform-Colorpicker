import * as THREE from 'three';
import { RGBColor } from '../core/types';
import { rgbToHex } from '../core/color';

export interface ColorPickerTargetOptions {
  container: HTMLElement;
  renderer: THREE.WebGLRenderer;
  initialNormX?: number;
  initialNormY?: number;
  onSample?: (rgb: RGBColor, hex: string) => void;
}

export class ColorPickerTarget {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private canvas: HTMLCanvasElement;
  private element: HTMLElement;
  private ringEl: HTMLElement;
  private hexBadgeEl: HTMLElement;
  private normX: number;
  private normY: number;
  private isDragging = false;
  private pixelBuffer = new Uint8Array(4);
  private currentRgb: RGBColor = { r: 235, g: 87, b: 87 };
  private currentHex = '#EB5757';
  private listeners: Set<(rgb: RGBColor, hex: string) => void> = new Set();
  private rafId: number | null = null;

  constructor(options: ColorPickerTargetOptions) {
    this.container = options.container;
    this.renderer = options.renderer;
    this.canvas = options.renderer.domElement;
    this.normX = options.initialNormX ?? 0.44;
    this.normY = options.initialNormY ?? 0.44;

    if (options.onSample) {
      this.listeners.add(options.onSample);
    }

    // Build the visual puck DOM
    this.element = document.createElement('div');
    this.element.className = 'color-picker-puck';
    this.element.title = 'Color Picker Target (Drag anywhere to sample lit color)';
    this.element.innerHTML = `
      <div class="puck-ring" id="puck-ring">
        <div class="puck-crosshair-h"></div>
        <div class="puck-crosshair-v"></div>
        <div class="puck-center-dot"></div>
      </div>
      <div class="puck-badge" id="puck-badge">#EB5757</div>
    `;

    this.ringEl = this.element.querySelector('#puck-ring')!;
    this.hexBadgeEl = this.element.querySelector('#puck-badge')!;

    this.container.appendChild(this.element);

    this.bindEvents();
    this.updatePositionDOM();
  }

  private bindEvents(): void {
    this.element.addEventListener('pointerdown', (e: PointerEvent) => {
      e.stopPropagation(); // Do not trigger 3D mesh or camera drag
      this.element.setPointerCapture(e.pointerId);
      this.isDragging = true;
      this.element.classList.add('dragging');
      this.handlePointerMove(e);
    });

    this.element.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.isDragging) return;
      e.stopPropagation();
      this.handlePointerMove(e);
    });

    const stopDrag = (e: PointerEvent) => {
      if (this.isDragging) {
        if (this.element.hasPointerCapture(e.pointerId)) {
          this.element.releasePointerCapture(e.pointerId);
        }
        this.isDragging = false;
        this.element.classList.remove('dragging');
      }
    };

    this.element.addEventListener('pointerup', stopDrag);
    this.element.addEventListener('pointercancel', stopDrag);
  }

  private handlePointerMove(e: PointerEvent): void {
    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const clientX = Math.max(rect.left, Math.min(rect.right, e.clientX));
    const clientY = Math.max(rect.top, Math.min(rect.bottom, e.clientY));

    this.normX = (clientX - rect.left) / rect.width;
    this.normY = (clientY - rect.top) / rect.height;

    this.updatePositionDOM();
    this.scheduleResample();
  }

  public updatePositionDOM(): void {
    const rect = this.container.getBoundingClientRect();
    const x = this.normX * rect.width;
    const y = this.normY * rect.height;
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
  }

  public teleportToClient(clientX: number, clientY: number): void {
    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.normX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    this.normY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    this.updatePositionDOM();
    this.resampleImmediate();
  }

  public scheduleResample(): void {
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.resampleImmediate();
      });
    }
  }

  public resampleImmediate(): void {
    const gl = this.renderer.getContext();
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = this.renderer.getPixelRatio();
    const clientX = rect.left + this.normX * rect.width;
    const clientY = rect.top + this.normY * rect.height;

    const x = Math.floor((clientX - rect.left) * dpr);
    const y = Math.floor((rect.bottom - clientY) * dpr);

    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    if (x < 0 || x >= canvasWidth || y < 0 || y >= canvasHeight) {
      return;
    }

    try {
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pixelBuffer);
    } catch (e) {
      console.warn('[ColorPickerTarget] WebGL readPixels error:', e);
      return;
    }

    this.currentRgb = {
      r: this.pixelBuffer[0],
      g: this.pixelBuffer[1],
      b: this.pixelBuffer[2],
    };
    this.currentHex = rgbToHex(this.currentRgb);

    // Update puck visual styling
    this.ringEl.style.backgroundColor = this.currentHex;
    this.hexBadgeEl.textContent = this.currentHex;

    // Dispatch sample event
    this.listeners.forEach((cb) => cb(this.currentRgb, this.currentHex));
  }

  public getRGB(): RGBColor {
    return { ...this.currentRgb };
  }

  public getHex(): string {
    return this.currentHex;
  }

  public get active(): boolean {
    return this.isDragging;
  }

  public onSample(callback: (rgb: RGBColor, hex: string) => void): () => void {
    this.listeners.add(callback);
    callback(this.currentRgb, this.currentHex);
    return () => {
      this.listeners.delete(callback);
    };
  }

  public dispose(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.listeners.clear();
    this.element.remove();
  }
}
