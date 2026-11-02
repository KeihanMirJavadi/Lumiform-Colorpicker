export * from './IPhotoshopBridge';
export * from './MockPhotoshopBridge';
export * from './WebViewPhotoshopBridge';

import { IPhotoshopBridge } from './IPhotoshopBridge';
import { MockPhotoshopBridge } from './MockPhotoshopBridge';
import { WebViewPhotoshopBridge, isUxpWebView } from './WebViewPhotoshopBridge';

let globalBridgeInstance: IPhotoshopBridge | null = null;

/**
 * Picks the Photoshop transport for the current runtime.
 *
 * In a normal browser (`npm run dev`) there is no `window.uxpHost`, so the
 * mock keeps the UI fully interactive. Inside the packaged Photoshop panel the
 * web app runs in a WebView, where `window.uxpHost` is injected by UXP, and the
 * host panel relays color changes to `app.foregroundColor`.
 */
export function getPhotoshopBridge(): IPhotoshopBridge {
  if (!globalBridgeInstance) {
    globalBridgeInstance = isUxpWebView()
      ? new WebViewPhotoshopBridge()
      : new MockPhotoshopBridge();
  }
  return globalBridgeInstance;
}
