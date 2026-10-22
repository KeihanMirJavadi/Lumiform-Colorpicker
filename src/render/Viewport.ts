import * as THREE from 'three';
import { OrbitCamera } from './OrbitCamera';
import { LightingEngine } from './LightingEngine';
import { createLumiformMaterial, LumiformShaderUniforms } from './shaders/lumiformShader';
import { LightingPreset, SurfaceFinish } from '../core/types';
import { SURFACE_FINISHES } from '../core/material';

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
  private sphereMesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private raycaster: THREE.Raycaster;
  private pointer: THREE.Vector2;
  private resizeObserver: ResizeObserver;
  private animationFrameId: number | null = null;
  private isDisposed = false;

  // Interaction mode tracking
  private interactionMode: 'none' | 'orbit-camera' | 'orbit-light' | 'sphere' = 'none';
  private currentFinish: SurfaceFinish = 'satin';
  private finishListeners: Set<(finish: SurfaceFinish) => void> = new Set();

  constructor(options: ViewportOptions) {
    this.container = options.container;

    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x181818); // Match Photoshop dark canvas

    // 2. Camera setup
    const aspect = (this.container.clientWidth || 300) / (this.container.clientHeight || 300);
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    this.camera.position.set(0, 0, 4.2);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true, // Needed for eyedropper sampling
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

    // 4. Orbit Camera Controls
    this.orbitCamera = new OrbitCamera(this.camera, {
      radius: 4.2,
      rotateSpeed: 0.006,
    });

    // 5. High-Resolution Sphere Mesh with Custom 3-Zone Lumiform Shader
    const sphereRadius = options.sphereRadius ?? 1.25;
    const geometry = new THREE.SphereGeometry(sphereRadius, 96, 96);
    const material = createLumiformMaterial(options.initialColor ?? 0xEB5757);
    this.sphereMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.sphereMesh);

    // 6. Lighting Engine & Orbit Gizmo
    this.lightingEngine = new LightingEngine();
    this.lightingEngine.bindUniforms(material.uniforms as LumiformShaderUniforms);
    this.scene.add(this.lightingEngine.getGizmo().group);

    // 7. Raycasting & Pointer Setup
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.bindPointerEvents(canvas);

    // 8. Responsive Resize Handling
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    // 9. Start Rendering Loop
    this.animate = this.animate.bind(this);
    this.startLoop();
  }

  private bindPointerEvents(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      this.updatePointerCoordinates(e);

      this.raycaster.setFromCamera(this.pointer, this.camera);

      // Check gizmo handles first (sun marker or orbit ring)
      const gizmoObjects = this.lightingEngine.getGizmo().getSunObjects();
      const gizmoHits = this.raycaster.intersectObjects(gizmoObjects, true);

      if (gizmoHits.length > 0) {
        this.interactionMode = 'orbit-light';
        canvas.style.cursor = 'crosshair';
        this.lightingEngine.getGizmo().onPointerDown(e.clientX, e.clientY);
        return;
      }

      // Check sphere
      const sphereHits = this.raycaster.intersectObject(this.sphereMesh);
      if (sphereHits.length > 0 && !e.altKey) {
        this.interactionMode = 'sphere';
        canvas.style.cursor = 'crosshair';
        return;
      }

      // Otherwise: Camera orbit
      this.interactionMode = 'orbit-camera';
      canvas.style.cursor = 'grabbing';
      this.orbitCamera.onPointerDown(e.clientX, e.clientY);
    });

    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (this.interactionMode === 'orbit-light') {
        this.lightingEngine.getGizmo().onPointerMove(e.clientX, e.clientY);
        return;
      }

      if (this.interactionMode === 'orbit-camera') {
        this.orbitCamera.onPointerMove(e.clientX, e.clientY);
        return;
      }

      // Hover feedback when not dragging
      this.updatePointerCoordinates(e);
      this.raycaster.setFromCamera(this.pointer, this.camera);

      const gizmoObjects = this.lightingEngine.getGizmo().getSunObjects();
      const gizmoHits = this.raycaster.intersectObjects(gizmoObjects, true);
      if (gizmoHits.length > 0) {
        canvas.style.cursor = 'pointer';
        return;
      }

      const sphereHits = this.raycaster.intersectObject(this.sphereMesh);
      if (sphereHits.length > 0) {
        canvas.style.cursor = 'crosshair';
      } else {
        canvas.style.cursor = 'grab';
      }
    });

    const endPointerAction = (e: PointerEvent) => {
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }

      if (this.interactionMode === 'orbit-light') {
        this.lightingEngine.getGizmo().onPointerUp();
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
    const uniforms = this.sphereMesh.material.uniforms as LumiformShaderUniforms;
    uniforms.uAlbedo.value.copy(col);
  }

  public setSurfaceFinish(finish: SurfaceFinish): void {
    this.currentFinish = finish;
    const config = SURFACE_FINISHES[finish];
    const uniforms = this.sphereMesh.material.uniforms as LumiformShaderUniforms;
    uniforms.uRoughness.value = config.roughness;
    uniforms.uSpecularIntensity.value = config.specularIntensity;
    this.finishListeners.forEach((cb) => cb(finish));
  }

  public getSurfaceFinish(): SurfaceFinish {
    return this.currentFinish;
  }

  public onSurfaceFinishChange(callback: (finish: SurfaceFinish) => void): () => void {
    this.finishListeners.add(callback);
    callback(this.currentFinish);
    return () => {
      this.finishListeners.delete(callback);
    };
  }

  public setPreset(preset: LightingPreset): void {
    this.lightingEngine.setPreset(preset);
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
    this.sphereMesh.geometry.dispose();
    this.sphereMesh.material.dispose();
    this.lightingEngine.dispose();
    this.renderer.dispose();
  }
}
