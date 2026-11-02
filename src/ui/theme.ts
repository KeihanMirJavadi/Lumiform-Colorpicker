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
  medium: 'mediumGray',
  light: 'mediumGray',
  lightest: 'lightGray',
};

export type ThemePreference = 'auto' | PhotoshopTheme;

export const THEME_STORAGE_KEY = 'lumiform.theme';

export function isPhotoshopTheme(value: unknown): value is PhotoshopTheme {
  return typeof value === 'string' && (THEME_ORDER as readonly string[]).includes(value);
}

export function themeFromHost(hostTheme: unknown): PhotoshopTheme | null {
  if (typeof hostTheme !== 'string') return null;
  const key = hostTheme.trim().toLowerCase();
  return HOST_THEME_MAP[key] ?? null;
}

/** Auto follows the host; a manual choice wins until Auto is selected again. */
export function resolveTheme(
  preference: ThemePreference,
  hostTheme: string | null
): PhotoshopTheme {
  if (preference !== 'auto') return preference;
  return themeFromHost(hostTheme) ?? DEFAULT_THEME;
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'auto') return 'auto';
    if (isPhotoshopTheme(stored)) return stored;
  } catch (error) {
    // localStorage can be unavailable in a sandboxed WebView.
  }
  return 'auto';
}

export function saveThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch (error) {
    // Persistence is a convenience; the session still follows the choice.
  }
}

/** URL bootstrap used by the host and by a manual reload. */
function readBootstrapTheme(): string | null {
  try {
    const value = new URLSearchParams(window.location.search).get('theme');
    return value && value.trim() ? value.trim() : null;
  } catch (error) {
    return null;
  }
}

/**
 * Resolves the first-paint theme before the shell renders, so the panel never
 * flashes the wrong palette while the host handshake is in flight.
 */
export function initialTheme(): PhotoshopTheme {
  const preference = readThemePreference();
  if (preference !== 'auto') return preference;
  return themeFromHost(readBootstrapTheme()) ?? DEFAULT_THEME;
}

/** Applies a theme by setting `data-ps-theme` on the document root. */
export function applyTheme(theme: PhotoshopTheme): void {
  document.documentElement.dataset.psTheme = theme;
}
