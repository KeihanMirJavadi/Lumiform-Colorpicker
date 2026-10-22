import * as THREE from 'three';
import { OrbitCamera } from './OrbitCamera';
import { LightingEngine } from './LightingEngine';
import { ColorPickerTarget } from './ColorPickerTarget';
import { createLumiformMaterial, LumiformShaderUniforms } from './shaders/lumiformShader';
import { createSkyDomeMaterial, SkyShaderUniforms } from './shaders/skyShader';
import { createGroundMaterial, GroundShaderUniforms } from './shaders/groundShader';
import { LightingPreset, SurfaceFinish, RGBColor } from '../core/types';
import { SURFACE_FINISHES } from '../core/material';

export type MeshGeometryType = 'sphere' | 'cube';

export interface ViewportOptions {
  container: HTMLElement;
  sphereRadius?: number;
  initialColor?: string | number;
  initialMeshType?: MeshGeometryType;
}

export class Viewport {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private orbitCamera: OrbitCamera;
  private lightingEngine: LightingEngine;
  private colorPickerTarget: ColorPickerTarget;

  // 3D Object Mesh & Group (allows isolated local object rotation)
  private meshGroup: THREE.Group;
  private targetMesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private sphereGeometry: THREE.SphereGeometry;
  private cubeGeometry: THREE.BoxGeometry;
  private currentMeshType: MeshGeometryType = 'sphere';

  // Environment: Dynamic 3-Tone Sky Dome & Ground Plane with Drop Shadow
  private skyGeometry: THREE.SphereGeometry;
  private skyMesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private groundGeometry: THREE.PlaneGeometry;
  private groundMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  private raycaster: THREE.Raycaster;
  private pointer: THREE.Vector2;
  private resizeObserver: ResizeObserver;
  private animationFrameId: number | null = null;
  private isDisposed = false;

  // Interaction tracking (Sun drag, Mesh rotation, Camera orbit)
  private interactionMode: 'none' | 'orbit-camera' | 'orbit-light' | 'rotate-mesh' = 'none';
  private previousPointerPos = { x: 0, y: 0 };
  private currentFinish: SurfaceFinish = 'satin';
  private currentRoughness = 0.45;
  private currentSpecular = 0.4;

  private finishListeners: Set<(finish: SurfaceFinish, roughness: number, specular: number) => void> = new Set();
  private sampleListeners: Set<(rgb: RGBColor, hex: string) => void> = new Set();
  private meshTypeListeners: Set<(type: MeshGeometryType) => void> = new Set();

  constructor(options: ViewportOptions) {
    this.container = options.container;

    // 1. Three.js Scene Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x181818);

    // 2. Perspective Camera
    const aspect = (this.container.clientWidth || 300) / (this.container.clientHeight || 300);
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    this.camera.position.set(0, 0.4, 4.3);

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

    // 4. Camera Orbit Controls (for background dragging)
    this.orbitCamera = new OrbitCamera(this.camera, {
      radius: 4.3,
      rotateSpeed: 0.006,
    });

    // 5. Dynamic 3-Tone Sky Dome (Zenith, Equator, Horizon)
    this.skyGeometry = new THREE.SphereGeometry(45, 36, 24);
    const skyMaterial = createSkyDomeMaterial();
    this.skyMesh = new THREE.Mesh(this.skyGeometry, skyMaterial);
    this.skyMesh.renderOrder = -1;
    this.scene.add(this.skyMesh);

    // 6. Ground Plane with Physical Sphere Drop Shadow & Ambient Color Bleed
    const sphereRadius = options.sphereRadius ?? 1.25;
    this.groundGeometry = new THREE.PlaneGeometry(18, 18, 32, 32);
    const groundMaterial = createGroundMaterial();
    this.groundMesh = new THREE.Mesh(this.groundGeometry, groundMaterial);
    this.groundMesh.position.set(0, -sphereRadius, 0);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.scene.add(this.groundMesh);

    // 7. High-Resolution Geometries (Sphere and Cube)
    this.sphereGeometry = new THREE.SphereGeometry(sphereRadius, 96, 96);
    this.cubeGeometry = new THREE.BoxGeometry(1.8, 1.8, 1.8);

    const material = createLumiformMaterial(options.initialColor ?? 0xEB5757);

    // Mesh Group allows local rotation completely independent from light and camera
    this.meshGroup = new THREE.Group();
    this.targetMesh = new THREE.Mesh(this.sphereGeometry, material);
    this.meshGroup.add(this.targetMesh);
    this.scene.add(this.meshGroup);

    // 8. Lighting Engine & Sun Indicator (Only the glowing sun itself, NO lines/rings)
    this.lightingEngine = new LightingEngine();
    this.lightingEngine.bindUniforms(
      material.uniforms as LumiformShaderUniforms,
      skyMaterial.uniforms as SkyShaderUniforms,
      groundMaterial.uniforms as GroundShaderUniforms
    );
    this.scene.add(this.lightingEngine.getSunIndicator().group);

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

    // 10. Raycasting & Pointer Events
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.bindPointerEvents(canvas);

    // 11. Resize Handling
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    // 12. Start Render Loop
    this.animate = this.animate.bind(this);
    this.startLoop();

    // Initial resample once rendered
    requestAnimationFrame(() => {
      this.colorPickerTarget.resampleImmediate();
    });
  }

