import * as THREE from 'three';
import { DEFAULT_ALBEDO_HEX } from '../../core/defaults';

export interface LumiformShaderUniforms {
  [key: string]: THREE.IUniform;
  uAlbedo: { value: THREE.Color };
  uMetalness: { value: number };
  uLightDir: { value: THREE.Vector3 };
  uKeyColor: { value: THREE.Color };
  uKeyIntensity: { value: number };
  uZenithColor: { value: THREE.Color };
  uEquatorColor: { value: THREE.Color };
  uHorizonColor: { value: THREE.Color };
  uGroundColor: { value: THREE.Color };
  uSkyColor: { value: THREE.Color };
  uSkyLightColor: { value: THREE.Color };
  uSkyLightIntensity: { value: number };
  uGroundLightColor: { value: THREE.Color };
  uGroundLightIntensity: { value: number };
  uSkyHemiPower: { value: number };
  uKeyAngularRadius: { value: number };
  uKeySoftNorm: { value: number };
  uEffectiveHaze: { value: number };
  uHorizonHaze: { value: THREE.Color };
  uHorizonBand: { value: number };
  uGroundHaze: { value: THREE.Color };
  uRoughness: { value: number };
  uSpecularIntensity: { value: number };
  uSphereCenter: { value: THREE.Vector3 };
}

