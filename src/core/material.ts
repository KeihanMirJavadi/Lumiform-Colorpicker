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
    roughness: 0.45,
    specularIntensity: 0.4,
    description: '45% Roughness, 40% Specular (soft, spread highlight)',
  },
  glossy: {
    finish: 'glossy',
    name: 'Glossy',
    roughness: 0.08,
    specularIntensity: 0.95,
    description: '8% Roughness, 95% Specular (sharp specular highlight + Fresnel)',
  },
};
