import * as THREE from 'three';
import { OrbitCamera } from './OrbitCamera';
import { LightingEngine } from './LightingEngine';
import { ColorPickerTarget } from './ColorPickerTarget';
import { createLumiformMaterial, LumiformShaderUniforms } from './shaders/lumiformShader';
import { createSkyDomeMaterial, SkyShaderUniforms } from './shaders/skyShader';
import { createGroundMaterial, GroundShaderUniforms } from './shaders/groundShader';
import { LightingPreset, SurfaceFinish, RGBColor } from '../core/types';
import { SURFACE_FINISHES } from '../core/material';
import { DEFAULT_ALBEDO_HEX, DEFAULT_SURFACE_FINISH } from '../core/defaults';

export interface ViewportOptions {
  container: HTMLElement;
  sphereRadius?: number;
  initialColor?: string | number;
}

export class Viewport {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private orbitCamera: OrbitCamera;
  private lightingEngine: LightingEngine;
  private colorPickerTarget: ColorPickerTarget;

  // Sphere with a ground-level scale pivot
  private meshScaleGroup: THREE.Group;
  private targetMesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private sphereGeometry: THREE.SphereGeometry;
  private sphereRadius: number;
  private meshScale = 1.0;

  // Environment: Dynamic 3-Tone Sky Dome & Ground Plane with Drop Shadow
  private skyGeometry: THREE.SphereGeometry;
  private skyMesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private groundGeometry: THREE.PlaneGeometry;
  private groundMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  private resizeObserver: ResizeObserver;
  private animationFrameId: number | null = null;
  private isDisposed = false;

  private currentFinish: SurfaceFinish = DEFAULT_SURFACE_FINISH;
  private currentRoughness = 1.0;
  private currentSpecular = 0.0;

  private finishListeners: Set<(finish: SurfaceFinish, roughness: number, specular: number) => void> = new Set();
  private sampleListeners: Set<(rgb: RGBColor, hex: string) => void> = new Set();

  constructor(options: ViewportOptions) {
    this.container = options.container;
    this.sphereRadius = options.sphereRadius ?? 1.25;

    // 1. Three.js Scene Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x181818);

    // 2. Perspective Camera
    const aspect = (this.container.clientWidth || 300) / (this.container.clientHeight || 300);
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 200);
    this.camera.position.set(0, 0.15, 7.0);

    // 3. WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.container.clientWidth || 300, this.container.clientHeight || 300);

    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';

    this.container.innerHTML = '';
    this.container.appendChild(canvas);

    // 4. Camera Orbit Controls (zoom only — canvas dragging never orbits the scene)
    this.orbitCamera = new OrbitCamera(this.camera, {
      radius: 7.0,
      minDistance: 2.2,
      maxDistance: 9.0,
      rotateSpeed: 0.006,
    });

    // 5. Dynamic 3-Tone Sky Dome (Zenith, Equator, Horizon)
    this.skyGeometry = new THREE.SphereGeometry(45, 36, 24);
    const skyMaterial = createSkyDomeMaterial();
    this.skyMesh = new THREE.Mesh(this.skyGeometry, skyMaterial);
    this.skyMesh.renderOrder = -1;
    this.scene.add(this.skyMesh);

    // 6. Ground Plane with Physical Sphere Drop Shadow & Ambient Color Bleed
    const sphereRadius = this.sphereRadius;
    this.groundGeometry = new THREE.PlaneGeometry(400, 400, 1, 1);
    const groundMaterial = createGroundMaterial();
    this.groundMesh = new THREE.Mesh(this.groundGeometry, groundMaterial);
    this.groundMesh.position.set(0, -sphereRadius, 0);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.scene.add(this.groundMesh);

    // 7. High-Resolution Sphere Geometry
    this.sphereGeometry = new THREE.SphereGeometry(sphereRadius, 96, 96);

    const material = createLumiformMaterial(options.initialColor ?? DEFAULT_ALBEDO_HEX);

    // Sphere hierarchy: meshScaleGroup sits with its origin at ground level
    // (bottom-center of the sphere), so uniform scaling keeps the sphere grounded.
    this.meshScaleGroup = new THREE.Group();
    this.meshScaleGroup.position.y = -sphereRadius;
    this.targetMesh = new THREE.Mesh(this.sphereGeometry, material);
    this.targetMesh.position.y = sphereRadius;
    this.meshScaleGroup.add(this.targetMesh);
    this.scene.add(this.meshScaleGroup);

