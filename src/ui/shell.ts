import { IPhotoshopBridge, ColorChangeEvent } from '../bridge/IPhotoshopBridge';
import { Viewport, MeshGeometryType } from '../render/Viewport';
import { LightingPreset, SurfaceFinish } from '../core/types';
import { SURFACE_FINISHES } from '../core/material';
import { StatusBar } from './statusBar';
import { ColorControls } from './colorControls';

export class AppShell {
  private root: HTMLElement;
  private bridge: IPhotoshopBridge;
  private viewport: Viewport | null = null;
  private colorControls: ColorControls | null = null;

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
          <span class="badge">Phase 1 Dev</span>
        </div>
      </header>

      <main class="panel-content">
        <!-- 3D Viewport Toolbar (Mesh Switcher) -->
        <div class="viewport-toolbar">
          <span class="toolbar-label">3D Test Form:</span>
          <div class="mesh-toggle-group">
            <button class="mesh-toggle-btn active" data-mesh="sphere" id="btn-mesh-sphere">🔮 Sphere</button>
            <button class="mesh-toggle-btn" data-mesh="cube" id="btn-mesh-cube">🧊 Cube</button>
          </div>
        </div>

        <!-- 3D Viewport with Orbit Ring Gizmo & Persistent Color Target -->
        <div class="viewport-card" id="viewport-container"></div>

        <!-- In-Panel HSB & Hex Color Controls (Task 1.5) -->
        <div class="section-card" id="color-controls-container"></div>

        <!-- Time-of-Day Lighting Presets & 3-Axis Sun Sliders (Task 1.3 / User Spec) -->
        <div class="section-card">
          <div class="section-header">
            <h2>Sun Position & Lighting Presets</h2>
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

          <!-- 3-Axis Sun Position Sliders (Matching Diagram 1 Green, 2 White, 3 Yellow) -->
          <div class="sun-sliders-container">
            <!-- Axis 1: Roll / Tilt (Green) -->
            <div class="sun-slider-row">
              <div class="sun-axis-badge axis-green" title="Axis 1: Frontal Tilt / Roll (Green in diagram)">1</div>
              <span class="sun-axis-name">Tilt</span>
              <div class="slider-track-wrap">
                <input type="range" class="ps-slider sun-slider-green" id="slider-sun-roll" min="-180" max="180" value="0" />
              </div>
              <input type="number" class="ps-input-num" id="num-sun-roll" min="-180" max="180" value="0" />
              <span class="slider-unit">°</span>
            </div>

            <!-- Axis 2: Azimuth / Horizontal Orbit (White) -->
            <div class="sun-slider-row">
              <div class="sun-axis-badge axis-white" title="Axis 2: Horizontal Orbit / Azimuth (White in diagram)">2</div>
              <span class="sun-axis-name">Orbit</span>
              <div class="slider-track-wrap">
                <input type="range" class="ps-slider sun-slider-white" id="slider-sun-azim" min="0" max="360" value="37" />
              </div>
              <input type="number" class="ps-input-num" id="num-sun-azim" min="0" max="360" value="37" />
              <span class="slider-unit">°</span>
            </div>

            <!-- Axis 3: Elevation / Vertical Height (Yellow) -->
            <div class="sun-slider-row">
              <div class="sun-axis-badge axis-yellow" title="Axis 3: Vertical Height / Elevation (Yellow in diagram)">3</div>
              <span class="sun-axis-name">Height</span>
              <div class="slider-track-wrap">
                <input type="range" class="ps-slider sun-slider-yellow" id="slider-sun-elev" min="-89" max="89" value="54" />
              </div>
              <input type="number" class="ps-input-num" id="num-sun-elev" min="-89" max="89" value="54" />
              <span class="slider-unit">°</span>
            </div>
          </div>
        </div>

        <!-- Surface Finish Mode (Task 1.4) -->
        <div class="section-card">
          <div class="section-header">
            <h2>Surface Finish Mode</h2>
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
          <p id="finish-desc" style="margin-top: 8px; font-size: 11px; color: var(--ps-text-secondary);">
            Satin: Roughness 0.5, 30% Specular (soft, spread highlight)
          </p>
        </div>

        <!-- Interaction Guide Card -->
        <div class="section-card">
          <h2>Decoupled Controls Guide</h2>
          <div style="display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--ps-text-secondary);">
            <p>• 🎯 <strong>Color Picker Target</strong>: Drag the white ring anywhere on the 3D canvas to sample that lit color.</p>
            <p>• 🧊 <strong>3D Mesh Drag</strong>: Drag the sphere/cube directly to rotate it on its own local axes.</p>
            <p>• ☀️ <strong>Sun Position Controls</strong>: Use the 3 sliders (1 Green Tilt, 2 White Orbit, 3 Yellow Height) or drag the 3D sun marker directly.</p>
            <p>• 🌌 <strong>Background Drag</strong>: Drag the dark background to orbit the camera.</p>
          </div>
        </div>
      </main>

