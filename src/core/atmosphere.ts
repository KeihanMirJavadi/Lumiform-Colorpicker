/**
 * Shared aerial-perspective model.
 *
 * Haze is single-scattering depth fog:
 *   L = L_surface * exp(-opticalDepth) + L_airlight * (1 - exp(-opticalDepth))
 *
 * The airlight is the background along the view ray, not one global tint: sky
 * above the horizon (with a smooth horizon haze band) and the phase's ground
 * haze below it. Distant geometry therefore desaturates toward whatever is
 * actually behind it and can never become paler than its background.
 *
 * The framing's sphere centres sit at ~13.7 (near), 18.4 (mid) and 52.6 (far)
 * world units. The near sphere's whole surface ends at ~14.95, so the fog
 * starts just beyond it at 15.5. That makes the central sphere exactly clear
 * at any Haze setting, while the mid sphere gets a light depth tint and the
 * far sphere reads strongly atmospheric.
 *
 * `lumiformShader.ts` and `groundShader.ts` mirror these constants exactly.
 */
export const HAZE_DENSITY = 0.030;
export const HAZE_START_DISTANCE = 15.5;

/**
 * Ground fog starts closer than the sphere fog. The floor is continuous from
 * the camera's feet, so its aerial perspective must begin in the near field;
 * the sphere exemption exists only because the central sphere is the colour
 * reference and must stay clear.
 */
export const GROUND_HAZE_START_DISTANCE = 10.0;

/** Highest effective optical factor the Haze slider can reach. */
export const HAZE_MAX = 1.5;

/**
 * Maps the global 0–100% Haze control onto an optical factor.
 *
 * Every time-of-day preset has its own calibrated slider value (`presetHaze`).
 * At that value the phase's measured atmosphere is reproduced exactly; below
 * it fades toward clear, above it reaches strong fog. This is why switching
 * presets also moves the Haze control instead of inheriting the previous
 * preset's setting.
 */
export function effectiveHaze(
  haze: number,
  phaseStrength: number,
  presetHaze = 0.5
): number {
  const h = Math.max(0, Math.min(1, haze));
  const p = Math.max(0, Math.min(HAZE_MAX, phaseStrength));
  const knee = Math.max(0.01, Math.min(0.99, presetHaze));
  if (h <= knee) return p * (h / knee);
  return p + ((h - knee) / (1 - knee)) * (HAZE_MAX - p);
}

export function atmosphereAmount(haze: number, distance: number): number {
  const h = Math.max(0, Math.min(1, haze));
  if (h <= 0) return 0;
  return 1 - Math.exp(-h * HAZE_DENSITY * Math.max(0, distance - HAZE_START_DISTANCE));
}
