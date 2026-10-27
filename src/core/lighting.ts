import * as THREE from 'three';
import { LightingPreset } from './types';

/**
 * Visible sky dome colours. These paint the background only; they are not the
 * light source. The engine separates what the sky *looks like* from how much
 * light it *emits*, because the reference panels are studio-style renders whose
 * sphere is lit far harder than the visible sky alone could explain.
 */
export interface Ambient3ZoneConfig {
  zenithColor: THREE.Color;
  equatorColor: THREE.Color;
  horizonColor: THREE.Color;
  groundColor: THREE.Color;
  skyColor: THREE.Color; // Backwards compatible alias
  intensity: number;
}

export interface KeyLightConfig {
  color: THREE.Color;
  /** Sun irradiance E. Diffuse radiance = albedo * E * NoL / PI. */
  intensity: number;
  azimuth: number;   // Horizontal orbit around Y (radians)
  elevation: number; // Height above the horizon (radians)
  /**
   * Angular radius of the key light (radians). 0 is a point sun with a cosine
   * terminator; larger values behave like a softbox and spread the lit-to-shadow
   * transition over roughly +/- this angle.
   */
  angularRadius: number;
}

/** A uniform hemisphere light, expressed as irradiance E. */
export interface HemisphereLightConfig {
  color: THREE.Color;
  /** Irradiance E. Diffuse radiance = albedo * E * weight / PI. */
  intensity: number;
}

export interface LightingEnvironment {
  preset: LightingPreset | 'custom';
  keyLight: KeyLightConfig;
  /** Visible dome colours (background only). */
  ambient: Ambient3ZoneConfig;
  /** Sky hemisphere lighting. */
  skyLight: HemisphereLightConfig;
  /** Ground bounce lighting. */
  groundLight: HemisphereLightConfig;
  /** Phase turbidity at the preset's calibrated Haze setting. */
  hazeStrength: number;
  /** Preset's calibrated Haze-slider value (0–1). */
  hazePreset: number;
  /** Colour of the horizontal airlight band at the horizon. */
  horizonHaze: THREE.Color;
  /** Angular width of that band, in radians. */
  horizonBand: number;
  /** Colour the ground converges to at great distance. */
  groundHaze: THREE.Color;
  /** Phase density for the ground's own aerial perspective. */
  groundHazeStrength: number;
}

export function sphericalToCartesian(azimuth: number, elevation: number, distance = 1.0): THREE.Vector3 {
  const cosElev = Math.cos(elevation);
  const sinElev = Math.sin(elevation);
  const x = distance * cosElev * Math.sin(azimuth);
  const y = distance * sinElev;
  const z = distance * cosElev * Math.cos(azimuth);
  return new THREE.Vector3(x, y, z);
}

export function cartesianToSpherical(v: THREE.Vector3): { azimuth: number; elevation: number } {
  const norm = v.clone().normalize();
  const elevation = Math.asin(Math.max(-1, Math.min(1, norm.y)));
  const azimuth = Math.atan2(norm.x, norm.z);
  return {
    azimuth: (azimuth + 2 * Math.PI) % (2 * Math.PI),
    elevation,
  };
}

/**
 * One keyframe of the environment curve.
 *
 * The curve is keyed by SUN ELEVATION, not by preset identity, so a preset is
 * just a named point on it. Clicking "Midday" and typing Midday's Height by
 * hand therefore produce identical images by construction.
 */
export interface AtmosphereKey {
  id: LightingPreset;
  /** Key elevation in radians; also the curve parameter. */
  elevation: number;
  keyColor: string;
  keyIntensity: number;
  keyAngularRadiusDeg: number;
  zenith: string;
  equator: string;
  horizon: string;
  groundDome: string;
  skyLightColor: string;
  skyLightIntensity: number;
  groundLightColor: string;
  groundLightIntensity: number;
  /**
   * Ground albedo for this phase. The visible ground in the reference is not
   * one material under changing light: its hue runs from green at Midday to
   * pale olive at dawn and warm brown at sunset, which a single saturated
   * green albedo cannot produce under any irradiance. The phase therefore
   * carries the ground colour too, exactly like it carries the sun colour.
   */
  groundAlbedo: string;
  /**
   * Effective haze factor at the preset's calibrated Haze setting. The sheet is
   * clear at Midday and heavily hazed at dawn, dusk and night, so one global
   * density cannot reproduce all seven panels.
   */
  hazeStrength: number;
  /**
   * Colour of the horizon haze band, in sRGB. This is the airlight you see
   * looking horizontally through the most air: it is what the sky just above
   * the horizon and every distant object must converge to.
   */
  horizonHaze: string;
  /**
   * Angular width of that band, in radians above the horizon. Hazier phases
   * hold their horizon colour over a wider slice of sky; clear Midday keeps a
   * thin line.
   */
  horizonBand: number;
  /**
   * Colour the ground converges to at great distance. It is the ground's own
   * aerial perspective, so it keeps some of the ground's hue instead of
   * becoming pure sky.
   */
  groundHaze: string;
  /**
   * Effective ground-haze factor at the preset's Haze setting. The ground's
   * visible depth span is only a few hundred world units, while the sky's air
   * path is effectively infinite, so the ground needs its own calibrated
   * density.
   */
  groundHazeStrength: number;
}

