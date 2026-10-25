import { SurfaceFinish } from './types';

/**
 * Default preview albedo. A neutral light gray shows the lighting model's hue
 * shifts (warm sun / cool sky / green bounce) without the base color masking them.
 */
export const DEFAULT_ALBEDO_HEX = '#E3E3E3';

/** Default surface finish. The reference daylight look is purely diffuse. */
export const DEFAULT_SURFACE_FINISH: SurfaceFinish = 'matte';

/** Default ground albedo (natural grass green). */
export const DEFAULT_GROUND_HEX = '#5C8F3E';
