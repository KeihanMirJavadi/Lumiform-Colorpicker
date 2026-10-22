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

        <!-- Time-of-Day Lighting Presets & Gizmo Controls (Task 1.3) -->
        <div class="section-card">
          <div class="section-header">
            <h2>Lighting Environment & Presets</h2>
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

          <div class="light-metrics-row">
            <div class="metric-item">
              <span>Azimuth:</span>
              <span class="metric-value" id="val-azimuth">37°</span>
            </div>
            <div class="metric-item">
              <span>Elevation:</span>
              <span class="metric-value" id="val-elevation">54°</span>
            </div>
            <div class="metric-item">
              <span>Sun Gizmo:</span>
              <span class="metric-value" style="color: #4ade80;">Active</span>
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
            <p>• ☀️ <strong>Sun Handle</strong>: Drag the glowing yellow sun marker on the orbit ring to change sun angle.</p>
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
    this.bindSurfaceFinishButtons();
    this.bindLightingMetricsSync();
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

  private bindLightingMetricsSync(): void {
    if (!this.viewport) return;

    const azimuthEl = this.root.querySelector<HTMLElement>('#val-azimuth');
    const elevationEl = this.root.querySelector<HTMLElement>('#val-elevation');
    const presetBtns = this.root.querySelectorAll<HTMLButtonElement>('.preset-btn');

    this.viewport.getLightingEngine().onEnvironmentChange((env) => {
      if (azimuthEl) {
        const deg = Math.round((env.keyLight.azimuth * 180) / Math.PI);
        azimuthEl.textContent = `${deg}°`;
      }
      if (elevationEl) {
        const deg = Math.round((env.keyLight.elevation * 180) / Math.PI);
        elevationEl.textContent = `${deg}°`;
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

  public getColorControls(): ColorControls | null {
    return this.colorControls;
  }

  public destroy(): void {
    this.viewport?.dispose();
    this.viewport = null;
    this.colorControls = null;
  }
}
