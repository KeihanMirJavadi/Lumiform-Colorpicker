export interface RGBColor {
  r: number; // 0 - 255
  g: number; // 0 - 255
  b: number; // 0 - 255
}

export interface HSBColor {
  h: number; // 0 - 360
  s: number; // 0 - 100
  b: number; // 0 - 100
}

export type SurfaceFinish = 'matte' | 'satin' | 'glossy' | 'custom';

export type LightingPreset = 'daylight' | 'golden-hour' | 'night';

export type SwatchRole = 'highlight' | 'halftone' | 'terminator' | 'core-shadow' | 'bounce-light';

export interface SwatchItem {
  role: SwatchRole;
  label: string;
  rgb: RGBColor;
  hex: string;
}
