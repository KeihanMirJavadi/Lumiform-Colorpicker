import * as THREE from 'three';
import { LightingEngine } from './LightingEngine';
import { ColorPickerTarget } from './ColorPickerTarget';
import { createLumiformMaterial, LumiformShaderUniforms } from './shaders/lumiformShader';
import { createSkyDomeMaterial, SkyShaderUniforms } from './shaders/skyShader';
import { createGroundMaterial, GroundShaderUniforms } from './shaders/groundShader';
import { LightingPreset, SurfaceFinish, RGBColor } from '../core/types';
import { effectiveHaze } from '../core/atmosphere';
import { SURFACE_FINISHES } from '../core/material';
import { DEFAULT_ALBEDO_HEX, DEFAULT_SURFACE_FINISH } from '../core/defaults';
import { FRAMING, REFERENCE_ASPECT, verticalFovRad } from '../core/framing';
import {
  BASE_SPHERE_RADIUS,
  GROUND_Y,
  SPHERE_SLOTS,
  SphereSlotConfig,
  SphereSlotId,
} from '../core/sphereSlots';

export interface ViewportOptions {
  container: HTMLElement;
  initialColor?: string | number;
}

interface SphereRuntime {
  config: SphereSlotConfig;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  material: THREE.ShaderMaterial;
  albedoHex: string;
  size: number;
  active: boolean;
}

export class Viewport {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private lightingEngine: LightingEngine;
  private colorPickerTarget: ColorPickerTarget;

  private spheres: SphereRuntime[] = [];
  private selectedId: SphereSlotId = 'center';
  private linkedColors = false;
  private haze = 0.5;

  private sphereGeometry: THREE.SphereGeometry;
  private selectionFlash: THREE.Sprite;
  private flashStart = 0;

  private skyGeometry: THREE.SphereGeometry;
  private skyMesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private groundGeometry: THREE.PlaneGeometry;
  private groundMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  private resizeObserver: ResizeObserver;
  private animationFrameId: number | null = null;
  private isDisposed = false;

  private currentFinish: SurfaceFinish = DEFAULT_SURFACE_FINISH;
  // Seed roughness/specular from the default finish so the first frame already
  // matches the selected material instead of falling back to matte.
  private currentRoughness =
    DEFAULT_SURFACE_FINISH === 'custom'
      ? 1.0
      : SURFACE_FINISHES[DEFAULT_SURFACE_FINISH].roughness;
  private currentSpecular =
    DEFAULT_SURFACE_FINISH === 'custom'
      ? 0.0
      : SURFACE_FINISHES[DEFAULT_SURFACE_FINISH].specularIntensity;

  private finishListeners: Set<(finish: SurfaceFinish, roughness: number, specular: number) => void> = new Set();
  private sampleListeners: Set<(rgb: RGBColor, hex: string) => void> = new Set();
  private selectionListeners: Set<(id: SphereSlotId) => void> = new Set();

  constructor(options: ViewportOptions) {
    this.container = options.container;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x181818);

