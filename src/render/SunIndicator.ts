import * as THREE from 'three';
import { sphericalToCartesian } from '../core/lighting';

export interface SunIndicatorOptions {
  radius?: number;
  initialAzimuth?: number;
  initialElevation?: number;
}

export class SunIndicator {
  public group: THREE.Group;
  private sunMarker: THREE.Mesh;
  private sunHitProxy: THREE.Mesh;
  private sunGlow: THREE.Sprite;
  private radius: number;
  private azimuth: number;
  private elevation: number;
  private isDragging = false;
  private previousPointer = { x: 0, y: 0 };
  private listeners: Set<(dir: THREE.Vector3, azimuth: number, elevation: number) => void> = new Set();

  constructor(options: SunIndicatorOptions = {}) {
    this.radius = options.radius ?? 1.85;
    this.azimuth = options.initialAzimuth ?? 0.65;
    this.elevation = options.initialElevation ?? 0.95;

    this.group = new THREE.Group();
    this.group.name = 'SunIndicator';

    // 1. Sun Sphere Marker
    const sunGeo = new THREE.SphereGeometry(0.14, 20, 20);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xffe082,
    });
    this.sunMarker = new THREE.Mesh(sunGeo, sunMat);
    this.sunMarker.name = 'SunMarker';
    this.group.add(this.sunMarker);

    // 2. Invisible Hit Proxy for comfortable clicking without false hits
    const proxyGeo = new THREE.SphereGeometry(0.28, 12, 12);
    const proxyMat = new THREE.MeshBasicMaterial({
      visible: false,
    });
    this.sunHitProxy = new THREE.Mesh(proxyGeo, proxyMat);
    this.group.add(this.sunHitProxy);

    // 3. Sun Glow Sprite
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255, 240, 170, 0.95)');
      grad.addColorStop(0.35, 'rgba(255, 200, 60, 0.45)');
      grad.addColorStop(1, 'rgba(255, 200, 60, 0)');
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

    this.updatePosition();
  }

  public getHitObjects(): THREE.Object3D[] {
    return [this.sunMarker, this.sunHitProxy];
  }

  public setAngles(azimuth: number, elevation: number, notify = true): void {
    this.azimuth = (azimuth % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    this.elevation = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, elevation));

    this.updatePosition();

    if (notify) {
      const dir = sphericalToCartesian(this.azimuth, this.elevation).normalize();
      this.listeners.forEach((cb) => cb(dir, this.azimuth, this.elevation));
    }
  }

  public setColor(color: THREE.Color | string): void {
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

    const azimuthDelta = -deltaX * 0.012;
    const elevationDelta = -deltaY * 0.012;

    this.setAngles(this.azimuth + azimuthDelta, this.elevation + elevationDelta, true);
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

  private updatePosition(): void {
    const sunPos = sphericalToCartesian(this.azimuth, this.elevation, this.radius);
    this.sunMarker.position.copy(sunPos);
    this.sunHitProxy.position.copy(sunPos);
    this.sunGlow.position.copy(sunPos);
  }

  public dispose(): void {
    this.listeners.clear();
    this.sunMarker.geometry.dispose();
    (this.sunMarker.material as THREE.Material).dispose();
    this.sunHitProxy.geometry.dispose();
    (this.sunHitProxy.material as THREE.Material).dispose();
    this.sunGlow.material.dispose();
  }
}
