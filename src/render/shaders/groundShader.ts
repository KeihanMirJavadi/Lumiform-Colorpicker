import * as THREE from 'three';
import { DEFAULT_ALBEDO_HEX, DEFAULT_GROUND_HEX } from '../../core/defaults';

export interface GroundShaderUniforms {
  [key: string]: THREE.IUniform;
  uLightDir: { value: THREE.Vector3 };
  uKeyColor: { value: THREE.Color };
  uKeyIntensity: { value: number };
  uZenithColor: { value: THREE.Color };
  uEquatorColor: { value: THREE.Color };
  uHorizonColor: { value: THREE.Color };
  uGroundColor: { value: THREE.Color };
  uAmbientIntensity: { value: number };
  uGroundAlbedo: { value: THREE.Color };
  uSphereCenters: { value: THREE.Vector3[] };
  uSphereRadii: { value: number[] };
  uSphereAlbedos: { value: THREE.Color[] };
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
  uniform vec3 uLightDir;
  uniform vec3 uKeyColor;
  uniform float uKeyIntensity;

  uniform vec3 uZenithColor;
  uniform vec3 uEquatorColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uGroundColor;
  uniform float uAmbientIntensity;

  uniform vec3 uGroundAlbedo;
  uniform vec3 uSphereCenters[3];
  uniform float uSphereRadii[3];
  uniform vec3 uSphereAlbedos[3];
  uniform float uHaze;

  varying vec3 vWorldPosition;

  // 1/255 triangular-ish dither: removes banding in the smooth sky/form gradients.
  float ditherNoise(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  vec3 linearToSRGB(vec3 c) {
    vec3 low = c * 12.92;
    vec3 high = 1.055 * pow(max(c, vec3(0.0)), vec3(0.41666667)) - 0.055;
    return mix(low, high, step(vec3(0.0031308), c));
  }

  vec3 toneMap(vec3 c) {
    vec3 x = max(c, vec3(0.0));
    vec3 over = max(x - vec3(0.8), vec3(0.0));
    return min(x, vec3(0.8)) + 0.2 * (1.0 - exp(-over / 0.2));
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

  void main() {
    vec3 P = vWorldPosition;
    vec3 L = normalize(uLightDir);

    float shadowFactor = 1.0;
    float contactAO = 1.0;
    vec3 colorBleed = vec3(0.0);

    // Accumulate drop shadow, contact AO, and color bleed from all visible spheres.
    for (int i = 0; i < 3; i++) {
      float r = uSphereRadii[i];
      if (r < 0.001) continue;

      vec3 center = uSphereCenters[i];

      if (L.y > 0.005) {
        vec3 W = center - P;
        float tProj = dot(W, L);
        if (tProj > 0.0) {
          float dSq = dot(W, W) - tProj * tProj;
          float d = sqrt(max(0.0, dSq));
          float penumbra = 0.18 + 0.10 * clamp(tProj / r - 1.0, 0.0, 4.0);
          float occlusion = 1.0 - smoothstep(r - penumbra, r + penumbra, d);
          shadowFactor = min(shadowFactor, 1.0 - occlusion);
        }
      }

      float rTouch = length(P.xz - center.xz);
      contactAO = min(contactAO, clamp(rTouch / (0.50 * r), 0.30, 1.0));

      float distSurf = max(0.0, length(P - center) - r);
      float localScale = max(r / 1.25, 0.2);
      float bounceSpread = max(0.0, 1.0 - distSurf / (1.75 * localScale));
      colorBleed += uSphereAlbedos[i] * (0.15 * bounceSpread * uKeyIntensity * max(0.0, L.y));
    }

    // Ground ambient GI from the 3-tone sky dome (ground sees less sky than the sphere)
    vec3 skyGI = (
      uHorizonColor * 0.35 +
      uEquatorColor * 0.45 +
      uZenithColor  * 0.20
    ) * uAmbientIntensity * 0.5;

    // Direct sunlight (occluded by every sphere shadow)
    float sunLambert = max(0.0, L.y);
    vec3 directSun = uKeyColor * (sunLambert * uKeyIntensity * shadowFactor) / 3.14159265;

    // Total ground illumination
    vec3 totalLight = directSun + (skyGI * contactAO) + colorBleed;
    vec3 groundCol = uGroundAlbedo * totalLight * 0.90;

    // Aerial perspective
    vec3 viewDir = normalize(P - cameraPosition);
    float viewDistance = length(P - cameraPosition);
    float hazeAmount = 1.0 - exp(-uHaze * 0.04 * max(0.0, viewDistance - 5.0));
    groundCol = mix(groundCol, atmosphereColor(viewDir), clamp(hazeAmount, 0.0, 0.85));

    // Distant boundary fade (blends seamlessly into the horizon sky)
    float distFromCenter = length(P.xz);
    float alpha = 1.0 - smoothstep(120.0, 190.0, distFromCenter);

    // Tone map + display encoding
    vec3 outColor = linearToSRGB(toneMap(groundCol));
    outColor += (ditherNoise(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(outColor, alpha);
  }
`;

export function createGroundMaterial(): THREE.ShaderMaterial {
  const uniforms: GroundShaderUniforms = {
    uLightDir: { value: new THREE.Vector3(1, 1, 1).normalize() },
    uKeyColor: { value: new THREE.Color('#FFE9C9') },
    uKeyIntensity: { value: 2.7 },
    uZenithColor: { value: new THREE.Color('#1B4A96') },
    uEquatorColor: { value: new THREE.Color('#5C9BD1') },
    uHorizonColor: { value: new THREE.Color('#D8ECF3') },
    uGroundColor: { value: new THREE.Color(DEFAULT_GROUND_HEX) },
    uAmbientIntensity: { value: 1.2 },
    uGroundAlbedo: { value: new THREE.Color(DEFAULT_GROUND_HEX) },
    uSphereCenters: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    uSphereRadii: { value: [0, 0, 0] },
    uSphereAlbedos: {
      value: [
        new THREE.Color(DEFAULT_ALBEDO_HEX),
        new THREE.Color(DEFAULT_ALBEDO_HEX),
        new THREE.Color(DEFAULT_ALBEDO_HEX),
      ],
    },
    uHaze: { value: 0.5 },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: true,
  });
}
