import * as THREE from 'three';
import { LightingPreset } from '../core/types';
import {
  LIGHTING_PRESETS,
  LightingEnvironment,
  sphericalToCartesian,
  evaluateAtmosphere,
  SKY_HEMISPHERE_POWER,
  MAX_KEY_ANGULAR_RADIUS_DEG,
  keySoftNormalisation,
} from '../core/lighting';
import { SunIndicator } from './SunIndicator';
import { LumiformShaderUniforms } from './shaders/lumiformShader';
import { SkyShaderUniforms } from './shaders/skyShader';
import { GroundShaderUniforms } from './shaders/groundShader';
import { DEFAULT_GROUND_HEX } from '../core/defaults';

export class LightingEngine {
  private activePreset: LightingPreset | 'custom' = 'midday';
  /**
   * Manual terminator softness, in radians. `null` means "follow the
   * atmosphere curve for the current elevation", so presets and the sun
   * sliders keep their calibrated values until the user takes over.
   */
  private angularRadiusOverride: number | null = null;
  private environment: LightingEnvironment;
  private sunIndicator: SunIndicator;
  private groundAlbedo: THREE.Color = new THREE.Color(DEFAULT_GROUND_HEX);

  private meshUniforms: LumiformShaderUniforms[] = [];
  private skyUniforms: SkyShaderUniforms | null = null;
  private groundUniforms: GroundShaderUniforms | null = null;

  private changeListeners: Set<(env: LightingEnvironment) => void> = new Set();

  constructor() {
    const presetConfig = LIGHTING_PRESETS.midday;

    this.sunIndicator = new SunIndicator({
      radius: 1.85,
      initialAzimuth: presetConfig.azimuth,
      initialElevation: presetConfig.elevation,
    });

    const atmos = evaluateAtmosphere(presetConfig.elevation);

    this.environment = {
      preset: this.activePreset,
      keyLight: {
        color: atmos.keyColor.clone(),
        intensity: atmos.keyIntensity,
        azimuth: presetConfig.azimuth,
        elevation: presetConfig.elevation,
        angularRadius: atmos.keyAngularRadius,
      },
      ambient: {
        zenithColor: atmos.zenithColor.clone(),
        equatorColor: atmos.equatorColor.clone(),
        horizonColor: atmos.horizonColor.clone(),
        groundColor: atmos.groundDomeColor.clone(),
        skyColor: atmos.equatorColor.clone(),
        intensity: 1.0,
      },
      skyLight: {
        color: atmos.skyLightColor.clone(),
        intensity: atmos.skyLightIntensity,
      },
      groundLight: {
        color: atmos.groundLightColor.clone(),
        intensity: atmos.groundLightIntensity,
      },
      hazeStrength: atmos.hazeStrength,
      hazePreset: presetConfig.haze,
      horizonHaze: atmos.horizonHaze.clone(),
      horizonBand: atmos.horizonBand,
      groundHaze: atmos.groundHaze.clone(),
      groundHazeStrength: atmos.groundHazeStrength,
    };

    this.groundAlbedo.copy(atmos.groundAlbedo);

    this.sunIndicator.setColor(this.environment.keyLight.color);

    // Direct sun drag: same evaluator as the sliders and the presets.
    this.sunIndicator.onDirectionChange((_dir, azimuth, elevation) => {
      this.markPresetCustom();
      this.environment.keyLight.azimuth = azimuth;
      this.applyElevation(elevation);
      this.syncShaderUniforms();
      this.notifyChange();
    });
  }

  public bindUniforms(
    mesh: LumiformShaderUniforms | LumiformShaderUniforms[],
    sky?: SkyShaderUniforms,
    ground?: GroundShaderUniforms
  ): void {
    this.meshUniforms = Array.isArray(mesh) ? mesh : [mesh];
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
    return sphericalToCartesian(
      this.environment.keyLight.azimuth,
      this.environment.keyLight.elevation
    ).normalize();
  }