/**
 * Seven time-of-day keyframes, measured from the supplied reference sheet
 * (825 x 1024, seven 3D panels on the satin material).
 *
 * For each panel the visible dome is sampled at the frame top, mid-sky and
 * just above the horizon, the light is solved from the eight sphere probes
 * used for the Midday calibration, and the key elevation follows the
 * reference terminator (the sphere shading is the primary match, exactly as
 * in phase 1; cast-shadow length is then whatever that elevation gives).
 *
 * The dome and the lighting are deliberately separate: the sheet's skies are
 * bright while the spheres' shadow sides are much darker than the visible sky
 * could light them, so skyLightIntensity is not the sky's apparent brightness.
 *
 * Keyframes are ordered by key elevation, the curve parameter. Clicking a
 * preset and typing its Orbit/Height by hand therefore remain identical.
 */
export const ATMOSPHERE_KEYS: AtmosphereKey[] = [
  {
    // The sheet's lowest, warmest sun. Warm key, rose/lilac sky, dark earth.
    id: 'golden-hour',
    elevation: (10 * Math.PI) / 180,
    keyColor: '#FFB860',
    keyIntensity: 4.8,
    keyAngularRadiusDeg: 8,
    zenith: '#B090A0',
    equator: '#D8B0A8',
    horizon: '#F8B470',
    groundDome: '#633D0C',
    skyLightColor: '#E0A090',
    skyLightIntensity: 1.5,
    groundLightColor: '#A85A28',
    groundLightIntensity: 0.90,
    groundAlbedo: '#8F7529',
    hazeStrength: 1.05,
    horizonHaze: '#FFC97C',
    horizonBand: 0.13,
    groundHaze: '#EEA757',
    groundHazeStrength: 0.78,
  },
  {
    id: 'near-sunset',
    elevation: (13 * Math.PI) / 180,
    keyColor: '#FFA868',
    keyIntensity: 2.10,
    keyAngularRadiusDeg: 10,
    zenith: '#7879A8',
    equator: '#AF9FB9',
    horizon: '#F4C09C',
    groundDome: '#574713',
    skyLightColor: '#C08A9C',
    skyLightIntensity: 1.20,
    groundLightColor: '#8A5228',
    groundLightIntensity: 1.34,
    groundAlbedo: '#A1BA44',
    hazeStrength: 0.90,
    horizonHaze: '#FFCEA3',
    horizonBand: 0.13,
    groundHaze: '#E6A46A',
    groundHazeStrength: 0.60,
  },
  {
    // Dim cool moonlight. Its height is a low moon, which keeps the shadow
    // long and faint like the sheet rather than a hard noon shadow.
    id: 'night',
    elevation: (16 * Math.PI) / 180,
    keyColor: '#7FA8FF',
    keyIntensity: 0.35,
    keyAngularRadiusDeg: 14,
    zenith: '#041034',
    equator: '#0B2358',
    horizon: '#384C83',
    groundDome: '#041912',
    skyLightColor: '#1A4EC0',
    skyLightIntensity: 0.80,
    groundLightColor: '#0A2A20',
    groundLightIntensity: 0.00,
    groundAlbedo: '#668F38',
    hazeStrength: 0.22,
    horizonHaze: '#384C7E',
    horizonBand: 0.09,
    groundHaze: '#0E2342',
    groundHazeStrength: 0.45,
  },
  {
    // Before sunrise: no direct sun, a soft cool key and a pale rose horizon.
    id: 'early-morning',
    elevation: (22 * Math.PI) / 180,
    keyColor: '#B8C8F0',
    keyIntensity: 0.76,
    keyAngularRadiusDeg: 20,
    zenith: '#5E74A8',
    equator: '#A0ACD0',
    horizon: '#D0C2D0',
    groundDome: '#293F4C',
    skyLightColor: '#4A64A8',
    skyLightIntensity: 1.74,
    groundLightColor: '#24384C',
    groundLightIntensity: 3.72,
    groundAlbedo: '#ABC09D',
    hazeStrength: 0.90,
    horizonHaze: '#6A7AA0',
    horizonBand: 0.05,
    groundHaze: '#7080A4',
    groundHazeStrength: 0.60,
  },
  {
    id: 'afternoon',
    elevation: (19 * Math.PI) / 180,
    keyColor: '#FFF4E2',
    keyIntensity: 5.9,
    keyAngularRadiusDeg: 7,
    zenith: '#0B59AB',
    equator: '#408ACB',
    horizon: '#D8D2D2',
    groundDome: '#4A7317',
    skyLightColor: '#2E7EA8',
    skyLightIntensity: 1.55,
    groundLightColor: '#5CC42A',
    groundLightIntensity: 0.30,
    groundAlbedo: '#668E23',
    hazeStrength: 0.14,
    horizonHaze: '#EFE0CB',
    horizonBand: 0.13,
    groundHaze: '#7A8D56',
    groundHazeStrength: 0.25,
  },
  {
    id: 'morning',
    elevation: (24 * Math.PI) / 180,
    keyColor: '#FFE4C0',
    keyIntensity: 3.3,
    keyAngularRadiusDeg: 18,
    zenith: '#94B7D6',
    equator: '#BFD1DB',
    horizon: '#ECE0CA',
    groundDome: '#6F8544',
    skyLightColor: '#4A90CC',
    skyLightIntensity: 2.2,
    groundLightColor: '#A8C070',
    groundLightIntensity: 0.80,
    groundAlbedo: '#B0BA60',
    hazeStrength: 0.65,
    horizonHaze: '#F8ECD4',
    horizonBand: 0.12,
    groundHaze: '#EFE3CD',
    groundHazeStrength: 0.35,
  },
  {
    id: 'midday',
    elevation: (58 * Math.PI) / 180,
    keyColor: '#FFEFE8',
    keyIntensity: 3.506,
    keyAngularRadiusDeg: 14,
    zenith: '#0055B0',
    equator: '#2F8CD1',
    horizon: '#90BAC6',
    groundDome: '#478503',
    skyLightColor: '#00DCFF',
    skyLightIntensity: 0.422,
    groundLightColor: '#85FF00',
    groundLightIntensity: 0.178,
    groundAlbedo: '#478503',
    hazeStrength: 0.045,
    horizonHaze: '#8EBAC3',
    horizonBand: 0.03,
    groundHaze: '#6F9A50',
    groundHazeStrength: 0.01,
  },
];

