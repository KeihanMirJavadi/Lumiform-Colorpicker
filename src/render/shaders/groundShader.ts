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

    // 1. Physically-based Analytic Sphere Cast Drop Shadow
    float shadowOcclusion = 0.0;
    if (L.y > 0.001) {
      vec3 V = uSphereCenter - P;
      float tProj = dot(V, L);
      if (tProj > 0.0) {
        float dSq = dot(V, V) - tProj * tProj;
        float d = sqrt(max(0.0, dSq));
        // Soft penumbra stretches naturally with distance from sphere contact
        float penumbra = 0.08 + 0.15 * max(0.0, tProj - uSphereRadius);
        shadowOcclusion = 1.0 - smoothstep(uSphereRadius - penumbra, uSphereRadius + penumbra, d);
      }
    }

    // 2. Contact Ambient Occlusion (tight radius directly under the touch point)
    float rTouch = length(P.xz - uSphereCenter.xz);
    float contactAO = clamp(rTouch / 0.65, 0.42, 1.0);

    // 3. Global Illumination (GI): Mesh Material Color Bleeding / Reflected Downward Bounce
    float dSphere = length(P - uSphereCenter) - uSphereRadius;
    float bounceSpread = max(0.0, 1.0 - dSphere / 2.2);
    vec3 indirectBounceGI = uSphereAlbedo * (
      0.45 * bounceSpread * uKeyIntensity * max(0.15, L.y) +
      0.25 * bounceSpread * uAmbientIntensity
    );

    // 4. Global Illumination (GI): Hemispherical Sky Fill illuminating the ground
    vec3 skyGI = (
      uHorizonColor * 0.35 +
      uEquatorColor * 0.45 +
      uZenithColor  * 0.20
    ) * uAmbientIntensity;

    // 5. Direct Sunlight on Ground
    vec3 directSun = uKeyColor * (max(0.0, L.y) * uKeyIntensity * (1.0 - shadowOcclusion));

    // 6. Total Ground Radiance (Direct + Ambient Sky GI + Indirect Material Bounce GI)
    vec3 totalLight = directSun + (skyGI * contactAO) + indirectBounceGI;
    vec3 groundCol = uGroundAlbedo * totalLight;

    // 7. Circular Boundary Edge Fade (blends seamlessly into horizon background)
    float distFromCenter = length(P.xz - uSphereCenter.xz);
    float alpha = 1.0 - smoothstep(5.0, 7.5, distFromCenter);

    // 8. ACES Filmic Tone Mapping with GI Shadow Luminance Preservation
    vec3 x = groundCol * 1.35;
    vec3 a = x * (x + 0.0245786) - 0.000090537;
    vec3 b = x * (0.983729 * x + 0.4329510) + 0.238081;
    vec3 mapped = clamp(a / b, 0.0, 1.0);

    // Ensure shadow retains clear, luminous Global Illumination from sky and bounce
    vec3 giFloor = (skyGI * contactAO + indirectBounceGI * 0.6) * uGroundAlbedo * 0.55;
    mapped = max(mapped, giFloor);

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
    uGroundColor: { value: new THREE.Color('#4B3C2F') },
    uAmbientIntensity: { value: 0.9 },
    uSphereAlbedo: { value: new THREE.Color('#EB5757') },
    uGroundAlbedo: { value: new THREE.Color('#78726B') }, // Neutral warm gray studio ground
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
