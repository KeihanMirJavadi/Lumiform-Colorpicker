import './ui/styles/theme.css';
import { getPhotoshopBridge } from './bridge';
import { AppShell } from './ui/shell';
import { applyTheme, DEFAULT_THEME } from './ui/theme';

// V1.2: paint in the fallback theme immediately; task 4.5 replaces this with
// the host relay and the URL bootstrap before the shell renders.
applyTheme(DEFAULT_THEME);

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character
  );
}

function renderStartupError(root: HTMLElement, error: unknown): void {
  const message = escapeHtml(error instanceof Error ? error.message : String(error));
  console.error('[Lumiform] Failed to start:', error);

  root.innerHTML = `
    <div style="
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;
      height: 100%;
      padding: 20px;
      justify-content: center;
      align-items: center;
      text-align: center;
      background: #1e1e1e;
      color: #ececec;
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 12px;
    ">
      <strong style="font-size: 14px;">Lumiform could not start</strong>
      <span style="max-width: 330px; color: #9e9e9e;">
        ${message}
      </span>
      <span style="max-width: 330px; color: #6f6f6f;">
        The panel needs WebGL. If this appears inside Photoshop, make sure you are
        running Photoshop 2025 (26.x) or newer with hardware acceleration enabled.
      </span>
    </div>
  `;
}

function initApp(): void {
  const root = document.getElementById('app');
  if (!root) {
    console.error('Fatal: Failed to locate #app root element.');
    return;
  }

  try {
    const bridge = getPhotoshopBridge();
    new AppShell(root, bridge);
    console.log('[Lumiform] Initialized successfully with', bridge.name);
  } catch (error) {
    renderStartupError(root, error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
