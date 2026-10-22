import * as THREE from 'three';
import { LightingPreset } from './types';

export interface Ambient3ZoneConfig {
  skyColor: THREE.Color;
  horizonColor: THREE.Color;
  groundColor: THREE.Color;
  intensity: number;
}

export interface KeyLightConfig {
  color: THREE.Color;
  intensity: number;
  azimuth: number;   // Horizontal orbit around Y axis (0 to 2*PI, in degrees 0° to 360°)
  elevation: number; // Vertical height above/below horizon (-PI/2 to PI/2, in degrees -89° to +89°)
}

export interface LightingEnvironment {
  preset: LightingPreset;
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

export const LIGHTING_PRESETS: Record<LightingPreset, {
  name: string;
  description: string;
  keyLight: { color: string; intensity: number; azimuth: number; elevation: number };
  ambient: { skyColor: string; horizonColor: string; groundColor: string; intensity: number };
}> = {
  'daylight': {
    name: 'Daylight',
    description: 'Crisp 5500K overhead sun, cool clear sky fill, warm ochre ground bounce',
    keyLight: {
      color: '#FFF2DB',
      intensity: 2.2,
      azimuth: 0.65, // ~37°
      elevation: 0.95, // ~54° high sun
    },
    ambient: {
      skyColor: '#5C8ECC',      // Cool sky blue
      horizonColor: '#9BB9DE',  // Soft atmospheric haze
      groundColor: '#7A5435',   // Warm ground bounce
      intensity: 0.85,
    },
  },
  'golden-hour': {
    name: 'Golden Hour',
    description: 'Low-angle 3200K amber sun, deep violet ambient, saturated warm bounce',
    keyLight: {
      color: '#FFA347',
      intensity: 2.8,
      azimuth: 0.85, // ~48°
      elevation: 0.28, // ~16° low sun
    },
    ambient: {
      skyColor: '#363463',      // Deep indigo / violet
      horizonColor: '#CC633D',  // Saturated orange/pink horizon
      groundColor: '#8C311E',   // Warm saturated terracotta bounce
      intensity: 0.9,
    },
  },
  'night': {
    name: 'Night',
    description: 'Cool pale moonlight rim, deep navy sky, subtle indigo ground fill',
    keyLight: {
      color: '#A8C7F0',
      intensity: 1.6,
      azimuth: 2.3, // ~131° rim angle
      elevation: 0.45, // ~25°
    },
    ambient: {
      skyColor: '#0E162B',      // Dark navy
      horizonColor: '#17223D',  // Atmospheric night indigo
      groundColor: '#0A0E1A',   // Very dark cool ground
      intensity: 0.6,
    },
  },
};
