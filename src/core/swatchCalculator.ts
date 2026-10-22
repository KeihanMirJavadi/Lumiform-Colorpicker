import * as THREE from 'three';
import { RGBColor, SurfaceFinish, SwatchRole } from './types';
import { LightingEnvironment } from './lighting';
import { SURFACE_FINISHES } from './material';
import { rgbToHex } from './color';

export interface AnalyticalSwatch {
  role: SwatchRole;
  label: string;
  tag: string;
  description: string;
  rgb: RGBColor;
  hex: string;
}

/**
 * Mathematically evaluates the physical Lumiform lighting equation for a given normal vector.
 * I_total = I_key * max(0, N·L) + I_ambient(N) + I_specular
 */
export function evaluateLightingAnalytical(
  N: THREE.Vector3,
  L: THREE.Vector3,
  V: THREE.Vector3,
  albedoCol: THREE.Color,
  env: LightingEnvironment,
  roughness: number,
  specularIntensity: number
): { rgb: RGBColor; hex: string } {
  const normN = N.clone().normalize();
  const normL = L.clone().normalize();
  const normV = V.clone().normalize();
  const H = new THREE.Vector3().addVectors(normL, normV).normalize();

  // 1. Key Diffuse
  const NdotL = Math.max(0, normN.dot(normL));
  const keyDiffuse = env.keyLight.color.clone().multiplyScalar(NdotL * env.keyLight.intensity);

  // 2. Physical Hemispherical Sky Fill + Ground Bounce GI
  const zenith = env.ambient.zenithColor ?? env.ambient.skyColor;
  const equator = env.ambient.equatorColor ?? env.ambient.skyColor;

  let skyLight: THREE.Color;
  if (normN.y < 0.45) {
    const t = Math.max(0, normN.y) / 0.45;
    skyLight = new THREE.Color().lerpColors(env.ambient.horizonColor, equator, t);
  } else {
    const t = (normN.y - 0.45) / 0.55;
    skyLight = new THREE.Color().lerpColors(equator, zenith, t);
  }

  const groundBounceGI = env.ambient.groundColor.clone().multiplyScalar(
    0.35 * Math.max(0, normL.y) * env.keyLight.intensity +
    0.22 * env.ambient.intensity
  );

  let ambientCol: THREE.Color;
  if (normN.y >= 0) {
    ambientCol = skyLight.multiplyScalar(env.ambient.intensity);
  } else {
    const t = Math.pow(Math.max(0, Math.min(1, -normN.y)), 0.75);
    ambientCol = new THREE.Color().lerpColors(
      env.ambient.horizonColor.clone().multiplyScalar(env.ambient.intensity),
      groundBounceGI.multiplyScalar(env.ambient.intensity),
      t
    );
  }
  const totalAmbient = ambientCol;

  // 3. Diffuse Component
  const totalDiffuseLight = new THREE.Color().addColors(keyDiffuse, totalAmbient);
  const diffuse = albedoCol.clone().multiply(totalDiffuseLight);

  // 4. Specular Component
  const specular = new THREE.Color(0, 0, 0);

  if (specularIntensity > 0.001 && NdotL > 0) {
    const shininess = Math.pow(2, 10 * (1 - Math.max(0, Math.min(1, roughness))));
    const NdotH = Math.max(0, normN.dot(H));
    const specFactor = Math.pow(NdotH, shininess);

    const VdotH = Math.max(0, normV.dot(H));
    const fresnel = specularIntensity + (1 - specularIntensity) * Math.pow(Math.max(0, Math.min(1, 1 - VdotH)), 5);

    const specScalar = specFactor * fresnel * env.keyLight.intensity;
    specular.copy(env.keyLight.color).multiplyScalar(specScalar);

    if (specularIntensity > 0.05 && roughness < 0.7) {
      const VdotN = Math.max(0, normV.dot(normN));
      const edgeFresnel = Math.pow(Math.max(0, Math.min(1, 1 - VdotN)), 4);
      const ambientReflect = (normN.y >= 0 ? zenith : env.ambient.groundColor).clone();
      ambientReflect.multiplyScalar(edgeFresnel * (1 - roughness) * specularIntensity * 0.45 * env.ambient.intensity);
      specular.add(ambientReflect);
    }
  }

  // 5. Total Radiance
  const finalCol = new THREE.Color().addColors(diffuse, specular);

  // 6. ACES Filmic Tone Mapping approximation
  const r = acesFilmic(finalCol.r);
  const g = acesFilmic(finalCol.g);
  const b = acesFilmic(finalCol.b);

  const rgb: RGBColor = {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };

  return { rgb, hex: rgbToHex(rgb) };
}

