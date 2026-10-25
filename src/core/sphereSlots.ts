import * as THREE from 'three';

export type SphereSlotId = 'center' | 'right' | 'left';

export interface SphereSlotConfig {
  id: SphereSlotId;
  label: string;
  depthLabel: string;
  /** Ground-plane position; the mesh is lifted by its radius. */
  position: THREE.Vector3;
}

/** Fixed reference composition: center near, right mid, left far. */
export const SPHERE_SLOTS: SphereSlotConfig[] = [
  { id: 'center', label: 'Center', depthLabel: 'Near', position: new THREE.Vector3(0, 0, 0) },
  { id: 'right', label: 'Right', depthLabel: 'Mid', position: new THREE.Vector3(3.4, 0, -5.8) },
  { id: 'left', label: 'Left', depthLabel: 'Far', position: new THREE.Vector3(-6.4, 0, -16.8) },
];

export const BASE_SPHERE_RADIUS = 1.25;
export const GROUND_Y = -BASE_SPHERE_RADIUS;

export function getSlot(id: SphereSlotId): SphereSlotConfig {
  const slot = SPHERE_SLOTS.find((s) => s.id === id);
  if (!slot) throw new Error(`Unknown sphere slot: ${id}`);
  return slot;
}
