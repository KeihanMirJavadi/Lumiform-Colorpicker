export * from './IPhotoshopBridge';
export * from './MockPhotoshopBridge';

import { IPhotoshopBridge } from './IPhotoshopBridge';
import { MockPhotoshopBridge } from './MockPhotoshopBridge';

let globalBridgeInstance: IPhotoshopBridge | null = null;

export function getPhotoshopBridge(): IPhotoshopBridge {
  if (!globalBridgeInstance) {
    // In Phase 1, we always return MockPhotoshopBridge.
    // In Phase 2, this will dynamically detect UXP runtime and instantiate UXPPhotoshopBridge.
    globalBridgeInstance = new MockPhotoshopBridge();
  }
  return globalBridgeInstance;
}
