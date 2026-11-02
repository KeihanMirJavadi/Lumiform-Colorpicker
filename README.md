# Lumiform Colorpicker

A real-time 3D color picker and light simulator for Photoshop. A Three.js viewport renders grounded spheres under a physically based sky, seven measured time-of-day lighting presets, depth haze, and a live 5-value swatch ramp. Pick a color from the render to set Photoshop's foreground/brush color.

The repository contains two targets that share the same renderer:

- **Web app** — Vite + TypeScript + Three.js, with a mock Photoshop bridge. Use it for fast iteration in a browser.
- **Photoshop add-on** — a UXP Manifest v5 panel that hosts the web app in a local WebView and bridges sampled colors to `app.foregroundColor`.

## Photoshop add-on

The first packaged version is `1.0.0`. See **[Docs/PHOTOSHOP.md](Docs/PHOTOSHOP.md)** for install, troubleshooting, and distribution notes.

Quick version:

1. Build or download `Lumiform-Colorpicker-1.0.0.ccx`.
2. Double-click it, choose **Install locally**, and restart Photoshop.
3. Open **Plugins → Lumiform Colorpicker**.

For development, load `plugin/manifest.json` through Adobe UXP Developer Tool.

> The panel needs Photoshop 2025 (26.0+) because the Three.js renderer runs in a local UXP WebView. UXP panels do not expose WebGL directly.

## Web development

```bash
npm install
npm run dev
```

Open the printed local URL. The browser build uses `MockPhotoshopBridge`; the status bar shows "Connected (Browser Dev Mode)".

```bash
npm run build     # production build in dist/
npm run preview   # preview the production build
```

## Building the Photoshop package

```bash
npm run plugin        # type-check + build plugin/web + package release/*.ccx
```

Or run the stages separately:

```bash
npm run plugin:build
npm run plugin:package
```

`plugin/web/index.html` and `release/*.ccx` are generated and gitignored. The web app is inlined into one HTML file so the `plugin:/` origin does not need to resolve a separate module graph.

## Project layout

```
src/core/        Lighting, atmosphere, material, color, framing math
src/render/      Three.js viewport, custom shaders, eyedropper
src/ui/          Panel shell, controls, swatch ramp, status bar
src/bridge/      IPhotoshopBridge, browser mock, WebView bridge
plugin/          UXP manifest, panel shell, host relay, icons
plugin/web/      Generated single-file web build (gitignored)
scripts/         Inline build + .ccx packaging
Docs/            Design doc, roadmap, Photoshop install guide
```

## Features

- Seven time-of-day presets with per-phase sky, ground albedo, haze, and horizon bands.
- Physically derived key light and terminator, plus adjustable Orbit/Height/Terminator controls.
- Three fixed depth spheres with per-sphere color and size, count/delete/refill, and Link Colors.
- Single-scattering aerial perspective with a smooth ground-to-sky horizon transition.
- Drag-anywhere color picker, live 5-value swatch ramp, eyedropper sampling.
- Fixed camera, no zoom; the composition stays stable.
- Photoshop foreground-color bridge with coalesced updates.

## Requirements

- Node.js 20+ for building.
- Photoshop 2025 (26.0+) or 2026 for the add-on.
- A GPU/driver with WebGL available to Photoshop.

## License

MIT. See [LICENSE](LICENSE).
