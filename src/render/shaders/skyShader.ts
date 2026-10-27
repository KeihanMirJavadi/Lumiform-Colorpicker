import * as THREE from 'three';

export interface SkyShaderUniforms {
  [key: string]: THREE.IUniform;
  uZenithColor: { value: THREE.Color };
  uEquatorColor: { value: THREE.Color };
  uHorizonColor: { value: THREE.Color };
  uGroundColor: { value: THREE.Color };
  uHorizonHaze: { value: THREE.Color };
  uHorizonBand: { value: number };
  uGroundHaze: { value: THREE.Color };
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
  uniform vec3 uHorizonHaze;
  uniform float uHorizonBand;
  uniform vec3 uGroundHaze;
  uniform vec3 uLightDir;
  uniform vec3 uSunColor;
  uniform float uSunIntensity;

  varying vec3 vWorldPosition;

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

  // Radiance of the sky along a ray. A horizontal sight line crosses far more
  // air than one looking up, so in-scattering is strongest at the horizon and
  // falls off smoothly with elevation. Distant geometry uses this same
  // function as its airlight, so an object can never fade past its background.
  vec3 skyRadiance(vec3 dir) {
    vec3 base = skyBase(dir);
    float y = max(dir.y, 0.0);
    float t = smoothstep(0.0, max(uHorizonBand, 1e-4), y);
    return mix(uHorizonHaze, base, t);
  }

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
    // Direction from the eye, not from the dome centre: the camera sits inside
    // the dome and the horizon must stay exactly on the eye line.
    vec3 dir = normalize(vWorldPosition - cameraPosition);

    // 3-stop gradient plus the horizontal haze band. Below the eye line the
    // dome takes the ground's aerial colour, so the finite ground plane can
    // fade into it at the horizon without a seam.
    vec3 sky = skyRadiance(dir);
    if (dir.y < 0.0) {
      float t = smoothstep(0.0, 0.03, -dir.y);
      sky = mix(uHorizonHaze, uGroundHaze, t);
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
    uZenithColor: { value: new THREE.Color('#0055B0') },
    uEquatorColor: { value: new THREE.Color('#2F8CD1') },
    uHorizonColor: { value: new THREE.Color('#90BAC6') },
    uGroundColor: { value: new THREE.Color('#478503') },
    uHorizonHaze: { value: new THREE.Color('#8EBAC3') },
    uHorizonBand: { value: 0.03 },
    uGroundHaze: { value: new THREE.Color('#6F9A50') },
    uLightDir: { value: new THREE.Vector3(1, 1, 1).normalize() },
    uSunColor: { value: new THREE.Color('#FFEFE8') },
    uSunIntensity: { value: 3.506 },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
  });
}
