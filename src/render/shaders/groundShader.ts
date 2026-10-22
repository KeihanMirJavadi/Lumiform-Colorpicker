import * as THREE from 'three';

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
  uSphereAlbedo: { value: THREE.Color };
  uGroundAlbedo: { value: THREE.Color };
  uSphereCenter: { value: THREE.Vector3 };
  uSphereRadius: { value: number };
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

  uniform vec3 uSphereAlbedo;
  uniform vec3 uGroundAlbedo;
  uniform vec3 uSphereCenter;
  uniform float uSphereRadius;

  varying vec3 vWorldPosition;

  void main() {
    vec3 P = vWorldPosition;
    vec3 L = normalize(uLightDir);

    // 1. Physically-accurate Sphere Cast Drop Shadow on Ground Plane
    float shadowFactor = 1.0;
    if (L.y > 0.005) {
      vec3 W = uSphereCenter - P;
      float tProj = dot(W, L);
      if (tProj > 0.0) {
        float dSq = dot(W, W) - tProj * tProj;
        float d = sqrt(max(0.0, dSq));
        // Crisp contact shadow near sphere base, softly widening with cast distance
        float penumbra = 0.035 + 0.08 * clamp(tProj / uSphereRadius - 1.0, 0.0, 4.0);
        float occlusion = 1.0 - smoothstep(uSphereRadius - penumbra, uSphereRadius + penumbra, d);
        shadowFactor = 1.0 - occlusion;
      }
    }

    // 2. Contact Ambient Occlusion (grounds the sphere with a dark crevice at contact)
    float rTouch = length(P.xz - uSphereCenter.xz);
    float contactAO = clamp(rTouch / 0.55, 0.22, 1.0);

    // 3. Ground Ambient GI from 3-Tone Sky Dome
    vec3 skyGI = (
      uHorizonColor * 0.35 +
      uEquatorColor * 0.45 +
      uZenithColor  * 0.20
    ) * uAmbientIntensity;

    // 4. Mesh Material Color Bleeding / Reflected Downward Bounce into shadow
    float dSphere = length(P - uSphereCenter) - uSphereRadius;
    float bounceSpread = max(0.0, 1.0 - dSphere / 1.75);
    vec3 colorBleed = uSphereAlbedo * (
      0.30 * bounceSpread * uKeyIntensity * max(0.1, L.y) +
      0.15 * bounceSpread * uAmbientIntensity
    );

    // 5. Direct Sunlight (Occluded by sphere shadow)
    float sunLambert = max(0.0, L.y);
    vec3 directSun = uKeyColor * (sunLambert * uKeyIntensity * shadowFactor);

    // 6. Total Ground Illumination (Direct sunlight + Sky GI + Contact AO + Color Bleed)
    vec3 totalLight = directSun + (skyGI * contactAO) + colorBleed;
    vec3 groundCol = uGroundAlbedo * totalLight;

    // 7. Circular boundary edge fade (blends seamlessly into horizon background)
    float distFromCenter = length(P.xz - uSphereCenter.xz);
    float alpha = 1.0 - smoothstep(5.2, 7.8, distFromCenter);

    // 8. ACES Filmic Tone Mapping
    vec3 a = groundCol * (groundCol + 0.0245786) - 0.000090537;
    vec3 b = groundCol * (0.983729 * groundCol + 0.4329510) + 0.238081;
    vec3 mapped = clamp(a / b, 0.0, 1.0);

    gl_FragColor = vec4(mapped, alpha);
  }
`;

export function createGroundMaterial(): THREE.ShaderMaterial {
  const uniforms: GroundShaderUniforms = {
    uLightDir: { value: new THREE.Vector3(1, 1, 1).normalize() },
    uKeyColor: { value: new THREE.Color('#FFFBEB') },
    uKeyIntensity: { value: 2.2 },
    uZenithColor: { value: new THREE.Color('#3B82F6') },
    uEquatorColor: { value: new THREE.Color('#93C5FD') },
    uHorizonColor: { value: new THREE.Color('#E0F2FE') },
    uGroundColor: { value: new THREE.Color('#4A853D') },
    uAmbientIntensity: { value: 0.9 },
    uSphereAlbedo: { value: new THREE.Color('#EB5757') },
    uGroundAlbedo: { value: new THREE.Color('#4A853D') }, // Default: Lush Grass Green
    uSphereCenter: { value: new THREE.Vector3(0, 0, 0) },
    uSphereRadius: { value: 1.25 },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: true,
  });
}