ATMOSPHERE_KEYS.sort((a, b) => a.elevation - b.elevation);

/**
 * How top-weighted the sky hemisphere is.
 *
 * 1.0 would be a uniform hemisphere. The reference sphere's underside is darker
 * than that allows (it shows almost no sky blue), and the probe fit selects a
 * slightly top-weighted lobe. This is a property of the environment model, not
 * a per-preset magic number.
 */
export const SKY_HEMISPHERE_POWER = 1.3;

export interface AtmosphereSample {
  keyColor: THREE.Color;
  keyIntensity: number;
  keyAngularRadius: number;
  zenithColor: THREE.Color;
  equatorColor: THREE.Color;
  horizonColor: THREE.Color;
  groundDomeColor: THREE.Color;
  skyLightColor: THREE.Color;
  skyLightIntensity: number;
  groundLightColor: THREE.Color;
  groundLightIntensity: number;
  groundAlbedo: THREE.Color;
  hazeStrength: number;
  horizonHaze: THREE.Color;
  horizonBand: number;
  groundHaze: THREE.Color;
  groundHazeStrength: number;
}

const KEY_COLORS = ATMOSPHERE_KEYS.map((k) => ({
  keyColor: new THREE.Color(k.keyColor),
  zenithColor: new THREE.Color(k.zenith),
  equatorColor: new THREE.Color(k.equator),
  horizonColor: new THREE.Color(k.horizon),
  groundDomeColor: new THREE.Color(k.groundDome),
  skyLightColor: new THREE.Color(k.skyLightColor),
  groundLightColor: new THREE.Color(k.groundLightColor),
  groundAlbedo: new THREE.Color(k.groundAlbedo),
  horizonHaze: new THREE.Color(k.horizonHaze),
  groundHaze: new THREE.Color(k.groundHaze),
}));