    // 2. Camera — fixed reference framing (see core/framing.ts). The camera
    //    never moves; time-of-day and material changes only touch the shaders.
    const aspect =
      this.container.clientWidth > 0 && this.container.clientHeight > 0
        ? this.container.clientWidth / this.container.clientHeight
        : REFERENCE_ASPECT;
    this.camera = new THREE.PerspectiveCamera(
      THREE.MathUtils.radToDeg(verticalFovRad(aspect)),
      aspect,
      0.1,
      600
    );
    this.camera.position.set(0, FRAMING.cameraY, FRAMING.cameraZ);
    this.camera.lookAt(0, 0, 0);
    // The eye line is the horizon. Tilt up so it lands on the reference's
    // 55.1% instead of dead centre. The camera never moves after this.
    this.camera.rotateX(FRAMING.pitchRad);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.container.clientWidth || 300, this.container.clientHeight || 165);

    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'default';

    this.container.innerHTML = '';
    this.container.appendChild(canvas);

    // 4. Sky dome. It must enclose the far sphere slot (the farthest geometry
    //    in the scene), otherwise the sky would be occluded by its own shell.
    this.skyGeometry = new THREE.SphereGeometry(300, 36, 24);
    const skyMaterial = createSkyDomeMaterial();
    this.skyMesh = new THREE.Mesh(this.skyGeometry, skyMaterial);
    this.skyMesh.renderOrder = -1;
    this.scene.add(this.skyMesh);

    // 5. Ground plane. Its far edge must reach the eye line (see framing.ts),
    //    otherwise the visible horizon sits below the true horizon.
    this.groundGeometry = new THREE.PlaneGeometry(1600, 1600, 1, 1);
    const groundMaterial = createGroundMaterial();
    this.groundMesh = new THREE.Mesh(this.groundGeometry, groundMaterial);
    this.groundMesh.position.set(0, GROUND_Y, 0);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.scene.add(this.groundMesh);

    // 6. Three spheres in fixed depth slots
    this.sphereGeometry = new THREE.SphereGeometry(BASE_SPHERE_RADIUS, 96, 96);
    const initialHex = options.initialColor !== undefined ? `#${new THREE.Color(options.initialColor).getHexString()}` : DEFAULT_ALBEDO_HEX;

    for (const config of SPHERE_SLOTS) {
      const material = createLumiformMaterial(initialHex);
      const mesh = new THREE.Mesh(this.sphereGeometry, material);
      mesh.position.set(config.position.x, GROUND_Y + BASE_SPHERE_RADIUS, config.position.z);
      mesh.scale.setScalar(1);
      mesh.userData.slotId = config.id;
      this.scene.add(mesh);

      this.spheres.push({
        config,
        mesh,
        material,
        albedoHex: initialHex,
        size: 1,
        active: true,
      });
    }

    // 7. Lighting engine — bind every sphere material
    this.lightingEngine = new LightingEngine();
    this.haze = this.lightingEngine.getEnvironment().hazePreset;
    this.lightingEngine.bindUniforms(
      this.spheres.map((s) => s.material.uniforms as LumiformShaderUniforms),
      skyMaterial.uniforms as SkyShaderUniforms,
      groundMaterial.uniforms as GroundShaderUniforms
    );

    this.lightingEngine.onEnvironmentChange(() => {
      this.syncAtmosphereUniforms();
      this.colorPickerTarget?.scheduleResample();
    });

    // 8. Eyedropper puck
    this.colorPickerTarget = new ColorPickerTarget({
      container: this.container,
      renderer: this.renderer,
      initialNormX: 0.44,
      initialNormY: 0.44,
      onSample: (rgb, hex) => {
        this.sampleListeners.forEach((cb) => cb(rgb, hex));
      },
    });

    // 9. Transient selection ring
    this.selectionFlash = this.createSelectionFlash();
    this.scene.add(this.selectionFlash);

    // 10. Input: sphere selection. The camera is fixed; the wheel is swallowed
    //     so the viewport never zooms or scrolls under the pointer.
    canvas.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });
    this.bindSphereSelection(canvas);

    // 11. Resize + render loop
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    this.animate = this.animate.bind(this);
    this.startLoop();

    this.syncSphereUniforms();

    requestAnimationFrame(() => {
      this.colorPickerTarget.resampleImmediate();
    });
  }

  // --- Public API -----------------------------------------------------------

  public onColorSample(callback: (rgb: RGBColor, hex: string) => void): () => void {
    this.sampleListeners.add(callback);
    return () => this.sampleListeners.delete(callback);
  }

  public onSelectionChange(callback: (id: SphereSlotId) => void): () => void {
    this.selectionListeners.add(callback);
    return () => this.selectionListeners.delete(callback);
  }

  public getSelectedSphereId(): SphereSlotId {
    return this.selectedId;
  }

  public getSelectedSphereColor(): string {
    return this.getSphere(this.selectedId).albedoHex;
  }

  public getSelectedSphereSize(): number {
    return this.getSphere(this.selectedId).size;
  }

  public getSelectedSphereDistance(): number {
    return this.camera.position.distanceTo(this.getSphere(this.selectedId).mesh.position);
  }

  public isSphereActive(id: SphereSlotId): boolean {
    return this.getSphere(id).active;
  }

  public getActiveCount(): number {
    return this.spheres.filter((s) => s.active).length;
  }

  public selectSphere(id: SphereSlotId): void {
    const sphere = this.getSphere(id);
    if (!sphere.active) return;

    this.selectedId = id;
    this.startSelectionFlash();
    this.selectionListeners.forEach((cb) => cb(id));
    this.colorPickerTarget.scheduleResample();
  }

  /** Adds or removes spheres to reach the requested count. */
  public setSphereCount(count: number): void {
    const target = Math.max(1, Math.min(3, Math.round(count)));
    const center = this.getSphere('center');

    let active = this.getActiveCount();
    if (target > active) {
      // Fill nearest empty slots first: right, then left.
      for (const id of ['right', 'left'] as SphereSlotId[]) {
        if (active >= target) break;
        const sphere = this.getSphere(id);
        if (!sphere.active) {
          sphere.active = true;
          sphere.albedoHex = center.albedoHex;
          sphere.size = 1;
          active += 1;
        }
      }
    } else if (target < active) {
      // Count decrease removes the farthest visible sphere first: left, then right.
      for (const id of ['left', 'right'] as SphereSlotId[]) {
        if (active <= target) break;
        const sphere = this.getSphere(id);
        if (sphere.active) {
          sphere.active = false;
          active -= 1;
        }
      }
      if (!this.getSphere(this.selectedId).active) {
        this.selectedId = 'center';
        this.startSelectionFlash();
        this.selectionListeners.forEach((cb) => cb('center'));
      }
    }

    this.syncSphereUniforms();
  }

  /** Deletes the selected sphere (center is permanent). */
  public deleteSelectedSphere(): boolean {
    if (this.selectedId === 'center') return false;
    const sphere = this.getSphere(this.selectedId);
    sphere.active = false;
    this.selectedId = 'center';
    this.startSelectionFlash();
    this.selectionListeners.forEach((cb) => cb('center'));
    this.syncSphereUniforms();
    return true;
  }

  public setSphereColor(hex: string): void {
    const color = new THREE.Color(hex);
    const resolved = `#${color.getHexString()}`;

    if (this.linkedColors) {
      for (const sphere of this.spheres) {
        if (sphere.active) sphere.albedoHex = resolved;
      }
    } else {
      this.getSphere(this.selectedId).albedoHex = resolved;
    }

    this.syncSphereUniforms();
  }

  public setLinkedColors(linked: boolean): void {
    this.linkedColors = linked;
    if (linked) {
      const shared = this.getSphere(this.selectedId).albedoHex;
      for (const sphere of this.spheres) {
        if (sphere.active) sphere.albedoHex = shared;
      }
    }
    this.syncSphereUniforms();
  }

  public getLinkedColors(): boolean {
    return this.linkedColors;
  }

  public setSelectedSphereSize(size: number): void {
    this.getSphere(this.selectedId).size = Math.max(0.2, Math.min(1.0, size));
    this.syncSphereUniforms();
  }

  public getHaze(): number {
    return this.haze;
  }

  public setHaze(haze: number): void {
    this.haze = Math.max(0, Math.min(1, haze));
    // Haze is one of the six preset-owned lighting values; moving it detaches
    // the look from the time-of-day preset without touching the spheres.
    this.lightingEngine.markManualEdit();
    this.syncSphereUniforms();
  }

  public setPreset(preset: LightingPreset): void {
    this.lightingEngine.setPreset(preset);
    // The preset owns its haze amount. Keep the slider/render in sync here so
    // every caller of setPreset gets the same calibrated atmosphere.
    this.haze = this.lightingEngine.getEnvironment().hazePreset;
    this.syncSphereUniforms();
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

  /** Hardens or softens the terminator by changing the key light's angular size. */
  public setKeyAngularRadius(radians: number): void {
    this.lightingEngine.setKeyAngularRadius(radians);
    this.colorPickerTarget.scheduleResample();
  }

  public setGroundColor(colorHex: string | number | THREE.Color): void {
    const col = colorHex instanceof THREE.Color ? colorHex : new THREE.Color(colorHex);
    const groundUniforms = this.groundMesh.material.uniforms as GroundShaderUniforms;
    groundUniforms.uGroundAlbedo.value.copy(col);
    this.lightingEngine.setGroundColor(col);
    this.colorPickerTarget.scheduleResample();
  }

  public getGroundColor(): THREE.Color {
    return this.lightingEngine.getGroundColor();
  }

  public setSurfaceFinish(finish: SurfaceFinish): void {
    if (finish !== 'custom' && finish in SURFACE_FINISHES) {
      const config = SURFACE_FINISHES[finish as Exclude<SurfaceFinish, 'custom'>];
      this.currentFinish = finish;
      this.currentRoughness = config.roughness;
      this.currentSpecular = config.specularIntensity;
      this.syncSurfaceUniforms();
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

    this.syncSurfaceUniforms();
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
    return () => this.finishListeners.delete(callback);
  }

  public getLightingEngine(): LightingEngine {
    return this.lightingEngine;
  }

  public getCanvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  // --- Internals ------------------------------------------------------------

  private getSphere(id: SphereSlotId): SphereRuntime {
    const sphere = this.spheres.find((s) => s.config.id === id);
    if (!sphere) throw new Error(`Unknown sphere slot: ${id}`);
    return sphere;
  }

  private syncSurfaceUniforms(): void {
    for (const sphere of this.spheres) {
      const uniforms = sphere.material.uniforms as LumiformShaderUniforms;
      uniforms.uRoughness.value = this.currentRoughness;
      uniforms.uSpecularIntensity.value = this.currentSpecular;
    }
  }

  /** Pushes sphere state into mesh transforms, per-sphere materials, and the ground arrays. */
  private syncSphereUniforms(): void {
    const groundUniforms = this.groundMesh.material.uniforms as GroundShaderUniforms;

    this.spheres.forEach((sphere, index) => {
      const radius = BASE_SPHERE_RADIUS * sphere.size;
      sphere.mesh.visible = sphere.active;
      sphere.mesh.scale.setScalar(sphere.size);
      sphere.mesh.position.set(
        sphere.config.position.x,
        GROUND_Y + radius,
        sphere.config.position.z
      );

      const uniforms = sphere.material.uniforms as LumiformShaderUniforms;
      uniforms.uAlbedo.value.set(sphere.albedoHex);
      uniforms.uSphereCenter.value.copy(sphere.mesh.position);
      uniforms.uRoughness.value = this.currentRoughness;
      uniforms.uSpecularIntensity.value = this.currentSpecular;

      if (sphere.active) {
        groundUniforms.uSphereCenters.value[index].copy(sphere.mesh.position);
        groundUniforms.uSphereRadii.value[index] = radius;
        groundUniforms.uSphereAlbedos.value[index].set(sphere.albedoHex);
      } else {
        groundUniforms.uSphereRadii.value[index] = 0;
      }
    });

    this.syncAtmosphereUniforms();
    this.updateSelectionFlashTransform();
    this.colorPickerTarget.scheduleResample();
  }

  /**
   * Single place that maps the Haze slider and the phase's turbidity onto the
   * shader uniforms. The preset's own Haze value is the calibrated atmosphere;
   * below it fades to clear, above it reaches full fog. The horizon band widens
   * with haze, which is what makes the ground/sky seam dissolve in hazy phases.
   */
  private syncAtmosphereUniforms(): void {
    const env = this.lightingEngine.getEnvironment();
    const optical = effectiveHaze(this.haze, env.hazeStrength, env.hazePreset);
    const groundOptical = effectiveHaze(
      this.haze,
      env.groundHazeStrength,
      env.hazePreset
    );

    const preset = Math.max(0.01, Math.min(0.99, env.hazePreset));
    const t = Math.max(0, Math.min(1, this.haze / preset));
    const bandFactor =
      this.haze <= preset
        ? t * t * (3 - 2 * t)
        : 1 + ((this.haze - preset) / (1 - preset)) * 0.3;
    const band = env.horizonBand * bandFactor;

    for (const sphere of this.spheres) {
      const uniforms = sphere.material.uniforms as LumiformShaderUniforms;
      uniforms.uEffectiveHaze.value = optical;
      uniforms.uHorizonHaze.value.copy(env.horizonHaze);
      uniforms.uHorizonBand.value = band;
      uniforms.uGroundHaze.value.copy(env.groundHaze);
    }

    const groundUniforms = this.groundMesh.material.uniforms as GroundShaderUniforms;
    groundUniforms.uGroundEffectiveHaze.value = groundOptical;
    groundUniforms.uGroundHaze.value.copy(env.groundHaze);

    const skyUniforms = this.skyMesh.material.uniforms as SkyShaderUniforms;
    skyUniforms.uHorizonHaze.value.copy(env.horizonHaze);
    skyUniforms.uHorizonBand.value = band;
    skyUniforms.uGroundHaze.value.copy(env.groundHaze);
  }

  private createSelectionFlash(): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 128, 128);
      ctx.beginPath();
      ctx.arc(64, 64, 51, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 5;
      ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
      ctx.shadowBlur = 14;
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.renderOrder = 50;
    return sprite;
  }

  private startSelectionFlash(): void {
    this.selectionFlash.visible = true;
    (this.selectionFlash.material as THREE.SpriteMaterial).opacity = 1;
    this.flashStart = performance.now();
    this.updateSelectionFlashTransform();
  }

  private updateSelectionFlashTransform(): void {
    const sphere = this.spheres.find((s) => s.config.id === this.selectedId);
    if (!sphere || !sphere.active) {
      this.selectionFlash.visible = false;
      return;
    }
    this.selectionFlash.position.copy(sphere.mesh.position);
    const ringSize = BASE_SPHERE_RADIUS * sphere.size * 2.7;
    this.selectionFlash.scale.set(ringSize, ringSize, 1);
  }

  private bindSphereSelection(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);

      const activeMeshes = this.spheres.filter((s) => s.active).map((s) => s.mesh);
      const hits = this.raycaster.intersectObjects(activeMeshes, false);
      if (hits.length > 0) {
        const id = hits[0].object.userData.slotId as SphereSlotId;
        this.selectSphere(id);
      }
    });
  }

  private handleResize(): void {
    if (this.isDisposed) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    // Keep the horizontal FOV fixed (the reference lens) instead of the vertical.
    this.camera.fov = THREE.MathUtils.radToDeg(verticalFovRad(this.camera.aspect));
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

    // Transient selection ring: full opacity on selection, fades out over ~1s.
    const flashMaterial = this.selectionFlash.material as THREE.SpriteMaterial;
    if (this.selectionFlash.visible) {
      const elapsed = (performance.now() - this.flashStart) / 1000;
      flashMaterial.opacity = Math.max(0, 1 - elapsed);
      if (flashMaterial.opacity <= 0.001) {
        flashMaterial.opacity = 0;
        this.selectionFlash.visible = false;
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.animationFrameId = requestAnimationFrame(this.animate);
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
    for (const sphere of this.spheres) {
      sphere.material.dispose();
    }
    (this.selectionFlash.material as THREE.SpriteMaterial).map?.dispose();
    (this.selectionFlash.material as THREE.SpriteMaterial).dispose();
    this.lightingEngine.dispose();
    this.colorPickerTarget.dispose();
    this.renderer.dispose();
  }
}
