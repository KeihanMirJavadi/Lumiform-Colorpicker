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
  uAmbientIntensity: { value: number };
  uRoughness: { value: number };
  uSpecularIntensity: { value: number };
  uSphereCenter: { value: THREE.Vector3 };
  uHaze: { value: number };
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
  uniform float uAmbientIntensity;

  uniform float uRoughness;
  uniform float uSpecularIntensity;
  uniform vec3 uSphereCenter;
  uniform float uHaze;

  varying vec3 vWorldPosition;

  // --- PBR BRDF (metallic / roughness workflow) -----------------------------

  // Trowbridge-Reitz (GGX) normal distribution.
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

  // Sky gradient used for atmospheric in-scattering (matches the sky dome).
  vec3 atmosphereColor(vec3 dir) {
    if (dir.y >= 0.0) {
      if (dir.y < 0.10) {
        float t = dir.y / 0.10;
        return mix(uHorizonColor, uEquatorColor, smoothstep(0.0, 1.0, t));
      }
      float t = (dir.y - 0.10) / 0.28;
      return mix(uEquatorColor, uZenithColor, smoothstep(0.0, 1.0, t));
    }
    return uHorizonColor;
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
    float NoL = max(dot(N, L), 0.0);
    float NoV = max(dot(N, V), 1e-4);
    float NoH = max(dot(N, H), 0.0);
    float VoH = max(dot(V, H), 0.0);

    // Dielectric F0 is derived from the surface finish reflectance; metals use albedo.
    vec3 F0 = mix(vec3(0.08 * uSpecularIntensity), uAlbedo, uMetalness);
    vec3 F = fresnelSchlick(VoH, F0);

    // --- Direct key light: Cook-Torrance specular + energy-conserving diffuse.
    vec3 specular = vec3(0.0);
    if (NoL > 0.0) {
      float D = distributionGGX(NoH, rough);
      float G = geometrySmith(NoV, NoL, rough);
      vec3 kdDirect = (1.0 - F) * (1.0 - uMetalness);
      vec3 specBRDF = (D * G * F) / max(4.0 * NoV * NoL, 1e-4);
      specular = (kdDirect * uAlbedo / PI + specBRDF) * uKeyColor * uKeyIntensity * NoL;
    }

    // --- Ambient: hemispherical sky irradiance + ground bounce + contact fill.
    float upWeight = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 groundBounceGI = uGroundColor * (
      0.55 * max(0.0, L.y) * uKeyIntensity
    );

    float groundLuma = dot(groundBounceGI, vec3(0.2126, 0.7152, 0.0722));
    groundBounceGI = mix(groundBounceGI, vec3(groundLuma), 0.65);

    vec3 skyIrradiance = skyBands(N);

    // Most of the sky's chroma is removed before it is used as fill light;
    // single-bounce sky light is far less saturated than the sky dome itself.
    float skyLuma = dot(skyIrradiance, vec3(0.2126, 0.7152, 0.0722));
    vec3 skyFill = mix(skyIrradiance, vec3(skyLuma), 0.45);

    // Vertical sky-fill weighting: side-facing normals see less of the bright
    // horizon band than up-facing ones, which restores form on the shadow side.
    skyFill *= mix(0.70, 1.0, clamp(N.y, 0.0, 1.0));

    vec3 irradiance = mix(groundBounceGI, skyFill, smoothstep(0.0, 1.0, upWeight)) * uAmbientIntensity;
    irradiance += mix(skyFill, groundBounceGI, 0.5) * (uAmbientIntensity * 0.10);

    vec3 kdAmbient = (1.0 - F0) * (1.0 - uMetalness);
    vec3 ambientDiffuse = kdAmbient * uAlbedo * irradiance;

    // Ambient specular: probe the sky along the reflection vector (roughness-weighted).
    vec3 R = reflect(-V, N);
    vec3 envSpecColor = skyBands(R);
    if (R.y < 0.0) {
      envSpecColor = mix(uGroundColor, envSpecColor, clamp(R.y + 1.0, 0.0, 1.0));
    }
    vec3 Fenv = F0 + (max(vec3(1.0 - rough), F0) - F0) * pow(clamp(1.0 - NoV, 0.0, 1.0), 5.0);
    vec3 ambientSpecular = envSpecColor * Fenv * (1.0 - 0.6 * rough) * 0.45 * uAmbientIntensity;

    // Total radiance.
    vec3 finalColor = specular + ambientDiffuse + ambientSpecular;

    // Aerial perspective: extinction + in-scattering tinted by the sky.
    vec3 viewDir = normalize(vWorldPosition - cameraPosition);
    float viewDistance = length(vWorldPosition - cameraPosition);
    float hazeAmount = 1.0 - exp(-uHaze * 0.04 * max(0.0, viewDistance - 5.0));
    finalColor = mix(finalColor, atmosphereColor(viewDir), clamp(hazeAmount, 0.0, 0.85));

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
    uKeyColor: { value: new THREE.Color('#FFE9C9') },
    uKeyIntensity: { value: 2.7 },
    uZenithColor: { value: new THREE.Color('#3B82F6') },
    uEquatorColor: { value: new THREE.Color('#93C5FD') },
    uHorizonColor: { value: new THREE.Color('#E0F2FE') },
    uGroundColor: { value: new THREE.Color('#4A853D') },
    uSkyColor: { value: new THREE.Color('#93C5FD') },
    uAmbientIntensity: { value: 1.2 },
    uRoughness: { value: 1.0 },
    uSpecularIntensity: { value: 0.0 },
    uSphereCenter: { value: new THREE.Vector3(0, 0, 0) },
    uHaze: { value: 0.5 },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
  });
}
