/**
 * Photoshop theme plumbing for the V1.2 native skin.
 *
 * Photoshop reports four internal theme names through `document.theme`:
 * `darkest`, `dark`, `light` and `lightest`. The user-facing Settings labels
 * were verified against those values in task 4.1 (a controlled pass), so this
 * table is the single place where the two vocabularies meet.
 */

export type PhotoshopTheme = 'black' | 'darkGray' | 'mediumGray' | 'lightGray';

/** Dark Gray is the reference theme and the fallback when the host is silent. */
export const DEFAULT_THEME: PhotoshopTheme = 'darkGray';

export const THEME_ORDER: readonly PhotoshopTheme[] = [
  'black',
  'darkGray',
  'mediumGray',
  'lightGray',
];

export const THEME_LABELS: Record<PhotoshopTheme, string> = {
  black: 'Black',
  darkGray: 'Dark Gray',
  mediumGray: 'Medium Gray',
  lightGray: 'Light Gray',
};

/** `document.theme` value -> Photoshop Settings label. */
export const HOST_THEME_MAP: Record<string, PhotoshopTheme> = {
  darkest: 'black',
  dark: 'darkGray',
  light: 'mediumGray',
  lightest: 'lightGray',
};

export function themeFromHost(hostTheme: unknown): PhotoshopTheme | null {
  if (typeof hostTheme !== 'string') return null;
  const key = hostTheme.trim().toLowerCase();
  return HOST_THEME_MAP[key] ?? null;
}

/** Applies a theme by setting `data-ps-theme` on the document root. */
export function applyTheme(theme: PhotoshopTheme): void {
  document.documentElement.dataset.psTheme = theme;
}
