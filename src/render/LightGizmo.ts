import * as THREE from 'three';
import { sphericalToCartesian } from '../core/lighting';

export interface LightGizmoOptions {
  radius?: number;
  initialAzimuth?: number;
  initialElevation?: number;
}

export class LightGizmo {
  public group: THREE.Group;
  private ringMesh: THREE.LineLoop;
  private elevationRingMesh: THREE.LineLoop;
  private sunMarker: THREE.Mesh;
  private sunHitProxy: THREE.Mesh;
  private sunGlow: THREE.Sprite;
  private radius: number;
  private azimuth: number;
  private elevation: number;
  private isDragging = false;
  private previousPointer = { x: 0, y: 0 };
  private listeners: Set<(dir: THREE.Vector3, azimuth: number, elevation: number) => void> = new Set();

  constructor(options: LightGizmoOptions = {}) {
    this.radius = options.radius ?? 1.85;
    this.azimuth = options.initialAzimuth ?? 0.65;
    this.elevation = options.initialElevation ?? 0.95;

    this.group = new THREE.Group();
    this.group.name = 'LightGizmo';

    // 1. Orbital Ring (Equator / Ground reference)
    const ringPoints: THREE.Vector3[] = [];
    const segments = 64;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      ringPoints.push(new THREE.Vector3(Math.cos(theta) * this.radius, 0, Math.sin(theta) * this.radius));
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPoints);
    const ringMat = new THREE.LineBasicMaterial({
      color: 0x4a5568,
      transparent: true,
      opacity: 0.4,
      linewidth: 1,
    });
    this.ringMesh = new THREE.LineLoop(ringGeo, ringMat);
    this.group.add(this.ringMesh);

    // 2. Active Light Elevation Arc / Meridian Ring
    const elevRingGeo = new THREE.BufferGeometry().setFromPoints(ringPoints);
    const elevRingMat = new THREE.LineBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.3,
    });
    this.elevationRingMesh = new THREE.LineLoop(elevRingGeo, elevRingMat);
    this.elevationRingMesh.rotation.y = this.azimuth;
    this.group.add(this.elevationRingMesh);

    // 3. Sun Marker (Interactive 3D Sphere Handle)
    const sunGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xffe082,
    });
    this.sunMarker = new THREE.Mesh(sunGeo, sunMat);
    this.sunMarker.name = 'SunHandle';
    this.group.add(this.sunMarker);

    // Hit Proxy for Sun Marker (enlarged comfortable click zone without visual clutter)
    const proxyGeo = new THREE.SphereGeometry(0.24, 12, 12);
    const proxyMat = new THREE.MeshBasicMaterial({
      visible: false,
    });
    this.sunHitProxy = new THREE.Mesh(proxyGeo, proxyMat);
    this.group.add(this.sunHitProxy);

    // 4. Sun Glow Sprite
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
    this.sunGlow.scale.set(0.6, 0.6, 1.0);
    this.group.add(this.sunGlow);

    this.updatePositions();
  }

  public getSunObjects(): THREE.Object3D[] {
    return [this.sunMarker, this.sunHitProxy];
  }

  public setLightDirection(azimuth: number, elevation: number, notify = true): void {
    this.azimuth = (azimuth % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    // Clamp elevation between -0.2 (slight underside) and 1.52 (~87° near zenith)
    this.elevation = Math.max(-0.2, Math.min(Math.PI / 2 - 0.05, elevation));

    this.updatePositions();

    if (notify) {
      const dir = sphericalToCartesian(this.azimuth, this.elevation).normalize();
      this.listeners.forEach((cb) => cb(dir, this.azimuth, this.elevation));
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
    this.sunGlow.scale.set(0.8, 0.8, 1.0);
  }

  public onPointerMove(clientX: number, clientY: number): boolean {
    if (!this.isDragging) return false;

    const deltaX = clientX - this.previousPointer.x;
    const deltaY = clientY - this.previousPointer.y;
    this.previousPointer = { x: clientX, y: clientY };

    // Azimuth: horizontal dragging rotates around the Y axis
    const azimuthDelta = -deltaX * 0.012;
    // Elevation: vertical dragging changes elevation angle
    const elevationDelta = -deltaY * 0.012;

    this.setLightDirection(this.azimuth + azimuthDelta, this.elevation + elevationDelta, true);
    return true;
  }

  public onPointerUp(): void {
    if (this.isDragging) {
      this.isDragging = false;
      this.sunMarker.scale.set(1.0, 1.0, 1.0);
      this.sunGlow.scale.set(0.6, 0.6, 1.0);
    }
  }

  public get active(): boolean {
    return this.isDragging;
  }

  public getAzimuth(): number {
    return this.azimuth;
  }

  public getElevation(): number {
    return this.elevation;
  }

  public getDirection(): THREE.Vector3 {
    return sphericalToCartesian(this.azimuth, this.elevation).normalize();
  }

  public onDirectionChange(callback: (dir: THREE.Vector3, azimuth: number, elevation: number) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private updatePositions(): void {
    const sunPos = sphericalToCartesian(this.azimuth, this.elevation, this.radius);
    this.sunMarker.position.copy(sunPos);
    this.sunHitProxy.position.copy(sunPos);
    this.sunGlow.position.copy(sunPos);

    // Rotate elevation meridian circle to align with current sun azimuth
    this.elevationRingMesh.rotation.y = this.azimuth + Math.PI / 2;
  }

  public dispose(): void {
    this.listeners.clear();
    this.ringMesh.geometry.dispose();
    (this.ringMesh.material as THREE.Material).dispose();
    this.elevationRingMesh.geometry.dispose();
    (this.elevationRingMesh.material as THREE.Material).dispose();
    this.sunMarker.geometry.dispose();
    (this.sunMarker.material as THREE.Material).dispose();
    this.sunHitProxy.geometry.dispose();
    (this.sunHitProxy.material as THREE.Material).dispose();
    this.sunGlow.material.dispose();
  }
}
