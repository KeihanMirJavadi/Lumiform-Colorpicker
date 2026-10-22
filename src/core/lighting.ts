import * as THREE from 'three';
import { LightingPreset } from './types';

export interface Ambient3ZoneConfig {
  zenithColor: THREE.Color;
  equatorColor: THREE.Color;
  horizonColor: THREE.Color;
  groundColor: THREE.Color;
  skyColor: THREE.Color; // Backwards compatible alias (points to zenith/equator)
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

  // Color anchor states
  // 1. High Daylight Sun (elevation >= 40°)
  const dayZenith = new THREE.Color('#1E40AF');   // Deep cerulean
  const dayEquator = new THREE.Color('#60A5FA');  // Radiant sky blue
  const dayHorizon = new THREE.Color('#E0F2FE');  // Pale atmospheric haze
  const dayGround = new THREE.Color('#5A4638');   // Warm neutral earth
  const daySun = new THREE.Color('#FFF5E6');      // Pure warm white sun

  // 2. Low Golden Hour Sun (elevation ~ 12°)
  const goldZenith = new THREE.Color('#2E1065');  // Deep dusk violet
  const goldEquator = new THREE.Color('#EA580C'); // Saturated amber orange
  const goldHorizon = new THREE.Color('#FB7185'); // Fiery sunset glow
  const goldGround = new THREE.Color('#7C2D12');  // Saturated terracotta bounce
  const goldSun = new THREE.Color('#FBBF24');     // Rich golden sun

  // 3. Twilight Sun (elevation ~ 1°)
  const twiZenith = new THREE.Color('#1E1B4B');   // Nightfall indigo
  const twiEquator = new THREE.Color('#831843');  // Deep wine twilight
  const twiHorizon = new THREE.Color('#BE185D');  // Crimson horizon rim
  const twiGround = new THREE.Color('#3B0764');   // Dark violet earth
  const twiSun = new THREE.Color('#F43F5E');      // Red rim sun

  // 4. Night / Below Horizon (elevation <= -10°)
  const nightZenith = new THREE.Color('#030712'); // Cosmic obsidian navy
  const nightEquator = new THREE.Color('#0F172A');// Deep midnight blue
  const nightHorizon = new THREE.Color('#1E1B4B');// Faint atmospheric indigo
  const nightGround = new THREE.Color('#090D16'); // Dark night ground
  const nightSun = new THREE.Color('#93C5FD');    // Pale silver moonlight

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
    sunIntensity = 2.2;
    ambientIntensity = 0.85;
  } else if (elevDeg >= 12) {
    // Blend Golden Hour -> Daylight
    const t = (elevDeg - 12) / (35 - 12);
    zenithColor.lerpColors(goldZenith, dayZenith, t);
    equatorColor.lerpColors(goldEquator, dayEquator, t);
    horizonColor.lerpColors(goldHorizon, dayHorizon, t);
    groundColor.lerpColors(goldGround, dayGround, t);
    sunColor.lerpColors(goldSun, daySun, t);
    sunIntensity = THREE.MathUtils.lerp(2.8, 2.2, t);
    ambientIntensity = THREE.MathUtils.lerp(0.9, 0.85, t);
  } else if (elevDeg >= 0) {
    // Blend Twilight -> Golden Hour
    const t = elevDeg / 12;
    zenithColor.lerpColors(twiZenith, goldZenith, t);
    equatorColor.lerpColors(twiEquator, goldEquator, t);
    horizonColor.lerpColors(twiHorizon, goldHorizon, t);
    groundColor.lerpColors(twiGround, goldGround, t);
    sunColor.lerpColors(twiSun, goldSun, t);
    sunIntensity = THREE.MathUtils.lerp(1.8, 2.8, t);
    ambientIntensity = THREE.MathUtils.lerp(0.7, 0.9, t);
  } else if (elevDeg >= -15) {
    // Blend Night -> Twilight
    const t = (elevDeg + 15) / 15;
    zenithColor.lerpColors(nightZenith, twiZenith, t);
    equatorColor.lerpColors(nightEquator, twiEquator, t);
    horizonColor.lerpColors(nightHorizon, twiHorizon, t);
    groundColor.lerpColors(nightGround, twiGround, t);
    sunColor.lerpColors(nightSun, twiSun, t);
    sunIntensity = THREE.MathUtils.lerp(0.8, 1.8, t);
    ambientIntensity = THREE.MathUtils.lerp(0.55, 0.7, t);
  } else {
    // Full night
    zenithColor.copy(nightZenith);
    equatorColor.copy(nightEquator);
    horizonColor.copy(nightHorizon);
    groundColor.copy(nightGround);
    sunColor.copy(nightSun);
    sunIntensity = 0.8;
    ambientIntensity = 0.55;
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
    description: 'Crisp 5500K overhead sun, 3-tone sky fill, warm ochre ground bounce',
    keyLight: {
      color: '#FFF2DB',
      intensity: 2.2,
      azimuth: 0.65, // ~37°
      elevation: 0.95, // ~54° high sun
    },
    ambient: {
      zenithColor: '#1E40AF',   // Deep cerulean zenith
      equatorColor: '#60A5FA',  // Radiant azure equator
      horizonColor: '#E0F2FE',  // Soft atmospheric haze horizon
      groundColor: '#7A5435',   // Warm ground bounce
      skyColor: '#5C8ECC',      // Legacy alias
      intensity: 0.85,
    },
  },
  'golden-hour': {
    name: 'Golden Hour',
    description: 'Low-angle 3200K amber sun, dusk violet/amber sky, saturated warm bounce',
    keyLight: {
      color: '#FFA347',
      intensity: 2.8,
      azimuth: 0.85, // ~48°
      elevation: 0.28, // ~16° low sun
    },
    ambient: {
      zenithColor: '#2E1065',   // Deep dusk violet zenith
      equatorColor: '#EA580C',  // Warm amber equator
      horizonColor: '#FB7185',  // Saturated flame horizon
      groundColor: '#8C311E',   // Warm saturated terracotta bounce
      skyColor: '#363463',      // Legacy alias
      intensity: 0.9,
    },
  },
  'night': {
    name: 'Night',
    description: 'Cool pale moonlight rim, deep navy 3-tone sky, subtle indigo ground fill',
    keyLight: {
      color: '#A8C7F0',
      intensity: 1.6,
      azimuth: 2.3, // ~131° rim angle
      elevation: 0.45, // ~25°
    },
    ambient: {
      zenithColor: '#030712',   // Cosmic black-navy zenith
      equatorColor: '#0F172A',  // Midnight blue equator
      horizonColor: '#1E1B4B',  // Atmospheric night indigo horizon
      groundColor: '#0A0E1A',   // Very dark cool ground
      skyColor: '#0E162B',      // Legacy alias
      intensity: 0.6,
    },
  },
};
