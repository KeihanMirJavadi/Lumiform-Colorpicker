import * as THREE from 'three';

export interface SkyShaderUniforms {
  [key: string]: THREE.IUniform;
  uZenithColor: { value: THREE.Color };
  uEquatorColor: { value: THREE.Color };
  uHorizonColor: { value: THREE.Color };
  uGroundColor: { value: THREE.Color };
  uLightDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uSunIntensity: { value: number };
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
  uniform vec3 uZenithColor;
  uniform vec3 uEquatorColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uGroundColor;
  uniform vec3 uLightDir;
  uniform vec3 uSunColor;
  uniform float uSunIntensity;

  varying vec3 vWorldPosition;

  void main() {
    vec3 dir = normalize(vWorldPosition);

    // 1. 3-Tone Dynamic Sky Gradient (Zenith, Equator, Horizon)
    vec3 sky;
    if (dir.y >= 0.0) {
      if (dir.y < 0.38) {
        float t = dir.y / 0.38;
        sky = mix(uHorizonColor, uEquatorColor, smoothstep(0.0, 1.0, t));
      } else {
        float t = (dir.y - 0.38) / 0.62;
        sky = mix(uEquatorColor, uZenithColor, smoothstep(0.0, 1.0, t));
      }
    } else {
      float t = clamp(-dir.y / 0.3, 0.0, 1.0);
      sky = mix(uHorizonColor, uGroundColor * 0.45, t);
    }

    // 2. Atmospheric Sun Halo & Bloom
    vec3 L = normalize(uLightDir);
    float sunDot = max(0.0, dot(dir, L));
    if (sunDot > 0.0) {
      float halo = pow(sunDot, 10.0) * 0.35 + pow(sunDot, 48.0) * 0.85;
      float sunVisibility = clamp(L.y * 1.5 + 0.3, 0.0, 1.0);
      sky += uSunColor * (halo * sunVisibility * (uSunIntensity * 0.4));
    }

    // 3. ACES Filmic Tone Mapping
    vec3 a = sky * (sky + 0.0245786) - 0.000090537;
    vec3 b = sky * (0.983729 * sky + 0.4329510) + 0.238081;
    vec3 mapped = clamp(a / b, 0.0, 1.0);

    gl_FragColor = vec4(mapped, 1.0);
  }
`;

export function createSkyDomeMaterial(): THREE.ShaderMaterial {
  const uniforms: SkyShaderUniforms = {
    uZenithColor: { value: new THREE.Color('#1E40AF') },
    uEquatorColor: { value: new THREE.Color('#60A5FA') },
    uHorizonColor: { value: new THREE.Color('#E0F2FE') },
    uGroundColor: { value: new THREE.Color('#5A4638') },
    uLightDir: { value: new THREE.Vector3(1, 1, 1).normalize() },
    uSunColor: { value: new THREE.Color('#FFF5E6') },
    uSunIntensity: { value: 2.2 },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
  });
}
