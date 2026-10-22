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
  uMeshType: { value: number };
  uCubeInvMatrix: { value: THREE.Matrix4 };
  uCubeHalfSize: { value: THREE.Vector3 };
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

  uniform float uMeshType; // 0.0 = Sphere, 1.0 = Cube
  uniform mat4 uCubeInvMatrix;
  uniform vec3 uCubeHalfSize;

  varying vec3 vWorldPosition;

  // Calculates soft drop shadow for a 3D box centered at origin in local space
  float calcCubeSoftShadow(vec3 ro, vec3 rd, vec3 halfSize) {
    // 1. Exact Branchless Kay-Kajiya Ray-AABB intersection test for direct umbra
    vec3 m = 1.0 / (rd + vec3(equal(rd, vec3(0.0))) * 1e-6);
    vec3 n = m * ro;
    vec3 k = abs(m) * halfSize;
    vec3 t1 = -n - k;
    vec3 t2 = -n + k;
    float tNear = max(max(t1.x, t1.y), t1.z);
    float tFar  = min(min(t2.x, t2.y), t2.z);

    if (tNear <= tFar && tFar > 0.0) {
      return 0.0; // Ray directly intersects the 3D cube body (full umbra)
    }

    // 2. Inigo Quilez SDF soft penumbra for rays that graze past the box
    float res = 1.0;
    float t = 0.04;
    for (int i = 0; i < 20; i++) {
      vec3 p = ro + rd * t;
      vec3 q = abs(p) - halfSize;
      float h = length(max(q, 0.0));
      res = min(res, 14.0 * h / t);
      t += max(0.04, h * 0.7);
      if (t > 6.0) break;
    }
    return clamp(res, 0.0, 1.0);
  }

  void main() {
    vec3 P = vWorldPosition;
    vec3 L = normalize(uLightDir);

    float shadowFactor = 1.0;
    float contactAO = 1.0;
    float distToMeshSurface = 0.0;

    if (uMeshType < 0.5) {
      // --- 1A. SPHERE DROP SHADOW & CONTACT AO ---
      if (L.y > 0.005) {
        vec3 W = uSphereCenter - P;
        float tProj = dot(W, L);
        if (tProj > 0.0) {
          float dSq = dot(W, W) - tProj * tProj;
          float d = sqrt(max(0.0, dSq));
          float penumbra = 0.035 + 0.08 * clamp(tProj / uSphereRadius - 1.0, 0.0, 4.0);
          float occlusion = 1.0 - smoothstep(uSphereRadius - penumbra, uSphereRadius + penumbra, d);
          shadowFactor = 1.0 - occlusion;
        }
      }

      // Circular contact AO & distance
      float rTouch = length(P.xz - uSphereCenter.xz);
      contactAO = clamp(rTouch / 0.55, 0.22, 1.0);
      distToMeshSurface = length(P - uSphereCenter) - uSphereRadius;
    } else {
      // --- 1B. CUBE DROP SHADOW & CONTACT AO (Exact Ray-Box Slab + IQ SDF Penumbra) ---
      vec3 P_local = (uCubeInvMatrix * vec4(P, 1.0)).xyz;
      vec3 L_local = normalize((uCubeInvMatrix * vec4(L, 0.0)).xyz);

      if (L.y > 0.005) {
        shadowFactor = calcCubeSoftShadow(P_local, L_local, uCubeHalfSize);
      }

      // Contact AO: 3D Euclidean distance from ground point to the oriented cube
      vec3 qContact = max(abs(P_local) - uCubeHalfSize, vec3(0.0));
      distToMeshSurface = length(qContact);
      contactAO = clamp(distToMeshSurface / 0.45, 0.22, 1.0);
    }

    // 2. Ground Ambient GI from 3-Tone Sky Dome
    vec3 skyGI = (
      uHorizonColor * 0.35 +
      uEquatorColor * 0.45 +
      uZenithColor  * 0.20
    ) * uAmbientIntensity;

    // 3. Mesh Material Color Bleeding / Reflected Downward Bounce into shadow
    float bounceSpread = max(0.0, 1.0 - distToMeshSurface / 1.75);
    vec3 colorBleed = uSphereAlbedo * (
      0.30 * bounceSpread * uKeyIntensity * max(0.1, L.y) +
      0.15 * bounceSpread * uAmbientIntensity
    );

    // 4. Direct Sunlight (Occluded by sphere/cube shadow)
    float sunLambert = max(0.0, L.y);
    vec3 directSun = uKeyColor * (sunLambert * uKeyIntensity * shadowFactor);

    // 5. Total Ground Illumination (Direct sunlight + Sky GI + Contact AO + Color Bleed)
    vec3 totalLight = directSun + (skyGI * contactAO) + colorBleed;
    vec3 groundCol = uGroundAlbedo * totalLight;

    // 6. Circular boundary edge fade (blends seamlessly into horizon background)
    float distFromCenter = length(P.xz - uSphereCenter.xz);
    float alpha = 1.0 - smoothstep(5.2, 7.8, distFromCenter);

    // 7. ACES Filmic Tone Mapping
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
    uMeshType: { value: 0.0 }, // 0.0 = Sphere, 1.0 = Cube
    uCubeInvMatrix: { value: new THREE.Matrix4() },
    uCubeHalfSize: { value: new THREE.Vector3(1.25, 1.25, 1.25) },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: true,
  });
}
