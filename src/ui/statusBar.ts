import { IPhotoshopBridge, ColorChangeEvent } from '../bridge/IPhotoshopBridge';
import { DEFAULT_ALBEDO_HEX } from '../core/defaults';

export class StatusBar {
  private container: HTMLElement;
  private bridge: IPhotoshopBridge;
  private dotEl: HTMLElement | null = null;
  private statusTextEl: HTMLElement | null = null;
  private swatchEl: HTMLElement | null = null;
  private hexEl: HTMLElement | null = null;

  constructor(container: HTMLElement, bridge: IPhotoshopBridge) {
    this.container = container;
    this.bridge = bridge;
    this.render();
    this.bindEvents();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="status-indicator-group">
        <span class="status-dot" id="status-dot"></span>
        <span class="status-text" id="status-text">${this.bridge.currentStatus}</span>
      </div>
      <div class="active-brush-group">
        <span class="active-brush-label">Brush:</span>
        <div class="active-brush-swatch" id="active-brush-swatch" title="Active Foreground Brush Color"></div>
        <span class="active-brush-hex" id="active-brush-hex">${DEFAULT_ALBEDO_HEX}</span>
      </div>
    `;

    this.dotEl = this.container.querySelector('#status-dot');
    this.statusTextEl = this.container.querySelector('#status-text');
    this.swatchEl = this.container.querySelector('#active-brush-swatch');
    this.hexEl = this.container.querySelector('#active-brush-hex');
  }

  private bindEvents(): void {
    this.bridge.onStatusChange((status: string) => {
      if (this.statusTextEl) {
        this.statusTextEl.textContent = status;
      }
      if (this.dotEl) {
        this.dotEl.style.backgroundColor = this.bridge.isConnected
          ? 'var(--ps-status-connected)'
          : 'var(--ps-status-disconnected)';
      }
    });

    this.bridge.onColorChange((event: ColorChangeEvent) => {
      if (this.swatchEl) {
        this.swatchEl.style.backgroundColor = event.hex;
      }
      if (this.hexEl) {
        this.hexEl.textContent = event.hex;
      }
    });
  }
}
