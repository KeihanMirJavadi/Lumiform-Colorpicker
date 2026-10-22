import * as THREE from 'three';
import { calculateLightDirection } from '../core/lighting';

export interface LightGizmoOptions {
  radius?: number;
  initialRoll?: number;
  initialAzimuth?: number;
  initialElevation?: number;
}

export class LightGizmo {
  public group: THREE.Group;

  // 3-axis colored reference rings (matching diagram: 1 Green, 2 White, 3 Yellow)
  private ringRoll: THREE.LineLoop;      // 1: Green (XY coronal ring around Z)
  private ringAzimuth: THREE.LineLoop;   // 2: White/Grey (XZ equator ring around Y)
  private ringElevation: THREE.LineLoop; // 3: Yellow (YZ sagittal ring around X)

  private sunMarker: THREE.Mesh;
  private sunHitProxy: THREE.Mesh;
  private sunGlow: THREE.Sprite;

  private radius: number;
  private roll: number;      // 1: Green (-PI to +PI)
  private azimuth: number;   // 2: White (0 to 2*PI)
  private elevation: number; // 3: Yellow (-PI/2 to +PI/2)

  private isDragging = false;
  private previousPointer = { x: 0, y: 0 };
  private listeners: Set<(dir: THREE.Vector3, roll: number, azimuth: number, elevation: number) => void> = new Set();

  constructor(options: LightGizmoOptions = {}) {
    this.radius = options.radius ?? 1.85;
    this.roll = options.initialRoll ?? 0.0;
    this.azimuth = options.initialAzimuth ?? 0.65;
    this.elevation = options.initialElevation ?? 0.95;

    this.group = new THREE.Group();
    this.group.name = 'LightGizmo';

    const segments = 64;
    const ringPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      ringPoints.push(new THREE.Vector3(Math.cos(theta) * this.radius, Math.sin(theta) * this.radius, 0));
    }
    const circleGeometry = new THREE.BufferGeometry().setFromPoints(ringPoints);

