import { IPhotoshopBridge, ColorChangeEvent } from '../bridge/IPhotoshopBridge';
import { Viewport } from '../render/Viewport';
import { LightingPreset, SurfaceFinish } from '../core/types';
import { SURFACE_FINISHES } from '../core/material';
import { StatusBar } from './statusBar';
import { ColorControls } from './colorControls';
import { SwatchRamp } from './swatchRamp';
import { DEFAULT_ALBEDO_HEX, DEFAULT_GROUND_HEX } from '../core/defaults';
import {
  LIGHTING_PRESET_ORDER,
  LIGHTING_PRESETS,
  MAX_KEY_ANGULAR_RADIUS_DEG,
} from '../core/lighting';
import { SPHERE_SLOTS, SphereSlotId } from '../core/sphereSlots';

/** Icon-only time-of-day buttons (D7); names live in title/aria-label. */
const TIME_OF_DAY_ICONS: Record<LightingPreset, string> = {
  'early-morning': '🌄',
  morning: '🌤️',
  midday: '☀️',
  afternoon: '🌞',
  'near-sunset': '🌇',
  'golden-hour': '🌅',
  night: '🌙',
};

export class AppShell {
  private root: HTMLElement;
  private bridge: IPhotoshopBridge;
  private viewport: Viewport | null = null;
  private colorControls: ColorControls | null = null;
  private swatchRamp: SwatchRamp | null = null;
  /**
   * Last preset the user applied. The engine reports `custom` as soon as a
   * lighting control is moved, but the collapsed Sun summary still needs a
   * name to show next to `edited` (D9).
   */
  private lastPreset: LightingPreset = 'midday';

  constructor(root: HTMLElement, bridge: IPhotoshopBridge) {
    this.root = root;
    this.bridge = bridge;
    this.init();
  }

