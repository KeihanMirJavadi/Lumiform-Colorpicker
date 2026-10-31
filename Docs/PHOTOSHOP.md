# Lumiform Colorpicker — Photoshop Add-on

This is the Photoshop packaging and installation guide for Lumiform Colorpicker. The add-on is a dockable UXP panel that runs the same Three.js lighting viewport as the web app and writes the sampled color to Photoshop's foreground color.

## Requirements

- Adobe Photoshop 2025 (version 26.0 or newer) or Photoshop 2026.
- Windows 10/11 or macOS 12+.
- Hardware acceleration enabled in Photoshop (the viewport uses WebGL).
- For the `.ccx` route: Adobe Creative Cloud Desktop (the installer agent ships with it).
- For development: Adobe UXP Developer Tool (installed from Creative Cloud → All apps).

The panel needs Photoshop 26.0+ because it loads the web app from a **local UXP WebView**. UXP panels themselves do not provide WebGL; the WebView does.

## Install from the `.ccx` (recommended)

1. Download `Lumiform-Colorpicker-1.0.0.ccx`.
2. Double-click the file. Creative Cloud opens and warns that the package has not been verified by Adobe.
3. Choose **Install locally** (or **Install**), then confirm the plugin permissions.
4. Restart Photoshop.
5. Open **Plugins → Lumiform Colorpicker**.
6. Dock the panel wherever it is convenient. The tool scrolls internally, so a narrow dock still works.

The `.ccx` is unsigned. The warning is expected for a package distributed outside the Creative Cloud Marketplace. If you build the plugin yourself, the same warning appears.

## Install through UXP Developer Tool (development)

1. Install **UXP Developer Tool** from Creative Cloud → All apps.
2. In Photoshop, enable **Preferences → Plugins → Enable Developer Mode**.
3. Open UXP Developer Tool → **Add Plugin** and select this repository's `plugin/manifest.json`.
4. Click **Load & Watch**.
5. In Photoshop, open **Plugins → Lumiform Colorpicker**.
6. After changing `manifest.json`, unload and reload the plugin (or remove and re-add it) so UDT picks up the new permissions.

## Install by copying the folder (advanced)

If UPIA/Creative Cloud is unavailable, the plugin folder can be copied into Photoshop's `Plug-ins` directory. Administrator rights are required.

- Windows: `C:\Program Files\Adobe\Adobe Photoshop 2025\Plug-ins\Lumiform Colorpicker`
- macOS: `/Applications/Adobe Photoshop 2025/Plug-ins/Lumiform Colorpicker`

Copy the **contents** of the extracted `.ccx` (the folder containing `manifest.json`) into that directory, then restart Photoshop. Repeat the copy for each update.

## Using the panel

- The 3D viewport and the analytical swatch ramp render exactly as they do in the browser.
- Clicking a sphere or a swatch writes that color to Photoshop's **foreground (brush) color**.
- Dragging the circular picker samples the rendered color and updates the brush continuously; rapid samples are coalesced on the host side.
- Changing the foreground color in Photoshop updates the panel's status bar.
- Selecting a time-of-day preset restores that phase's calibrated Haze amount, as in the web app.

## How it works

```
UXP panel (plugin/index.html)
  └─ <webview src="plugin:/web/index.html">
       └─ Lumiform web app + WebViewPhotoshopBridge
            │  postMessage: ready / set-foreground / get-foreground
            ▼
       plugin/main.js (UXP host)
            │  Photoshop DOM: app.foregroundColor / SolidColor
            ▼
       Photoshop foreground (brush) color
```

- The web app is built into a **single inlined HTML file** at `plugin/web/index.html`. This avoids the `plugin:/` origin having to resolve a separate ES-module graph or asset requests.
- `src/bridge/WebViewPhotoshopBridge.ts` is the WebView-side transport. It implements the same `IPhotoshopBridge` interface as the browser mock, so the rest of the app is unaware of the host.
- `plugin/main.js` is the only code that touches the Photoshop API. It coalesces writes and polls for external foreground changes.

## Build from source

```bash
npm install
npm run plugin        # type-check, build the inlined web app, package the .ccx
```

Outputs:

- `plugin/web/index.html` — the inlined web app loaded by the WebView (generated, gitignored).
- `release/Lumiform-Colorpicker-1.0.0.ccx` — the distributable package (generated, gitignored).

Useful individual commands:

```bash
npm run dev            # browser development with the mock bridge
npm run build          # browser production build in dist/
npm run plugin:build   # build plugin/web only
npm run plugin:package # package the current plugin/ folder only
```

The plugin build runs `tsc --noEmit`, so a type error will stop the package from being created.

## Troubleshooting

### The panel is missing from the Plugins menu

- Confirm Photoshop is 26.0 or newer.
- Restart Photoshop after installing.
- If you used UDT, confirm **Load & Watch** is active and the plugin shows as loaded.
- If you copied the folder manually, confirm `manifest.json` is directly inside the plugin folder and that you restarted Photoshop.

### The panel opens but stays on “Starting Lumiform…”

- The local WebView failed to load. Open the panel's developer tools (UDT `uxpAllowInspector="true"` is enabled) and check the console.
- Confirm `plugin/web/index.html` exists in the installed package. A source checkout does not contain it until `npm run plugin:build` runs.
- Confirm Photoshop 2025 is fully updated; local WebView rendering needs UXP 8.0+.

### The viewport is black or reports a WebGL error

- Enable **Preferences → Performance → Use Graphics Processor**.
- Update the GPU driver.
- On a remote desktop or virtual machine, WebGL may be unavailable. The panel shows a startup error instead of a blank page.

### The brush color does not change

- Click inside the panel first so the WebView has focus.
- Check the panel status bar: it should read **Connected to Photoshop**.
- In UDT, open the plugin console and look for `[Lumiform]` messages.
- Some color-managed documents convert RGB values through the document's color settings; the brush still receives the converted color.

### Double-clicking the `.ccx` does nothing

- Install or repair Creative Cloud Desktop; `.ccx` files are associated with its installer agent (UPIA).
- Or use UXP Developer Tool with `plugin/manifest.json`.
- As a last resort, use the manual folder copy above.

## Distribution notes

- The manifest uses the id `com.lumiform.colorpicker` for private distribution. Before publishing to the Creative Cloud Marketplace, obtain a plugin id from the Adobe Developer Distribution portal and update `plugin/manifest.json`.
- The package is unsigned. Adobe shows an “unverified” warning; users must explicitly choose to install it.
- The plugin requests only the local WebView permission. It does not use the network, clipboard, or filesystem.
- Keep the version in `plugin/manifest.json` and the generated file name in sync when releasing updates (`package.json` is not read by UXP).
- `.github/workflows/plugin-release.yml` builds the `.ccx` on a manual run or a `v*` tag and attaches it to a GitHub release, so users can download the latest package without building locally.