const vertexShader = /* glsl */ `
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const fragmentShader = /* glsl */ `
  const float PI = 3.14159265359;
  // Mirrors core/atmosphere.ts. The near sphere's far surface ends at ~14.95,
  // so fog begins just beyond it and the colour-reference sphere stays clear.
  const float HAZE_DENSITY = 0.030;
  const float HAZE_START = 15.5;

  uniform vec3 uAlbedo;
  uniform float uMetalness;
  uniform vec3 uLightDir;
  uniform vec3 uKeyColor;
  uniform float uKeyIntensity;

  uniform vec3 uZenithColor;
  uniform vec3 uEquatorColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uGroundColor;
  uniform vec3 uSkyColor;
  uniform vec3 uSkyLightColor;
  uniform float uSkyLightIntensity;
  uniform vec3 uGroundLightColor;
  uniform float uGroundLightIntensity;
  uniform float uSkyHemiPower;
  uniform float uKeyAngularRadius;
  uniform float uKeySoftNorm;
  uniform float uEffectiveHaze;
  uniform vec3 uHorizonHaze;
  uniform float uHorizonBand;
  uniform vec3 uGroundHaze;

  uniform float uRoughness;
  uniform float uSpecularIntensity;
  uniform vec3 uSphereCenter;

  varying vec3 vWorldPosition;

  // --- PBR BRDF (metallic / roughness workflow) -----------------------------

  // Soft key: average the cosine over a small cone around L, so the terminator
  // spreads over roughly +/- the light's angular radius instead of ending at a
  // hard cosine zero. Mirrors core/lighting.ts (same weights, same order).
  float softKeyNoL(vec3 N, vec3 L, float radius, float norm) {
    if (radius <= 1e-4) return max(dot(N, L), 0.0);

    vec3 up = abs(L.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 T = normalize(cross(up, L));
    vec3 B = cross(L, T);
    float tanR = tan(radius);

    float sum = 0.28 * max(dot(N, L), 0.0);

    for (int i = 0; i < 4; i++) {
      float a = float(i) * 1.5707963;
      vec3 dir = normalize(L + T * cos(a) * tanR + B * sin(a) * tanR);
      sum += 0.12 * max(dot(N, dir), 0.0);
    }

    for (int i = 0; i < 4; i++) {
      float a = float(i) * 1.5707963 + 0.7853982;
      vec3 dir = normalize(L + T * cos(a) * tanR * 0.5 + B * sin(a) * tanR * 0.5);
      sum += 0.06 * max(dot(N, dir), 0.0);
    }

    return sum / norm;
  }

  float distributionGGX(float NoH, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float d = NoH * NoH * (a2 - 1.0) + 1.0;
    return a2 / max(PI * d * d, 1e-6);
  }

  // Smith geometry term with Schlick-GGX partial masking.
  float geometrySchlickGGX(float NoX, float roughness) {
    float r = roughness + 1.0;
    float k = (r * r) / 8.0;
    return NoX / (NoX * (1.0 - k) + k);
  }

  float geometrySmith(float NoV, float NoL, float roughness) {
    return geometrySchlickGGX(NoV, roughness) * geometrySchlickGGX(NoL, roughness);
  }

  // Schlick Fresnel approximation.
  vec3 fresnelSchlick(float cosTheta, vec3 F0) {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
  }

  // 3-zone sky radiance used both as diffuse irradiance and as a cheap IBL probe.
  vec3 skyBands(vec3 dir) {
    if (dir.y < 0.45) {
      float t = max(0.0, dir.y) / 0.45;
      return mix(uHorizonColor, uEquatorColor, smoothstep(0.0, 1.0, t));
    }
    float t = (dir.y - 0.45) / 0.55;
    return mix(uEquatorColor, uZenithColor, smoothstep(0.0, 1.0, t));
  }

  // Normal 3-zone sky gradient, before the horizontal haze band.
  vec3 skyBase(vec3 dir) {
    if (dir.y >= 0.0) {
      if (dir.y < 0.07) {
        float t = dir.y / 0.07;
        return mix(uHorizonColor, uEquatorColor, smoothstep(0.0, 1.0, t));
      }
      float t = (dir.y - 0.07) / 0.16;
      return mix(uEquatorColor, uZenithColor, smoothstep(0.0, 1.0, t));
    }
    return uHorizonColor;
  }

  // Radiance of the sky along a ray, including the horizontal haze band.
  //
  // A ray near the horizon traverses far more air than one looking up, so the
  // last few degrees are dominated by in-scattered light. This is also the
  // airlight a distant object fades into, so the two cannot disagree at the
  // horizon.
  vec3 skyRadiance(vec3 dir) {
    vec3 base = skyBase(dir);
    float y = max(dir.y, 0.0);
    float t = smoothstep(0.0, max(uHorizonBand, 1e-4), y);
    return mix(uHorizonHaze, base, t);
  }

  // Display encoding: the shader works in linear light, the canvas expects sRGB.
  // 1/255 triangular-ish dither: removes banding in the smooth sky/form gradients.
  float ditherNoise(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  vec3 linearToSRGB(vec3 c) {
    vec3 low = c * 12.92;
    vec3 high = 1.055 * pow(max(c, vec3(0.0)), vec3(0.41666667)) - 0.055;
    return mix(low, high, step(vec3(0.0031308), c));
  }

  // Neutral display transform: identity through the midtones, soft shoulder above 0.8.
  vec3 toneMap(vec3 c) {
    vec3 x = max(c, vec3(0.0));
    vec3 over = max(x - vec3(0.8), vec3(0.0));
    return min(x, vec3(0.8)) + 0.2 * (1.0 - exp(-over / 0.2));
  }

  void main() {
    // Sphere normals are radial, so the form is independent of mesh rotation.
    vec3 N = normalize(vWorldPosition - uSphereCenter);

    vec3 L = normalize(uLightDir);
    vec3 V = normalize(cameraPosition - vWorldPosition);
    vec3 H = normalize(L + V);

    float rough = clamp(uRoughness, 0.045, 1.0);
    // Geometric cosine for the specular lobe; the softened cosine for diffuse.
    float geoNoL = max(dot(N, L), 0.0);
    float NoL = softKeyNoL(N, L, uKeyAngularRadius, uKeySoftNorm);
    float NoV = max(dot(N, V), 1e-4);
    float NoH = max(dot(N, H), 0.0);
    float VoH = max(dot(V, H), 0.0);

    // Dielectric F0 is derived from the surface finish reflectance; metals use albedo.
    vec3 F0 = mix(vec3(0.08 * uSpecularIntensity), uAlbedo, uMetalness);
    vec3 F = fresnelSchlick(VoH, F0);
    vec3 kdDirect = (1.0 - F) * (1.0 - uMetalness);

    // --- Direct key light -----------------------------------------------------
    // Diffuse uses the area-light cosine so the terminator is soft; the specular
    // lobe stays a GGX response around the key direction.
    vec3 directDiffuse = kdDirect * uAlbedo / PI * uKeyColor * uKeyIntensity * NoL;

    vec3 specular = vec3(0.0);
    if (geoNoL > 0.0) {
      float D = distributionGGX(NoH, rough);
      float G = geometrySmith(NoV, geoNoL, rough);
      vec3 specBRDF = (D * G * F) / max(4.0 * NoV * geoNoL, 1e-4);
      specular = specBRDF * uKeyColor * uKeyIntensity * geoNoL;
    }

    // --- Ambient: two-hemisphere (L1 spherical harmonics) model.
    //     E(N) = skyE * (0.5 + 0.5 N.y) + groundE * (0.5 - 0.5 N.y)
    //     This is the exact form fitted to the reference sphere, so no
    //     per-preset hand tuning lives in this shader.
    float hemi = pow(clamp(N.y * 0.5 + 0.5, 0.0, 1.0), uSkyHemiPower);
    vec3 skyE = uSkyLightColor * uSkyLightIntensity;
    vec3 groundE = uGroundLightColor * uGroundLightIntensity;
    vec3 ambientE = mix(groundE, skyE, hemi);

    vec3 kdAmbient = (1.0 - F0) * (1.0 - uMetalness);
    vec3 ambientDiffuse = kdAmbient * uAlbedo * ambientE / PI;

    // Ambient specular: band-limited probe of the visible dome, lifted toward
    // the sky-light colour (the satin sheen the reference shows at the top).
    vec3 R = reflect(-V, N);
    vec3 envSpecColor = skyBands(R);
    if (R.y < 0.0) {
      envSpecColor = mix(uGroundColor, envSpecColor, clamp(R.y + 1.0, 0.0, 1.0));
    }
    envSpecColor = mix(envSpecColor, uSkyLightColor, 0.55);
    vec3 Fenv = F0 + (max(vec3(1.0 - rough), F0) - F0) * pow(clamp(1.0 - NoV, 0.0, 1.0), 5.0);
    vec3 ambientSpecular = envSpecColor * Fenv * (1.0 - 0.5 * rough) * 0.35;

    // Total radiance.
    vec3 finalColor = directDiffuse + specular + ambientDiffuse + ambientSpecular;

    // --- Aerial perspective -------------------------------------------------
    // Single-scattering depth fog: what survives the path to the eye is the
    // object attenuated by extinction, plus the background radiance scattered
    // into the same path. The airlight is not one global tint: above the
    // horizon it is the sky along the view ray (including its haze band),
    // below it the phase's ground haze. That is what lets a distant sphere
    // dissolve into the scene without ever becoming paler than the background
    // behind it.
    vec3 viewDir = normalize(vWorldPosition - cameraPosition);
    float viewDistance = length(vWorldPosition - cameraPosition);

    // Rayleigh removes short wavelengths first; aerosol haze is neutral. The
    // mild spectral term gives clear air its blue-through-pale progression
    // without tinting the already hazy phases.
    float neutrality = smoothstep(0.10, 0.80, uEffectiveHaze);
    vec3 spectral = mix(vec3(0.94, 1.00, 1.06), vec3(1.0), neutrality);
    vec3 opticalDepth = uEffectiveHaze * HAZE_DENSITY * spectral
      * max(0.0, viewDistance - HAZE_START);
    vec3 transmittance = exp(-opticalDepth);

    // The airlight crosses from the ground haze to the sky over a smooth
    // angular window. A narrow split at the eye line would draw a hard
    // horizontal seam across a hazy sphere; this keeps the transition gradual
    // while still letting the lower half lean toward the ground behind it.
    float horizonBlendWidth = clamp(uHorizonBand * 0.4, 0.02, 0.06);
    float horizonBlend = smoothstep(
      -horizonBlendWidth,
      horizonBlendWidth,
      viewDir.y
    );
    vec3 airlight = mix(uGroundHaze, skyRadiance(viewDir), horizonBlend);
    finalColor = finalColor * transmittance + airlight * (1.0 - transmittance);

    // Tone map + display encoding.
    vec3 outColor = linearToSRGB(toneMap(finalColor));
    outColor += (ditherNoise(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(outColor, 1.0);
  }
`;

export function createLumiformMaterial(initialAlbedo: THREE.Color | string | number = DEFAULT_ALBEDO_HEX): THREE.ShaderMaterial {
  const albedo = initialAlbedo instanceof THREE.Color ? initialAlbedo : new THREE.Color(initialAlbedo);

  const uniforms: LumiformShaderUniforms = {
    uAlbedo: { value: albedo },
    uMetalness: { value: 0.0 },
    uLightDir: { value: new THREE.Vector3(1, 1, 1).normalize() },
    uKeyColor: { value: new THREE.Color('#FFEFE8') },
    uKeyIntensity: { value: 3.506 },
    uZenithColor: { value: new THREE.Color('#0055B0') },
    uEquatorColor: { value: new THREE.Color('#2F8CD1') },
    uHorizonColor: { value: new THREE.Color('#90BAC6') },
    uGroundColor: { value: new THREE.Color('#478503') },
    uSkyColor: { value: new THREE.Color('#2F8CD1') },
    uSkyLightColor: { value: new THREE.Color('#00DCFF') },
    uSkyLightIntensity: { value: 0.422 },
    uGroundLightColor: { value: new THREE.Color('#85FF00') },
    uGroundLightIntensity: { value: 0.178 },
    uSkyHemiPower: { value: 1.3 },
    uKeyAngularRadius: { value: (14 * Math.PI) / 180 },
    uKeySoftNorm: { value: 1.0 },
    uEffectiveHaze: { value: 0.5 },
    uHorizonHaze: { value: new THREE.Color('#8EBAC3') },
    uHorizonBand: { value: 0.03 },
    uGroundHaze: { value: new THREE.Color('#6F9A50') },
    uRoughness: { value: 0.45 },
    uSpecularIntensity: { value: 0.4 },
    uSphereCenter: { value: new THREE.Vector3(0, 0, 0) },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
  });
}