function acesFilmic(x: number): number {
  const a = x * (x + 0.0245786) - 0.000090537;
  const b = x * (0.983729 * x + 0.4329510) + 0.238081;
  return Math.max(0, Math.min(1, a / b));
}

/**
 * Computes canonical 5-value ramp:
 * [Highlight, Half-Tone, Terminator, Core Shadow, Bounce Light]
 */
export function calculate5ValueRamp(
  lightDir: THREE.Vector3,
  viewDir: THREE.Vector3,
  albedoHex: string,
  env: LightingEnvironment,
  roughnessOrFinish: number | SurfaceFinish,
  specularIntensityParam?: number
): AnalyticalSwatch[] {
  let roughness: number;
  let specularIntensity: number;

  if (typeof roughnessOrFinish === 'string') {
    if (roughnessOrFinish in SURFACE_FINISHES) {
      const cfg = SURFACE_FINISHES[roughnessOrFinish as Exclude<SurfaceFinish, 'custom'>];
      roughness = cfg.roughness;
      specularIntensity = cfg.specularIntensity;
    } else {
      roughness = 0.45;
      specularIntensity = 0.4;
    }
  } else {
    roughness = roughnessOrFinish;
    specularIntensity = specularIntensityParam ?? 0.4;
  }

  const L = lightDir.clone().normalize();
  const V = viewDir.clone().normalize();
  const albedoCol = new THREE.Color(albedoHex);

  // 1. Highlight Normal: Half-vector H = normalize(L + V)
  const nHighlight = new THREE.Vector3().addVectors(L, V).normalize();

  // 2. Half-Tone Normal: Normal at 45° toward light vector L
  const nHalftone = new THREE.Vector3().addVectors(V.clone().multiplyScalar(0.7), L.clone().multiplyScalar(0.7)).normalize();

  // 3. Terminator Normal: Perpendicular to L (N · L = 0)
  let nTerminator = new THREE.Vector3().crossVectors(L, new THREE.Vector3(0, 1, 0));
  if (nTerminator.lengthSq() < 0.001) {
    nTerminator = new THREE.Vector3().crossVectors(L, new THREE.Vector3(1, 0, 0));
  }
  nTerminator.normalize();

  // 4. Core Shadow Normal: Opposite to L, angled into upper ambient sky/shadow
  const nCoreShadow = L.clone().negate().add(new THREE.Vector3(0, 0.4, 0)).normalize();

  // 5. Bounce Light Normal: Pointing straight down (0, -1, 0)
  const nBounceLight = new THREE.Vector3(0, -1, 0);

  const swatches: { role: SwatchRole; label: string; tag: string; description: string; normal: THREE.Vector3 }[] = [
    {
      role: 'highlight',
      label: 'Highlight',
      tag: 'HL',
      description: 'Direct specular & key light reflection point (Half-vector H)',
      normal: nHighlight,
    },
    {
      role: 'halftone',
      label: 'Half-Tone',
      tag: 'HT',
      description: 'True lit surface color facing ~45° toward the key light',
      normal: nHalftone,
    },
    {
      role: 'terminator',
      label: 'Terminator',
      tag: 'TERM',
      description: 'Form terminator where sunlight grazes the form (N·L = 0)',
      normal: nTerminator,
    },
    {
      role: 'core-shadow',
      label: 'Core Shadow',
      tag: 'CORE',
      description: 'Deepest shadow crest facing away from direct sun and bounce',
      normal: nCoreShadow,
    },
    {
      role: 'bounce-light',
      label: 'Bounce Light',
      tag: 'BNC',
      description: 'Underside reflection illuminated by ground ambient bounce',
      normal: nBounceLight,
    },
  ];

  return swatches.map((s) => {
    const { rgb, hex } = evaluateLightingAnalytical(s.normal, L, V, albedoCol, env, roughness, specularIntensity);
    return {
      role: s.role,
      label: s.label,
      tag: s.tag,
      description: s.description,
      rgb,
      hex,
    };
  });
}
