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
}

/**
 * Measured from the Midday reference panel (412 x 227) with a constrained
 * diffuse fit over the near sphere:
 *
 *   key          az 291 deg, el 62 deg, E = 3.09, warm-neutral white
 *   sky fill     E = 0.50, pale cyan  (the sphere's shadow side reads teal)
 *   ground       E = 0.15, saturated green bounce
 *
 * The fit reproduces the measured sphere probes to within ~0.01 linear
 * radiance (top .70, upper-left .73, left .57, centre .15, right .04).
 *
 * Midday's cast shadow in the reference is ~1.6 sphere radii long, which would
 * need a ~31 deg sun. Its sphere requires 62 deg. The sphere is what is being
 * matched (shadows stay physically derived), so the rendered shadow is the
 * shorter one that 62 deg actually produces.
 */
export const ATMOSPHERE_KEYS: AtmosphereKey[] = [
  {
    id: 'golden-hour',
    elevation: 0.28,
    keyColor: '#FBBF24',
    keyIntensity: 2.8,
    keyAngularRadiusDeg: 8,
    zenith: '#4338CA',
    equator: '#D97706',
    horizon: '#F97316',
    groundDome: '#3B1D0E',
    skyLightColor: '#D08A50',
    skyLightIntensity: 0.75,
    groundLightColor: '#3B1D0E',
    groundLightIntensity: 0.22,
  },
  {
    id: 'night',
    elevation: 0.45,
    keyColor: '#94A3B8',
    keyIntensity: 1.0,
    keyAngularRadiusDeg: 8,
    zenith: '#0F172A',
    equator: '#1E293B',
    horizon: '#334155',
    groundDome: '#0A0E17',
    skyLightColor: '#31456B',
    skyLightIntensity: 0.30,
    groundLightColor: '#0A0E17',
    groundLightIntensity: 0.05,
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
}

const KEY_COLORS = ATMOSPHERE_KEYS.map((k) => ({
  keyColor: new THREE.Color(k.keyColor),
  zenithColor: new THREE.Color(k.zenith),
  equatorColor: new THREE.Color(k.equator),
  horizonColor: new THREE.Color(k.horizon),
  groundDomeColor: new THREE.Color(k.groundDome),
  skyLightColor: new THREE.Color(k.skyLightColor),
  groundLightColor: new THREE.Color(k.groundLightColor),
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
}> = {
  midday: {
    name: 'Midday',
    description: 'Measured reference: high side sun, pale cyan sky fill, saturated green bounce',
    azimuth: (284 * Math.PI) / 180,
    elevation: (58 * Math.PI) / 180,
  },
  'golden-hour': {
    name: 'Golden Hour',
    description: 'Low amber sun, warm dusk sky, dark earth bounce (not yet calibrated)',
    azimuth: 0.85,
    elevation: 0.28,
  },
  night: {
    name: 'Night',
    description: 'Cool moonlight, deep navy sky, faint bounce (not yet calibrated)',
    azimuth: 2.3,
    elevation: 0.45,
  },
};

export const LIGHTING_PRESET_ORDER: LightingPreset[] = ['midday', 'golden-hour', 'night'];

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