    // 1. Ring 1 (Green in diagram): Frontal Coronal Plane (XY plane around Z)
    const rollMat = new THREE.LineBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.55,
      linewidth: 1,
    });
    this.ringRoll = new THREE.LineLoop(circleGeometry.clone(), rollMat);
    this.ringRoll.name = 'Ring1_Roll_Green';
    this.group.add(this.ringRoll);

    // 2. Ring 2 (White/Grey in diagram): Horizontal Equator Plane (XZ plane around Y)
    const azimPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      azimPoints.push(new THREE.Vector3(Math.cos(theta) * this.radius, 0, Math.sin(theta) * this.radius));
    }
    const azimGeo = new THREE.BufferGeometry().setFromPoints(azimPoints);
    const azimMat = new THREE.LineBasicMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.55,
      linewidth: 1,
    });
    this.ringAzimuth = new THREE.LineLoop(azimGeo, azimMat);
    this.ringAzimuth.name = 'Ring2_Azimuth_White';
    this.group.add(this.ringAzimuth);

    // 3. Ring 3 (Yellow in diagram): Vertical Sagittal Plane (YZ plane around X)
    const elevPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      elevPoints.push(new THREE.Vector3(0, Math.sin(theta) * this.radius, Math.cos(theta) * this.radius));
    }
    const elevGeo = new THREE.BufferGeometry().setFromPoints(elevPoints);
    const elevMat = new THREE.LineBasicMaterial({
      color: 0xeab308,
      transparent: true,
      opacity: 0.55,
      linewidth: 1,
    });
    this.ringElevation = new THREE.LineLoop(elevGeo, elevMat);
    this.ringElevation.name = 'Ring3_Elevation_Yellow';
    this.group.add(this.ringElevation);

    // 4. Sun Marker (Interactive 3D Sphere Handle)
    const sunGeo = new THREE.SphereGeometry(0.13, 16, 16);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xffe082,
    });
    this.sunMarker = new THREE.Mesh(sunGeo, sunMat);
    this.sunMarker.name = 'SunHandle';
    this.group.add(this.sunMarker);

    // Hit Proxy for Sun Marker
    const proxyGeo = new THREE.SphereGeometry(0.26, 12, 12);
    const proxyMat = new THREE.MeshBasicMaterial({
      visible: false,
    });
    this.sunHitProxy = new THREE.Mesh(proxyGeo, proxyMat);
    this.group.add(this.sunHitProxy);

    // 5. Sun Glow Sprite
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255, 235, 150, 0.9)');
      grad.addColorStop(0.3, 'rgba(255, 200, 50, 0.4)');
      grad.addColorStop(1, 'rgba(255, 200, 50, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
    }
    const spriteMap = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: spriteMap,
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
    });
    this.sunGlow = new THREE.Sprite(spriteMat);
    this.sunGlow.scale.set(0.65, 0.65, 1.0);
    this.group.add(this.sunGlow);

    this.updatePositions();
  }

  public getSunObjects(): THREE.Object3D[] {
    return [this.sunMarker, this.sunHitProxy];
  }

  public setAngles(roll: number, azimuth: number, elevation: number, notify = true): void {
    // Wrap roll between -PI and +PI
    this.roll = Math.max(-Math.PI, Math.min(Math.PI, roll));
    // Wrap azimuth 0 to 2*PI
    this.azimuth = (azimuth % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    // Clamp elevation -PI/2 to +PI/2
    this.elevation = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, elevation));

    this.updatePositions();

    if (notify) {
      const dir = calculateLightDirection(this.roll, this.azimuth, this.elevation);
      this.listeners.forEach((cb) => cb(dir, this.roll, this.azimuth, this.elevation));
    }
  }

  public setSunColor(color: THREE.Color | string): void {
    const col = color instanceof THREE.Color ? color : new THREE.Color(color);
    (this.sunMarker.material as THREE.MeshBasicMaterial).color.copy(col);
  }

  public onPointerDown(clientX: number, clientY: number): void {
    this.isDragging = true;
    this.previousPointer = { x: clientX, y: clientY };
    this.sunMarker.scale.set(1.3, 1.3, 1.3);
    this.sunGlow.scale.set(0.85, 0.85, 1.0);
  }

  public onPointerMove(clientX: number, clientY: number): boolean {
    if (!this.isDragging) return false;

    const deltaX = clientX - this.previousPointer.x;
    const deltaY = clientY - this.previousPointer.y;
    this.previousPointer = { x: clientX, y: clientY };

    // Direct drag adjusts azimuth (horizontal drag) and elevation (vertical drag)
    const azimuthDelta = -deltaX * 0.012;
    const elevationDelta = -deltaY * 0.012;

    this.setAngles(this.roll, this.azimuth + azimuthDelta, this.elevation + elevationDelta, true);
    return true;
  }

  public onPointerUp(): void {
    if (this.isDragging) {
      this.isDragging = false;
      this.sunMarker.scale.set(1.0, 1.0, 1.0);
      this.sunGlow.scale.set(0.65, 0.65, 1.0);
    }
  }

  public get active(): boolean {
    return this.isDragging;
  }

  public getRoll(): number {
    return this.roll;
  }

  public getAzimuth(): number {
    return this.azimuth;
  }

  public getElevation(): number {
    return this.elevation;
  }

  public getDirection(): THREE.Vector3 {
    return calculateLightDirection(this.roll, this.azimuth, this.elevation);
  }

  public onDirectionChange(callback: (dir: THREE.Vector3, roll: number, azimuth: number, elevation: number) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private updatePositions(): void {
    const dir = calculateLightDirection(this.roll, this.azimuth, this.elevation);
    const sunPos = dir.clone().multiplyScalar(this.radius);

    this.sunMarker.position.copy(sunPos);
    this.sunHitProxy.position.copy(sunPos);
    this.sunGlow.position.copy(sunPos);
  }

  public dispose(): void {
    this.listeners.clear();
    this.ringRoll.geometry.dispose();
    (this.ringRoll.material as THREE.Material).dispose();
    this.ringAzimuth.geometry.dispose();
    (this.ringAzimuth.material as THREE.Material).dispose();
    this.ringElevation.geometry.dispose();
    (this.ringElevation.material as THREE.Material).dispose();
    this.sunMarker.geometry.dispose();
    (this.sunMarker.material as THREE.Material).dispose();
    this.sunHitProxy.geometry.dispose();
    (this.sunHitProxy.material as THREE.Material).dispose();
    this.sunGlow.material.dispose();
  }
}
