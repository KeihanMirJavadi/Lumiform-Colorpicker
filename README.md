# Lumiform Colorpicker

A real-time 3D lighting reference and color picker for Photoshop. A Three.js viewport renders grounded spheres under a physically based sky, seven measured time-of-day lighting presets, depth haze, and a live 5-value swatch ramp. Pick a color from the render to set Photoshop's foreground/brush color.

[**Download the latest release**](https://github.com/KeihanMirJavadi/Lumiform-Colorpicker/releases/latest)

## Install

### Windows

1. Download **`Lumiform-Colorpicker.zip`** from the [latest release](https://github.com/KeihanMirJavadi/Lumiform-Colorpicker/releases/latest).
2. Close Photoshop.
3. Extract the ZIP.
4. Copy the **`Lumiform Colorpicker`** folder into:
   `C:\Program Files\Adobe\Adobe Photoshop 2025\Plug-ins\`
5. Start Photoshop, then open **Plugins → Lumiform Colorpicker**.

Or double-click **`Install Windows.cmd`** in the extracted folder and approve the administrator prompt. The script finds Photoshop and copies the plugin for you.

### macOS

1. Download **`Lumiform-Colorpicker.zip`** from the [latest release](https://github.com/KeihanMirJavadi/Lumiform-Colorpicker/releases/latest).
2. Close Photoshop.
3. Extract the ZIP.
4. Double-click **`Install macOS.command`** and enter your password.
   If macOS refuses to run it, open Terminal in the extracted folder and run
   `chmod +x "Install macOS.command"` first.
5. Start Photoshop, then open **Plugins → Lumiform Colorpicker**.

### Manual install

Copy the `Lumiform Colorpicker` folder into Photoshop's Plug-ins directory:

- **Windows:** `C:\Program Files\Adobe\Adobe Photoshop 2025\Plug-ins\`
- **macOS:** `/Applications/Adobe Photoshop 2025/Plug-ins/`

The folder must contain `manifest.json` directly. Do not copy the whole `Lumiform-Colorpicker-1.3.2` folder into `Plug-ins`, because the manifest would be nested one level too deep.

The folder name does not affect the menu label; Photoshop reads `manifest.json`. The menu entry is **Lumiform Colorpicker**.

### The `.ccx` package

If Adobe Creative Cloud Desktop is installed, the release also includes `Lumiform-Colorpicker.ccx`. Double-click it and choose **Install locally**. The ZIP is the recommended method because the `.ccx` requires Creative Cloud's installer handler, which is not present on every machine.

### Older versions

Every release is kept on the [Releases page](https://github.com/KeihanMirJavadi/Lumiform-Colorpicker/releases). Download the version you need from its release.

## Requirements

- Photoshop 2025 (26.0+) or 2026.
- Windows 10/11 or macOS 12+.
- Hardware acceleration enabled in Photoshop. The panel renders with WebGL inside a local UXP WebView.

## Features

- Seven time-of-day presets with per-phase sky, ground albedo, haze, and horizon bands.
- Physically derived key light and terminator, plus adjustable Orbit, Height, and Terminator controls.
- Three fixed-depth spheres with per-sphere color and size, count/delete/refill, and Link Colors.
- Single-scattering aerial perspective with a smooth ground-to-sky horizon transition.
- Drag-anywhere color picker with a live 5-value swatch ramp.
- Resizable preview, collapsible Time of Day and Ramp, and persisted layout.
- Native Photoshop shortcuts and painting are left untouched.

## Troubleshooting

- **The panel is missing:** confirm `manifest.json` is directly inside `Plug-ins\Lumiform Colorpicker`, then fully quit and reopen Photoshop. Closing the window is not enough.
- **The viewport is black:** enable **Preferences → Performance → Use Graphics Processor** and update the GPU driver.
- **Colors do not reach Photoshop:** click inside the panel first; the status bar should read **Connected to Photoshop**.

## Development

The repository has two targets that share the same renderer:

- **Web app:** Vite + TypeScript + Three.js with a mock Photoshop bridge.
- **Photoshop add-on:** a UXP Manifest v5 panel that hosts the web app in a local WebView and bridges colors to `app.foregroundColor`.

```bash
npm install
npm run dev       # browser development
npm run build     # production build in dist/
npm run plugin    # type-check, build plugin/web, package release/*.ccx
```

`plugin/web/index.html` and `release/*.ccx` are generated and gitignored. The web app is inlined into one HTML file so the `plugin:/` origin does not need a separate module graph.

## Project layout

```
src/core/        Lighting, atmosphere, material, color, framing math
src/render/      Three.js viewport, shaders, eyedropper
src/ui/          Panel shell, controls, swatch ramp, status bar
src/bridge/      Photoshop bridge, browser mock, WebView bridge
plugin/          UXP manifest, panel shell, host relay, icons
scripts/         Build, packaging, release assets
```

## License

MIT. See [LICENSE](LICENSE).