      <footer class="status-bar" id="status-bar-container"></footer>
    `;

    // 1. Mount 3D Viewport
    const viewportContainer = this.root.querySelector<HTMLElement>('#viewport-container');
    if (viewportContainer) {
      this.viewport = new Viewport({
        container: viewportContainer,
        sphereRadius: 1.25,
        initialColor: '#EB5757',
        initialMeshType: 'sphere',
      });

      // Connect Color Picker Target sampling directly to Photoshop bridge
      this.viewport.onColorSample((rgb, _hex) => {
        this.bridge.setForegroundColor(rgb);
      });
    }

    // 2. Mount Color Controls (HSB Sliders & Hex input)
    const colorControlsContainer = this.root.querySelector<HTMLElement>('#color-controls-container');
    if (colorControlsContainer) {
      this.colorControls = new ColorControls({
        container: colorControlsContainer,
        initialHex: '#EB5757',
        onChange: (_hsb, _rgb, hex) => {
          this.viewport?.setSphereColor(hex);
        },
      });
    }

    // 3. Mount Status Bar
    const statusBarContainer = this.root.querySelector<HTMLElement>('#status-bar-container');
    if (statusBarContainer) {
      new StatusBar(statusBarContainer, this.bridge);
    }

    // 4. Bridge color events (if any external source updates color)
    this.bridge.onColorChange((_event: ColorChangeEvent) => {
      // Kept in sync
    });

    this.bindMeshToggleButtons();
    this.bindPresetButtons();
    this.bindSunSliders();
    this.bindSurfaceFinishButtons();
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
    const rollSlider = this.root.querySelector<HTMLInputElement>('#slider-sun-roll')!;
    const azimSlider = this.root.querySelector<HTMLInputElement>('#slider-sun-azim')!;
    const elevSlider = this.root.querySelector<HTMLInputElement>('#slider-sun-elev')!;

    // Number Inputs
    const rollNum = this.root.querySelector<HTMLInputElement>('#num-sun-roll')!;
    const azimNum = this.root.querySelector<HTMLInputElement>('#num-sun-azim')!;
    const elevNum = this.root.querySelector<HTMLInputElement>('#num-sun-elev')!;

    const presetBtns = this.root.querySelectorAll<HTMLButtonElement>('.preset-btn');

    const applyAnglesFromUI = (rollDeg: number, azimDeg: number, elevDeg: number) => {
      const rollRad = (rollDeg * Math.PI) / 180;
      const azimRad = (azimDeg * Math.PI) / 180;
      const elevRad = (elevDeg * Math.PI) / 180;
      this.viewport?.setLightAngles(rollRad, azimRad, elevRad);
    };

    // Slider inputs
    rollSlider.addEventListener('input', () => {
      const val = parseInt(rollSlider.value, 10);
      rollNum.value = val.toString();
      applyAnglesFromUI(val, parseInt(azimSlider.value, 10), parseInt(elevSlider.value, 10));
    });

    azimSlider.addEventListener('input', () => {
      const val = parseInt(azimSlider.value, 10);
      azimNum.value = val.toString();
      applyAnglesFromUI(parseInt(rollSlider.value, 10), val, parseInt(elevSlider.value, 10));
    });

    elevSlider.addEventListener('input', () => {
      const val = parseInt(elevSlider.value, 10);
      elevNum.value = val.toString();
      applyAnglesFromUI(parseInt(rollSlider.value, 10), parseInt(azimSlider.value, 10), val);
    });

    // Number inputs
    rollNum.addEventListener('change', () => {
      let val = parseInt(rollNum.value, 10);
      if (isNaN(val)) val = 0;
      val = Math.max(-180, Math.min(180, val));
      rollNum.value = val.toString();
      rollSlider.value = val.toString();
      applyAnglesFromUI(val, parseInt(azimSlider.value, 10), parseInt(elevSlider.value, 10));
    });

    azimNum.addEventListener('change', () => {
      let val = parseInt(azimNum.value, 10);
      if (isNaN(val)) val = 0;
      val = ((val % 360) + 360) % 360;
      azimNum.value = val.toString();
      azimSlider.value = val.toString();
      applyAnglesFromUI(parseInt(rollSlider.value, 10), val, parseInt(elevSlider.value, 10));
    });

    elevNum.addEventListener('change', () => {
      let val = parseInt(elevNum.value, 10);
      if (isNaN(val)) val = 0;
      val = Math.max(-89, Math.min(89, val));
      elevNum.value = val.toString();
      elevSlider.value = val.toString();
      applyAnglesFromUI(parseInt(rollSlider.value, 10), parseInt(azimSlider.value, 10), val);
    });

    // Synchronize 3D Gizmo drags or preset clicks back to the sliders
    this.viewport.getLightingEngine().onEnvironmentChange((env) => {
      const rollDeg = Math.round((env.keyLight.roll * 180) / Math.PI);
      const azimDeg = Math.round((env.keyLight.azimuth * 180) / Math.PI);
      const elevDeg = Math.round((env.keyLight.elevation * 180) / Math.PI);

      if (document.activeElement !== rollSlider && document.activeElement !== rollNum) {
        rollSlider.value = rollDeg.toString();
        rollNum.value = rollDeg.toString();
      }

      if (document.activeElement !== azimSlider && document.activeElement !== azimNum) {
        azimSlider.value = azimDeg.toString();
        azimNum.value = azimDeg.toString();
      }

      if (document.activeElement !== elevSlider && document.activeElement !== elevNum) {
        elevSlider.value = elevDeg.toString();
        elevNum.value = elevDeg.toString();
      }

      presetBtns.forEach((btn) => {
        if (btn.getAttribute('data-preset') === env.preset) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    });
  }

  private bindSurfaceFinishButtons(): void {
    const finishBtns = this.root.querySelectorAll<HTMLButtonElement>('.finish-btn');
    const descEl = this.root.querySelector<HTMLElement>('#finish-desc');

    finishBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const finish = btn.getAttribute('data-finish') as SurfaceFinish;
        if (finish && this.viewport) {
          this.viewport.setSurfaceFinish(finish);
          finishBtns.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');

          if (descEl) {
            descEl.textContent = `${SURFACE_FINISHES[finish].name}: ${SURFACE_FINISHES[finish].description}`;
          }
        }
      });
    });
  }

  public getColorControls(): ColorControls | null {
    return this.colorControls;
  }

  public destroy(): void {
    this.viewport?.dispose();
    this.viewport = null;
    this.colorControls = null;
  }
}
