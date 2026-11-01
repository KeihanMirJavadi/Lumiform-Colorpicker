import * as THREE from 'three';
import { AnalyticalSwatch, calculate5ValueRamp } from '../core/swatchCalculator';
import { LightingEnvironment } from '../core/lighting';
import { SurfaceFinish } from '../core/types';
import { SURFACE_FINISHES } from '../core/material';
import { atmosphereAmount, effectiveHaze } from '../core/atmosphere';
import { DEFAULT_ALBEDO_HEX, DEFAULT_SURFACE_FINISH } from '../core/defaults';

export interface SwatchRampOptions {
  container: HTMLElement;
  initialAlbedoHex?: string;
  initialSphereName?: string;
  initialEnv: LightingEnvironment;
  initialFinish?: SurfaceFinish;
  initialRoughness?: number;
  initialSpecular?: number;
  initialHaze?: number;
  initialDistance?: number;
  onSelectSwatch?: (swatch: AnalyticalSwatch) => void;
}

export class SwatchRamp {
  private container: HTMLElement;
  private albedoHex: string;
  private sphereName: string;
  private env: LightingEnvironment;
  private finish: SurfaceFinish;
  private roughness: number;
  private specular: number;
  private haze: number;
  private distance: number;
  private currentSwatches: AnalyticalSwatch[] = [];
  private listeners: Set<(swatch: AnalyticalSwatch) => void> = new Set();
  private flashTimeouts: Map<string, number> = new Map();

  constructor(options: SwatchRampOptions) {
    this.container = options.container;
    this.albedoHex = options.initialAlbedoHex ?? DEFAULT_ALBEDO_HEX;
    this.sphereName = options.initialSphereName ?? 'Near';
    this.env = options.initialEnv;
    this.finish = options.initialFinish ?? DEFAULT_SURFACE_FINISH;
    this.haze = options.initialHaze ?? 0.5;
    this.distance = options.initialDistance ?? 7;

    if (options.initialRoughness !== undefined) {
      this.roughness = options.initialRoughness;
    } else if (this.finish in SURFACE_FINISHES) {
      this.roughness = SURFACE_FINISHES[this.finish as Exclude<SurfaceFinish, 'custom'>].roughness;
    } else {
      this.roughness = 0.45;
    }

    if (options.initialSpecular !== undefined) {
      this.specular = options.initialSpecular;
    } else if (this.finish in SURFACE_FINISHES) {
      this.specular = SURFACE_FINISHES[this.finish as Exclude<SurfaceFinish, 'custom'>].specularIntensity;
    } else {
      this.specular = 0.4;
    }

    if (options.onSelectSwatch) {
      this.listeners.add(options.onSelectSwatch);
    }

    this.recalculateAndRender();
  }

  public updateParameters(params: {
    albedoHex?: string;
    sphereName?: string;
    env?: LightingEnvironment;
    finish?: SurfaceFinish;
    roughness?: number;
    specular?: number;
    haze?: number;
    distance?: number;
  }): void {
    if (params.albedoHex !== undefined) this.albedoHex = params.albedoHex;
    if (params.sphereName !== undefined) this.sphereName = params.sphereName;
    if (params.env !== undefined) this.env = params.env;
    if (params.finish !== undefined) this.finish = params.finish;
    if (params.roughness !== undefined) this.roughness = params.roughness;
    if (params.specular !== undefined) this.specular = params.specular;
    if (params.haze !== undefined) this.haze = params.haze;
    if (params.distance !== undefined) this.distance = params.distance;

    this.recalculateAndRender();
  }

  private recalculateAndRender(): void {
    const lightDir = new THREE.Vector3(
      Math.cos(this.env.keyLight.elevation) * Math.sin(this.env.keyLight.azimuth),
      Math.sin(this.env.keyLight.elevation),
      Math.cos(this.env.keyLight.elevation) * Math.cos(this.env.keyLight.azimuth)
    ).normalize();

    const viewDir = new THREE.Vector3(0, 0, 1);

    this.currentSwatches = calculate5ValueRamp(
      lightDir,
      viewDir,
      this.albedoHex,
      this.env,
      this.roughness,
      this.specular,
      {
        amount: atmosphereAmount(
          effectiveHaze(this.haze, this.env.hazeStrength, this.env.hazePreset),
          this.distance
        ),
        color: this.env.horizonHaze,
      }
    );

    this.render();
  }

  private render(): void {
    const albedo = this.albedoHex.toUpperCase();
    this.container.innerHTML = `
      <div class="swatch-ramp-card">
        <div class="ramp-header">
          <h2>5-VALUE RAMP</h2>
          <span
            class="ramp-sphere-chip"
            title="${this.sphereName} · ${albedo}"
            aria-label="Ramp computed for ${this.sphereName}, albedo ${albedo}"
          >
            <span class="ramp-albedo-dot" style="background-color: ${this.albedoHex};" aria-hidden="true"></span>
            <span class="ramp-sphere-name">${this.sphereName}</span>
          </span>
          <span class="ramp-click-hint">Click to Paint</span>
        </div>
        <div class="swatch-ramp-grid" id="swatch-grid">
          ${this.currentSwatches
            .map(
              (s) => `
            <div class="swatch-block" data-role="${s.role}" title="${s.label} (${s.hex}): ${s.description}">
              <div class="swatch-fill" style="background-color: ${s.hex};"></div>
              <div class="swatch-meta">
                <span class="swatch-tag">${s.tag}</span>
                <span class="swatch-hex">${s.hex}</span>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    const blocks = this.container.querySelectorAll<HTMLElement>('.swatch-block');
    blocks.forEach((block) => {
      block.addEventListener('click', () => {
        const role = block.getAttribute('data-role');
        const found = this.currentSwatches.find((s) => s.role === role);
        if (found && role) {
          // Cancel any existing flash timeout for this block
          const existingTimeout = this.flashTimeouts.get(role);
          if (existingTimeout) {
            window.clearTimeout(existingTimeout);
          }

          // Trigger click flash feedback animation (appears and immediately fades out)
          block.classList.remove('clicked');
          void block.offsetWidth; // Force DOM reflow to retrigger animation
          block.classList.add('clicked');

          const timer = window.setTimeout(() => {
            block.classList.remove('clicked');
            this.flashTimeouts.delete(role);
          }, 380);
          this.flashTimeouts.set(role, timer);

          // Dispatch color to set Photoshop brush / foreground color
          this.listeners.forEach((cb) => cb(found));
        }
      });
    });
  }

  public getSwatches(): AnalyticalSwatch[] {
    return [...this.currentSwatches];
  }

  public onSelectSwatch(callback: (swatch: AnalyticalSwatch) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }
}
