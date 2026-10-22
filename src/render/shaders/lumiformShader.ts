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

    // 4. Specular Component (Surface Finish Roughness + Specular Intensity)
    vec3 specular = vec3(0.0);
    if (uSpecularIntensity > 0.001 && NdotL > 0.0) {
      // Shininess exponent: maps roughness 0.0 -> ~1024 (ultra sharp), 0.08 -> ~588 (sharp gloss), 0.45 -> ~45 (satin), 1.0 -> 1 (matte)
      float shininess = exp2(10.0 * (1.0 - clamp(uRoughness, 0.0, 1.0)));
      float NdotH = max(0.0, dot(N, H));
      float specFactor = pow(NdotH, shininess);

      // Schlick Fresnel approximation: transitions from base specular intensity to 1.0 at glancing angles
      float VdotH = max(0.0, dot(V, H));
      float fresnel = mix(uSpecularIntensity, 1.0, pow(clamp(1.0 - VdotH, 0.0, 1.0), 5.0));

      specular = uKeyColor * (specFactor * fresnel * uKeyIntensity);
    }

    // 5. Subtle ambient reflection / rim sheen on glossy finishes
    if (uSpecularIntensity > 0.05 && uRoughness < 0.7) {
      float VdotN = max(0.0, dot(V, N));
      float edgeFresnel = pow(clamp(1.0 - VdotN, 0.0, 1.0), 4.0);
      vec3 ambientReflect = (N.y >= 0.0) ? uSkyColor : uGroundColor;
      specular += ambientReflect * (edgeFresnel * (1.0 - uRoughness) * uSpecularIntensity * 0.45 * uAmbientIntensity);
    }

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
    uRoughness: { value: 0.45 },
    uSpecularIntensity: { value: 0.4 },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
  });
}
