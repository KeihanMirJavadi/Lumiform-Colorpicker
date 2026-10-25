import { HSBColor, RGBColor } from '../core/types';
import { hsbToRgb, rgbToHsb, rgbToHex, hexToRgb } from '../core/color';
import { DEFAULT_ALBEDO_HEX } from '../core/defaults';

export interface ColorControlsOptions {
  container: HTMLElement;
  initialHex?: string;
  onChange?: (hsb: HSBColor, rgb: RGBColor, hex: string) => void;
}

export class ColorControls {
  private container: HTMLElement;
  private hsb: HSBColor;
  private listeners: Set<(hsb: HSBColor, rgb: RGBColor, hex: string) => void> = new Set();

  // Elements
  private hueSlider!: HTMLInputElement;
  private satSlider!: HTMLInputElement;
  private briSlider!: HTMLInputElement;
  private hueNum!: HTMLInputElement;
  private satNum!: HTMLInputElement;
  private briNum!: HTMLInputElement;
  private hexInput!: HTMLInputElement;
  private swatchPreview!: HTMLElement;

  constructor(options: ColorControlsOptions) {
    this.container = options.container;

    const initialHex = options.initialHex ?? DEFAULT_ALBEDO_HEX;
    const initialRgb = hexToRgb(initialHex) ?? { r: 227, g: 227, b: 227 };
    this.hsb = rgbToHsb(initialRgb);

    if (options.onChange) {
      this.listeners.add(options.onChange);
    }

    this.render();
    this.bindEvents();
    this.updateUI(false);
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="color-controls-panel">
        <div class="section-header">
          <h2>Selected Sphere Color (Decoupled Albedo)</h2>
          <div class="hex-group">
            <div class="albedo-swatch" id="albedo-swatch-preview" title="Current Base Albedo"></div>
            <input type="text" class="ps-input-hex" id="input-hex" maxlength="7" spellcheck="false" value="${DEFAULT_ALBEDO_HEX}" />
          </div>
        </div>

        <div class="slider-group">
          <!-- Hue -->
          <div class="slider-row">
            <span class="slider-label">H</span>
            <div class="slider-track-wrap">
              <input type="range" class="ps-slider hue-slider" id="slider-hue" min="0" max="360" value="${this.hsb.h}" />
            </div>
            <input type="number" class="ps-input-num" id="num-hue" min="0" max="360" value="${this.hsb.h}" />
            <span class="slider-unit">°</span>
          </div>

          <!-- Saturation -->
          <div class="slider-row">
            <span class="slider-label">S</span>
            <div class="slider-track-wrap">
              <input type="range" class="ps-slider sat-slider" id="slider-sat" min="0" max="100" value="${this.hsb.s}" />
            </div>
            <input type="number" class="ps-input-num" id="num-sat" min="0" max="100" value="${this.hsb.s}" />
            <span class="slider-unit">%</span>
          </div>

          <!-- Brightness -->
          <div class="slider-row">
            <span class="slider-label">B</span>
            <div class="slider-track-wrap">
              <input type="range" class="ps-slider bri-slider" id="slider-bri" min="0" max="100" value="${this.hsb.b}" />
            </div>
            <input type="number" class="ps-input-num" id="num-bri" min="0" max="100" value="${this.hsb.b}" />
            <span class="slider-unit">%</span>
          </div>
        </div>
      </div>
    `;

    this.hueSlider = this.container.querySelector('#slider-hue')!;
    this.satSlider = this.container.querySelector('#slider-sat')!;
    this.briSlider = this.container.querySelector('#slider-bri')!;
    this.hueNum = this.container.querySelector('#num-hue')!;
    this.satNum = this.container.querySelector('#num-sat')!;
    this.briNum = this.container.querySelector('#num-bri')!;
    this.hexInput = this.container.querySelector('#input-hex')!;
    this.swatchPreview = this.container.querySelector('#albedo-swatch-preview')!;
  }

  private bindEvents(): void {
    // Slider Drag events (real-time input)
    this.hueSlider.addEventListener('input', () => {
      this.hsb.h = parseInt(this.hueSlider.value, 10);
      this.updateUI(true);
    });

    this.satSlider.addEventListener('input', () => {
      this.hsb.s = parseInt(this.satSlider.value, 10);
      this.updateUI(true);
    });

    this.briSlider.addEventListener('input', () => {
      this.hsb.b = parseInt(this.briSlider.value, 10);
      this.updateUI(true);
    });

    // Number input events
    this.hueNum.addEventListener('change', () => {
      let val = parseInt(this.hueNum.value, 10);
      if (isNaN(val)) val = 0;
      this.hsb.h = ((val % 360) + 360) % 360;
      this.updateUI(true);
    });

    this.satNum.addEventListener('change', () => {
      let val = parseInt(this.satNum.value, 10);
      if (isNaN(val)) val = 0;
      this.hsb.s = Math.max(0, Math.min(100, val));
      this.updateUI(true);
    });

    this.briNum.addEventListener('change', () => {
      let val = parseInt(this.briNum.value, 10);
      if (isNaN(val)) val = 0;
      this.hsb.b = Math.max(0, Math.min(100, val));
      this.updateUI(true);
    });

    // Hex input validation and synchronization
    this.hexInput.addEventListener('change', () => {
      let raw = this.hexInput.value.trim();
      if (!raw.startsWith('#')) {
        raw = '#' + raw;
      }
      const rgb = hexToRgb(raw);
      if (rgb) {
        this.hsb = rgbToHsb(rgb);
        this.updateUI(true);
      } else {
        // Reset to current valid hex
        const currentRgb = hsbToRgb(this.hsb);
        this.hexInput.value = rgbToHex(currentRgb);
      }
    });

    this.hexInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.hexInput.blur();
      }
    });
  }

  private updateUI(notify = true): void {
    const rgb = hsbToRgb(this.hsb);
    const hex = rgbToHex(rgb);

    // Sync input controls
    this.hueSlider.value = this.hsb.h.toString();
    this.satSlider.value = this.hsb.s.toString();
    this.briSlider.value = this.hsb.b.toString();

    this.hueNum.value = this.hsb.h.toString();
    this.satNum.value = this.hsb.s.toString();
    this.briNum.value = this.hsb.b.toString();

    if (document.activeElement !== this.hexInput) {
      this.hexInput.value = hex;
    }

    // Dynamic slider gradient styling
    this.updateSliderTrackGradients();

    // Swatch preview
    this.swatchPreview.style.backgroundColor = hex;

    if (notify) {
      this.listeners.forEach((cb) => cb({ ...this.hsb }, rgb, hex));
    }
  }

  private updateSliderTrackGradients(): void {
    // Saturation gradient: from HSB(H, 0, B) to HSB(H, 100, B)
    const satStart = rgbToHex(hsbToRgb({ h: this.hsb.h, s: 0, b: this.hsb.b }));
    const satEnd = rgbToHex(hsbToRgb({ h: this.hsb.h, s: 100, b: this.hsb.b }));
    this.satSlider.style.background = `linear-gradient(to right, ${satStart}, ${satEnd})`;

    // Brightness gradient: from black to HSB(H, S, 100)
    const briEnd = rgbToHex(hsbToRgb({ h: this.hsb.h, s: this.hsb.s, b: 100 }));
    this.briSlider.style.background = `linear-gradient(to right, #000000, ${briEnd})`;
  }

  public setHex(hex: string, notify = true): void {
    const rgb = hexToRgb(hex);
    if (rgb) {
      this.hsb = rgbToHsb(rgb);
      this.updateUI(notify);
    }
  }

  public getHex(): string {
    return rgbToHex(hsbToRgb(this.hsb));
  }

  public getHSB(): HSBColor {
    return { ...this.hsb };
  }

  public getRGB(): RGBColor {
    return hsbToRgb(this.hsb);
  }

  public onChange(callback: (hsb: HSBColor, rgb: RGBColor, hex: string) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }
}
