/**
 * Shared aerial-perspective model.
 *
 * Haze is depth dependent: extinction ramps in with distance from the camera.
 * `HAZE_START_DISTANCE` keeps the nearest composition sphere almost clear,
 * so the three-sphere study reads near → mid → far.
 */
export const HAZE_DENSITY = 0.04;
export const HAZE_START_DISTANCE = 5.0;

export function atmosphereAmount(haze: number, distance: number): number {
  const h = Math.max(0, Math.min(1, haze));
  if (h <= 0) return 0;
  return 1 - Math.exp(-h * HAZE_DENSITY * Math.max(0, distance - HAZE_START_DISTANCE));
}