  public setMeshType(type: MeshGeometryType): void {
    this.currentMeshType = type;
    if (type === 'cube') {
      this.targetMesh.geometry = this.cubeGeometry;
    } else {
      this.targetMesh.geometry = this.sphereGeometry;
    }
    this.meshTypeListeners.forEach((cb) => cb(type));
    this.colorPickerTarget.scheduleResample();
  }

  public resetMeshRotation(): void {
    this.meshGroup.rotation.set(0, 0, 0);
    this.colorPickerTarget.scheduleResample();
  }

  public getMeshType(): MeshGeometryType {
    return this.currentMeshType;
  }

  public onMeshTypeChange(callback: (type: MeshGeometryType) => void): () => void {
    this.meshTypeListeners.add(callback);
    callback(this.currentMeshType);
    return () => {
      this.meshTypeListeners.delete(callback);
    };
  }

  private bindPointerEvents(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      this.updatePointerCoordinates(e);
      this.previousPointerPos = { x: e.clientX, y: e.clientY };

      this.raycaster.setFromCamera(this.pointer, this.camera);

      // 1. Check Sun Handle hit (direct drag on the 3D Sun)
      const sunHits = this.raycaster.intersectObjects(this.lightingEngine.getSunIndicator().getHitObjects(), true);
      if (sunHits.length > 0) {
        this.interactionMode = 'orbit-light';
        canvas.style.cursor = 'crosshair';
        this.lightingEngine.getSunIndicator().onPointerDown(e.clientX, e.clientY);
        return;
      }

      // 2. Check 3D Mesh hit (Isolated 3D Object Rotation)
      const meshHits = this.raycaster.intersectObject(this.targetMesh);
      if (meshHits.length > 0 && !e.altKey) {
        this.interactionMode = 'rotate-mesh';
        canvas.style.cursor = 'grabbing';
        return;
      }

      // 3. Otherwise: Camera Orbit around the scene
      this.interactionMode = 'orbit-camera';
      canvas.style.cursor = 'grabbing';
      this.orbitCamera.onPointerDown(e.clientX, e.clientY);
    });

    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (this.interactionMode === 'orbit-light') {
        this.lightingEngine.getSunIndicator().onPointerMove(e.clientX, e.clientY);
        this.colorPickerTarget.scheduleResample();
        return;
      }

      if (this.interactionMode === 'rotate-mesh') {
        const deltaX = e.clientX - this.previousPointerPos.x;
        const deltaY = e.clientY - this.previousPointerPos.y;
        this.previousPointerPos = { x: e.clientX, y: e.clientY };

        // Rotate only the 3D mesh locally (decoupled from scene and camera)
        this.meshGroup.rotation.y += deltaX * 0.008;
        this.meshGroup.rotation.x += deltaY * 0.008;

        this.colorPickerTarget.scheduleResample();
        return;
      }

      if (this.interactionMode === 'orbit-camera') {
        this.orbitCamera.onPointerMove(e.clientX, e.clientY);
        this.colorPickerTarget.scheduleResample();
        return;
      }

      // Hover feedback when not dragging
      this.updatePointerCoordinates(e);
      this.raycaster.setFromCamera(this.pointer, this.camera);

      const sunHits = this.raycaster.intersectObjects(this.lightingEngine.getSunIndicator().getHitObjects(), true);
      if (sunHits.length > 0) {
        canvas.style.cursor = 'pointer';
        return;
      }

      const meshHits = this.raycaster.intersectObject(this.targetMesh);
      if (meshHits.length > 0) {
        canvas.style.cursor = 'grab';
      } else {
        canvas.style.cursor = 'default';
      }
    });

    const endPointerAction = (e: PointerEvent) => {
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }

      if (this.interactionMode === 'orbit-light') {
        this.lightingEngine.getSunIndicator().onPointerUp();
      } else if (this.interactionMode === 'orbit-camera') {
        this.orbitCamera.onPointerUp();
      }

      this.interactionMode = 'none';
      canvas.style.cursor = 'grab';
    };

    canvas.addEventListener('pointerup', endPointerAction);
    canvas.addEventListener('pointercancel', endPointerAction);
  }

  private updatePointerCoordinates(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
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
    this.cubeGeometry.dispose();
    this.targetMesh.material.dispose();
    this.lightingEngine.dispose();
    this.colorPickerTarget.dispose();
    this.renderer.dispose();
  }
}
