import { IPhotoshopBridge, ColorChangeEvent } from '../bridge/IPhotoshopBridge';
import { Viewport } from '../render/Viewport';
import { LightingPreset, SurfaceFinish } from '../core/types';
import { SURFACE_FINISHES } from '../core/material';
import { StatusBar } from './statusBar';
import { ColorControls } from './colorControls';
import { SwatchRamp } from './swatchRamp';
import { DEFAULT_ALBEDO_HEX, DEFAULT_GROUND_HEX, DEFAULT_SURFACE_FINISH } from '../core/defaults';
import {
  LIGHTING_PRESET_ORDER,
  LIGHTING_PRESETS,
  MAX_KEY_ANGULAR_RADIUS_DEG,
} from '../core/lighting';
import { SPHERE_SLOTS, SphereSlotId } from '../core/sphereSlots';
import { ICONS } from './icons';
import {
  applyTheme,
  isPhotoshopTheme,
  readThemePreference,
  resolveTheme,
  saveThemePreference,
  THEME_LABELS,
  THEME_ORDER,
  ThemePreference,
} from './theme';

const LUMIFORM_GITHUB_URL = 'https://github.com/KeihanMirJavadi/Lumiform-Colorpicker';

/** Icon-only time-of-day buttons (D7); names live in title/aria-label. */
const TIME_OF_DAY_ICONS: Record<LightingPreset, string> = {
  'early-morning': ICONS.time['early-morning'],
  morning: ICONS.time.morning,
  midday: ICONS.time.midday,
  afternoon: ICONS.time.afternoon,
  'near-sunset': ICONS.time['near-sunset'],
  'golden-hour': ICONS.time['golden-hour'],
  night: ICONS.time.night,
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
  /** Latest colour waiting for the next animation frame (D21). */
  private pendingForegroundHex: string | null = null;
  private foregroundFrameId: number | null = null;
  /** V1.2 appearance: Auto follows the host; a pinned theme wins (4.5). */
  private themePreference: ThemePreference = readThemePreference();
  private hostTheme: string | null = null;

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
          <span class="badge">v1.2.0</span>
        </div>
        <!-- Opens the full-panel Controls Guide takeover. -->
        <button
          type="button"
          class="panel-info-btn"
          id="btn-open-guide"
          title="Controls Guide"
          aria-label="Open Controls Guide"
          aria-haspopup="dialog"
          aria-expanded="false"
          aria-controls="guide-overlay"
        >${ICONS.info}</button>
      </header>

      <main class="panel-content">
        <!-- 1. Canvas: fixed 412:227 framing, eyedropper reticle. The frame is
             the workspace matte; the card itself keeps the V1.1 geometry. -->
        <div class="viewport-frame">
          <div class="viewport-card" id="viewport-container"></div>
        </div>

        <!-- 2. Time of Day (always open): icon strip + snapped slider -->
        <section class="section-card" aria-labelledby="time-of-day-heading">
          <div class="section-header time-of-day-header">
            <h2 id="time-of-day-heading">Time of Day</h2>
            <div class="time-of-day-state" aria-live="polite">
              <span class="time-state-name" id="time-of-day-label">Midday</span>
              <span class="time-state-edited" id="time-of-day-edited" hidden>Â· edited</span>
              <button
                type="button"
                class="time-reset-btn"
                id="btn-time-reset"
                title="Restore Midday"
                aria-label="Restore Midday"
                hidden
              >${ICONS.reset}</button>
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
            <span class="section-state" id="spheres-summary">Near Â· #E3E3E3</span>
            <button
              type="button"
              class="section-reset-btn"
              data-reset="spheres"
              title="Reset Spheres"
              aria-label="Reset Spheres"
            >${ICONS.reset}</button>
            <span class="section-chevron" aria-hidden="true"></span>
          </summary>
          <div class="section-body">
            <div class="sphere-toggle-row" role="group" aria-label="Sphere visibility and selection">
              <button
                type="button"
                class="sphere-toggle"
                data-sphere="center"
                data-state="selected"
                aria-pressed="true"
                aria-current="true"
                title="Near â€” selected. Click to hide."
              >Near</button>
              <button
                type="button"
                class="sphere-toggle"
                data-sphere="right"
                data-state="on"
                aria-pressed="true"
                title="Mid â€” enabled. Click to select."
              >Mid</button>
              <button
                type="button"
                class="sphere-toggle"
                data-sphere="left"
                data-state="on"
                aria-pressed="true"
                title="Far â€” enabled. Click to select."
              >Far</button>
            </div>

            <div class="sphere-link-row">
              <label class="check-row">
                <input type="checkbox" id="toggle-link-colors" />
                <span>Link Colours</span>
              </label>
              <label class="check-row">
                <input type="checkbox" id="toggle-link-size" />
                <span>Link Size</span>
              </label>
            </div>

            <!-- Sphere Size (selected sphere, or all enabled when Link Size is on) -->
            <div class="sun-slider-row mesh-scale-row">
              <span class="sun-axis-name" style="width: 82px;">Size Â· <span id="size-target">Near</span></span>
              <div class="slider-track-wrap">
                <input type="range" class="ps-slider" id="slider-mesh-scale" min="20" max="100" value="100" />
              </div>
              <input type="number" class="ps-input-num" id="num-mesh-scale" min="20" max="100" value="100" />
              <span class="slider-unit">%</span>
            </div>

            <!-- Albedo chip + hex, with the HSB sliders behind a closed disclosure -->
            <div class="sphere-color-block" id="color-controls-container"></div>
          </div>
        </details>

        <!-- 5. Sun & Atmosphere (collapsed by default) -->
        <details class="section-card section-collapsible" id="section-sun">
          <summary class="section-summary">
            <span class="section-title">Sun &amp; Atmosphere</span>
            <span class="section-state" id="sun-summary">Midday</span>
            <button
              type="button"
              class="section-reset-btn"
              data-reset="sun"
              title="Reset Sun &amp; Atmosphere"
              aria-label="Reset Sun and Atmosphere"
            >${ICONS.reset}</button>
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
                <span class="slider-unit">Â°</span>
              </div>

              <!-- Axis 2: Elevation / Vertical Height -->
              <div class="sun-slider-row">
                <span class="sun-axis-name">Height</span>
                <div class="slider-track-wrap">
                  <input type="range" class="ps-slider sun-slider-yellow" id="slider-sun-elev" min="-89" max="89" value="58" />
                </div>
                <input type="number" class="ps-input-num" id="num-sun-elev" min="-89" max="89" value="58" />
                <span class="slider-unit">Â°</span>
              </div>

              <!-- Axis 3: Terminator / shadow edge hardness (key light angular size) -->
              <div class="sun-slider-row">
                <span class="sun-axis-name" style="width: 70px;" title="How sharply the lit side falls into shadow">Terminator</span>
                <div class="slider-track-wrap">
                  <input type="range" class="ps-slider terminator-slider" id="slider-terminator" min="0" max="${MAX_KEY_ANGULAR_RADIUS_DEG}" value="14" />
                </div>
                <input type="number" class="ps-input-num" id="num-terminator" min="0" max="${MAX_KEY_ANGULAR_RADIUS_DEG}" value="14" />
                <span class="slider-unit">Â°</span>
              </div>
            </div>
            <p class="section-note" id="terminator-note">
              0Â° gives a hard terminator, ${MAX_KEY_ANGULAR_RADIUS_DEG}Â° a broad softbox shadow. Choosing a preset restores its calibrated softness.
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
            <button
              type="button"
              class="section-reset-btn"
              data-reset="ground"
              title="Reset Ground Surface &amp; Color"
              aria-label="Reset Ground Surface and Color"
            >${ICONS.reset}</button>
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
                <span class="preset-icon" aria-hidden="true">${ICONS.ground.grass}</span> Grass
              </button>
              <button class="ground-preset-btn" data-color="#78726B" id="btn-ground-neutral">
                <span class="preset-icon" aria-hidden="true">${ICONS.ground.neutral}</span> Studio Gray
              </button>
              <button class="ground-preset-btn" data-color="#6B4C35" id="btn-ground-dirt">
                <span class="preset-icon" aria-hidden="true">${ICONS.ground.dirt}</span> Dirt
              </button>
              <button class="ground-preset-btn" data-color="#C2A676" id="btn-ground-sand">
                <span class="preset-icon" aria-hidden="true">${ICONS.ground.sand}</span> Sand
              </button>
            </div>
          </div>
        </details>

        <!-- 7. Surface Finish & Reflectivity (collapsed by default) -->
        <details class="section-card section-collapsible" id="section-finish">
          <summary class="section-summary">
            <span class="section-title">Surface Finish &amp; Reflectivity</span>
            <span class="section-state" id="finish-summary">Satin</span>
            <button
              type="button"
              class="section-reset-btn"
              data-reset="finish"
              title="Reset Surface Finish &amp; Reflectivity"
              aria-label="Reset Surface Finish and Reflectivity"
            >${ICONS.reset}</button>
            <span class="section-chevron" aria-hidden="true"></span>
          </summary>
          <div class="section-body">
            <div class="preset-segmented-control">
              <button class="finish-btn" data-finish="matte" id="btn-finish-matte">
                <span class="preset-icon" aria-hidden="true">${ICONS.finish.matte}</span> Matte
              </button>
              <button class="finish-btn active" data-finish="satin" id="btn-finish-satin">
                <span class="preset-icon" aria-hidden="true">${ICONS.finish.satin}</span> Satin
              </button>
              <button class="finish-btn" data-finish="glossy" id="btn-finish-glossy">
                <span class="preset-icon" aria-hidden="true">${ICONS.finish.glossy}</span> Glossy
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

      <!-- Controls Guide takeover. Covers header, canvas, scroll area and status bar. -->
      <div class="guide-overlay" id="guide-overlay" hidden>
        <div class="guide-backdrop" id="guide-backdrop"></div>
        <section
          class="guide-window"
          id="guide-window"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guide-title"
          tabindex="-1"
        >
          <header class="guide-header">
            <div class="guide-title-group">
              <span class="guide-kicker">Lumiform Colorpicker</span>
              <h2 id="guide-title">Controls Guide</h2>
            </div>
            <button type="button" class="guide-back" id="btn-guide-back"><span class="icon-slot" aria-hidden="true">${ICONS.close}</span>Back</button>
          </header>

          <div class="guide-body">
            <section class="guide-section">
              <h3>Time of Day</h3>
              <p>Click one of the seven icons or drag the slider. Each stop applies its calibrated sun, sky, ground and haze. Moving Orbit, Height, Terminator, Haze, Light or Ground turns the label into <strong>edited</strong>; <span class="guide-inline-icon" aria-hidden="true">${ICONS.reset}</span> restores the last preset without touching the spheres.</p>
            </section>

            <section class="guide-section">
              <h3>5-Value Ramp</h3>
              <p>The five tones are calculated from the selected sphere's surface and lighting. Click any swatch to paint with that tone. The header names the sphere and shows a dot of its albedo.</p>
            </section>

            <section class="guide-section">
              <h3>Spheres</h3>
              <p><strong>Near</strong>, <strong>Mid</strong> and <strong>Far</strong> carry visibility and selection: an off sphere enables and selects, an enabled sphere selects, and the selected sphere hides. The last sphere cannot be hidden, and hidden spheres remember their colour and size.</p>
              <p>Link Colours and Link Size apply one edit to every enabled sphere. Click the albedo chip to send its exact hex to Photoshop, or open <strong>H Â· S Â· B</strong> for the sliders.</p>
            </section>

            <section class="guide-section">
              <h3>Sun &amp; Atmosphere</h3>
              <p><strong>Light</strong> sets the key colour. <strong>Orbit</strong> and <strong>Height</strong> move the sun, <strong>Terminator</strong> softens or hardens the shadow edge, and <strong>Haze</strong> sets aerial perspective. Editing any of them detaches the time preset.</p>
            </section>

            <section class="guide-section">
              <h3>Ground &amp; Surface Finish</h3>
              <p><strong>Ground</strong> sets the bounce colour and offers grass, studio grey, dirt and sand. <strong>Surface Finish</strong> switches Matte, Satin or Glossy, or exposes roughness and specular sliders.</p>
            </section>

            <section class="guide-section">
              <h3>Canvas &amp; Brush</h3>
              <p>Drag the circular reticle to sample the rendered colour under it. A ramp swatch or the albedo chip sends an exact colour; dragging <strong>H Â· S Â· B</strong> or typing a valid hex streams the albedo to the brush. The status bar shows the connection and the active foreground.</p>
            </section>

            <section class="guide-section">
              <h3>Appearance</h3>
              <p class="guide-note">Follow Photoshop's Color Theme, or pin one. A pinned theme stays until Auto is selected.</p>
              <div class="appearance-row" role="group" aria-label="Appearance theme">
                <button type="button" class="appearance-btn" data-theme-pref="auto" aria-pressed="true">Auto</button>
                ${THEME_ORDER.map(
                  (theme) =>
                    `<button type="button" class="appearance-btn" data-theme-pref="${theme}" aria-pressed="false">${THEME_LABELS[theme]}</button>`
                ).join('')}
              </div>
              <p class="appearance-state" id="appearance-state" aria-live="polite"></p>
            </section>

            <button
              type="button"
              class="guide-github-row"
              id="btn-guide-github"
              aria-label="Open the Lumiform Colorpicker GitHub repository"
            >
              <span class="guide-github-text">
                <span class="guide-github-label">GitHub repository</span>
                <span class="guide-github-url">github.com/KeihanMirJavadi/Lumiform-Colorpicker</span>
              </span>
              <span class="guide-github-arrow" aria-hidden="true">${ICONS.external}</span>
            </button>
          </div>
        </section>
      </div>
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
        initialSphereName:
          SPHERE_SLOTS.find((slot) => slot.id === this.viewport!.getSelectedSphereId())?.label ??
          'Near',
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
          this.streamForeground(hex);
        },
        onAlbedoClick: (hex) => {
          this.sendForegroundNow(hex);
        },
      });
    }

    // 4. Mount Status Bar
    const statusBarContainer = this.root.querySelector<HTMLElement>('#status-bar-container');
    if (statusBarContainer) {
      new StatusBar(statusBarContainer, this.bridge);
    }

    // 5. Mount the Controls Guide takeover and the appearance state
    this.bindGuide();
    this.bindTheme();

    // 6. Bridge color events (if any external source updates color)
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
    this.bindPanelResets();
    this.bindFocusRelease();

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

    // Spheres Â· <selected depth name> Â· <selected albedo>
    const selectedId = this.viewport.getSelectedSphereId();
    const selectedSlot = SPHERE_SLOTS.find((slot) => slot.id === selectedId);
    this.setStateText(
      '#spheres-summary',
      `${selectedSlot?.label ?? 'Near'} Â· ${this.viewport.getSelectedSphereColor().toUpperCase()}`
    );

    // Sun & Atmosphere Â· <last preset> [Â· edited]
    const timeOfDay = this.getTimeOfDayState();
    this.setStateText(
      '#sun-summary',
      `${timeOfDay.name}${timeOfDay.edited ? ' Â· edited' : ''}`
    );

    // Ground Â· <current ground albedo>
    this.setStateText(
      '#ground-summary',
      `#${this.viewport.getGroundColor().getHexString().toUpperCase()}`
    );

    // Surface Finish Â· <finish name>
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

  /** Shared by the time strip, its reset, and the two lighting-panel resets. */
  private applyLightingPreset(preset: LightingPreset): void {
    if (!this.viewport) return;
    this.lastPreset = preset;
    this.viewport.setPreset(preset);
    // The preset carries its own haze amount and softness; pull every other
    // control and the swatch ramp back in sync with it.
    this.syncSphereUI();
  }

  /**
   * Per-panel reset buttons in the collapsed headers. They stop the click from
   * toggling the <details> they live in.
   */
  private bindPanelResets(): void {
    this.root.querySelectorAll<HTMLButtonElement>('.section-reset-btn').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!this.viewport) return;

        switch (button.dataset.reset) {
          case 'spheres':
            this.viewport.resetSpheres();
            this.syncSphereUI();
            break;
          case 'sun':
          case 'ground':
            // Both lighting panels belong to the active time-of-day preset.
            this.applyLightingPreset(this.lastPreset);
            break;
          case 'finish':
            this.viewport.setSurfaceFinish(DEFAULT_SURFACE_FINISH);
            break;
        }
      });

      // Enter/Space must reset, not expand the section.
      button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.stopPropagation();
        }
      });
    });
  }

  /**
   * A UXP WebView owns the keyboard after any click, which traps Tab and every
   * Photoshop shortcut inside the panel. After a non-text interaction, hand
   * focus back to Photoshop. Text fields keep focus while being edited and
   * release on Enter/Escape. The guide keeps focus while it is open so its
   * Escape/Tab handling still works.
   */
  private bindFocusRelease(): void {
    const guideIsOpen = (): boolean => {
      const guide = this.root.querySelector<HTMLElement>('#guide-overlay');
      return Boolean(guide && !guide.hidden);
    };

    // Text entry keeps the keyboard while it is being edited. Sliders,
    // checkboxes, colour wells and buttons release it immediately.
    const isTextEntry = (target: EventTarget | null): boolean =>
      target instanceof Element &&
      target.closest(
        'input[type="text"], input[type="number"], input[type="search"], textarea, select, [contenteditable="true"]'
      ) !== null;

    document.addEventListener(
      'pointerup',
      (event) => {
        if (isTextEntry(event.target)) return;
        // Let the click finish first: the info button opens the guide on click.
        window.setTimeout(() => {
          if (!guideIsOpen()) this.bridge.focusPhotoshop();
        }, 0);
      },
      true
    );

    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Enter' && event.key !== 'Escape') return;
        if (!isTextEntry(event.target)) return;
        if (guideIsOpen()) return;
        (event.target as HTMLElement).blur();
        this.bridge.focusPhotoshop();
      },
      true
    );
  }

  /**
   * Full-panel Controls Guide takeover (D19-D20). It is an overlay, not a
   * second UXP entrypoint, so it covers the header, canvas, scroll area and
   * status bar and closes with Back, Esc or the backdrop.
   */
  /**
   * V1.2 theme linking (4.5). Auto follows the host token relayed by the UXP
   * panel; a pinned choice wins and survives reloads. The URL bootstrap in
   * `main.ts` already painted the right palette, so this only reacts to
   * changes and keeps the Appearance row in sync.
   */
  private bindTheme(): void {
    this.bridge.onThemeChange((hostTheme) => {
      this.hostTheme = hostTheme;
      if (this.themePreference === 'auto') {
        applyTheme(resolveTheme('auto', hostTheme));
      }
      this.syncAppearance();
    });

    this.root.querySelectorAll<HTMLButtonElement>('.appearance-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const preference = button.dataset.themePref;
        if (!preference) return;

        const next: ThemePreference =
          preference === 'auto' ? 'auto' : isPhotoshopTheme(preference) ? preference : 'auto';

        this.themePreference = next;
        saveThemePreference(next);
        applyTheme(resolveTheme(next, this.hostTheme));
        this.syncAppearance();
      });
    });

    applyTheme(resolveTheme(this.themePreference, this.hostTheme));
    this.syncAppearance();
  }

  private syncAppearance(): void {
    const effective = resolveTheme(this.themePreference, this.hostTheme);

    this.root.querySelectorAll<HTMLButtonElement>('.appearance-btn').forEach((button) => {
      const active = button.dataset.themePref === this.themePreference;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    const state = this.root.querySelector<HTMLElement>('#appearance-state');
    if (!state) return;

    state.textContent =
      this.themePreference === 'auto'
        ? this.hostTheme
          ? `Auto · Photoshop: ${THEME_LABELS[effective]}`
          : `Auto · no host signal, using ${THEME_LABELS[effective]}`
        : `Pinned to ${THEME_LABELS[effective]}`;
  }

  private bindGuide(): void {
    const overlay = this.root.querySelector<HTMLElement>('#guide-overlay');
    const windowEl = this.root.querySelector<HTMLElement>('#guide-window');
    const openBtn = this.root.querySelector<HTMLButtonElement>('#btn-open-guide');
    const backBtn = this.root.querySelector<HTMLButtonElement>('#btn-guide-back');
    const backdrop = this.root.querySelector<HTMLElement>('#guide-backdrop');
    const githubBtn = this.root.querySelector<HTMLButtonElement>('#btn-guide-github');
    if (!overlay || !windowEl || !openBtn || !backBtn) return;

    const background = [
      this.root.querySelector<HTMLElement>('.panel-header'),
      this.root.querySelector<HTMLElement>('.panel-content'),
      this.root.querySelector<HTMLElement>('.status-bar'),
    ].filter((el): el is HTMLElement => el !== null);

    const setBackgroundInert = (inert: boolean): void => {
      for (const el of background) {
        if (inert) {
          el.setAttribute('inert', '');
          el.setAttribute('aria-hidden', 'true');
        } else {
          el.removeAttribute('inert');
          el.removeAttribute('aria-hidden');
        }
      }
    };

    const getFocusable = (): HTMLElement[] =>
      Array.from(
        windowEl.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('hidden') && el.offsetParent !== null);

    const closeGuide = (): void => {
      if (overlay.hidden) return;
      overlay.hidden = true;
      openBtn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', handleGuideKeyDown);
      setBackgroundInert(false);
      openBtn.focus();
      // The guide needed the keyboard while open; release it to Photoshop now.
      window.setTimeout(() => this.bridge.focusPhotoshop(), 0);
    };

    function handleGuideKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeGuide();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    const openGuide = (): void => {
      overlay.hidden = false;
      openBtn.setAttribute('aria-expanded', 'true');
      setBackgroundInert(true);
      document.addEventListener('keydown', handleGuideKeyDown);
      backBtn.focus();
    };

    openBtn.addEventListener('click', openGuide);
    backBtn.addEventListener('click', closeGuide);
    backdrop?.addEventListener('click', closeGuide);
    githubBtn?.addEventListener('click', () => {
      void this.bridge.openUrl(LUMIFORM_GITHUB_URL).catch((error) => {
        console.warn('[Lumiform] Could not open the GitHub link:', error);
      });
    });
  }

  /**
   * Coalesces colour edits into one foreground write per animation frame.
   * The host bridge already coalesces; this keeps the web side from emitting
   * more than the brush can use (D21).
   */
  private streamForeground(hex: string): void {
    this.pendingForegroundHex = hex;
    if (this.foregroundFrameId !== null) return;

    this.foregroundFrameId = requestAnimationFrame(() => {
      this.foregroundFrameId = null;
      const pending = this.pendingForegroundHex;
      this.pendingForegroundHex = null;
      if (pending) {
        void this.bridge.setForegroundColor(pending);
      }
    });
  }

  /** Albedo chip click: send now and drop any queued frame write. */
  private sendForegroundNow(hex: string): void {
    if (this.foregroundFrameId !== null) {
      cancelAnimationFrame(this.foregroundFrameId);
      this.foregroundFrameId = null;
    }
    this.pendingForegroundHex = null;
    void this.bridge.setForegroundColor(hex);
  }

  private bindSphereControls(): void {
    if (!this.viewport) return;

    // Near / Mid / Far toggles: off enables and selects, on selects, selected hides.
    this.root.querySelectorAll<HTMLButtonElement>('.sphere-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!this.viewport) return;
        const id = btn.getAttribute('data-sphere') as SphereSlotId | null;
        if (!id) return;

        const active = this.viewport.isSphereActive(id);
        const selected = this.viewport.getSelectedSphereId();
        if (!active) {
          this.viewport.enableSphere(id);
        } else if (id !== selected) {
          this.viewport.selectSphere(id);
        } else {
          this.viewport.disableSphere(id);
        }
        this.syncSphereUI();
      });
    });

    const linkColorsToggle = this.root.querySelector<HTMLInputElement>('#toggle-link-colors');
    linkColorsToggle?.addEventListener('change', () => {
      this.viewport?.setLinkedColors(linkColorsToggle.checked);
      this.syncSphereUI();
    });

    const linkSizeToggle = this.root.querySelector<HTMLInputElement>('#toggle-link-size');
    linkSizeToggle?.addEventListener('change', () => {
      this.viewport?.setLinkedSizes(linkSizeToggle.checked);
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

  /** Keeps the toggles, links, size, colour panel and ramp aligned with the viewport. */
  private syncSphereUI(): void {
    if (!this.viewport) return;

    const activeCount = this.viewport.getActiveCount();
    const selectedId = this.viewport.getSelectedSphereId();
    const selectedSlot = SPHERE_SLOTS.find((s) => s.id === selectedId);

    this.root.querySelectorAll<HTMLButtonElement>('.sphere-toggle').forEach((btn) => {
      const id = btn.getAttribute('data-sphere') as SphereSlotId | null;
      if (!id) return;
      const slot = SPHERE_SLOTS.find((s) => s.id === id);
      const name = slot?.label ?? 'Near';
      const active = this.viewport!.isSphereActive(id);
      const selected = active && id === selectedId;
      const state = selected ? 'selected' : active ? 'on' : 'off';
      btn.dataset.state = state;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      if (selected) {
        btn.setAttribute('aria-current', 'true');
      } else {
        btn.removeAttribute('aria-current');
      }

      const lastOne = active && activeCount <= 1;
      btn.title = selected
        ? lastOne
          ? `${name} â€” selected. At least one sphere must stay visible.`
          : `${name} â€” selected. Click to hide.`
        : active
          ? `${name} â€” enabled. Click to select.`
          : `${name} â€” hidden. Click to show and select.`;
      btn.setAttribute('aria-label', btn.title);
    });

    const linkColorsToggle = this.root.querySelector<HTMLInputElement>('#toggle-link-colors');
    if (linkColorsToggle) linkColorsToggle.checked = this.viewport.getLinkedColors();
    const linkSizeToggle = this.root.querySelector<HTMLInputElement>('#toggle-link-size');
    if (linkSizeToggle) linkSizeToggle.checked = this.viewport.getLinkedSizes();

    const sizeLabel = this.root.querySelector<HTMLElement>('#size-target');
    if (sizeLabel) {
      sizeLabel.textContent = this.viewport.getLinkedSizes()
        ? 'All'
        : selectedSlot?.label ?? 'Near';
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
        sphereName: selectedSlot?.label ?? 'Near',
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
      this.applyLightingPreset(preset);
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

    // `â†º` re-applies only the last preset's six lighting values (D10).
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
    if (this.foregroundFrameId !== null) {
      cancelAnimationFrame(this.foregroundFrameId);
      this.foregroundFrameId = null;
    }
    this.pendingForegroundHex = null;
    this.viewport?.dispose();
    this.viewport = null;
    this.colorControls = null;
    this.swatchRamp = null;
  }
}

