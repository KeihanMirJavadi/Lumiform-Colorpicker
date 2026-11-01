import * as THREE from 'three';
import { BASE_SPHERE_RADIUS, FRAMING } from './framing';

export type SphereSlotId = 'center' | 'right' | 'left';

export interface SphereSlotConfig {
  id: SphereSlotId;
  label: string;
  depthLabel: string;
  /** Ground-plane position; the mesh is lifted by its radius. */
  position: THREE.Vector3;
}

/**
 * Fixed reference composition: center near, right mid, left far.
 *
 * The positions are solved from the measured reference projection in
 * `core/framing.ts` (near/mid/far diameters and centre X fractions) rather
 * than hand-placed, so they follow the camera contract automatically.
 */
export const SPHERE_SLOTS: SphereSlotConfig[] = [
  { id: 'center', label: 'Near', depthLabel: 'Near', position: FRAMING.slots.near.clone() },
  { id: 'right', label: 'Mid', depthLabel: 'Mid', position: FRAMING.slots.mid.clone() },
  { id: 'left', label: 'Far', depthLabel: 'Far', position: FRAMING.slots.far.clone() },
];

export { BASE_SPHERE_RADIUS };
export const GROUND_Y = -BASE_SPHERE_RADIUS;

export function getSlot(id: SphereSlotId): SphereSlotConfig {
  const slot = SPHERE_SLOTS.find((s) => s.id === id);
  if (!slot) throw new Error(`Unknown sphere slot: ${id}`);
  return slot;
}
