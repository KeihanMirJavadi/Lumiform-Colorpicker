import './ui/styles/theme.css';
import { getPhotoshopBridge } from './bridge';
import { AppShell } from './ui/shell';

function initApp(): void {
  const root = document.getElementById('app');
  if (!root) {
    console.error('Fatal: Failed to locate #app root element.');
    return;
  }

  const bridge = getPhotoshopBridge();
  new AppShell(root, bridge);

  console.log('[Lumiform] Initialized successfully with', bridge.name);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