  public setPreset(preset: LightingPreset): void {
    const config = LIGHTING_PRESETS[preset];
    this.activePreset = preset;
    this.environment.preset = preset;
    this.environment.keyLight.azimuth = config.azimuth;
    // Each time of day carries its own calibrated Haze amount, so switching
    // presets resets the slider instead of inheriting the previous setting.
    this.environment.hazePreset = config.haze;

    // A preset owns its calibrated terminator softness. Clicking it is the way
    // back from a manual override.
    this.angularRadiusOverride = null;

    // A preset is only a named elevation. Both this path and the manual slider
    // path call applyElevation(), so they cannot produce different images.
    this.applyElevation(config.elevation);

    this.sunIndicator.setAngles(config.azimuth, config.elevation, false);
    this.sunIndicator.setColor(this.environment.keyLight.color);

    this.syncShaderUniforms();
    this.notifyChange();
  }

  public setLightAngles(azimuth: number, elevation: number): void {
    this.markPresetCustom();
    this.environment.keyLight.azimuth = (azimuth % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);

    this.applyElevation(
      Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, elevation))
    );

    this.sunIndicator.setAngles(this.environment.keyLight.azimuth, this.environment.keyLight.elevation, false);
    this.sunIndicator.setColor(this.environment.keyLight.color);

    this.syncShaderUniforms();
    this.notifyChange();
  }

  public setKeyLightColor(colorHex: string | THREE.Color): void {
    const col = colorHex instanceof THREE.Color ? colorHex : new THREE.Color(colorHex);
    this.markPresetCustom();
    this.environment.keyLight.color.copy(col);
    this.sunIndicator.setColor(col);

    this.syncShaderUniforms();
    this.notifyChange();
  }

  /**
   * Manually sets how large the key light is, which is what controls how hard
   * or soft the sphere's terminator reads. Stays in effect across orbit/height
   * changes; clicking a preset restores that preset's calibrated value.
   */
  public setKeyAngularRadius(radians: number): void {
    const max = (MAX_KEY_ANGULAR_RADIUS_DEG * Math.PI) / 180;
    this.markPresetCustom();
    this.angularRadiusOverride = Math.max(0, Math.min(max, radians));
    this.environment.keyLight.angularRadius = this.angularRadiusOverride;

    this.syncShaderUniforms();
    this.notifyChange();
  }

  public getKeyAngularRadius(): number {
    return this.environment.keyLight.angularRadius;
  }

  public setGroundColor(colorHex: string | THREE.Color): void {
    const col = colorHex instanceof THREE.Color ? colorHex : new THREE.Color(colorHex);
    this.markPresetCustom();
    this.groundAlbedo.copy(col);

    if (this.groundUniforms) {
      this.groundUniforms.uGroundAlbedo.value.copy(col);
    }
    this.syncShaderUniforms();
    this.notifyChange();
  }

  public getGroundColor(): THREE.Color {
    return this.groundAlbedo.clone();
  }

  /**
   * Detaches the current look from its preset. Call this from controls whose
   * value lives outside the engine (Haze) so the time-of-day strip clears its
   * buttons. Does nothing (and does not notify) when already custom.
   */
  public markManualEdit(): void {
    if (this.activePreset === 'custom') return;
    this.markPresetCustom();
    this.notifyChange();
  }

  private markPresetCustom(): void {
    this.activePreset = 'custom';
    this.environment.preset = 'custom';
  }

  /** Single source of truth for every light change. */
  private applyElevation(elevation: number): void {
    const atmos = evaluateAtmosphere(elevation);

    this.environment.keyLight.elevation = elevation;
    this.environment.keyLight.angularRadius =
      this.angularRadiusOverride ?? atmos.keyAngularRadius;
    this.environment.keyLight.color.copy(atmos.keyColor);
    this.environment.keyLight.intensity = atmos.keyIntensity;

    this.environment.ambient.zenithColor.copy(atmos.zenithColor);
    this.environment.ambient.equatorColor.copy(atmos.equatorColor);
    this.environment.ambient.horizonColor.copy(atmos.horizonColor);
    this.environment.ambient.groundColor.copy(atmos.groundDomeColor);
    this.environment.ambient.skyColor.copy(atmos.equatorColor);

    this.environment.skyLight.color.copy(atmos.skyLightColor);
    this.environment.skyLight.intensity = atmos.skyLightIntensity;
    this.environment.groundLight.color.copy(atmos.groundLightColor);
    this.environment.groundLight.intensity = atmos.groundLightIntensity;
    this.environment.hazeStrength = atmos.hazeStrength;
    this.environment.horizonHaze.copy(atmos.horizonHaze);
    this.environment.horizonBand = atmos.horizonBand;
    this.environment.groundHaze.copy(atmos.groundHaze);
    this.environment.groundHazeStrength = atmos.groundHazeStrength;

    // The phase owns the ground colour: the reference's ground hue changes with
    // the light setup, and a fixed green albedo cannot reproduce it.
    this.groundAlbedo.copy(atmos.groundAlbedo);
    if (this.groundUniforms) {
      this.groundUniforms.uGroundAlbedo.value.copy(this.groundAlbedo);
    }

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
    const keyDir = this.getDirection();

    // 1. Sphere material uniforms
    for (const mesh of this.meshUniforms) {
      mesh.uLightDir.value.copy(keyDir);
      mesh.uKeyColor.value.copy(this.environment.keyLight.color);
      mesh.uKeyIntensity.value = this.environment.keyLight.intensity;
      mesh.uKeyAngularRadius.value = this.environment.keyLight.angularRadius;
      mesh.uKeySoftNorm.value = keySoftNormalisation(this.environment.keyLight.angularRadius);

      mesh.uZenithColor.value.copy(this.environment.ambient.zenithColor);
      mesh.uEquatorColor.value.copy(this.environment.ambient.equatorColor);
      mesh.uHorizonColor.value.copy(this.environment.ambient.horizonColor);
      mesh.uGroundColor.value.copy(this.environment.ambient.groundColor);
      mesh.uSkyColor.value.copy(this.environment.ambient.skyColor);

      mesh.uSkyLightColor.value.copy(this.environment.skyLight.color);
      mesh.uSkyLightIntensity.value = this.environment.skyLight.intensity;
      mesh.uGroundLightColor.value.copy(this.environment.groundLight.color);
      mesh.uGroundLightIntensity.value = this.environment.groundLight.intensity;
      mesh.uSkyHemiPower.value = SKY_HEMISPHERE_POWER;
      mesh.uHorizonHaze.value.copy(this.environment.horizonHaze);
      mesh.uHorizonBand.value = this.environment.horizonBand;
      mesh.uGroundHaze.value.copy(this.environment.groundHaze);
    }

    // 2. Sky dome uniforms (background only)
    if (this.skyUniforms) {
      this.skyUniforms.uLightDir.value.copy(keyDir);
      this.skyUniforms.uZenithColor.value.copy(this.environment.ambient.zenithColor);
      this.skyUniforms.uEquatorColor.value.copy(this.environment.ambient.equatorColor);
      this.skyUniforms.uHorizonColor.value.copy(this.environment.ambient.horizonColor);
      this.skyUniforms.uGroundColor.value.copy(this.environment.ambient.groundColor);
      this.skyUniforms.uHorizonHaze.value.copy(this.environment.horizonHaze);
      this.skyUniforms.uHorizonBand.value = this.environment.horizonBand;
      this.skyUniforms.uGroundHaze.value.copy(this.environment.groundHaze);
      this.skyUniforms.uSunColor.value.copy(this.environment.keyLight.color);
      this.skyUniforms.uSunIntensity.value = this.environment.keyLight.intensity;
    }

    // 3. Ground plane uniforms — same lights as the sphere, so they agree.
    if (this.groundUniforms) {
      this.groundUniforms.uLightDir.value.copy(keyDir);
      this.groundUniforms.uKeyColor.value.copy(this.environment.keyLight.color);
      this.groundUniforms.uKeyIntensity.value = this.environment.keyLight.intensity;

      this.groundUniforms.uZenithColor.value.copy(this.environment.ambient.zenithColor);
      this.groundUniforms.uEquatorColor.value.copy(this.environment.ambient.equatorColor);
      this.groundUniforms.uHorizonColor.value.copy(this.environment.ambient.horizonColor);
      this.groundUniforms.uGroundColor.value.copy(this.environment.ambient.groundColor);
      this.groundUniforms.uGroundAlbedo.value.copy(this.groundAlbedo);

      this.groundUniforms.uSkyLightColor.value.copy(this.environment.skyLight.color);
      this.groundUniforms.uSkyLightIntensity.value = this.environment.skyLight.intensity;
      this.groundUniforms.uGroundLightColor.value.copy(this.environment.groundLight.color);
      this.groundUniforms.uGroundLightIntensity.value = this.environment.groundLight.intensity;
      this.groundUniforms.uGroundHaze.value.copy(this.environment.groundHaze);
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
