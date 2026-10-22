import { SurfaceFinish } from './types';

export interface SurfaceFinishConfig {
  finish: SurfaceFinish;
  name: string;
  roughness: number;
  specularIntensity: number;
  description: string;
}

export const SURFACE_FINISHES: Record<SurfaceFinish, SurfaceFinishConfig> = {
  matte: {
    finish: 'matte',
    name: 'Matte',
    roughness: 1.0,
    specularIntensity: 0.0,
    description: 'Roughness 1.0, 0% Specular (pure diffuse Lambertian)',
  },
  satin: {
    finish: 'satin',
    name: 'Satin',
    roughness: 0.5,
    specularIntensity: 0.3,
    description: 'Roughness 0.5, 30% Specular (soft, spread highlight)',
  },
  glossy: {
    finish: 'glossy',
    name: 'Glossy',
    roughness: 0.1,
    specularIntensity: 0.9,
    description: 'Roughness 0.1, 90% Specular (sharp specular highlight + Fresnel)',
  },
};