function smoothstep(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

/**
 * Continuous environment evaluation. At a keyframe elevation the keyframe is
 * returned exactly, so presets and manual angles cannot drift apart.
 */
export function evaluateAtmosphere(elevation: number): AtmosphereSample {
  let lower = 0;
  let upper = 0;
  let t = 0;

  if (elevation <= ATMOSPHERE_KEYS[0].elevation) {
    lower = upper = 0;
  } else if (elevation >= ATMOSPHERE_KEYS[ATMOSPHERE_KEYS.length - 1].elevation) {
    lower = upper = ATMOSPHERE_KEYS.length - 1;
  } else {
    for (let i = 0; i < ATMOSPHERE_KEYS.length - 1; i += 1) {
      const a = ATMOSPHERE_KEYS[i];
      const b = ATMOSPHERE_KEYS[i + 1];
      if (elevation >= a.elevation && elevation <= b.elevation) {
        lower = i;
        upper = i + 1;
        const span = b.elevation - a.elevation;
        t = span > 0 ? (elevation - a.elevation) / span : 1;
        break;
      }
    }
  }

  const s = smoothstep(t);
  const a = keyColorsOf(lower);
  const b = keyColorsOf(upper);
  const ka = ATMOSPHERE_KEYS[lower];
  const kb = ATMOSPHERE_KEYS[upper];
  const lerp = (x: number, y: number) => THREE.MathUtils.lerp(x, y, s);

  return {
    keyColor: a.keyColor.clone().lerp(b.keyColor, s),
    keyIntensity: lerp(ka.keyIntensity, kb.keyIntensity),
    keyAngularRadius: THREE.MathUtils.degToRad(lerp(ka.keyAngularRadiusDeg, kb.keyAngularRadiusDeg)),
    zenithColor: a.zenithColor.clone().lerp(b.zenithColor, s),
    equatorColor: a.equatorColor.clone().lerp(b.equatorColor, s),
    horizonColor: a.horizonColor.clone().lerp(b.horizonColor, s),
    groundDomeColor: a.groundDomeColor.clone().lerp(b.groundDomeColor, s),
    skyLightColor: a.skyLightColor.clone().lerp(b.skyLightColor, s),
    skyLightIntensity: lerp(ka.skyLightIntensity, kb.skyLightIntensity),
    groundLightColor: a.groundLightColor.clone().lerp(b.groundLightColor, s),
    groundLightIntensity: lerp(ka.groundLightIntensity, kb.groundLightIntensity),
    groundAlbedo: a.groundAlbedo.clone().lerp(b.groundAlbedo, s),
    hazeStrength: lerp(ka.hazeStrength, kb.hazeStrength),
    horizonHaze: a.horizonHaze.clone().lerp(b.horizonHaze, s),
    horizonBand: lerp(ka.horizonBand, kb.horizonBand),
    groundHaze: a.groundHaze.clone().lerp(b.groundHaze, s),
    groundHazeStrength: lerp(ka.groundHazeStrength, kb.groundHazeStrength),
  };
}

function keyColorsOf(index: number) {
  return KEY_COLORS[index];
}

/** Preset table: azimuth plus the elevation that selects its keyframe. */
export const LIGHTING_PRESETS: Record<LightingPreset, {
  name: string;
  description: string;
  azimuth: number;
  elevation: number;
  /** Calibrated Haze-slider value (0–1) for this time of day. */
  haze: number;
}> = {
  morning: {
    name: 'Morning',
    description: 'Pale hazy sky, soft warm key, low contrast',
    azimuth: (255 * Math.PI) / 180,
    elevation: (24 * Math.PI) / 180,
    haze: 0.43,
  },
  midday: {
    name: 'Midday',
    description: 'High side sun, pale cyan sky fill, saturated green bounce',
    azimuth: (284 * Math.PI) / 180,
    elevation: (58 * Math.PI) / 180,
    haze: 0.03,
  },
  afternoon: {
    name: 'Afternoon',
    description: 'Deep blue sky, crisp warm key, vivid green bounce',
    azimuth: (255 * Math.PI) / 180,
    elevation: (19 * Math.PI) / 180,
    haze: 0.09,
  },
  'near-sunset': {
    name: 'Near Sunset',
    description: 'Low amber sun, lilac sky, long warm shadow',
    azimuth: (265 * Math.PI) / 180,
    elevation: (13 * Math.PI) / 180,
    haze: 0.60,
  },
  'golden-hour': {
    name: 'Golden Hour',
    description: 'Lowest orange sun, rose sky, dark earth bounce',
    azimuth: (265 * Math.PI) / 180,
    elevation: (10 * Math.PI) / 180,
    haze: 0.70,
  },
  night: {
    name: 'Night',
    description: 'Cool moonlight, deep navy sky, faint bounce',
    azimuth: (285 * Math.PI) / 180,
    elevation: (16 * Math.PI) / 180,
    haze: 0.15,
  },
  'early-morning': {
    name: 'Early Morning',
    description: 'Before sunrise: cool ambient light and a pale rose horizon',
    azimuth: (260 * Math.PI) / 180,
    elevation: (22 * Math.PI) / 180,
    haze: 0.60,
  },
};

/** UI order, following the reference sheet: dawn through dusk to night. */
export const LIGHTING_PRESET_ORDER: LightingPreset[] = [
  'morning',
  'midday',
  'afternoon',
  'near-sunset',
  'golden-hour',
  'night',
  'early-morning',
];

/**
 * Soft-key sample set. A key light with an angular radius behaves like a small
 * area light: the diffuse response is the average of the cosine over a cone,
 * which spreads the terminator over roughly +/- the angular radius instead of
 * ending at a hard cosine zero.
 *
 * The shader mirrors these constants exactly.
 */
export const SOFT_KEY_CENTER_WEIGHT = 0.28;
export const SOFT_KEY_RING_WEIGHT = 0.12;  // 4 samples at the full radius
export const SOFT_KEY_INNER_WEIGHT = 0.06; // 4 samples at half the radius

/**
 * User-facing range for the terminator control, in degrees.
 *
 * 0 is a point sun: the diffuse terminator is the plain cosine edge. 45 is a
 * broad softbox that spreads the lit-to-shadow transition over +/-45 degrees.
 * Midday's measured value (14) sits inside this range.
 */
export const MAX_KEY_ANGULAR_RADIUS_DEG = 45;

/** Average cos between L and the sample directions, so N = L still returns 1. */
export function keySoftNormalisation(angularRadius: number): number {
  return (
    SOFT_KEY_CENTER_WEIGHT +
    4 * SOFT_KEY_RING_WEIGHT * Math.cos(angularRadius) +
    4 * SOFT_KEY_INNER_WEIGHT * Math.cos(angularRadius * 0.5)
  );
}

/** CPU twin of the shader's `softKeyNoL`. */
export function softKeyNoL(
  n: THREE.Vector3,
  l: THREE.Vector3,
  angularRadius: number
): number {
  const cosine = n.dot(l);
  if (angularRadius <= 1e-4) return Math.max(0, cosine);

  const up = Math.abs(l.y) < 0.99
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const t = new THREE.Vector3().crossVectors(up, l).normalize();
  const b = new THREE.Vector3().crossVectors(l, t);
  const tanR = Math.tan(angularRadius);

  let sum = SOFT_KEY_CENTER_WEIGHT * Math.max(0, cosine);

  for (let i = 0; i < 4; i += 1) {
    const a = (i * Math.PI) / 2;
    const dir = l
      .clone()
      .addScaledVector(t, Math.cos(a) * tanR)
      .addScaledVector(b, Math.sin(a) * tanR)
      .normalize();
    sum += SOFT_KEY_RING_WEIGHT * Math.max(0, n.dot(dir));
  }

  for (let i = 0; i < 4; i += 1) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const dir = l
      .clone()
      .addScaledVector(t, Math.cos(a) * tanR * 0.5)
      .addScaledVector(b, Math.sin(a) * tanR * 0.5)
      .normalize();
    sum += SOFT_KEY_INNER_WEIGHT * Math.max(0, n.dot(dir));
  }

  return sum / keySoftNormalisation(angularRadius);
}
