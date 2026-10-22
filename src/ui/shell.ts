import { IPhotoshopBridge, ColorChangeEvent } from '../bridge/IPhotoshopBridge';
import { Viewport, MeshGeometryType } from '../render/Viewport';
import { LightingPreset, SurfaceFinish } from '../core/types';
import { SURFACE_FINISHES } from '../core/material';
import { StatusBar } from './statusBar';
import { ColorControls } from './colorControls';
import { SwatchRamp } from './swatchRamp';

export class AppShell {
  private root: HTMLElement;
  private bridge: IPhotoshopBridge;
  private viewport: Viewport | null = null;
  private colorControls: ColorControls | null = null;
  private swatchRamp: SwatchRamp | null = null;

  constructor(root: HTMLElement, bridge: IPhotoshopBridge) {
    this.root = root;
    this.bridge = bridge;
    this.init();
  }

  private init(): void {
    this.root.innerHTML = `
      <header class="app-header">
        <span class="app-logo">Lumiform Colorpicker</span>
        <span class="app-version">v0.1.0</span>
      </header>

      <main class="panel-content">
        <!-- 3D Mesh Toggle (Sphere vs Cube) & Reset Rotation -->
        <div class="mesh-toggle-row">
          <div class="mesh-toggle-group">
            <button class="mesh-toggle-btn active" data-mesh="sphere" id="btn-mesh-sphere">
              <span>🔮</span> Sphere
            </button>
            <button class="mesh-toggle-btn" data-mesh="cube" id="btn-mesh-cube">
              <span>🧊</span> Cube
            </button>
          </div>
          <button class="mesh-reset-btn" id="btn-reset-rotation" title="Reset Mesh Rotation">
            <span>↺</span> Reset Rotation
          </button>
        </div>

        <!-- 3D Viewport with Persistent Color Target (No Lines) -->
        <div class="viewport-card" id="viewport-container"></div>

        <!-- Analytical 5-Value Swatch Ramp (Task 1.7) -->
        <div class="section-card" id="swatch-ramp-container"></div>

        <!-- In-Panel HSB & Hex Color Controls (Task 1.5) -->
        <div class="section-card" id="color-controls-container"></div>

        <!-- Time-of-Day Lighting Presets, Light Color & 2-Axis Sun Sliders -->
        <div class="section-card">
          <div class="section-header">
            <h2>Sun Position & Light Color</h2>
            <div class="hex-group" title="Key Light (Sun) Color">
              <input type="color" id="picker-light-color" style="opacity:0; width:0; height:0; position:absolute;" value="#FFFBEB" />
              <div class="albedo-swatch" id="swatch-light-color" style="background-color: #FFFBEB; cursor: pointer;" title="Click to choose light color"></div>
              <input type="text" class="ps-input-hex" id="input-light-hex" maxlength="7" spellcheck="false" value="#FFFBEB" />
            </div>
          </div>
          <div class="preset-segmented-control">
            <button class="preset-btn active" data-preset="daylight" id="btn-preset-daylight">
              <span>☀️</span> Daylight
            </button>
            <button class="preset-btn" data-preset="golden-hour" id="btn-preset-golden">
              <span>🌅</span> Golden Hour
            </button>
            <button class="preset-btn" data-preset="night" id="btn-preset-night">
              <span>🌙</span> Night
            </button>
          </div>

          <!-- Intuitive 2-Axis Sun Position Sliders (Orbit & Height) -->
          <div class="sun-sliders-container">
            <!-- Axis 1: Azimuth / Horizontal Orbit -->
            <div class="sun-slider-row">
              <span class="sun-axis-name">Orbit</span>
              <div class="slider-track-wrap">
                <input type="range" class="ps-slider sun-slider-white" id="slider-sun-azim" min="0" max="360" value="37" />
              </div>
              <input type="number" class="ps-input-num" id="num-sun-azim" min="0" max="360" value="37" />
              <span class="slider-unit">°</span>
            </div>

            <!-- Axis 2: Elevation / Vertical Height -->
            <div class="sun-slider-row">
              <span class="sun-axis-name">Height</span>
              <div class="slider-track-wrap">
                <input type="range" class="ps-slider sun-slider-yellow" id="slider-sun-elev" min="-89" max="89" value="54" />
              </div>
              <input type="number" class="ps-input-num" id="num-sun-elev" min="-89" max="89" value="54" />
              <span class="slider-unit">°</span>
            </div>
          </div>
        </div>

        <!-- Ground Surface & Color (Default: Grass) -->
        <div class="section-card">
          <div class="section-header">
            <h2>Ground Surface & Color</h2>
            <div class="hex-group" title="Ground Surface Color">
              <input type="color" id="picker-ground-color" style="opacity:0; width:0; height:0; position:absolute;" value="#4A853D" />
              <div class="albedo-swatch" id="swatch-ground-color" style="background-color: #4A853D; cursor: pointer;" title="Click to choose ground color"></div>
              <input type="text" class="ps-input-hex" id="input-ground-hex" maxlength="7" spellcheck="false" value="#4A853D" />
            </div>
          </div>
          <div class="preset-segmented-control" style="margin-top: 6px;">
            <button class="ground-preset-btn active" data-color="#4A853D" id="btn-ground-grass">
              <span>🌿</span> Grass
            </button>
            <button class="ground-preset-btn" data-color="#78726B" id="btn-ground-neutral">
              <span>⚪</span> Studio Gray
            </button>
            <button class="ground-preset-btn" data-color="#6B4C35" id="btn-ground-dirt">
              <span>🍂</span> Dirt
            </button>
            <button class="ground-preset-btn" data-color="#C2A676" id="btn-ground-sand">
              <span>🏖️</span> Sand
            </button>
          </div>
        </div>

        <!-- Surface Finish Mode & Reflectivity Controls (Task 1.4 & Roughness / Specular Sliders) -->
        <div class="section-card">
          <div class="section-header">
            <h2>Surface Finish & Reflectivity</h2>
          </div>
          <div class="preset-segmented-control">
            <button class="finish-btn" data-finish="matte" id="btn-finish-matte">
              <span>⚪</span> Matte
            </button>
            <button class="finish-btn active" data-finish="satin" id="btn-finish-satin">
              <span>✨</span> Satin
            </button>
            <button class="finish-btn" data-finish="glossy" id="btn-finish-glossy">
              <span>💎</span> Glossy
            </button>
          </div>

          <!-- Direct Custom Sliders for Roughness and Specular Intensity -->
          <div class="finish-sliders-container" style="margin-top: 10px; display: flex; flex-direction: column; gap: 8px;">
            <!-- Roughness Slider -->
            <div class="sun-slider-row">
              <span class="sun-axis-name" style="width: 58px;">Roughness</span>
              <div class="slider-track-wrap">
                <input type="range" class="ps-slider finish-slider-roughness" id="slider-finish-roughness" min="0" max="100" value="45" />
              </div>
              <input type="number" class="ps-input-num" id="num-finish-roughness" min="0" max="100" value="45" />
              <span class="slider-unit">%</span>
            </div>

            <!-- Specular Intensity Slider -->
            <div class="sun-slider-row">
              <span class="sun-axis-name" style="width: 58px;">Specular</span>
              <div class="slider-track-wrap">
                <input type="range" class="ps-slider finish-slider-specular" id="slider-finish-specular" min="0" max="100" value="40" />
              </div>
              <input type="number" class="ps-input-num" id="num-finish-specular" min="0" max="100" value="40" />
              <span class="slider-unit">%</span>
            </div>
          </div>

          <p id="finish-desc" style="margin-top: 8px; font-size: 11px; color: var(--ps-text-secondary);">
            Satin: 45% Roughness, 40% Specular (soft, spread highlight)
          </p>
        </div>

        <!-- Interaction Guide Card -->
        <div class="section-card">
          <h2>Controls Guide</h2>
          <div style="display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--ps-text-secondary);">
            <p>• 🎨 <strong>5-Value Swatches</strong>: Click any swatch to paint with that calculated lighting tone.</p>
            <p>• 🎯 <strong>Color Picker Target</strong>: Drag the circular reticle anywhere on the sphere, ground, or sky to sample lit colors.</p>
            <p>• 🧊 <strong>3D Mesh Drag</strong>: Drag the sphere/cube directly to rotate it on its own local axes.</p>
            <p>• ☀️ <strong>Sun Position Controls</strong>: Drag the 3D sun marker or use the Orbit/Height sliders.</p>
            <p>• 🌿 <strong>Ground Plane</strong>: Grass floor by default; customize color to see bounce light and shadow shift in real time.</p>
            <p>• 🌌 <strong>Background Drag</strong>: Drag the sky background to orbit the camera.</p>
          </div>
        </div>
      </main>

      <footer class="status-bar" id="status-bar-container"></footer>
    `;

    // 1. Mount Viewport
    const viewportContainer = this.root.querySelector<HTMLElement>('#viewport-container');
    if (viewportContainer) {
      this.viewport = new Viewport({
        container: viewportContainer,
        initialColor: '#EB5757',
        initialMeshType: 'sphere',
      });

      this.viewport.onColorSample((rgb: { r: number; g: number; b: number }) => {
        this.bridge.setForegroundColor(rgb);
      });
    }

    // 2. Mount Analytical 5-Value Swatch Ramp
    const swatchRampContainer = this.root.querySelector<HTMLElement>('#swatch-ramp-container');
    if (swatchRampContainer && this.viewport) {
      this.swatchRamp = new SwatchRamp({
        container: swatchRampContainer,
        initialAlbedoHex: '#EB5757',
        initialEnv: this.viewport.getLightingEngine().getEnvironment(),
        initialFinish: this.viewport.getSurfaceFinish(),
        initialRoughness: this.viewport.getRoughness(),
        initialSpecular: this.viewport.getSpecular(),
        onSelectSwatch: (swatch) => {
          this.bridge.setForegroundColor(swatch.rgb);
        },
      });

      // Synchronize finish changes to swatch ramp
      this.viewport.onSurfaceFinishChange((finish, roughness, specular) => {
        this.swatchRamp?.updateParameters({ finish, roughness, specular });
      });
    }

    // 3. Mount Color Controls (HSB Sliders & Hex input)
    const colorControlsContainer = this.root.querySelector<HTMLElement>('#color-controls-container');
    if (colorControlsContainer) {
      this.colorControls = new ColorControls({
        container: colorControlsContainer,
        initialHex: '#EB5757',
        onChange: (_hsb, _rgb, hex) => {
          this.viewport?.setSphereColor(hex);
          this.swatchRamp?.updateParameters({ albedoHex: hex });
        },
      });
    }

    // 4. Mount Status Bar
    const statusBarContainer = this.root.querySelector<HTMLElement>('#status-bar-container');
    if (statusBarContainer) {
      new StatusBar(statusBarContainer, this.bridge);
    }

    // 5. Bridge color events (if any external source updates color)
    this.bridge.onColorChange((_event: ColorChangeEvent) => {
      // Kept in sync
    });

    this.bindMeshToggleButtons();
    this.bindPresetButtons();
    this.bindSunSliders();
    this.bindLightColorControls();
    this.bindGroundColorControls();
    this.bindSurfaceFinishControls();
  }