    // 8. Lighting Engine & Sun Indicator (Only the glowing sun itself, NO lines/rings)
    this.lightingEngine = new LightingEngine();
    this.lightingEngine.bindUniforms(
      material.uniforms as LumiformShaderUniforms,
      skyMaterial.uniforms as SkyShaderUniforms,
      groundMaterial.uniforms as GroundShaderUniforms
    );
    // The sun marker is intentionally not added to the scene: light direction is
    // controlled from the panel sliders/presets only.

    this.lightingEngine.onEnvironmentChange(() => {
      this.colorPickerTarget?.scheduleResample();
    });

    // 9. Persistent Draggable Color Picker Puck
    this.colorPickerTarget = new ColorPickerTarget({
      container: this.container,
      renderer: this.renderer,
      initialNormX: 0.44,
      initialNormY: 0.44,
      onSample: (rgb, hex) => {
        this.sampleListeners.forEach((cb) => cb(rgb, hex));
      },
    });

    // 10. Camera zoom (wheel only; canvas dragging never orbits or rotates anything)
    this.bindZoom(canvas);

    // 11. Resize Handling
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    // 12. Start Render Loop
    this.animate = this.animate.bind(this);
    this.startLoop();

    this.updateMeshGroundUniforms();

    // Initial resample once rendered
    requestAnimationFrame(() => {
      this.colorPickerTarget.resampleImmediate();
    });
  }

  /** Uniformly scales the sphere while keeping its bottom centered on the ground. */
  public setMeshScale(scale: number): void {
    this.meshScale = Math.max(0.2, Math.min(1.0, scale));
    this.meshScaleGroup.scale.setScalar(this.meshScale);
    this.updateMeshGroundUniforms();

    // Keep the shrunken object framed instead of letting it sink to the bottom of the canvas.
    this.orbitCamera.setTargetY(this.meshScaleGroup.position.y + this.sphereRadius * this.meshScale);
    this.colorPickerTarget.scheduleResample();
  }

  public getMeshScale(): number {
    return this.meshScale;
  }

  /** Keeps shader bounds (radial normal origin, shadows, contact AO) aligned with the scaled sphere. */
  private updateMeshGroundUniforms(): void {
    if (!this.groundMesh || !this.targetMesh) return;
    const groundUniforms = this.groundMesh.material.uniforms as GroundShaderUniforms;
    const meshUniforms = this.targetMesh.material.uniforms as LumiformShaderUniforms;
    const center = this.targetMesh.getWorldPosition(new THREE.Vector3());

    // The sphere's radial normal must be measured from the actual (moved) sphere center.
    meshUniforms.uSphereCenter.value.copy(center);

    groundUniforms.uSphereCenter.value.copy(center);
    groundUniforms.uSphereRadius.value = this.sphereRadius * this.meshScale;
    groundUniforms.uMeshScale.value = this.meshScale;
  }

  private bindZoom(canvas: HTMLCanvasElement): void {
    // Wheel zoom (the only camera control; dragging never orbits the scene).
    canvas.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault();
        const factor = Math.exp(e.deltaY * 0.0012);
        this.orbitCamera.zoomBy(factor);
        this.colorPickerTarget.scheduleResample();
      },
      { passive: false }
    );
  }

  private handleResize(): void {
    if (this.isDisposed) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.colorPickerTarget.updatePositionDOM();
    this.colorPickerTarget.scheduleResample();
  }

  private startLoop(): void {
    if (this.animationFrameId === null && !this.isDisposed) {
      this.animationFrameId = requestAnimationFrame(this.animate);
    }
  }

  private animate(): void {
    if (this.isDisposed) return;
    this.renderer.render(this.scene, this.camera);
    this.animationFrameId = requestAnimationFrame(this.animate);
  }

  public setSphereColor(colorHex: string | number | THREE.Color): void {
    const col = colorHex instanceof THREE.Color ? colorHex : new THREE.Color(colorHex);
    const uniforms = this.targetMesh.material.uniforms as LumiformShaderUniforms;
    uniforms.uAlbedo.value.copy(col);

    // Update ground color bleeding uniform
    const groundUniforms = this.groundMesh.material.uniforms as GroundShaderUniforms;
    groundUniforms.uSphereAlbedo.value.copy(col);

    this.colorPickerTarget.scheduleResample();
  }

  public setSurfaceFinish(finish: SurfaceFinish): void {
    if (finish !== 'custom' && finish in SURFACE_FINISHES) {
      const config = SURFACE_FINISHES[finish as Exclude<SurfaceFinish, 'custom'>];
      this.currentFinish = finish;
      this.currentRoughness = config.roughness;
      this.currentSpecular = config.specularIntensity;

      const uniforms = this.targetMesh.material.uniforms as LumiformShaderUniforms;
      uniforms.uRoughness.value = this.currentRoughness;
      uniforms.uSpecularIntensity.value = this.currentSpecular;

      this.finishListeners.forEach((cb) => cb(this.currentFinish, this.currentRoughness, this.currentSpecular));
      this.colorPickerTarget.scheduleResample();
    }
  }

  public setRoughnessAndSpecular(roughness: number, specular: number): void {
    this.currentRoughness = Math.max(0, Math.min(1, roughness));
    this.currentSpecular = Math.max(0, Math.min(1, specular));

    if (Math.abs(this.currentRoughness - 1.0) < 0.01 && this.currentSpecular < 0.01) {
      this.currentFinish = 'matte';
    } else if (Math.abs(this.currentRoughness - 0.45) < 0.02 && Math.abs(this.currentSpecular - 0.4) < 0.02) {
      this.currentFinish = 'satin';
    } else if (Math.abs(this.currentRoughness - 0.08) < 0.02 && Math.abs(this.currentSpecular - 0.95) < 0.02) {
      this.currentFinish = 'glossy';
    } else {
      this.currentFinish = 'custom';
    }

    const uniforms = this.targetMesh.material.uniforms as LumiformShaderUniforms;
    uniforms.uRoughness.value = this.currentRoughness;
    uniforms.uSpecularIntensity.value = this.currentSpecular;

    this.finishListeners.forEach((cb) => cb(this.currentFinish, this.currentRoughness, this.currentSpecular));
    this.colorPickerTarget.scheduleResample();
  }

  public getSurfaceFinish(): SurfaceFinish {
    return this.currentFinish;
  }

  public getRoughness(): number {
    return this.currentRoughness;
  }

  public getSpecular(): number {
    return this.currentSpecular;
  }

  public onSurfaceFinishChange(callback: (finish: SurfaceFinish, roughness: number, specular: number) => void): () => void {
    this.finishListeners.add(callback);
    callback(this.currentFinish, this.currentRoughness, this.currentSpecular);
    return () => {
      this.finishListeners.delete(callback);
    };
  }

  public onColorSample(callback: (rgb: RGBColor, hex: string) => void): () => void {
    this.sampleListeners.add(callback);
    return () => {
      this.sampleListeners.delete(callback);
    };
  }

  public getColorPickerTarget(): ColorPickerTarget {
    return this.colorPickerTarget;
  }

  public setPreset(preset: LightingPreset): void {
    this.lightingEngine.setPreset(preset);
    this.colorPickerTarget.scheduleResample();
  }

  public setLightAngles(azimuth: number, elevation: number): void {
    this.lightingEngine.setLightAngles(azimuth, elevation);
    this.colorPickerTarget.scheduleResample();
  }

  public setLightColor(colorHex: string | number | THREE.Color): void {
    const col = colorHex instanceof THREE.Color ? colorHex : new THREE.Color(colorHex);
    this.lightingEngine.setKeyLightColor(col);
    this.colorPickerTarget.scheduleResample();
  }

  public setGroundColor(colorHex: string | number | THREE.Color): void {
    const col = colorHex instanceof THREE.Color ? colorHex : new THREE.Color(colorHex);
    const groundUniforms = this.groundMesh.material.uniforms as GroundShaderUniforms;
    groundUniforms.uGroundAlbedo.value.copy(col);
    this.lightingEngine.setGroundColor(col);
    this.colorPickerTarget.scheduleResample();
  }

  public getLightingEngine(): LightingEngine {
    return this.lightingEngine;
  }

  public getCanvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  public dispose(): void {
    this.isDisposed = true;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.resizeObserver.disconnect();
    this.skyGeometry.dispose();
    this.skyMesh.material.dispose();
    this.groundGeometry.dispose();
    this.groundMesh.material.dispose();
    this.sphereGeometry.dispose();
    this.targetMesh.material.dispose();
    this.lightingEngine.dispose();
    this.colorPickerTarget.dispose();
    this.renderer.dispose();
  }
}