  private init(): void {
    this.root.innerHTML = `
      <header class="panel-header">
        <div class="title-group">
          <h1>Lumiform Colorpicker</h1>
          <span class="badge">v1.0.0</span>
        </div>
        <!-- Task 3.6 wires this to the full-panel Controls Guide takeover. -->
        <button
          type="button"
          class="panel-info-btn"
          id="btn-open-guide"
          title="Controls Guide"
          aria-label="Open Controls Guide"
          aria-haspopup="dialog"
        >i</button>
      </header>

      <main class="panel-content">
        <!-- 1. Canvas: fixed 412:227 framing, eyedropper reticle -->
        <div class="viewport-card" id="viewport-container"></div>

        <!-- 2. Time of Day (always open): icon strip + snapped slider -->
        <section class="section-card" aria-labelledby="time-of-day-heading">
          <div class="section-header time-of-day-header">
            <h2 id="time-of-day-heading">Time of Day</h2>
            <div class="time-of-day-state" aria-live="polite">
              <span class="time-state-name" id="time-of-day-label">Midday</span>
              <span class="time-state-edited" id="time-of-day-edited" hidden>· edited</span>
              <button
                type="button"
                class="time-reset-btn"
                id="btn-time-reset"
                title="Restore Midday"
                aria-label="Restore Midday"
                hidden
              >↺</button>
            </div>
          </div>
          <div class="time-strip">
            <div class="time-strip-icons" role="group" aria-label="Time of day presets">
              ${LIGHTING_PRESET_ORDER.map(
                (preset) => `
                <button
                  type="button"
                  class="time-icon-btn"
                  data-preset="${preset}"
                  title="${LIGHTING_PRESETS[preset].name}"
                  aria-label="${LIGHTING_PRESETS[preset].name}"
                  aria-pressed="false"
                >${TIME_OF_DAY_ICONS[preset]}</button>
              `
              ).join('')}
            </div>
            <input
              type="range"
              class="ps-slider time-range"
              id="slider-time-of-day"
              min="0"
              max="${LIGHTING_PRESET_ORDER.length - 1}"
              step="1"
              value="${LIGHTING_PRESET_ORDER.indexOf('midday')}"
              aria-label="Time of day"
            />
          </div>
        </section>

        <!-- 3. Analytical 5-Value Swatch Ramp (always open) -->
        <div class="section-card" id="swatch-ramp-container"></div>

        <!-- 4. Spheres (collapsed by default) -->
        <details class="section-card section-collapsible" id="section-spheres">
          <summary class="section-summary">
            <span class="section-title">Spheres</span>
            <span class="section-state" id="spheres-summary">Near · #E3E3E3</span>
            <span class="section-chevron" aria-hidden="true"></span>
          </summary>
          <div class="section-body">
            <!-- Sphere Size (per selected sphere, bottom stays on the ground) -->
            <div class="sun-slider-row mesh-scale-row">
              <span class="sun-axis-name" style="width: 82px;">Size · <span id="size-target">Near</span></span>
              <div class="slider-track-wrap">
                <input type="range" class="ps-slider" id="slider-mesh-scale" min="20" max="100" value="100" />
              </div>
              <input type="number" class="ps-input-num" id="num-mesh-scale" min="20" max="100" value="100" />
              <span class="slider-unit">%</span>
            </div>

            <div class="field-row">
              <span class="field-label">Visible spheres</span>
              <div class="count-control" id="sphere-count-control">
                <button class="count-btn" data-count="1">1</button>
                <button class="count-btn" data-count="2">2</button>
                <button class="count-btn active" data-count="3">3</button>
              </div>
            </div>

            <div class="sphere-selector-row">
              <button class="sphere-select-btn active" data-sphere="center">Center <span>Near</span></button>
              <button class="sphere-select-btn" data-sphere="right">Right <span>Mid</span></button>
              <button class="sphere-select-btn" data-sphere="left">Left <span>Far</span></button>
              <button class="sphere-delete-btn" id="btn-delete-sphere" title="Delete the selected sphere">Delete</button>
            </div>

            <label class="link-colors-row">
              <input type="checkbox" id="toggle-link-colors" />
              <span>Link colors across all visible spheres</span>
            </label>
            <p class="section-note" id="sphere-hint">Select a sphere in the canvas or above to edit its color and size.</p>

            <!-- In-Panel HSB & Hex Color Controls (Task 1.5) -->
            <div class="sphere-color-block" id="color-controls-container"></div>
          </div>
        </details>

        <!-- 5. Sun & Atmosphere (collapsed by default) -->
        <details class="section-card section-collapsible" id="section-sun">
          <summary class="section-summary">
            <span class="section-title">Sun &amp; Atmosphere</span>
            <span class="section-state" id="sun-summary">Midday</span>
            <span class="section-chevron" aria-hidden="true"></span>
          </summary>
          <div class="section-body">
            <div class="field-row">
              <span class="field-label">Light</span>
              <div class="hex-group" title="Key Light (Sun) Color">
                <input type="color" id="picker-light-color" style="opacity:0; width:0; height:0; position:absolute;" value="#FFF2EF" />
                <div class="albedo-swatch" id="swatch-light-color" style="background-color: #FFF2EF; cursor: pointer;" title="Click to choose light color"></div>
                <input type="text" class="ps-input-hex" id="input-light-hex" maxlength="7" spellcheck="false" value="#FFF2EF" />
              </div>
            </div>

            <!-- Intuitive 2-Axis Sun Position Sliders (Orbit & Height) -->
            <div class="sun-sliders-container">
              <!-- Axis 1: Azimuth / Horizontal Orbit -->
              <div class="sun-slider-row">
                <span class="sun-axis-name">Orbit</span>
                <div class="slider-track-wrap">
                  <input type="range" class="ps-slider sun-slider-white" id="slider-sun-azim" min="0" max="360" value="284" />
                </div>
                <input type="number" class="ps-input-num" id="num-sun-azim" min="0" max="360" value="284" />
                <span class="slider-unit">°</span>
              </div>

              <!-- Axis 2: Elevation / Vertical Height -->
              <div class="sun-slider-row">
                <span class="sun-axis-name">Height</span>
                <div class="slider-track-wrap">
                  <input type="range" class="ps-slider sun-slider-yellow" id="slider-sun-elev" min="-89" max="89" value="58" />
                </div>
                <input type="number" class="ps-input-num" id="num-sun-elev" min="-89" max="89" value="58" />
                <span class="slider-unit">°</span>
              </div>

              <!-- Axis 3: Terminator / shadow edge hardness (key light angular size) -->
              <div class="sun-slider-row">
                <span class="sun-axis-name" style="width: 70px;" title="How sharply the lit side falls into shadow">Terminator</span>
                <div class="slider-track-wrap">
                  <input type="range" class="ps-slider terminator-slider" id="slider-terminator" min="0" max="${MAX_KEY_ANGULAR_RADIUS_DEG}" value="14" />
                </div>
                <input type="number" class="ps-input-num" id="num-terminator" min="0" max="${MAX_KEY_ANGULAR_RADIUS_DEG}" value="14" />
                <span class="slider-unit">°</span>
              </div>
            </div>
            <p class="section-note" id="terminator-note">
              0° gives a hard terminator, ${MAX_KEY_ANGULAR_RADIUS_DEG}° a broad softbox shadow. Choosing a preset restores its calibrated softness.
            </p>

            <div class="section-divider"></div>

            <!-- Aerial perspective -->
            <div class="sun-slider-row">
              <span class="sun-axis-name" style="width: 58px;">Haze</span>
              <div class="slider-track-wrap">
                <input type="range" class="ps-slider" id="slider-haze" min="0" max="100" value="50" />
              </div>
              <input type="number" class="ps-input-num" id="num-haze" min="0" max="100" value="50" />
              <span class="slider-unit">%</span>
            </div>
            <p class="section-note">Depth fog: the near sphere stays clear while the mid and far spheres dissolve into the horizon haze. Selecting a time of day restores its calibrated Haze amount.</p>
          </div>
        </details>

        <!-- 6. Ground Surface & Color (collapsed by default) -->
        <details class="section-card section-collapsible" id="section-ground">
          <summary class="section-summary">
            <span class="section-title">Ground Surface &amp; Color</span>
            <span class="section-state" id="ground-summary">${DEFAULT_GROUND_HEX}</span>
            <span class="section-chevron" aria-hidden="true"></span>
          </summary>
          <div class="section-body">
            <div class="field-row">
              <span class="field-label">Color</span>
              <div class="hex-group" title="Ground Surface Color">
                <input type="color" id="picker-ground-color" style="opacity:0; width:0; height:0; position:absolute;" value="${DEFAULT_GROUND_HEX}" />
                <div class="albedo-swatch" id="swatch-ground-color" style="background-color: ${DEFAULT_GROUND_HEX}; cursor: pointer;" title="Click to choose ground color"></div>
                <input type="text" class="ps-input-hex" id="input-ground-hex" maxlength="7" spellcheck="false" value="${DEFAULT_GROUND_HEX}" />
              </div>
            </div>
            <div class="preset-segmented-control">
              <button class="ground-preset-btn active" data-color="${DEFAULT_GROUND_HEX}" id="btn-ground-grass">
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
        </details>

        <!-- 7. Surface Finish & Reflectivity (collapsed by default) -->
        <details class="section-card section-collapsible" id="section-finish">
          <summary class="section-summary">
            <span class="section-title">Surface Finish &amp; Reflectivity</span>
            <span class="section-state" id="finish-summary">Satin</span>
            <span class="section-chevron" aria-hidden="true"></span>
          </summary>
          <div class="section-body">
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
            <div class="finish-sliders-container">
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

            <p id="finish-desc" class="section-note">
              Satin: 75% Roughness, 35% Specular (broad, diffused sheen)
            </p>
          </div>
        </details>
      </main>

      <footer class="status-bar" id="status-bar-container"></footer>
    `;

    // 1. Mount Viewport
    const viewportContainer = this.root.querySelector<HTMLElement>('#viewport-container');
    if (viewportContainer) {
      this.viewport = new Viewport({
        container: viewportContainer,
        initialColor: DEFAULT_ALBEDO_HEX,
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
        initialAlbedoHex: this.viewport.getSelectedSphereColor(),
        initialEnv: this.viewport.getLightingEngine().getEnvironment(),
        initialFinish: this.viewport.getSurfaceFinish(),
        initialRoughness: this.viewport.getRoughness(),
        initialSpecular: this.viewport.getSpecular(),
        initialHaze: this.viewport.getHaze(),
        initialDistance: this.viewport.getSelectedSphereDistance(),
        onSelectSwatch: (swatch) => {
          this.bridge.setForegroundColor(swatch.rgb);
        },
      });

      // Synchronize finish changes to swatch ramp
      this.viewport.onSurfaceFinishChange((finish, roughness, specular) => {
        this.swatchRamp?.updateParameters({
          finish,
          roughness,
          specular,
          haze: this.viewport?.getHaze(),
          distance: this.viewport?.getSelectedSphereDistance(),
        });
      });
    }

    // 3. Mount Color Controls (HSB Sliders & Hex input)
    const colorControlsContainer = this.root.querySelector<HTMLElement>('#color-controls-container');
    if (colorControlsContainer) {
      this.colorControls = new ColorControls({
        container: colorControlsContainer,
        initialHex: this.viewport?.getSelectedSphereColor() ?? DEFAULT_ALBEDO_HEX,
        onChange: (_hsb, _rgb, hex) => {
          this.viewport?.setSphereColor(hex);
          this.swatchRamp?.updateParameters({
            albedoHex: hex,
            haze: this.viewport?.getHaze(),
            distance: this.viewport?.getSelectedSphereDistance(),
          });
          this.updateSectionSummaries();
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

    this.viewport?.onSelectionChange(() => this.syncSphereUI());

    this.bindSphereControls();
    this.bindHazeControl();
    this.bindMeshScaleControl();
    this.bindTimeOfDayStrip();
    this.bindSunSliders();
    this.bindTerminatorControl();
    this.bindLightColorControls();
    this.bindGroundColorControls();
    this.bindSurfaceFinishControls();
    this.bindSectionSummaryListeners();

    this.syncSphereUI();
  }

  /**
   * Keeps the collapsed-header state lines live (D4). Both subscriptions fire
   * once immediately, so the panel opens with correct summaries.
   */
  private bindSectionSummaryListeners(): void {
    if (!this.viewport) return;

    this.viewport.getLightingEngine().onEnvironmentChange(() => {
      this.updateSectionSummaries();
    });

    this.viewport.onSurfaceFinishChange(() => {
      this.updateSectionSummaries();
    });
  }

  /**
   * The preset the strip should point at, plus whether the lighting has been
   * manually edited since it was applied. The thumb stays parked on the last
   * stop while edited (D9).
   */
  private getTimeOfDayState(): { name: string; edited: boolean } {
    const env = this.viewport!.getLightingEngine().getEnvironment();
    if (env.preset !== 'custom') {
      this.lastPreset = env.preset;
    }
    return {
      name: LIGHTING_PRESETS[this.lastPreset].name,
      edited: env.preset === 'custom',
    };
  }

  private updateSectionSummaries(): void {
    if (!this.viewport) return;

    // Spheres · <selected depth name> · <selected albedo>
    const selectedId = this.viewport.getSelectedSphereId();
    const selectedSlot = SPHERE_SLOTS.find((slot) => slot.id === selectedId);
    this.setStateText(
      '#spheres-summary',
      `${selectedSlot?.depthLabel ?? 'Near'} · ${this.viewport.getSelectedSphereColor().toUpperCase()}`
    );

    // Sun & Atmosphere · <last preset> [· edited]
    const timeOfDay = this.getTimeOfDayState();
    this.setStateText(
      '#sun-summary',
      `${timeOfDay.name}${timeOfDay.edited ? ' · edited' : ''}`
    );

    // Ground · <current ground albedo>
    this.setStateText(
      '#ground-summary',
      `#${this.viewport.getGroundColor().getHexString().toUpperCase()}`
    );

    // Surface Finish · <finish name>
    const finish = this.viewport.getSurfaceFinish();
    const finishName =
      finish === 'custom'
        ? 'Custom'
        : SURFACE_FINISHES[finish as Exclude<SurfaceFinish, 'custom'>]?.name ?? 'Matte';
    this.setStateText('#finish-summary', finishName);
  }

  private setStateText(selector: string, text: string): void {
    const el = this.root.querySelector<HTMLElement>(selector);
    if (el && el.textContent !== text) {
      el.textContent = text;
    }
  }

  private bindSphereControls(): void {
    if (!this.viewport) return;

    // Count 1 / 2 / 3
    this.root.querySelectorAll<HTMLButtonElement>('.count-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const count = parseInt(btn.getAttribute('data-count') ?? '3', 10);
        this.viewport?.setSphereCount(count);
        this.syncSphereUI();
      });
    });

    // Center / Right / Left selection
    this.root.querySelectorAll<HTMLButtonElement>('.sphere-select-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-sphere') as SphereSlotId | null;
        if (id) this.viewport?.selectSphere(id);
      });
    });

    // Delete selected sphere
    this.root.querySelector<HTMLButtonElement>('#btn-delete-sphere')?.addEventListener('click', () => {
      this.viewport?.deleteSelectedSphere();
      this.syncSphereUI();
    });

    // Link colors
    const linkToggle = this.root.querySelector<HTMLInputElement>('#toggle-link-colors');
    linkToggle?.addEventListener('change', () => {
      this.viewport?.setLinkedColors(linkToggle.checked);
      this.syncSphereUI();
    });
  }

  private bindHazeControl(): void {
    if (!this.viewport) return;

    const slider = this.root.querySelector<HTMLInputElement>('#slider-haze')!;
    const num = this.root.querySelector<HTMLInputElement>('#num-haze')!;

    const applyHaze = (percent: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(percent)));
      this.viewport?.setHaze(clamped / 100);
      this.swatchRamp?.updateParameters({
        haze: clamped / 100,
        distance: this.viewport?.getSelectedSphereDistance(),
      });
    };

    slider.addEventListener('input', () => {
      num.value = slider.value;
      applyHaze(parseInt(slider.value, 10));
    });

    num.addEventListener('change', () => {
      let val = parseInt(num.value, 10);
      if (isNaN(val)) val = 50;
      val = Math.max(0, Math.min(100, val));
      num.value = val.toString();
      slider.value = val.toString();
      applyHaze(val);
    });
  }

  /** Keeps sphere count, selector, size, color panel, and swatch ramp aligned with the viewport state. */
  private syncSphereUI(): void {
    if (!this.viewport) return;

    const activeCount = this.viewport.getActiveCount();
    const selectedId = this.viewport.getSelectedSphereId();

    this.root.querySelectorAll<HTMLButtonElement>('.count-btn').forEach((btn) => {
      btn.classList.toggle('active', parseInt(btn.getAttribute('data-count') ?? '0', 10) === activeCount);
    });

    this.root.querySelectorAll<HTMLButtonElement>('.sphere-select-btn').forEach((btn) => {
      const id = btn.getAttribute('data-sphere') as SphereSlotId | null;
      if (!id) return;
      const active = this.viewport!.isSphereActive(id);
      btn.disabled = !active;
      btn.classList.toggle('active', active && id === selectedId);
    });

    const deleteBtn = this.root.querySelector<HTMLButtonElement>('#btn-delete-sphere');
    if (deleteBtn) deleteBtn.disabled = selectedId === 'center';

    const sizeLabel = this.root.querySelector<HTMLElement>('#size-target');
    if (sizeLabel) {
      const slot = SPHERE_SLOTS.find((s) => s.id === selectedId);
      sizeLabel.textContent = slot?.depthLabel ?? 'Near';
    }

    const sizePct = Math.round(this.viewport.getSelectedSphereSize() * 100);
    const sizeSlider = this.root.querySelector<HTMLInputElement>('#slider-mesh-scale');
    const sizeNum = this.root.querySelector<HTMLInputElement>('#num-mesh-scale');
    if (sizeSlider && document.activeElement !== sizeSlider) sizeSlider.value = sizePct.toString();
    if (sizeNum && document.activeElement !== sizeNum) sizeNum.value = sizePct.toString();

    const hazePct = Math.round(this.viewport.getHaze() * 100);
    const hazeSlider = this.root.querySelector<HTMLInputElement>('#slider-haze');
    const hazeNum = this.root.querySelector<HTMLInputElement>('#num-haze');
    if (hazeSlider && document.activeElement !== hazeSlider) hazeSlider.value = hazePct.toString();
    if (hazeNum && document.activeElement !== hazeNum) hazeNum.value = hazePct.toString();

    if (this.colorControls) {
      this.colorControls.setHex(this.viewport.getSelectedSphereColor(), false);
    }

    if (this.swatchRamp) {
      this.swatchRamp.updateParameters({
        albedoHex: this.viewport.getSelectedSphereColor(),
        haze: this.viewport.getHaze(),
        distance: this.viewport.getSelectedSphereDistance(),
      });
    }

    this.updateSectionSummaries();
  }

  private bindMeshScaleControl(): void {
    if (!this.viewport) return;

    const slider = this.root.querySelector<HTMLInputElement>('#slider-mesh-scale')!;
    const num = this.root.querySelector<HTMLInputElement>('#num-mesh-scale')!;

    const applyScale = (percent: number) => {
      const clamped = Math.max(20, Math.min(100, Math.round(percent)));
      this.viewport?.setSelectedSphereSize(clamped / 100);
      this.swatchRamp?.updateParameters({
        distance: this.viewport?.getSelectedSphereDistance(),
      });
    };

    slider.addEventListener('input', () => {
      num.value = slider.value;
      applyScale(parseInt(slider.value, 10));
    });

    num.addEventListener('change', () => {
      let val = parseInt(num.value, 10);
      if (isNaN(val)) val = 100;
      val = Math.max(20, Math.min(100, val));
      num.value = val.toString();
      slider.value = val.toString();
      applyScale(val);
    });
  }

  /**
   * Time-of-day strip: seven icon buttons above one snapping slider (D5-D9).
   * Clicking an icon and landing on a slider stop are the same action, so the
   * two paths cannot disagree.
   */
  private bindTimeOfDayStrip(): void {
    if (!this.viewport) return;

    const slider = this.root.querySelector<HTMLInputElement>('#slider-time-of-day')!;
    const resetBtn = this.root.querySelector<HTMLButtonElement>('#btn-time-reset')!;
    const label = this.root.querySelector<HTMLElement>('#time-of-day-label')!;
    const editedEl = this.root.querySelector<HTMLElement>('#time-of-day-edited')!;
    const iconBtns = Array.from(this.root.querySelectorAll<HTMLButtonElement>('.time-icon-btn'));

    const applyPreset = (preset: LightingPreset) => {
      if (!this.viewport) return;
      this.lastPreset = preset;
      this.viewport.setPreset(preset);
      // The preset carries its own haze amount and softness; pull every other
      // control and the swatch ramp back in sync with it.
      this.syncSphereUI();
    };

    iconBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-preset') as LightingPreset | null;
        if (preset) applyPreset(preset);
      });
    });

    slider.addEventListener('input', () => {
      const index = Math.max(
        0,
        Math.min(
          LIGHTING_PRESET_ORDER.length - 1,
          Number.parseInt(slider.value, 10) || 0
        )
      );
      applyPreset(LIGHTING_PRESET_ORDER[index]);
    });

    // `↺` re-applies only the last preset's six lighting values (D10).
    resetBtn.addEventListener('click', () => {
      applyPreset(this.lastPreset);
    });

    this.viewport.getLightingEngine().onEnvironmentChange(() => {
      const { name, edited } = this.getTimeOfDayState();
      const index = Math.max(0, LIGHTING_PRESET_ORDER.indexOf(this.lastPreset));

      label.textContent = name;
      editedEl.hidden = !edited;
      resetBtn.hidden = !edited;
      resetBtn.title = `Restore ${name}`;
      resetBtn.setAttribute('aria-label', `Restore ${name}`);

      slider.value = index.toString();
      slider.setAttribute('aria-valuetext', edited ? `${name}, edited` : name);

      iconBtns.forEach((btn) => {
        const active = !edited && btn.getAttribute('data-preset') === this.lastPreset;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
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

    const applyAnglesFromUI = (azimDeg: number, elevDeg: number) => {
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
      const azimDeg = Math.round((((env.keyLight.azimuth * 180) / Math.PI) % 360 + 360) % 360);
      const elevDeg = Math.round((env.keyLight.elevation * 180) / Math.PI);

      if (document.activeElement !== azimSlider && document.activeElement !== azimNum) {
        azimSlider.value = azimDeg.toString();
        azimNum.value = azimDeg.toString();
      }

      if (document.activeElement !== elevSlider && document.activeElement !== elevNum) {
        elevSlider.value = elevDeg.toString();
        elevNum.value = elevDeg.toString();
      }

      // Update analytical swatches
      this.swatchRamp?.updateParameters({
        env,
        haze: this.viewport?.getHaze(),
        distance: this.viewport?.getSelectedSphereDistance(),
      });
    });
  }

  private bindTerminatorControl(): void {
    if (!this.viewport) return;

    const slider = this.root.querySelector<HTMLInputElement>('#slider-terminator')!;
    const num = this.root.querySelector<HTMLInputElement>('#num-terminator')!;

    const applyDegrees = (deg: number) => {
      const clamped = Math.max(0, Math.min(MAX_KEY_ANGULAR_RADIUS_DEG, Math.round(deg)));
      this.viewport?.setKeyAngularRadius((clamped * Math.PI) / 180);
    };

    slider.addEventListener('input', () => {
      num.value = slider.value;
      applyDegrees(parseInt(slider.value, 10));
    });

    num.addEventListener('change', () => {
      let val = parseInt(num.value, 10);
      if (isNaN(val)) {
        val = Math.round((this.viewport!.getLightingEngine().getKeyAngularRadius() * 180) / Math.PI);
      }
      val = Math.max(0, Math.min(MAX_KEY_ANGULAR_RADIUS_DEG, val));
      num.value = val.toString();
      slider.value = val.toString();
      applyDegrees(val);
    });

    // Presets and elevation changes move the calibrated softness; mirror that
    // into the control unless the user is actively editing it.
    this.viewport.getLightingEngine().onEnvironmentChange((env) => {
      const deg = Math.round((env.keyLight.angularRadius * 180) / Math.PI);
      if (document.activeElement !== slider && document.activeElement !== num) {
        slider.value = deg.toString();
        num.value = deg.toString();
      }
    });
  }

  private bindLightColorControls(): void {
    if (!this.viewport) return;

    const swatchEl = this.root.querySelector<HTMLElement>('#swatch-light-color')!;
    const pickerEl = this.root.querySelector<HTMLInputElement>('#picker-light-color')!;
    const hexInput = this.root.querySelector<HTMLInputElement>('#input-light-hex')!;

    swatchEl.addEventListener('click', () => {
      pickerEl.click();
    });

    const applyLightColor = (hex: string) => {
      swatchEl.style.backgroundColor = hex;
      pickerEl.value = hex;
      if (hexInput !== document.activeElement) {
        hexInput.value = hex.toUpperCase();
      }

      this.viewport?.setLightColor(hex);
      if (this.viewport) {
        this.swatchRamp?.updateParameters({
          env: this.viewport.getLightingEngine().getEnvironment(),
          haze: this.viewport.getHaze(),
          distance: this.viewport.getSelectedSphereDistance(),
        });
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

    const syncGroundUI = (hex: string) => {
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
    };

    const applyGroundColor = (hex: string) => {
      syncGroundUI(hex);
      this.viewport?.setGroundColor(hex);
      if (this.viewport) {
        this.swatchRamp?.updateParameters({
          env: this.viewport.getLightingEngine().getEnvironment(),
          haze: this.viewport.getHaze(),
          distance: this.viewport.getSelectedSphereDistance(),
        });
      }
    };

    // Time-of-day presets carry their own ground albedo (the reference ground
    // hue changes with the phase). Mirror it into this control.
    this.viewport.getLightingEngine().onEnvironmentChange(() => {
      if (!this.viewport) return;
      syncGroundUI('#' + this.viewport.getGroundColor().getHexString());
    });

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