  private bindMeshToggleButtons(): void {
    const meshBtns = this.root.querySelectorAll<HTMLButtonElement>('.mesh-toggle-btn');
    meshBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const meshType = btn.getAttribute('data-mesh') as MeshGeometryType;
        if (meshType && this.viewport) {
          this.viewport.setMeshType(meshType);
          meshBtns.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });

    const resetBtn = this.root.querySelector<HTMLButtonElement>('#btn-reset-rotation');
    resetBtn?.addEventListener('click', () => {
      this.viewport?.resetMeshRotation();
    });
  }

  private bindPresetButtons(): void {
    const presetBtns = this.root.querySelectorAll<HTMLButtonElement>('.preset-btn');
    presetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-preset') as LightingPreset;
        if (preset && this.viewport) {
          this.viewport.setPreset(preset);
          presetBtns.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });
  }

  private bindSunSliders(): void {
    if (!this.viewport) return;

    // Sliders
    const azimSlider = this.root.querySelector<HTMLInputElement>('#slider-sun-azim')!;
    const elevSlider = this.root.querySelector<HTMLInputElement>('#slider-sun-elev')!;

    // Number Inputs
    const azimNum = this.root.querySelector<HTMLInputElement>('#num-sun-azim')!;
    const elevNum = this.root.querySelector<HTMLInputElement>('#num-sun-elev')!;

    const presetBtns = this.root.querySelectorAll<HTMLButtonElement>('.preset-btn');

    const applyAnglesFromUI = (azimDeg: number, elevDeg: number) => {
      // Immediately deselect presets on manual slider adjustment
      presetBtns.forEach((btn) => btn.classList.remove('active'));

      const azimRad = (azimDeg * Math.PI) / 180;
      const elevRad = (elevDeg * Math.PI) / 180;
      this.viewport?.setLightAngles(azimRad, elevRad);
    };

    // Slider inputs
    azimSlider.addEventListener('input', () => {
      const val = parseInt(azimSlider.value, 10);
      azimNum.value = val.toString();
      applyAnglesFromUI(val, parseInt(elevSlider.value, 10));
    });

    elevSlider.addEventListener('input', () => {
      const val = parseInt(elevSlider.value, 10);
      elevNum.value = val.toString();
      applyAnglesFromUI(parseInt(azimSlider.value, 10), val);
    });

    // Number inputs
    azimNum.addEventListener('change', () => {
      let val = parseInt(azimNum.value, 10);
      if (isNaN(val)) val = 0;
      val = Math.max(0, Math.min(360, val));
      azimNum.value = val.toString();
      azimSlider.value = val.toString();
      applyAnglesFromUI(val, parseInt(elevSlider.value, 10));
    });

    elevNum.addEventListener('change', () => {
      let val = parseInt(elevNum.value, 10);
      if (isNaN(val)) val = 0;
      val = Math.max(-89, Math.min(89, val));
      elevNum.value = val.toString();
      elevSlider.value = val.toString();
      applyAnglesFromUI(parseInt(azimSlider.value, 10), val);
    });

    // Synchronize presets and sun angle changes back to the sliders & swatch ramp
    this.viewport.getLightingEngine().onEnvironmentChange((env) => {
      const azimDeg = Math.round((env.keyLight.azimuth * 180) / Math.PI);
      const elevDeg = Math.round((env.keyLight.elevation * 180) / Math.PI);

      if (document.activeElement !== azimSlider && document.activeElement !== azimNum) {
        azimSlider.value = azimDeg.toString();
        azimNum.value = azimDeg.toString();
      }

      if (document.activeElement !== elevSlider && document.activeElement !== elevNum) {
        elevSlider.value = elevDeg.toString();
        elevNum.value = elevDeg.toString();
      }

      presetBtns.forEach((btn) => {
        if (env.preset !== 'custom' && btn.getAttribute('data-preset') === env.preset) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      // Update analytical swatches
      this.swatchRamp?.updateParameters({ env });
    });
  }

  private bindLightColorControls(): void {
    if (!this.viewport) return;

    const swatchEl = this.root.querySelector<HTMLElement>('#swatch-light-color')!;
    const pickerEl = this.root.querySelector<HTMLInputElement>('#picker-light-color')!;
    const hexInput = this.root.querySelector<HTMLInputElement>('#input-light-hex')!;
    const presetBtns = this.root.querySelectorAll<HTMLButtonElement>('.preset-btn');

    swatchEl.addEventListener('click', () => {
      pickerEl.click();
    });

    const applyLightColor = (hex: string) => {
      swatchEl.style.backgroundColor = hex;
      pickerEl.value = hex;
      if (hexInput !== document.activeElement) {
        hexInput.value = hex.toUpperCase();
      }

      presetBtns.forEach((btn) => btn.classList.remove('active'));
      this.viewport?.setLightColor(hex);
      if (this.viewport) {
        this.swatchRamp?.updateParameters({ env: this.viewport.getLightingEngine().getEnvironment() });
      }
    };

    pickerEl.addEventListener('input', () => {
      applyLightColor(pickerEl.value);
    });

    hexInput.addEventListener('input', () => {
      let val = hexInput.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        applyLightColor(val);
      }
    });

    // Synchronize preset changes to light color swatch
    this.viewport.getLightingEngine().onEnvironmentChange((env) => {
      const hex = '#' + env.keyLight.color.getHexString();
      swatchEl.style.backgroundColor = hex;
      pickerEl.value = hex;
      if (hexInput !== document.activeElement) {
        hexInput.value = hex.toUpperCase();
      }
    });
  }

  private bindGroundColorControls(): void {
    if (!this.viewport) return;

    const swatchEl = this.root.querySelector<HTMLElement>('#swatch-ground-color')!;
    const pickerEl = this.root.querySelector<HTMLInputElement>('#picker-ground-color')!;
    const hexInput = this.root.querySelector<HTMLInputElement>('#input-ground-hex')!;
    const groundBtns = this.root.querySelectorAll<HTMLButtonElement>('.ground-preset-btn');

    swatchEl.addEventListener('click', () => {
      pickerEl.click();
    });

    const applyGroundColor = (hex: string) => {
      swatchEl.style.backgroundColor = hex;
      pickerEl.value = hex;
      if (hexInput !== document.activeElement) {
        hexInput.value = hex.toUpperCase();
      }

      groundBtns.forEach((b) => {
        if (b.getAttribute('data-color')?.toUpperCase() === hex.toUpperCase()) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });

      this.viewport?.setGroundColor(hex);
      if (this.viewport) {
        this.swatchRamp?.updateParameters({ env: this.viewport.getLightingEngine().getEnvironment() });
      }
    };

    pickerEl.addEventListener('input', () => {
      applyGroundColor(pickerEl.value);
    });

    hexInput.addEventListener('input', () => {
      let val = hexInput.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        applyGroundColor(val);
      }
    });

    groundBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const color = btn.getAttribute('data-color');
        if (color) {
          applyGroundColor(color);
        }
      });
    });
  }

  private bindSurfaceFinishControls(): void {
    if (!this.viewport) return;

    const finishBtns = this.root.querySelectorAll<HTMLButtonElement>('.finish-btn');
    const descEl = this.root.querySelector<HTMLElement>('#finish-desc');

    const roughnessSlider = this.root.querySelector<HTMLInputElement>('#slider-finish-roughness')!;
    const roughnessNum = this.root.querySelector<HTMLInputElement>('#num-finish-roughness')!;
    const specularSlider = this.root.querySelector<HTMLInputElement>('#slider-finish-specular')!;
    const specularNum = this.root.querySelector<HTMLInputElement>('#num-finish-specular')!;

    const updateUIState = (finish: SurfaceFinish, roughness: number, specular: number) => {
      const roughPct = Math.round(roughness * 100);
      const specPct = Math.round(specular * 100);

      if (document.activeElement !== roughnessSlider && document.activeElement !== roughnessNum) {
        roughnessSlider.value = roughPct.toString();
        roughnessNum.value = roughPct.toString();
      }
      if (document.activeElement !== specularSlider && document.activeElement !== specularNum) {
        specularSlider.value = specPct.toString();
        specularNum.value = specPct.toString();
      }

      finishBtns.forEach((b) => {
        if (b.getAttribute('data-finish') === finish) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });

      if (descEl) {
        if (finish !== 'custom' && finish in SURFACE_FINISHES) {
          const cfg = SURFACE_FINISHES[finish as Exclude<SurfaceFinish, 'custom'>];
          descEl.textContent = `${cfg.name}: ${cfg.description}`;
        } else {
          descEl.textContent = `Custom: ${roughPct}% Roughness, ${specPct}% Specular`;
        }
      }
    };

    // Preset button clicks
    finishBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const finish = btn.getAttribute('data-finish') as SurfaceFinish;
        if (finish && this.viewport) {
          this.viewport.setSurfaceFinish(finish);
        }
      });
    });

    // Slider inputs
    const applySlidersFromUI = () => {
      const r = Math.max(0, Math.min(100, parseInt(roughnessSlider.value, 10) || 0)) / 100;
      const s = Math.max(0, Math.min(100, parseInt(specularSlider.value, 10) || 0)) / 100;
      this.viewport?.setRoughnessAndSpecular(r, s);
    };

    roughnessSlider.addEventListener('input', () => {
      roughnessNum.value = roughnessSlider.value;
      applySlidersFromUI();
    });

    roughnessNum.addEventListener('change', () => {
      let val = parseInt(roughnessNum.value, 10);
      if (isNaN(val)) val = 0;
      val = Math.max(0, Math.min(100, val));
      roughnessNum.value = val.toString();
      roughnessSlider.value = val.toString();
      applySlidersFromUI();
    });

    specularSlider.addEventListener('input', () => {
      specularNum.value = specularSlider.value;
      applySlidersFromUI();
    });

    specularNum.addEventListener('change', () => {
      let val = parseInt(specularNum.value, 10);
      if (isNaN(val)) val = 0;
      val = Math.max(0, Math.min(100, val));
      specularNum.value = val.toString();
      specularSlider.value = val.toString();
      applySlidersFromUI();
    });

    // Listen to changes from viewport (initial setup & updates)
    this.viewport.onSurfaceFinishChange((finish, roughness, specular) => {
      updateUIState(finish, roughness, specular);
    });
  }

  public getColorControls(): ColorControls | null {
    return this.colorControls;
  }

  public getSwatchRamp(): SwatchRamp | null {
    return this.swatchRamp;
  }

  public destroy(): void {
    this.viewport?.dispose();
    this.viewport = null;
    this.colorControls = null;
    this.swatchRamp = null;
  }
}
