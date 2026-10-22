import * as THREE from 'three';
import { LightingPreset } from '../core/types';
import { LIGHTING_PRESETS, LightingEnvironment, sphericalToCartesian } from '../core/lighting';
import { SunIndicator } from './SunIndicator';
import { LumiformShaderUniforms } from './shaders/lumiformShader';

export class LightingEngine {
  private activePreset: LightingPreset | 'custom' = 'daylight';
  private environment: LightingEnvironment;
  private sunIndicator: SunIndicator;
  private shaderUniforms: LumiformShaderUniforms | null = null;
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
        skyColor: new THREE.Color(presetConfig.ambient.skyColor),
        horizonColor: new THREE.Color(presetConfig.ambient.horizonColor),
        groundColor: new THREE.Color(presetConfig.ambient.groundColor),
        intensity: presetConfig.ambient.intensity,
      },
    };

    this.sunIndicator.setColor(this.environment.keyLight.color);

    // Direct sun drag syncs to engine and shaders; switches preset to 'custom' (deselects presets)
    this.sunIndicator.onDirectionChange((dir, azimuth, elevation) => {
      this.activePreset = 'custom';
      this.environment.preset = 'custom';
      this.environment.keyLight.azimuth = azimuth;
      this.environment.keyLight.elevation = elevation;
      if (this.shaderUniforms) {
        this.shaderUniforms.uLightDir.value.copy(dir);
      }
      this.notifyChange();
    });
  }

  public bindUniforms(uniforms: LumiformShaderUniforms): void {
    this.shaderUniforms = uniforms;
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

    this.environment.ambient.skyColor.set(config.ambient.skyColor);
    this.environment.ambient.horizonColor.set(config.ambient.horizonColor);
    this.environment.ambient.groundColor.set(config.ambient.groundColor);
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

    this.sunIndicator.setAngles(this.environment.keyLight.azimuth, this.environment.keyLight.elevation, false);

    this.syncShaderUniforms();
    this.notifyChange();
  }

  public onEnvironmentChange(callback: (env: LightingEnvironment) => void): () => void {
    this.changeListeners.add(callback);
    callback(this.environment);
    return () => {
      this.changeListeners.delete(callback);
    };
  }

  private syncShaderUniforms(): void {
    if (!this.shaderUniforms) return;

    this.shaderUniforms.uLightDir.value.copy(this.getDirection());
    this.shaderUniforms.uKeyColor.value.copy(this.environment.keyLight.color);
    this.shaderUniforms.uKeyIntensity.value = this.environment.keyLight.intensity;

    this.shaderUniforms.uSkyColor.value.copy(this.environment.ambient.skyColor);
    this.shaderUniforms.uHorizonColor.value.copy(this.environment.ambient.horizonColor);
    this.shaderUniforms.uGroundColor.value.copy(this.environment.ambient.groundColor);
    this.shaderUniforms.uAmbientIntensity.value = this.environment.ambient.intensity;
  }

  private notifyChange(): void {
    this.changeListeners.forEach((cb) => cb(this.environment));
  }

  public dispose(): void {
    this.changeListeners.clear();
    this.sunIndicator.dispose();
  }
}
