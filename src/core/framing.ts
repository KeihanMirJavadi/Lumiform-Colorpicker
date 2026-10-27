import * as THREE from 'three';

/**
 * Reference framing contract.
 *
 * Measured from the Midday reference panel (412 x 227 px):
 *   horizon        55.1% of frame height
 *   near sphere    40.0% of frame height, centre at 49.9% of frame width
 *   mid sphere     ~27.8% of frame height, centre at 79.0% of frame width
 *   far sphere     ~10.4% of frame height, centre at 18.8% of frame width
 *
 * Two facts make this a derivation instead of a guess:
 *
 *  1. All three sphere centres sit on the horizon. The horizon is the eye line,
 *     so the camera eye height equals the sphere centre height. That fixes the
 *     camera height (the spheres' centres are at y = 0), and any upward pitch is
 *     then purely the amount needed to put that eye line at 55.1% of the frame.
 *  2. The three diameters are inverse-distance (40.0 / 27.8 / 10.4 for near /
 *     mid / far), which is exactly how one shared sphere radius projects at
 *     three different distances. The lens is therefore a single fixed lens, and
 *     each distance is solved from its measured on-screen diameter.
 *
 * Everything else (slot positions) is derived from those numbers, so the
 * composition cannot drift when a preset changes. Time-of-day and material
 * changes must not touch this file. The camera is fixed; there is no zoom.
 */

/** Physical radius of every sphere before the per-sphere size slider is applied. */
export const BASE_SPHERE_RADIUS = 1.25;

/** Reference panel aspect ratio (412 x 227). */
export const REFERENCE_ASPECT = 412 / 227;

/** Horizontal field of view. Chosen once for the reference long-lens look. */
export const HORIZONTAL_FOV_DEG = 45;

/** Measured horizon row of the reference panel. */
export const HORIZON_HEIGHT_FRACTION = 125 / 227;

export interface CompositionTarget {
  /** Projected sphere-centre X, 0 = left edge, 1 = right edge. */
  centerX: number;
  /** Projected sphere diameter as a fraction of the frame height. */
  diameter: number;
}

export const COMPOSITION: Record<'near' | 'mid' | 'far', CompositionTarget> = {
  near: { centerX: 205.5 / 412, diameter: 90.8 / 227 },
  mid: { centerX: 325.5 / 412, diameter: 2 * 33.8 / 227 },
  far: { centerX: 77.4 / 412, diameter: 23.7 / 227 },
};

/** Vertical FOV implied by the fixed horizontal FOV at a given aspect. */
export function verticalFovRad(aspect: number): number {
  const hHalf = THREE.MathUtils.degToRad(HORIZONTAL_FOV_DEG) / 2;
  return 2 * Math.atan(Math.tan(hHalf) / aspect);
}

/** Distance at which a sphere of `radius` projects to `diameter` of frame height. */
export function distanceForDiameter(radius: number, diameter: number, vFovRad: number): number {
  return radius / (diameter * Math.tan(vFovRad / 2));
}

/** Camera pitch that places the eye line (horizon) at `fraction` of frame height. */
export function pitchForHorizon(fraction: number, vFovRad: number): number {
  return Math.atan((2 * fraction - 1) * Math.tan(vFovRad / 2));
}

/** World X at which a sphere centre projects to `centerX` on a ground plane at `distance`. */
export function xForCenterX(centerX: number, distance: number, vFovRad: number, aspect: number): number {
  const hHalfTan = Math.tan(vFovRad / 2) * aspect;
  return (2 * centerX - 1) * distance * hHalfTan;
}

export interface Framing {
  aspect: number;
  verticalFovRad: number;
  /** Camera Z on the near-sphere distance; near sphere sits at the origin. */
  cameraZ: number;
  cameraY: number;
  /** Upward tilt so the eye line lands on HORIZON_HEIGHT_FRACTION. */
  pitchRad: number;
  /** Ground-plane positions of the three slots. */
  slots: Record<'near' | 'mid' | 'far', THREE.Vector3>;
  distances: Record<'near' | 'mid' | 'far', number>;
}

function buildFraming(radius: number): Framing {
  const aspect = REFERENCE_ASPECT;
  const vFov = verticalFovRad(aspect);

  const distances = {
    near: distanceForDiameter(radius, COMPOSITION.near.diameter, vFov),
    mid: distanceForDiameter(radius, COMPOSITION.mid.diameter, vFov),
    far: distanceForDiameter(radius, COMPOSITION.far.diameter, vFov),
  };

  const cameraZ = distances.near;
  const slots = {} as Framing['slots'];
  for (const key of ['near', 'mid', 'far'] as const) {
    const d = distances[key];
    slots[key] = new THREE.Vector3(
      xForCenterX(COMPOSITION[key].centerX, d, vFov, aspect),
      0,
      cameraZ - d
    );
  }

  return {
    aspect,
    verticalFovRad: vFov,
    cameraZ,
    // Sphere centres are at y = 0 and sit on the horizon, so the eye is at y = 0.
    cameraY: 0,
    pitchRad: pitchForHorizon(HORIZON_HEIGHT_FRACTION, vFov),
    slots,
    distances,
  };
}

export const FRAMING: Framing = buildFraming(BASE_SPHERE_RADIUS);
