import { IPhotoshopBridge, ColorChangeEvent } from '../bridge/IPhotoshopBridge';
import { Viewport } from '../render/Viewport';
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
        <!-- 3D Viewport Target for Task 1.2 -->
        <div class="viewport-card" id="viewport-container"></div>

        <!-- Controls Placeholder & Bridge Tester -->
        <div class="section-card">
          <h2>Viewport & Camera Controls</h2>
          <div class="mock-controls-preview">
            <p>• <strong>Background Drag</strong> (or <code>Alt</code> + Drag): Orbit camera smoothly around sphere.</p>
            <p>• <strong>Sphere Hover</strong>: Eyedropper target (aiming for Task 1.6 sampling).</p>
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

    this.bindVerificationButtons();
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
