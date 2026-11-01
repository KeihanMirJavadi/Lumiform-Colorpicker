/**
 * V1.2 icon set (Task 4.4).
 *
 * 16 px line icons on a 16x16 grid, 1.5 px stroke, `currentColor`, no fills.
 * They are injected as inline SVG so they inherit the active Photoshop theme
 * and never need a network request. Text labels and aria labels stay in the
 * markup; the SVGs are decorative (`aria-hidden`).
 */

const svg = (body: string): string =>
  `<svg class="ui-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

const time = {
  'early-morning': svg(`
    <path d="M2.5 12.5h11" />
    <path d="M5 12.5a3 3 0 0 1 6 0" />
    <path d="M8 7.2V4.2" />
    <path d="m6.4 5.8 1.6-1.6 1.6 1.6" />
  `),
  morning: svg(`
    <circle cx="6" cy="6" r="2.2" />
    <path d="M6 2.4v1" />
    <path d="M2.4 6h1" />
    <path d="m3.5 3.5.7.7" />
    <path d="m8.5 3.5-.7.7" />
    <path d="M6.4 12.6h5.1a2 2 0 0 0 0-4 2.6 2.6 0 0 0-5-.7 1.8 1.8 0 0 0-.1 3.6Z" />
  `),
  midday: svg(`
    <circle cx="8" cy="8" r="2.8" />
    <path d="M8 1.6v1.5" />
    <path d="M8 12.9v1.5" />
    <path d="M1.6 8h1.5" />
    <path d="M12.9 8h1.5" />
    <path d="m3.5 3.5 1 1" />
    <path d="m11.5 11.5 1 1" />
    <path d="m12.5 3.5-1 1" />
    <path d="m4.5 11.5-1 1" />
  `),
  afternoon: svg(`
    <circle cx="8" cy="6.6" r="2.5" />
    <path d="M8 1.7v1.2" />
    <path d="M1.9 6.6h1.2" />
    <path d="M14.1 6.6h-1.2" />
    <path d="m3.6 2.7.9.9" />
    <path d="m12.4 2.7-.9.9" />
    <path d="M3 13.2h10" />
  `),
  'near-sunset': svg(`
    <path d="M2.5 12.5h11" />
    <path d="M5 12.5a3 3 0 0 1 6 0" />
    <path d="M8 4.6v3" />
    <path d="m6.4 10 1.6 1.6 1.6-1.6" />
  `),
  'golden-hour': svg(`
    <path d="M2 12.5h12" />
    <path d="M4.5 12.5a3.5 3.5 0 0 1 7 0" />
    <path d="m2.2 8.3 1.2.6" />
    <path d="m13.8 8.3-1.2.6" />
    <path d="m4.3 5.4 1 1" />
    <path d="m11.7 5.4-1 1" />
  `),
  night: svg(`
    <path d="M11.4 9.7A5 5 0 1 1 6.3 2.3a4.1 4.1 0 0 0 5.1 7.4Z" />
    <path d="M12.6 3.2v1.7" />
    <path d="M11.8 4.1h1.7" />
  `),
} as const;

const ground = {
  grass: svg(`
    <path d="M4 12.5c0-4.5 2.5-7.5 7.5-8" />
    <path d="M4.6 12.2C6 9.8 8.4 7.4 11.5 6" />
  `),
  neutral: svg('<circle cx="8" cy="8" r="4.6" />'),
  dirt: svg(`
    <path d="M2.2 12.4h11.6" />
    <path d="M3.2 12.4c.9-2.9 2.7-4.4 4.8-4.4s3.9 1.5 4.8 4.4" />
    <path d="M6.3 10.6h.01" />
    <path d="M9.4 10.2h.01" />
  `),
  sand: svg(`
    <path d="M2.4 6.2c1.4-1.1 2.8-1.1 4.2 0s2.8 1.1 4.2 0 2-.7 2.6-.4" />
    <path d="M2.4 9.6c1.4-1.1 2.8-1.1 4.2 0s2.8 1.1 4.2 0 2-.7 2.6-.4" />
    <path d="M4.4 12.7h7.2" />
  `),
} as const;

const finish = {
  matte: svg(`
    <circle cx="8" cy="8" r="4.6" />
    <path d="M5.6 8h4.8" />
  `),
  satin: svg(`
    <path d="M8 2.4c.6 2.9 2.7 5 5.6 5.6-2.9.6-5 2.7-5.6 5.6-.6-2.9-2.7-5-5.6-5.6 2.9-.6 5-2.7 5.6-5.6Z" />
  `),
  glossy: svg(`
    <path d="M8 2.4 13.6 8 8 13.6 2.4 8Z" />
    <path d="M5.4 5.4 8 8l2.6-2.6" />
  `),
} as const;

const info = svg(`
  <circle cx="8" cy="8" r="5.4" />
  <path d="M8 7.3v3.6" />
  <path d="M8 4.9h.01" />
`);

const reset = svg(`
  <path d="M3.4 8a4.6 4.6 0 1 0 1.3-3.2" />
  <path d="M3.1 2.8v2.6h2.6" />
`);

const close = svg(`
  <path d="m4.6 4.6 6.8 6.8" />
  <path d="m11.4 4.6-6.8 6.8" />
`);

const external = svg(`
  <path d="M9 3.2h3.8V7" />
  <path d="M12.8 3.2 7.4 8.6" />
  <path d="M11.2 9.4v2.2a1 1 0 0 1-1 1H4.2a1 1 0 0 1-1-1V5.6a1 1 0 0 1 1-1h2.2" />
`);

export const ICONS = { time, ground, finish, info, reset, close, external } as const;
