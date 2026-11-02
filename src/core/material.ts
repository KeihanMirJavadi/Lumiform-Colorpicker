import { SurfaceFinish } from './types';

export interface SurfaceFinishConfig {
  finish: SurfaceFinish;
  name: string;
  roughness: number;
  specularIntensity: number;
  description: string;
}

export const SURFACE_FINISHES: Record<Exclude<SurfaceFinish, 'custom'>, SurfaceFinishConfig> = {
  matte: {
    finish: 'matte',
    name: 'Matte',
    roughness: 1.0,
    specularIntensity: 0.0,
    description: '100% Roughness, 0% Specular (pure diffuse Lambertian)',
  },
  satin: {
    finish: 'satin',
    name: 'Satin',
    roughness: 0.75,
    specularIntensity: 0.35,
    description: '75% Roughness, 35% Specular (broad, diffused sheen)',
  },
  glossy: {
    finish: 'glossy',
    name: 'Glossy',
    roughness: 0.08,
    specularIntensity: 0.95,
    description: '8% Roughness, 95% Specular (sharp specular highlight + Fresnel)',
  },
};
