import * as THREE from 'three';
import { LightingPreset } from '../core/types';
import {
  LIGHTING_PRESETS,
  LightingEnvironment,
  sphericalToCartesian,
  computeDynamicAtmosphere,
} from '../core/lighting';
import { SunIndicator } from './SunIndicator';
import { LumiformShaderUniforms } from './shaders/lumiformShader';
import { SkyShaderUniforms } from './shaders/skyShader';
import { GroundShaderUniforms } from './shaders/groundShader';

export class LightingEngine {
  private activePreset: LightingPreset | 'custom' = 'daylight';
  private environment: LightingEnvironment;
  private sunIndicator: SunIndicator;
  private groundAlbedo: THREE.Color = new THREE.Color('#4A853D'); // Default Grass Green

  private meshUniforms: LumiformShaderUniforms | null = null;
  private skyUniforms: SkyShaderUniforms | null = null;
  private groundUniforms: GroundShaderUniforms | null = null;

  private changeListeners: Set<(env: LightingEnvironment) => void> = new Set();

  constructor() {
    const presetConfig = LIGHTING_PRESETS['daylight'];

    this.sunIndicator = new SunIndicator({
      radius: 1.85,
      initialAzimuth: presetConfig.keyLight.azimuth,
      initialElevation: presetConfig.keyLight.elevation,
    });

    this.environment = {
      preset: this.activePreset,
      keyLight: {
        color: new THREE.Color(presetConfig.keyLight.color),
        intensity: presetConfig.keyLight.intensity,
        azimuth: presetConfig.keyLight.azimuth,
        elevation: presetConfig.keyLight.elevation,
      },
      ambient: {
        zenithColor: new THREE.Color(presetConfig.ambient.zenithColor),
        equatorColor: new THREE.Color(presetConfig.ambient.equatorColor),
        horizonColor: new THREE.Color(presetConfig.ambient.horizonColor),
        groundColor: new THREE.Color(this.groundAlbedo), // Default Grass
        skyColor: new THREE.Color(presetConfig.ambient.equatorColor),
        intensity: presetConfig.ambient.intensity,
      },
    };

    this.sunIndicator.setColor(this.environment.keyLight.color);

    // Direct sun drag syncs to engine and dynamically updates atmospheric colors
    this.sunIndicator.onDirectionChange((_dir, azimuth, elevation) => {
      this.activePreset = 'custom';
      this.environment.preset = 'custom';
      this.environment.keyLight.azimuth = azimuth;
      this.environment.keyLight.elevation = elevation;

      this.updateDynamicAtmosphere(elevation);
      this.syncShaderUniforms();
      this.notifyChange();
    });
  }

  public bindUniforms(
    mesh: LumiformShaderUniforms,
    sky?: SkyShaderUniforms,
    ground?: GroundShaderUniforms
  ): void {
    this.meshUniforms = mesh;
    if (sky) this.skyUniforms = sky;
    if (ground) this.groundUniforms = ground;
    this.syncShaderUniforms();
  }

  public bindSkyUniforms(sky: SkyShaderUniforms): void {
    this.skyUniforms = sky;
    this.syncShaderUniforms();
  }

  public bindGroundUniforms(ground: GroundShaderUniforms): void {
    this.groundUniforms = ground;
    this.syncShaderUniforms();
  }

  public getSunIndicator(): SunIndicator {
    return this.sunIndicator;
  }

  public getEnvironment(): LightingEnvironment {
    return this.environment;
  }

  public getActivePreset(): LightingPreset | 'custom' {
    return this.activePreset;
  }

  public getDirection(): THREE.Vector3 {
    return sphericalToCartesian(this.environment.keyLight.azimuth, this.environment.keyLight.elevation).normalize();
  }

  public setPreset(preset: LightingPreset): void {
    this.activePreset = preset;
    const config = LIGHTING_PRESETS[preset];

    this.environment.preset = preset;
    this.environment.keyLight.color.set(config.keyLight.color);
    this.environment.keyLight.intensity = config.keyLight.intensity;
    this.environment.keyLight.azimuth = config.keyLight.azimuth;
    this.environment.keyLight.elevation = config.keyLight.elevation;

    this.environment.ambient.zenithColor.set(config.ambient.zenithColor);
    this.environment.ambient.equatorColor.set(config.ambient.equatorColor);
    this.environment.ambient.horizonColor.set(config.ambient.horizonColor);
    this.environment.ambient.groundColor.copy(this.groundAlbedo);
    this.environment.ambient.skyColor.set(config.ambient.equatorColor);
    this.environment.ambient.intensity = config.ambient.intensity;

    this.sunIndicator.setAngles(config.keyLight.azimuth, config.keyLight.elevation, false);
    this.sunIndicator.setColor(this.environment.keyLight.color);

    this.syncShaderUniforms();
    this.notifyChange();
  }

  public setLightAngles(azimuth: number, elevation: number): void {
    this.activePreset = 'custom';
    this.environment.preset = 'custom';
    this.environment.keyLight.azimuth = (azimuth % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    this.environment.keyLight.elevation = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, elevation));

