import { RGBColor, HSBColor } from './types';

export function rgbToHex(rgb: RGBColor): string {
  const r = Math.max(0, Math.min(255, Math.round(rgb.r))).toString(16).padStart(2, '0');
  const g = Math.max(0, Math.min(255, Math.round(rgb.g))).toString(16).padStart(2, '0');
  const b = Math.max(0, Math.min(255, Math.round(rgb.b))).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`.toUpperCase();
}

export function hexToRgb(hex: string): RGBColor | null {
  const cleaned = hex.replace(/^#/, '').trim();
  if (!/^[0-9A-Fa-f]{6}$/.test(cleaned)) {
    return null;
  }
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  return { r, g, b };
}

export function hsbToRgb(hsb: HSBColor): RGBColor {
  const h = (hsb.h % 360 + 360) % 360;
  const s = Math.max(0, Math.min(100, hsb.s)) / 100;
  const v = Math.max(0, Math.min(100, hsb.b)) / 100;

  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (h >= 0 && h < 60) {
    rPrime = c; gPrime = x; bPrime = 0;
  } else if (h >= 60 && h < 120) {
    rPrime = x; gPrime = c; bPrime = 0;
  } else if (h >= 120 && h < 180) {
    rPrime = 0; gPrime = c; bPrime = x;
  } else if (h >= 180 && h < 240) {
    rPrime = 0; gPrime = x; bPrime = c;
  } else if (h >= 240 && h < 300) {
    rPrime = x; gPrime = 0; bPrime = c;
  } else {
    rPrime = c; gPrime = 0; bPrime = x;
  }

  return {
    r: Math.round((rPrime + m) * 255),
    g: Math.round((gPrime + m) * 255),
    b: Math.round((bPrime + m) * 255),
  };
}

export function rgbToHsb(rgb: RGBColor): HSBColor {
  const r = Math.max(0, Math.min(255, rgb.r)) / 255;
  const g = Math.max(0, Math.min(255, rgb.g)) / 255;
  const b = Math.max(0, Math.min(255, rgb.b)) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      h = 60 * (((b - r) / delta) + 2);
    } else {
      h = 60 * (((r - g) / delta) + 4);
    }
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : (delta / max) * 100;
  const brightness = max * 100;

  return {
    h: Math.round(h),
    s: Math.round(s),
    b: Math.round(brightness),
  };
}
