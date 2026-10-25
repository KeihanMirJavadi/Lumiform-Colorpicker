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

  void main() {
    vec3 dir = normalize(vWorldPosition);

    // 1. 3-Tone Dynamic Sky Gradient (Zenith, Equator, Horizon)
    vec3 sky;
    if (dir.y >= 0.0) {
      if (dir.y < 0.10) {
        float t = dir.y / 0.10;
        sky = mix(uHorizonColor, uEquatorColor, smoothstep(0.0, 1.0, t));
      } else {
        float t = (dir.y - 0.10) / 0.28;
        sky = mix(uEquatorColor, uZenithColor, smoothstep(0.0, 1.0, t));
      }
    } else {
      float t = clamp(-dir.y / 0.3, 0.0, 1.0);
      sky = mix(uHorizonColor, uGroundColor * 0.45, t);
    }

    // 2. Clean sky: no sun disc or halo is drawn in the preview canvas.

    // 3. ACES Filmic Tone Mapping
    vec3 outColor = linearToSRGB(toneMap(sky));
    outColor += (ditherNoise(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(outColor, 1.0);
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