    this.updateDynamicAtmosphere(this.environment.keyLight.elevation);
    this.sunIndicator.setAngles(this.environment.keyLight.azimuth, this.environment.keyLight.elevation, false);
    this.sunIndicator.setColor(this.environment.keyLight.color);

    this.syncShaderUniforms();
    this.notifyChange();
  }

  public setKeyLightColor(colorHex: string | THREE.Color): void {
    const col = colorHex instanceof THREE.Color ? colorHex : new THREE.Color(colorHex);
    this.activePreset = 'custom';
    this.environment.preset = 'custom';
    this.environment.keyLight.color.copy(col);
    this.sunIndicator.setColor(col);

    this.syncShaderUniforms();
    this.notifyChange();
  }

  public setGroundColor(colorHex: string | THREE.Color): void {
    const col = colorHex instanceof THREE.Color ? colorHex : new THREE.Color(colorHex);
    this.groundAlbedo.copy(col);
    this.environment.ambient.groundColor.copy(col);

    if (this.groundUniforms) {
      this.groundUniforms.uGroundAlbedo.value.copy(col);
      this.groundUniforms.uGroundColor.value.copy(col);
    }
    this.syncShaderUniforms();
    this.notifyChange();
  }

  public getGroundColor(): THREE.Color {
    return this.groundAlbedo.clone();
  }

  private updateDynamicAtmosphere(elevation: number): void {
    const atmos = computeDynamicAtmosphere(elevation);
    this.environment.ambient.zenithColor.copy(atmos.zenithColor);
    this.environment.ambient.equatorColor.copy(atmos.equatorColor);
    this.environment.ambient.horizonColor.copy(atmos.horizonColor);
    this.environment.ambient.groundColor.copy(this.groundAlbedo);
    this.environment.ambient.skyColor.copy(atmos.equatorColor);
    this.environment.ambient.intensity = atmos.ambientIntensity;

    this.environment.keyLight.color.copy(atmos.sunColor);
    this.environment.keyLight.intensity = atmos.sunIntensity;
    this.sunIndicator.setColor(this.environment.keyLight.color);
  }

  public onEnvironmentChange(callback: (env: LightingEnvironment) => void): () => void {
    this.changeListeners.add(callback);
    callback(this.environment);
    return () => {
      this.changeListeners.delete(callback);
    };
  }

  public syncShaderUniforms(): void {
    const dir = this.getDirection();

    // 1. Mesh Material Uniforms
    if (this.meshUniforms) {
      this.meshUniforms.uLightDir.value.copy(dir);
      this.meshUniforms.uKeyColor.value.copy(this.environment.keyLight.color);
      this.meshUniforms.uKeyIntensity.value = this.environment.keyLight.intensity;

      this.meshUniforms.uZenithColor.value.copy(this.environment.ambient.zenithColor);
      this.meshUniforms.uEquatorColor.value.copy(this.environment.ambient.equatorColor);
      this.meshUniforms.uHorizonColor.value.copy(this.environment.ambient.horizonColor);
      this.meshUniforms.uGroundColor.value.copy(this.environment.ambient.groundColor);
      this.meshUniforms.uSkyColor.value.copy(this.environment.ambient.skyColor);
      this.meshUniforms.uAmbientIntensity.value = this.environment.ambient.intensity;
    }

    // 2. Sky Dome Uniforms
    if (this.skyUniforms) {
      this.skyUniforms.uLightDir.value.copy(dir);
      this.skyUniforms.uZenithColor.value.copy(this.environment.ambient.zenithColor);
      this.skyUniforms.uEquatorColor.value.copy(this.environment.ambient.equatorColor);
      this.skyUniforms.uHorizonColor.value.copy(this.environment.ambient.horizonColor);
      this.skyUniforms.uGroundColor.value.copy(this.environment.ambient.groundColor);
      this.skyUniforms.uSunColor.value.copy(this.environment.keyLight.color);
      this.skyUniforms.uSunIntensity.value = this.environment.keyLight.intensity;
    }

    // 3. Ground Plane Uniforms
    if (this.groundUniforms) {
      this.groundUniforms.uLightDir.value.copy(dir);
      this.groundUniforms.uKeyColor.value.copy(this.environment.keyLight.color);
      this.groundUniforms.uKeyIntensity.value = this.environment.keyLight.intensity;

      this.groundUniforms.uZenithColor.value.copy(this.environment.ambient.zenithColor);
      this.groundUniforms.uEquatorColor.value.copy(this.environment.ambient.equatorColor);
      this.groundUniforms.uHorizonColor.value.copy(this.environment.ambient.horizonColor);
      this.groundUniforms.uGroundColor.value.copy(this.environment.ambient.groundColor);
      this.groundUniforms.uGroundAlbedo.value.copy(this.groundAlbedo);
      this.groundUniforms.uAmbientIntensity.value = this.environment.ambient.intensity;
    }
  }

  private notifyChange(): void {
    this.changeListeners.forEach((cb) => cb(this.environment));
  }

  public dispose(): void {
    this.changeListeners.clear();
    this.sunIndicator.dispose();
  }
}
