import * as THREE from 'three';
import { RGBColor, SurfaceFinish, SwatchRole } from './types';
import { LightingEnvironment, SKY_HEMISPHERE_POWER } from './lighting';
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

export interface AtmosphereSample {
  /** 0 = clear, 1 = fully scattered. */
  amount: number;
  /** Linear-light in-scatter color (usually the horizon/sky tint). */
  color: THREE.Color;
}

const PI = Math.PI;

function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 3-zone sky radiance. Shared with the lumiform shader's `skyBands()`. */
function skyBands(dir: THREE.Vector3, env: LightingEnvironment): THREE.Color {
  const zenith = env.ambient.zenithColor;
  const equator = env.ambient.equatorColor;

  if (dir.y < 0.45) {
    const t = Math.max(0, dir.y) / 0.45;
    return new THREE.Color().lerpColors(env.ambient.horizonColor, equator, smoothstep(0, 1, t));
  }
  const t = (dir.y - 0.45) / 0.55;
  return new THREE.Color().lerpColors(equator, zenith, smoothstep(0, 1, t));
}

/** GGX normal distribution, matching `distributionGGX()` in the shader. */
function distributionGGX(NoH: number, roughness: number): number {
  const a = roughness * roughness;
  const a2 = a * a;
  const d = NoH * NoH * (a2 - 1) + 1;
  return a2 / Math.max(PI * d * d, 1e-6);
}

/** Smith-Schlick geometry masking, matching `geometrySmith()` in the shader. */
function geometrySchlickGGX(NoX: number, roughness: number): number {
  const r = roughness + 1;
  const k = (r * r) / 8;
  return NoX / (NoX * (1 - k) + k);
}

function geometrySmith(NoV: number, NoL: number, roughness: number): number {
  return geometrySchlickGGX(NoV, roughness) * geometrySchlickGGX(NoL, roughness);
}

/**
 * Mathematically evaluates the same physically based (GGX Cook-Torrance) lighting
 * model that the lumiform shader renders, for a given surface normal.
 */
export function evaluateLightingAnalytical(
  N: THREE.Vector3,
  L: THREE.Vector3,
  V: THREE.Vector3,
  albedoCol: THREE.Color,
  env: LightingEnvironment,
  roughness: number,
  specularIntensity: number,
  atmosphere?: AtmosphereSample
): { rgb: RGBColor; hex: string } {
  const normN = N.clone().normalize();
  const normL = L.clone().normalize();
  const normV = V.clone().normalize();
  const H = new THREE.Vector3().addVectors(normL, normV).normalize();

  const metalness = 0.0;
  const rough = clamp(roughness, 0.045, 1.0);

  const NoL = Math.max(0, normN.dot(normL));
  const NoV = Math.max(normV.dot(normN), 1e-4);
  const NoH = Math.max(0, normN.dot(H));
  const VoH = Math.max(0, normV.dot(H));

  // Dielectric F0 from surface reflectance; metals would use albedo.
  const f0 = 0.08 * specularIntensity;
  const fresnel = f0 + (1 - f0) * Math.pow(1 - clamp(VoH, 0, 1), 5);

  // --- Direct key light (Cook-Torrance) -------------------------------------
  const direct = new THREE.Color(0, 0, 0);

  if (NoL > 0) {
    const D = distributionGGX(NoH, rough);
    const G = geometrySmith(NoV, NoL, rough);
    const specBRDF = (D * G * fresnel) / Math.max(4 * NoV * NoL, 1e-4);
    const kd = (1 - fresnel) * (1 - metalness);

    const diffusePart = albedoCol.clone().multiplyScalar(kd / PI);
    const specPart = new THREE.Color(1, 1, 1).multiplyScalar(specBRDF);
    const brdf = diffusePart.add(specPart);

    direct.copy(brdf).multiply(
      env.keyLight.color.clone().multiplyScalar(env.keyLight.intensity * NoL)
    );
  }

  // --- Ambient: two-hemisphere (L1) model, identical to the sphere shader ---
  const hemi = Math.pow(clamp(normN.y * 0.5 + 0.5, 0, 1), SKY_HEMISPHERE_POWER);
  const skyE = env.skyLight.color.clone().multiplyScalar(env.skyLight.intensity);
  const groundE = env.groundLight.color.clone().multiplyScalar(env.groundLight.intensity);
  const ambientE = new THREE.Color().lerpColors(groundE, skyE, hemi);

  const kdAmbient = 1 - f0;
  const ambientDiffuse = albedoCol
    .clone()
    .multiplyScalar(kdAmbient)
    .multiply(ambientE)
    .multiplyScalar(1 / Math.PI);

  // Ambient specular probe along the reflection vector.
  const R = normV.clone().negate().reflect(normN);
  let envSpecColor = skyBands(R, env);
  if (R.y < 0) {
    envSpecColor = new THREE.Color().lerpColors(
      env.ambient.groundColor,
      envSpecColor,
      clamp(R.y + 1, 0, 1)
    );
  }
  envSpecColor = new THREE.Color().lerpColors(envSpecColor, env.skyLight.color, 0.55);

  const fEnv = f0 + (Math.max(1 - rough, f0) - f0) * Math.pow(clamp(1 - NoV, 0, 1), 5);
  const ambientSpecular = envSpecColor.multiplyScalar(fEnv * (1 - 0.5 * rough) * 0.35);

  // --- Total radiance & ACES filmic tone mapping ----------------------------
  const finalCol = new THREE.Color().addColors(direct, ambientDiffuse).add(ambientSpecular);

  if (atmosphere && atmosphere.amount > 0) {
    finalCol.lerp(atmosphere.color, clamp(atmosphere.amount, 0, 1));
  }

  const r = linearToSRGB(toneMap(finalCol.r));
  const g = linearToSRGB(toneMap(finalCol.g));
  const b = linearToSRGB(toneMap(finalCol.b));

  const rgb: RGBColor = {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };

  return { rgb, hex: rgbToHex(rgb) };
}

/** Matches the shaders' display encoding (linear → sRGB). */
function linearToSRGB(c: number): number {
  const v = clamp(c, 0, 1);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 0.41666667) - 0.055;
}

function toneMap(x: number): number {
  const c = Math.max(0, x);
  return c <= 0.8 ? c : 0.8 + 0.2 * (1 - Math.exp(-(c - 0.8) / 0.2));
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
  specularIntensityParam?: number,
  atmosphere?: AtmosphereSample
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

  // 2. Half-Tone Normal: normal at 45° from the light, tilted toward the viewer.
  //    (Using normalize(0.7V + 0.7L) would collapse onto the Highlight half-vector.)
  const nHalftone = (() => {
    const vPerp = V.clone().sub(L.clone().multiplyScalar(V.dot(L)));
    if (vPerp.lengthSq() < 1e-6) {
      // Degenerate case: view aligned with light. Pick any axis perpendicular to L.
      vPerp.crossVectors(L, new THREE.Vector3(0, 1, 0));
      if (vPerp.lengthSq() < 1e-6) vPerp.crossVectors(L, new THREE.Vector3(1, 0, 0));
    }
    vPerp.normalize();
    const cos45 = Math.SQRT1_2;
    return L.clone().multiplyScalar(cos45).add(vPerp.multiplyScalar(cos45)).normalize();
  })();

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
    const { rgb, hex } = evaluateLightingAnalytical(s.normal, L, V, albedoCol, env, roughness, specularIntensity, atmosphere);
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
