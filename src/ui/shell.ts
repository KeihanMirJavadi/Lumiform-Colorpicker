import { IPhotoshopBridge, ColorChangeEvent } from '../bridge/IPhotoshopBridge';
import { Viewport } from '../render/Viewport';
import { LightingPreset } from '../core/types';
import { StatusBar } from './statusBar';

export class AppShell {
  private root: HTMLElement;
  private bridge: IPhotoshopBridge;
  private viewport: Viewport | null = null;

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
        <!-- 3D Viewport with Orbit Ring Gizmo -->
        <div class="viewport-card" id="viewport-container"></div>

        <!-- Time-of-Day Lighting Presets & Gizmo Controls -->
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

        <!-- Controls Placeholder & Bridge Tester -->
        <div class="section-card">
          <h2>Controls & Bridge Verification</h2>
          <div class="mock-controls-preview">
            <p>• <strong>Orbit Ring / Sun Handle</strong>: Drag yellow sun marker or ring to rotate key light.</p>
            <p>• <strong>Background Drag</strong> (or <code>Alt</code> + Drag): Orbit camera around sphere.</p>
            <div class="mock-button-row">
              <button class="ps-button" id="btn-sample-sun">Sun Highlight (#FFE099)</button>
              <button class="ps-button" id="btn-sample-shadow">Sky Shadow (#38507A)</button>
              <button class="ps-button" id="btn-sample-bounce">Ground Bounce (#8C5332)</button>
            </div>
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
        initialColor: 0xEB5757,
      });
    }

    // 2. Mount Status Bar
    const statusBarContainer = this.root.querySelector<HTMLElement>('#status-bar-container');
    if (statusBarContainer) {
      new StatusBar(statusBarContainer, this.bridge);
    }

    // 3. Listen to color change from bridge to update base sphere color
    this.bridge.onColorChange((event: ColorChangeEvent) => {
      this.viewport?.setSphereColor(event.hex);
    });

    this.bindPresetButtons();
    this.bindVerificationButtons();
    this.bindLightingMetricsSync();
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

  private bindVerificationButtons(): void {
    const sunBtn = this.root.querySelector<HTMLButtonElement>('#btn-sample-sun');
    const shadowBtn = this.root.querySelector<HTMLButtonElement>('#btn-sample-shadow');
    const bounceBtn = this.root.querySelector<HTMLButtonElement>('#btn-sample-bounce');

    sunBtn?.addEventListener('click', () => {
      this.bridge.setForegroundColor('#FFE099');
    });

    shadowBtn?.addEventListener('click', () => {
      this.bridge.setForegroundColor('#38507A');
    });

    bounceBtn?.addEventListener('click', () => {
      this.bridge.setForegroundColor('#8C5332');
    });
  }

  public destroy(): void {
    this.viewport?.dispose();
    this.viewport = null;
  }
}
