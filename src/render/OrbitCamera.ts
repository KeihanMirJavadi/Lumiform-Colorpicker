import * as THREE from 'three';

export interface OrbitCameraOptions {
  radius?: number;
  minPolarAngle?: number; // radians
  maxPolarAngle?: number; // radians
  rotateSpeed?: number;
}

export class OrbitCamera {
  private camera: THREE.PerspectiveCamera;
  private target: THREE.Vector3;
  private spherical: THREE.Spherical;
  private isDragging = false;
  private previousPointerPosition = { x: 0, y: 0 };
  private rotateSpeed: number;
  private minPolarAngle: number;
  private maxPolarAngle: number;

  constructor(camera: THREE.PerspectiveCamera, options: OrbitCameraOptions = {}) {
    this.camera = camera;
    this.target = new THREE.Vector3(0, 0, 0);
    this.rotateSpeed = options.rotateSpeed ?? 0.006;
    this.minPolarAngle = options.minPolarAngle ?? 0.1;
    this.maxPolarAngle = options.maxPolarAngle ?? Math.PI - 0.1;

    // Initialize spherical coordinates from camera's initial position
    const offset = new THREE.Vector3().subVectors(this.camera.position, this.target);
    const radius = options.radius ?? offset.length();
    this.spherical = new THREE.Spherical(radius, Math.PI / 2, 0);
    this.spherical.setFromVector3(offset);
    this.updateCamera();
  }

  public onPointerDown(clientX: number, clientY: number): void {
    this.isDragging = true;
    this.previousPointerPosition = { x: clientX, y: clientY };
  }

  public onPointerMove(clientX: number, clientY: number): boolean {
    if (!this.isDragging) return false;

    const deltaX = clientX - this.previousPointerPosition.x;
    const deltaY = clientY - this.previousPointerPosition.y;

    this.previousPointerPosition = { x: clientX, y: clientY };

    // Azimuthal rotation (horizontal drag around Y-axis)
    this.spherical.theta -= deltaX * this.rotateSpeed;

    // Polar rotation (vertical drag)
    this.spherical.phi -= deltaY * this.rotateSpeed;
    this.spherical.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this.spherical.phi));

    this.updateCamera();
    return true;
  }

  public onPointerUp(): void {
    this.isDragging = false;
  }

  public get active(): boolean {
    return this.isDragging;
  }

  public updateCamera(): void {
    this.spherical.makeSafe();
    const offset = new THREE.Vector3().setFromSpherical(this.spherical);
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
  }
}
