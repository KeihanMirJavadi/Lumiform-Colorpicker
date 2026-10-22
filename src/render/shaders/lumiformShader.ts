import * as THREE from 'three';

export interface LumiformShaderUniforms {
  [key: string]: THREE.IUniform;
  uAlbedo: { value: THREE.Color };
  uLightDir: { value: THREE.Vector3 };
  uKeyColor: { value: THREE.Color };
  uKeyIntensity: { value: number };
  uSkyColor: { value: THREE.Color };
  uHorizonColor: { value: THREE.Color };
  uGroundColor: { value: THREE.Color };
  uAmbientIntensity: { value: number };
  uRoughness: { value: number };
  uSpecularIntensity: { value: number };
}

const vertexShader = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uAlbedo;
  uniform vec3 uLightDir;
  uniform vec3 uKeyColor;
  uniform float uKeyIntensity;

  uniform vec3 uSkyColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uGroundColor;
  uniform float uAmbientIntensity;

  uniform float uRoughness;
  uniform float uSpecularIntensity;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 L = normalize(uLightDir);
    vec3 V = normalize(cameraPosition - vWorldPosition);
    vec3 H = normalize(L + V);

    // 1. Directional Key Light Diffuse (Lambertian)
    float NdotL = max(0.0, dot(N, L));
    vec3 keyDiffuse = uKeyColor * (NdotL * uKeyIntensity);

    // 2. 3-Zone Ambient Environment (Sky, Horizon, Ground)
    vec3 ambientColor;
    if (N.y >= 0.0) {
      float t = pow(clamp(N.y, 0.0, 1.0), 0.85);
      ambientColor = mix(uHorizonColor, uSkyColor, t);
    } else {
      float t = pow(clamp(-N.y, 0.0, 1.0), 0.85);
      ambientColor = mix(uHorizonColor, uGroundColor, t);
    }
    vec3 totalAmbient = ambientColor * uAmbientIntensity;

    // 3. Diffuse component applied to Base Albedo
    vec3 diffuseLight = keyDiffuse + totalAmbient;
    vec3 diffuse = uAlbedo * diffuseLight;

    // 4. Specular Component (Roughness-driven Blinn-Phong with Fresnel)
    // Map roughness (0.0 to 1.0) to specular power/shininess
    float shininess = mix(256.0, 4.0, uRoughness);
    float NdotH = max(0.0, dot(N, H));
    float specFactor = pow(NdotH, shininess);

    // Fresnel Schlick approximation
    float VdotH = max(0.0, dot(V, H));
    float fresnel = 0.04 + (1.0 - 0.04) * pow(clamp(1.0 - VdotH, 0.0, 1.0), 5.0);

    vec3 specular = uKeyColor * (specFactor * fresnel * uSpecularIntensity * uKeyIntensity * (NdotL > 0.0 ? 1.0 : 0.0));

    // Total Surface Radiance
    vec3 finalColor = diffuse + specular;

    // Tone Mapping (ACES Filmic Curve approximation for clean vibrancy without blowout)
    vec3 a = finalColor * (finalColor + 0.0245786) - 0.000090537;
    vec3 b = finalColor * (0.983729 * finalColor + 0.4329510) + 0.238081;
    vec3 mapped = clamp(a / b, 0.0, 1.0);

    gl_FragColor = vec4(mapped, 1.0);
  }
`;

export function createLumiformMaterial(initialAlbedo: THREE.Color | string | number = 0xEB5757): THREE.ShaderMaterial {
  const albedo = initialAlbedo instanceof THREE.Color ? initialAlbedo : new THREE.Color(initialAlbedo);

  const uniforms: LumiformShaderUniforms = {
    uAlbedo: { value: albedo },
    uLightDir: { value: new THREE.Vector3(1, 1, 1).normalize() },
    uKeyColor: { value: new THREE.Color('#FFF2DB') },
    uKeyIntensity: { value: 2.2 },
    uSkyColor: { value: new THREE.Color('#5C8ECC') },
    uHorizonColor: { value: new THREE.Color('#9BB9DE') },
    uGroundColor: { value: new THREE.Color('#7A5435') },
    uAmbientIntensity: { value: 0.85 },
    uRoughness: { value: 0.35 },
    uSpecularIntensity: { value: 0.5 },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
  });
}
