import * as THREE from 'three';

export interface LumiformShaderUniforms {
  [key: string]: THREE.IUniform;
  uAlbedo: { value: THREE.Color };
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
  uIsSphere: { value: number };
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

  uniform vec3 uZenithColor;
  uniform vec3 uEquatorColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uGroundColor;
  uniform vec3 uSkyColor;
  uniform float uAmbientIntensity;

  uniform float uRoughness;
  uniform float uSpecularIntensity;
  uniform vec3 uSphereCenter;
  uniform float uIsSphere;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    // For a sphere, the true outward normal in world space is radially outward from center.
    // This ensures lighting is invariant to local rotation of the sphere.
    // For a cube (uIsSphere = 0), face normals rotate with the mesh.
    vec3 N;
    if (uIsSphere > 0.5) {
      N = normalize(vWorldPosition - uSphereCenter);
    } else {
      N = normalize(vWorldNormal);
    }

    vec3 L = normalize(uLightDir);
    vec3 V = normalize(cameraPosition - vWorldPosition);
    vec3 H = normalize(L + V);

    // 1. Directional Key Light Diffuse (Lambertian)
    float NdotL = max(0.0, dot(N, L));
    vec3 keyDiffuse = uKeyColor * (NdotL * uKeyIntensity);

    // 2. Physical Hemispherical Sky Fill + Ground Bounce GI
    // Upper hemisphere receives sky dome fill from above (Zenith, Equator, Horizon):
    float upWeight = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 skyLight;
    if (N.y < 0.45) {
      float t = max(0.0, N.y) / 0.45;
      skyLight = mix(uHorizonColor, uEquatorColor, smoothstep(0.0, 1.0, t));
    } else {
      float t = (N.y - 0.45) / 0.55;
      skyLight = mix(uEquatorColor, uZenithColor, smoothstep(0.0, 1.0, t));
    }

    // Lower hemisphere receives secondary ground bounce GI (from key sunlight + ambient hitting ground):
    vec3 groundBounceGI = uGroundColor * (
      0.30 * max(0.0, L.y) * uKeyIntensity +
      0.18 * uAmbientIntensity
    );

    // Natural hemispherical blend between sky fill and ground bounce:
    vec3 ambientLight = mix(groundBounceGI, skyLight, smoothstep(0.2, 0.8, upWeight)) * uAmbientIntensity;

    // Gentle ambient floor ensures shadows retain rich color and never clip to black:
    vec3 ambientFloor = mix(skyLight, groundBounceGI, 0.5) * (uAmbientIntensity * 0.15);
    ambientLight += ambientFloor;

    // 3. Diffuse component applied to Base Albedo
    vec3 diffuseLight = keyDiffuse + ambientLight;
    vec3 diffuse = uAlbedo * diffuseLight;

    // 4. Specular Component (Surface Finish Roughness + Specular Intensity)
    vec3 specular = vec3(0.0);
    if (uSpecularIntensity > 0.001 && NdotL > 0.0) {
      float shininess = exp2(10.0 * (1.0 - clamp(uRoughness, 0.0, 1.0)));
      float NdotH = max(0.0, dot(N, H));
      float specFactor = pow(NdotH, shininess);

      float VdotH = max(0.0, dot(V, H));
      float fresnel = mix(uSpecularIntensity, 1.0, pow(clamp(1.0 - VdotH, 0.0, 1.0), 5.0));

      specular = uKeyColor * (specFactor * fresnel * uKeyIntensity);
    }

    // 5. Ambient Specular Sheen for Glossy finishes
    if (uSpecularIntensity > 0.05 && uRoughness < 0.7) {
      float VdotN = max(0.0, dot(V, N));
      float edgeFresnel = pow(clamp(1.0 - VdotN, 0.0, 1.0), 4.0);
      vec3 ambientReflect = (N.y >= 0.0) ? uZenithColor : uGroundColor;
      specular += ambientReflect * (edgeFresnel * (1.0 - uRoughness) * uSpecularIntensity * 0.45 * uAmbientIntensity);
    }

    // Total Surface Radiance
    vec3 finalColor = diffuse + specular;

    // Tone Mapping (ACES Filmic Curve approximation with proper shadow retention)
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
    uKeyColor: { value: new THREE.Color('#FFFBEB') },
    uKeyIntensity: { value: 2.2 },
    uZenithColor: { value: new THREE.Color('#3B82F6') },
    uEquatorColor: { value: new THREE.Color('#93C5FD') },
    uHorizonColor: { value: new THREE.Color('#E0F2FE') },
    uGroundColor: { value: new THREE.Color('#4A853D') },
    uSkyColor: { value: new THREE.Color('#93C5FD') },
    uAmbientIntensity: { value: 0.9 },
    uRoughness: { value: 0.45 },
    uSpecularIntensity: { value: 0.4 },
    uSphereCenter: { value: new THREE.Vector3(0, 0, 0) },
    uIsSphere: { value: 1.0 },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
  });
}
