import * as THREE from 'three';
import { OrbitCamera } from './OrbitCamera';

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
  private sphereMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private raycaster: THREE.Raycaster;
  private pointer: THREE.Vector2;
  private resizeObserver: ResizeObserver;
  private animationFrameId: number | null = null;
  private isDisposed = false;

  // Interaction mode tracking
  private isOrbiting = false;

  constructor(options: ViewportOptions) {
    this.container = options.container;

    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x181818); // Match Photoshop dark background

    // 2. Camera setup
    const aspect = (this.container.clientWidth || 300) / (this.container.clientHeight || 300);
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    this.camera.position.set(0, 0, 4.2);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true, // Needed for eyedropper sampling in Task 1.6
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.container.clientWidth || 300, this.container.clientHeight || 300);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none'; // Prevent browser gestures
    canvas.style.cursor = 'grab';

    // Clear placeholder and append canvas
    this.container.innerHTML = '';
    this.container.appendChild(canvas);

    // 4. Orbit Camera Controls
    this.orbitCamera = new OrbitCamera(this.camera, {
      radius: 4.2,
      rotateSpeed: 0.006,
    });

    // 5. High-Resolution Sphere Mesh
    const sphereRadius = options.sphereRadius ?? 1.25;
    const geometry = new THREE.SphereGeometry(sphereRadius, 96, 96);
    const material = new THREE.MeshStandardMaterial({
      color: options.initialColor ?? 0xEB5757,
      roughness: 0.35,
      metalness: 0.0,
    });
    this.sphereMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.sphereMesh);

    // 6. Preliminary Stage 1.2 Lighting
    const keyLight = new THREE.DirectionalLight(0xfff4e5, 2.5); // Warm key sunlight
    keyLight.position.set(2.5, 3.5, 3.0);
    this.scene.add(keyLight);

    const skyAmbient = new THREE.HemisphereLight(0x7395c7, 0x473024, 0.9); // Cool sky + warm ground bounce
    this.scene.add(skyAmbient);

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
      const intersects = this.raycaster.intersectObject(this.sphereMesh);

      // If user clicks on background or holds Alt/Option, orbit camera
      if (intersects.length === 0 || e.altKey) {
        this.isOrbiting = true;
        canvas.style.cursor = 'grabbing';
        this.orbitCamera.onPointerDown(e.clientX, e.clientY);
      } else {
        // Pointer is on the sphere (ready for Task 1.6 Eyedropper)
        canvas.style.cursor = 'crosshair';
      }
    });

    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (this.isOrbiting) {
        this.orbitCamera.onPointerMove(e.clientX, e.clientY);
        return;
      }

      this.updatePointerCoordinates(e);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const intersects = this.raycaster.intersectObject(this.sphereMesh);

      if (intersects.length > 0) {
        canvas.style.cursor = 'crosshair';
      } else {
        canvas.style.cursor = 'grab';
      }
    });

    const endPointerAction = (e: PointerEvent) => {
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      if (this.isOrbiting) {
        this.isOrbiting = false;
        this.orbitCamera.onPointerUp();
        canvas.style.cursor = 'grab';
      }
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

  public setSphereColor(colorHex: string | number): void {
    this.sphereMesh.material.color.set(colorHex);
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
    this.renderer.dispose();
  }
}
