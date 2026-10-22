/**
 * 3D Viewport and rendering pipeline module.
 * Implementation will be expanded in Task 1.2 (Three.js Scene & Sphere)
 * and Task 1.3 (Lighting Engine & Orbit Gizmo).
 */

export interface ViewportConfig {
  antialias?: boolean;
  alpha?: boolean;
  powerPreference?: 'high-performance' | 'default' | 'low-power';
}
