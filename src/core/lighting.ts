import * as THREE from 'three';
import { LightingPreset } from './types';

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
  intensity: number;
  azimuth: number;   // Horizontal orbit around Y axis (0 to 2*PI, in degrees 0° to 360°)
  elevation: number; // Vertical height above/below horizon (-PI/2 to PI/2, in degrees -89° to +89°)
}

export interface LightingEnvironment {
  preset: LightingPreset | 'custom';
  keyLight: KeyLightConfig;
  ambient: Ambient3ZoneConfig;
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
 * Dynamically evaluates natural 3-tone sky colors (Zenith, Equator, Horizon),
 * Ground bounce, and Key sun properties based on sun elevation angle.
 * Ensures the sky dome is always more luminous than the secondary ground bounce.
 */
export function computeDynamicAtmosphere(elevationRad: number): {
  zenithColor: THREE.Color;
  equatorColor: THREE.Color;
  horizonColor: THREE.Color;
  groundColor: THREE.Color;
  sunColor: THREE.Color;
  sunIntensity: number;
  ambientIntensity: number;
} {
  const elevDeg = (elevationRad * 180) / Math.PI;

  // 1. High Daylight Sun (elevation >= 35°)
  const dayZenith = new THREE.Color('#1B4A96');   // Deep clear-sky blue
  const dayEquator = new THREE.Color('#5C9BD1');  // Hazy cyan mid-sky
  const dayHorizon = new THREE.Color('#D8ECF3');  // Pale atmospheric horizon
  const dayGround = new THREE.Color('#5C8F3E');   // Natural grass bounce
  const daySun = new THREE.Color('#FFE9C9');      // Warm sunlight

  // 2. Low Golden Hour Sun (elevation ~ 14°)
  const goldZenith = new THREE.Color('#4338CA');  // Luminous twilight violet (clear sky fill)
  const goldEquator = new THREE.Color('#D97706'); // Warm glowing amber
  const goldHorizon = new THREE.Color('#F97316'); // Radiant sunset glow
  const goldGround = new THREE.Color('#3B1D0E');  // Dark warm earth bounce (subtle, secondary)
  const goldSun = new THREE.Color('#FBBF24');     // Rich golden sun

  // 3. Twilight Sun (elevation ~ 1°)
  const twiZenith = new THREE.Color('#312E81');   // Deep indigo sky
  const twiEquator = new THREE.Color('#9333EA');  // Purple dusk
  const twiHorizon = new THREE.Color('#F43F5E');  // Crimson/pink horizon
  const twiGround = new THREE.Color('#1F102E');   // Dark twilight ground
  const twiSun = new THREE.Color('#FB7185');

  // 4. Night / Below Horizon (elevation <= -10°)
  const nightZenith = new THREE.Color('#0F172A'); // Deep night sky
  const nightEquator = new THREE.Color('#1E293B');// Indigo night
  const nightHorizon = new THREE.Color('#334155');// Faint horizon haze
  const nightGround = new THREE.Color('#0A0E17'); // Very dark ground
  const nightSun = new THREE.Color('#94A3B8');    // Moonlight

  const zenithColor = new THREE.Color();
  const equatorColor = new THREE.Color();
  const horizonColor = new THREE.Color();
  const groundColor = new THREE.Color();
  const sunColor = new THREE.Color();
  let sunIntensity: number;
  let ambientIntensity: number;

  if (elevDeg >= 35) {
    // Full daylight
    zenithColor.copy(dayZenith);
    equatorColor.copy(dayEquator);
    horizonColor.copy(dayHorizon);
    groundColor.copy(dayGround);
    sunColor.copy(daySun);
    sunIntensity = 2.7;
    ambientIntensity = 1.2;
  } else if (elevDeg >= 12) {
    // Blend Golden Hour -> Daylight
    const t = (elevDeg - 12) / (35 - 12);
    zenithColor.lerpColors(goldZenith, dayZenith, t);
    equatorColor.lerpColors(goldEquator, dayEquator, t);
    horizonColor.lerpColors(goldHorizon, dayHorizon, t);
    groundColor.lerpColors(goldGround, dayGround, t);
    sunColor.lerpColors(goldSun, daySun, t);
    sunIntensity = THREE.MathUtils.lerp(2.8, 2.8, t);
    ambientIntensity = THREE.MathUtils.lerp(0.95, 1.2, t);
  } else if (elevDeg >= 0) {
    // Blend Twilight -> Golden Hour
    const t = elevDeg / 12;
    zenithColor.lerpColors(twiZenith, goldZenith, t);
    equatorColor.lerpColors(twiEquator, goldEquator, t);
    horizonColor.lerpColors(twiHorizon, goldHorizon, t);
    groundColor.lerpColors(twiGround, goldGround, t);
    sunColor.lerpColors(twiSun, goldSun, t);
    sunIntensity = THREE.MathUtils.lerp(1.8, 2.8, t);
    ambientIntensity = THREE.MathUtils.lerp(0.8, 0.95, t);
  } else if (elevDeg >= -15) {
    // Blend Night -> Twilight
    const t = (elevDeg + 15) / 15;
    zenithColor.lerpColors(nightZenith, twiZenith, t);
    equatorColor.lerpColors(nightEquator, twiEquator, t);
    horizonColor.lerpColors(nightHorizon, twiHorizon, t);
    groundColor.lerpColors(nightGround, twiGround, t);
    sunColor.lerpColors(nightSun, twiSun, t);
    sunIntensity = THREE.MathUtils.lerp(0.8, 1.8, t);
    ambientIntensity = THREE.MathUtils.lerp(0.65, 0.8, t);
  } else {
    // Full night
    zenithColor.copy(nightZenith);
    equatorColor.copy(nightEquator);
    horizonColor.copy(nightHorizon);
    groundColor.copy(nightGround);
    sunColor.copy(nightSun);
    sunIntensity = 0.8;
    ambientIntensity = 0.65;
  }

  return {
    zenithColor,
    equatorColor,
    horizonColor,
    groundColor,
    sunColor,
    sunIntensity,
    ambientIntensity,
  };
}

export const LIGHTING_PRESETS: Record<LightingPreset, {
  name: string;
  description: string;
  keyLight: { color: string; intensity: number; azimuth: number; elevation: number };
  ambient: {
    zenithColor: string;
    equatorColor: string;
    horizonColor: string;
    groundColor: string;
    skyColor: string;
    intensity: number;
  };
}> = {
  'daylight': {
    name: 'Daylight',
    description: 'High warm sun, deep blue sky fill, natural green ground bounce',
    keyLight: {
      color: '#FFE9C9',
      intensity: 2.7,
      azimuth: -0.65, // ~-37° upper left
      elevation: 0.95, // ~54° high sun
    },
    ambient: {
      zenithColor: '#1B4A96',   // Deep clear-sky blue
      equatorColor: '#5C9BD1',  // Hazy cyan mid-sky
      horizonColor: '#D8ECF3',  // Pale atmospheric horizon
      groundColor: '#5C8F3E',   // Natural grass bounce
      skyColor: '#5C9BD1',      // Legacy alias
      intensity: 1.2,
    },
  },
  'golden-hour': {
    name: 'Golden Hour',
    description: 'Low-angle 3200K amber sun, luminous dusk violet sky fill, subtle warm bounce',
    keyLight: {
      color: '#FBBF24',
      intensity: 2.7,
      azimuth: 0.85, // ~48°
      elevation: 0.28, // ~16° low sun
    },
    ambient: {
      zenithColor: '#4338CA',   // Luminous twilight violet zenith
      equatorColor: '#D97706',  // Warm amber equator
      horizonColor: '#F97316',  // Saturated flame horizon
      groundColor: '#3B1D0E',   // Dark terracotta bounce
      skyColor: '#4338CA',      // Legacy alias
      intensity: 0.95,
    },
  },
  'night': {
    name: 'Night',
    description: 'Cool pale moonlight rim, deep navy 3-tone sky, subtle dark ground fill',
    keyLight: {
      color: '#94A3B8',
      intensity: 1.2,
      azimuth: 2.3, // ~131° rim angle
      elevation: 0.45, // ~25°
    },
    ambient: {
      zenithColor: '#0F172A',   // Deep night sky
      equatorColor: '#1E293B',  // Midnight blue equator
      horizonColor: '#334155',  // Indigo horizon
      groundColor: '#0A0E17',   // Dark ground
      skyColor: '#1E293B',      // Legacy alias
      intensity: 0.65,
    },
  },
};
