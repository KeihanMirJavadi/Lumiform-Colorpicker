import { IPhotoshopBridge } from '../bridge/IPhotoshopBridge';
import { StatusBar } from './statusBar';

export class AppShell {
  private root: HTMLElement;
  private bridge: IPhotoshopBridge;

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
        <div class="viewport-card" id="viewport-container">
          <div class="viewport-placeholder">
            <div class="icon">🔮</div>
            <p>Three.js 3D Viewport Target</p>
            <span>Ready for Stage 1.2: Sphere Rendering</span>
          </div>
        </div>

        <!-- Controls Placeholder & Bridge Tester -->
        <div class="section-card">
          <h2>Bridge & Architecture Verification</h2>
          <div class="mock-controls-preview">
            <p>Mock Photoshop bridge is operational. Click sample swatches below to test bridge dispatch:</p>
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

    const statusBarContainer = this.root.querySelector<HTMLElement>('#status-bar-container');
    if (statusBarContainer) {
      new StatusBar(statusBarContainer, this.bridge);
    }

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
}
