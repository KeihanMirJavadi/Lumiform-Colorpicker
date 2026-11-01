# AI_CONTEXT.md - Lumiform Colorpicker

> **AUDIENCE NOTICE**: This file is strictly for **AI Agents** working on this repository. It provides complete onboarding context, architectural specifications, and the exact protocol for step-by-step development.

> **V1.1 UI PHASE:** The panel redesign - design decisions, onboarding and the Stage 3 roadmap - lives in
> [AI_CONTEXT_UI.md](./AI_CONTEXT_UI.md). This file stays authoritative for the architecture, the lighting model,
> the add-on runtime and the task-state protocol; that file owns the UI phase.

---

## 1. AI Agent Operating Protocol

Every AI Agent executing tasks in this codebase must adhere to the following execution loop:

```
┌────────────────────────────────────────────────────────┐
│ 1. Read AI_CONTEXT.md                                  │
│    - Identify the single task with state: `current`    │
└───────────────────────────┬────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│ 2. Implement & Verify                                  │
│    - Write code, build, and test acceptance criteria   │
│    - Do NOT jump ahead to `planned` tasks              │
└───────────────────────────┬────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│ 3. Report Back to User                                 │
│    - Present completed work and verification results   │
│    - Explicitly ask for user approval to proceed       │
└───────────────────────────┬────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────┐
│ 4. Update Roadmap State (ONLY AFTER USER APPROVAL)     │
│    - Change completed task from `current` -> `Done`    │
│    - Change next task from `planned` -> `current`      │
│    - Sync states in both AI_CONTEXT.md and             │
│      Docs/index.html                                   │
└────────────────────────────────────────────────────────┘
```

### Strict Rules:
1. **Task States:** Exactly three allowed states: `Done`, `current`, `planned`.
2. **Single Concurrency:** Exactly **one** task may be in the `current` state at any time.
3. **Approval Gate:** Never mark a task `Done` or advance to the next task without explicit user approval.
4. **Documentation Synchronization:** Whenever roadmap states change, update both `AI_CONTEXT.md` and `Docs/index.html` simultaneously.

---

## 2. Project Vision & Core Problem

### The Problem: The "Muddy Shadow" Dilemma
In traditional digital painting, choosing shadow and highlight colors using 2D flat color pickers leads to dull, lifeless, or "muddy" paintings because artists naively drag values down toward black or desaturate. In physical reality:
* Sunlight has high color temperature ($5500\text{K} - 3500\text{K}$).
* Shadows are illuminated by ambient skylight (cool blue/cyan) and ground bounce light.
* Form volume creates half-tones, terminators, and ambient occlusion.

### The Solution
The **Lumiform Colorpicker** renders the artist's chosen base color on a real-time lit 3D sphere inside Photoshop. It simulates directional sunlight, 3-zone ambient environment (Sky, Horizon, Ground), and surface finishes. Artists can sample lit hues directly from the 3D form or from an analytical 5-value swatch ramp with a single click, instantly updating Photoshop's active brush.

---

## 3. System Architecture & Tech Stack

The project follows a **two-phase dual-target architecture**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                       Panel UI (Photoshop Dark #1e1e1e)                │
│  ├─ Compact HSB Sliders + Hex Input                                    │
│  ├─ Time-of-Day Presets (7 phases: Early Morning to Night)             │
│  ├─ Surface Finish Toggle (Matte / Satin / Glossy)                     │
│  └─ Per-Sphere Size Slider                                             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     3D Viewport (Three.js WebGL)                       │
│  ├─ Up to 3 Grounded Spheres (near / mid / far, fixed camera)          │
│  ├─ Single-Scattering Depth Fog + Horizon Haze Band                    │
│  ├─ Directional Key Light + Orbit/Height Sun Sliders                   │
│  ├─ 3-Zone Hemispherical Ambient (Sky / Horizon / Ground Bounce)       │
│  └─ Eyedropper Pointer Controller (WebGL readPixels, throttled to RAF) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  Analytical 5-Value Swatch Generator                   │
│  [Highlight]   [Half-Tone]   [Terminator]   [Core Shadow]   [Bounce]   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Photoshop Bridge Interface (IPhotoshopBridge)            │
│  ├─ MockPhotoshopBridge     (Web browser dev preview & verification)   │
│  ├─ WebViewPhotoshopBridge   (WebView ↔ UXP host postMessage)          │
│  └─ plugin/main.js           (Photoshop app.foregroundColor relay)     │
└────────────────────────────────────────────────────────────────────────┘
```

### Technology Matrix
* **Language:** TypeScript (strict mode)
* **3D Library:** Three.js
* **Build Tool:** Vite
* **Target 1 (Phase 1):** Standalone Web Application with Mock Photoshop Bridge for rapid iteration.
* **Target 2 (Phase 2):** Adobe UXP Plugin (Manifest v5) targeting Adobe Photoshop 2025+, distributed as a `.ccx`.

### 3.1 Photoshop Add-on Runtime (Stage 2)

* **Why a WebView:** A UXP panel itself has no WebGL (UXP only exposes a 2D canvas), so the Three.js renderer cannot run directly in the panel DOM. The panel therefore hosts the built web app in a **local UXP WebView** (`<webview src="plugin:/web/index.html">`). WebView2 on Windows and WKWebView on macOS provide the WebGL context, and the existing renderer, shaders, and eyedropper work unchanged.
* **Panel shell:** `plugin/index.html` is the native UXP panel. It contains only the full-size WebView plus loading/error overlays; `plugin/main.js` is the UXP host.
* **Bridge split:**
  * `src/bridge/WebViewPhotoshopBridge.ts` runs inside the WebView, implements `IPhotoshopBridge`, and sends `ready`, `set-foreground` and `get-foreground` messages through `window.uxpHost`.
  * `plugin/main.js` receives those messages, reads/writes `app.foregroundColor` through the Photoshop DOM (`SolidColor`), and pushes `status`, `foreground` and `error` messages back. Rapid eyedropper samples are coalesced into one write at a time.
  * `getPhotoshopBridge()` selects the WebView bridge when `window.uxpHost` exists and the mock otherwise, so `npm run dev` remains fully interactive.
* **Runtime requirements:** Photoshop 26.0+ (UXP 8.0+) for local WebView rendering. The manifest requests only `requiredPermissions.webview` (`allowLocalRendering: "yes"`, `enableMessageBridge: "localOnly"`); no network, clipboard, or filesystem permissions.
* **Build and package:**
  * `npm run plugin:build` type-checks, builds the web app into `plugin/web`, and inlines the JS/CSS into a single `plugin/web/index.html` (avoids the `plugin:/` ES-module/asset-origin issue).
  * `npm run plugin:package` zips the `plugin/` contents into `release/Lumiform-Colorpicker-<version>.ccx`.
  * `npm run plugin` runs both.
* **Install paths:** end users double-click the `.ccx` (Creative Cloud/UPIA); developers load `plugin/manifest.json` through UXP Developer Tool; the plugin folder can also be copied into Photoshop's `Plug-ins` directory when UPIA is unavailable. Full instructions live in `Docs/PHOTOSHOP.md`.
* **Current verification state:** The web build, inlined plugin page, bridge protocol harness, manifest structure, and `.ccx` contents are verified locally. The packaged panel now loads and runs inside Photoshop 26.8, which closes Task 2.2's in-Photoshop criterion; full docking/resize/high-DPI polish remains open as Task 2.3.

---

## 4. Key Subsystem Specifications

### 4.1 3D Viewport & Pointer Interactions
* **Scoped Pointer Events:** Viewport events are strictly bounded to the panel canvas. Never capture or interfere with the Photoshop document canvas or global pointer.
* **Grounded Sphere Sizing:** A panel **Size** slider uniformly scales the sphere (20%–100%). The transform pivot is the sphere's bottom-center at ground level, so the sphere always rests exactly on the ground plane.
* **Persistent Draggable Color Picker Target:** An always-visible circular reticle in the 3D viewport featuring crosshairs, an inner sampled color ring, and a floating Hex pill badge. Can be dragged freely across the canvas to sample any lit surface or bounce light via WebGL `readPixels`, with zero-lag bridge dispatch to Photoshop's active brush. Resamples automatically when the light position, sphere size, or ground color changes.
* **2-Axis Sun Sliders:** Key-light direction is controlled exclusively from the panel via **Orbit** (Horizontal $0^\circ-360^\circ$) and **Height** (Vertical $-89^\circ-+89^\circ$) sliders. No sun marker or light gizmo is drawn in the 3D canvas.
* **Automatic Preset Deselection:** Moving the Orbit/Height sliders immediately deselects the active lighting preset.
* **Fixed Camera:** The framing contract sets the camera position, lens, and horizon pitch once. The mouse wheel does not zoom; it is swallowed over the canvas so the view stays static. Dragging the empty canvas never orbits or rotates the camera; there is no canvas-drag camera control.
* **No Mesh Rotation:** The preview form is a sphere only. There is no alternate-form switcher and no object-rotation mode; sphere shading is rotation-invariant by construction.

### 4.2 Lighting & Environment Engine
* **Lighting Model (PBR):** Metallic/roughness Cook-Torrance BRDF — GGX normal distribution, Smith-Schlick geometry masking, Schlick Fresnel, and energy-conserving diffuse (`kd = 1 − F`).
  $$\mathbf{I}_{\text{total}} = \mathbf{I}_{\text{key}} \cdot \max(0, \hat{N} \cdot \hat{L}) + \mathbf{I}_{\text{ambient}}(\hat{N}) + \mathbf{I}_{\text{specular}}$$
* **Ambient 3-Zone Model:**
  * **Sky ($\hat{N}_y > 0$):** Fills upper hemisphere; chroma partially desaturated before use as fill light.
  * **Horizon ($\hat{N}_y \approx 0$):** Soft lateral transition.
  * **Ground Bounce ($\hat{N}_y < 0$):** Underside reflection, driven only by light that actually reaches the ground (no always-on under-light).
* **Display Pipeline:** Linear-light shading → neutral tone curve with a soft highlight shoulder → sRGB display encoding → 1/255 dithering to prevent gradient banding.
* **Curated Presets (Phase 1):** Seven keyframes on one elevation curve, measured from the time-of-day reference sheet. Selecting a preset restores that phase's key light, sky, ground albedo, and calibrated Haze amount.
  1. **Early Morning:** Before sunrise, cool ambient light, pale rose over a blue-gray horizon haze. Haze 60%.
  2. **Morning:** Pale hazy sky, soft warm low key, low contrast. Haze 43%.
  3. **Midday:** High side sun, pale cyan sky fill, saturated green bounce (measured). Haze 3%.
  4. **Afternoon:** Deep blue sky, crisp warm key, vivid green bounce. Haze 9%.
  5. **Near Sunset:** Low amber sun, lilac sky, long warm shadow. Haze 60%.
  6. **Golden Hour:** Lowest orange sun, rose sky, warm earth bounce. Haze 70%.
  7. **Night:** Cool moonlight, deep navy sky, faint bounce. Haze 15%.
  * Each keyframe owns its visible dome colours, horizon haze colour/width, lighting irradiances, key angle/softness, ground albedo, and ground/air turbidity. Clicking a preset and entering its Orbit/Height by hand produce identical lighting at the preset's calibrated Haze; Haze is a separate control, and a preset click resets it to that phase's value.

### 4.3 Surface Finish Modes
* **Matte (default):** Roughness 1.0, 0% reflectance (pure diffuse Lambertian).
* **Satin:** Roughness 0.45, 40% reflectance (soft, spread specular lobe).
* **Glossy:** Roughness 0.08, 95% reflectance (tight GGX highlight + Fresnel edge).
* **Custom:** Roughness and Specular sliders can be adjusted freely; presets deselect when values leave a preset.
* **Reflectance (F0):** The Specular slider controls dielectric F0 (0–8%); the BRDF is energy-conserving, so raising specular reduces diffuse accordingly.

### 4.4 Color Controls & Swatch Ramp
* **In-Panel Controls:** HSB sliders (Hue 0–360, Saturation 0–100, Brightness 0–100) + Hex input.
* **Default Surface:** Neutral light-gray albedo (`#E3E3E3`) with Matte finish, so the lighting ramp and ambient color shifts are readable before the artist picks a base hue.
* **Decoupled Input:** The 3D sphere is driven exclusively by the panel's controls to prevent unwanted canvas feedback loops while painting.
* **Analytical 5-Value Swatch Ramp:** Calculated directly from surface normal vectors:
  * **Highlight:** Half-vector $\hat{H} = \text{normalize}(\hat{L} + \hat{V})$
  * **Half-Tone:** Surface normal at $45^\circ$ toward $\hat{L}$
  * **Terminator:** Normal at $90^\circ$ to $\hat{L}$ ($\hat{N} \cdot \hat{L} = 0$)
  * **Core Shadow:** Normal facing opposite $\hat{L}$ before ground bounce
  * **Bounce Light:** Normal pointing directly down toward ground reflection
* Clicking any swatch immediately applies it to the active brush color.

### 4.5 Depth, Atmosphere & Multi-Sphere Composition

> **V1.1:** Sphere visibility and selection are the three-state Near / Mid / Far toggles. The v1.0
> `1 / 2 / 3` count control and Delete button no longer exist. See
> [AI_CONTEXT_UI.md](./AI_CONTEXT_UI.md) for the panel design.

* **Three composition slots:** The scene supports up to three spheres in fixed depth slots:
  * **Near** (`center`) — nearest to the camera, largest on screen.
  * **Mid** (`right`) — mid ground.
  * **Far** (`left`) — furthest, sitting near the horizon.
  All three rest on the ground plane. Slots are fixed to the reference composition; there are no position controls.
* **Visibility & selection:** Near/Mid/Far are three-state toggles. Clicking an off sphere enables and selects it; clicking an enabled but unselected sphere selects it; clicking the selected sphere hides it. The last enabled sphere cannot be hidden — the guard lives in the model. Hiding the selected sphere falls back in Near -> Mid -> Far order. Re-enabling restores the colour and size the sphere owned before it was hidden; with Link Colours or Link Size on, the sphere joins the shared value instead.
* **Links:** **Link Colours** and **Link Size** each adopt the selected sphere's value when enabled and keep applying subsequent edits to every enabled sphere. Disabling a link keeps the shared value so spheres can diverge from there.
* **Aerial perspective:** Physically based single scattering: `L = L_surface · e^(−βd) + L_airlight · (1 − e^(−βd))`. The airlight is the local background, not one global tint: above the horizon it is the sky radiance along the view ray (including a smooth horizontal haze band), below it is the phase's ground-haze colour. This makes distant geometry desaturate toward whatever is actually behind it, so a far sphere can never become paler than its background. Extinction is per-channel in clear air (blue attenuates first) and neutral in hazy air, giving the deep-blue → pale-blue → background progression the reference shows.
  * **Horizon haze band:** Each time-of-day keyframe supplies a horizon airlight colour and an angular band width. The sky fades from that colour at the eye line to its normal gradient above, which creates the soft ground/sky seam. The band widens as haze increases.
  * **Ground haze:** The ground has its own calibrated aerial-perspective density because its visible depth span is only a few hundred world units, while the sky's air path is effectively infinite. Distant ground keeps some of its own hue instead of turning into pure sky.
  * **Depth range:** Sphere fog begins at 15.5 world units, just beyond the near sphere's far surface, so the central colour-reference sphere is exactly clear at every Haze setting. Ground fog begins at 10 units. The mid sphere is lightly hazed and the far sphere loses contrast and takes on the atmospheric colour.
  * **Haze control:** Every time-of-day preset carries its own calibrated Haze value, expressed as a fraction of the maximum: Midday 3%, Afternoon 9%, Night 15%, Morning 43%, Near Sunset/Early Morning 60%, Golden Hour 70%. Selecting a preset moves the slider to that value; at that setting the phase's measured atmosphere is reproduced exactly. Below it fades to clear, above it adds fog up to a strong maximum. The swatch ramp uses the same mapping and the selected sphere's distance.
* **Per-sphere colour state:** Each sphere carries its own base albedo, and hidden spheres keep theirs for restore-on-re-enable. The merged Spheres panel edits the selected sphere.
* **Per-sphere size:** Size is decoupled per sphere (20%–100% of the base radius). It applies to the selected sphere, or to every enabled sphere when Link Size is on. Scaling pivots on that sphere's bottom-center so it stays grounded; the camera does not move.
* **Selection:** The active sphere is chosen by clicking it in the viewport or by clicking a Near / Mid / Far toggle. Selection persists for editing, while a highlight ring flashes for about a second and fades on every selection action; there is no permanent outline. If the selected sphere is hidden, selection falls back in Near -> Mid -> Far order.
* **Picking through atmosphere:** The eyedropper samples the final rendered (atmosphere-affected) color of any sphere, so the same albedo can be compared across near, mid, and far depths.
* **Swatch ramp:** The analytical 5-value ramp follows the selected sphere and includes that sphere's depth-dependent atmospheric haze, so its swatches match the rendered color at that distance.
* **Shadows & contact AO:** Ground shading accumulates drop shadows and contact occlusion from every visible sphere, with haze applied to the ground and far shadows.

---

## 5. Development Roadmap & Task States

States: `Done`, `current`, `planned`. Only **one** task may be `current`.

### Stage 1: Web Application Prototype (Vite + TypeScript + Three.js)

* [x] **Task 1.1: Project Scaffolding & Build Configuration**
  * **State:** `Done`
  * **Description:** Set up Vite, TypeScript, Three.js, clean directory structure (`src/core`, `src/render`, `src/ui`, `src/bridge`), Photoshop-dark theme CSS, and a Mock Photoshop status bridge.
  * **Acceptance Criteria:** `npm run dev` builds and serves a clean dark-themed shell with a working mock status bar without warnings or errors.

* [x] **Task 1.2: 3D Viewport & Sphere Rendering**
  * **State:** `Done`
  * **Description:** Implement Three.js scene, fixed perspective camera (no zoom), high-resolution grounded sphere geometry, and resize handling.
  * **Acceptance Criteria:** Smooth 60fps rendering, responsive canvas resizing, static camera framing, no background-drag camera orbit.

* [x] **Task 1.3: Lighting Engine & Sun Sliders**
  * **State:** `Done`
  * **Description:** Implement directional key light driven by Orbit/Height sliders, 3-zone ambient model (Sky/Horizon/Ground), dynamic atmosphere, and 7 time-of-day presets (Early Morning through Night). No in-canvas sun marker.
  * **Acceptance Criteria:** Moving Orbit/Height repositions the light smoothly; clicking presets immediately updates the lighting atmosphere.

* [x] **Task 1.4: Surface Finish (Matte / Satin / Glossy)**
  * **State:** `Done`
  * **Description:** Implement a PBR metallic/roughness surface finish selector (GGX + Smith + Schlick) with roughness and reflectance controls.
  * **Acceptance Criteria:** Switching finish modes immediately updates highlight sharpness and material response with energy-conserving shading.

* [x] **Task 1.5: In-Panel HSB & Hex Color Controls**
  * **State:** `Done`
  * **Description:** Build compact HSB sliders and hex code input that update the 3D sphere's base diffuse albedo.
  * **Acceptance Criteria:** Changing Hue, Saturation, or Brightness updates the sphere material in real time; hex validation syncs cleanly.

* [x] **Task 1.6: Viewport Eyedropper Sampling & Throttling**
  * **State:** `Done`
  * **Description:** Implement the persistent draggable eyedropper puck on the viewport canvas using WebGL `readPixels`, throttled to `requestAnimationFrame`, with zero-lag bridge dispatch.
  * **Acceptance Criteria:** Dragging the puck samples the lit pixel under the reticle and updates the active brush color with zero lag.

* [x] **Task 1.7: Analytical 5-Value Swatch Ramp**
  * **State:** `Done`
  * **Description:** Compute Highlight, Half-Tone, Terminator, Core Shadow, and Bounce Light swatches from normal vectors. Clicking any swatch applies it.
  * **Acceptance Criteria:** All 5 swatches update in real time as light/base color changes; clicking a swatch sets active color and shows tooltip.

* [x] **Task 1.8: Multi-Sphere Depth Staging**
  * **State:** `Done`
  * **Description:** Extend the viewport from one sphere to three fixed composition slots (center/near, right/mid, left/far) with a `1 / 2 / 3` count control, explicit Delete for the selected non-center sphere, nearest-empty refill, grounded placement, independent mesh instances, and a per-selected-sphere size control.
  * **Acceptance Criteria:** Count changes and Delete add/remove the correct spheres without moving the others; refills copy the center's current color at 100% size; every sphere rests on the ground; per-sphere sizes persist while the sphere exists; composition matches the reference framing at 60fps.

* [x] **Task 1.9: Aerial Perspective & Atmosphere**
  * **State:** `Done`
  * **Description:** Add single-scattering depth fog for spheres and ground: per-channel extinction plus in-scattering toward the local background (sky with a horizon haze band above the eye line, phase ground haze below). Each preset carries its own calibrated Haze amount and resets the slider when selected.
  * **Acceptance Criteria:** The far sphere is visibly hazier and lower-contrast than the mid sphere, and the mid sphere hazier than the near sphere; the far sphere desaturates toward the background behind it without a halo; the ground fades into a horizon haze band that meets the sky; the near sphere stays exactly clear at every Haze setting; haze shifts sampled colors consistently.

* [x] **Task 1.10: Per-Sphere Color, Selection & Link Toggle**
  * **State:** `Done`
  * **Description:** Give each sphere an independent albedo, add sphere selection (viewport click + panel selector with a transient highlight flash), and add a Link Colors toggle that applies edits to all visible spheres at once.
  * **Acceptance Criteria:** Unlinked edits affect only the selected sphere; linked edits affect all visible spheres; selection falls back to the center when the selected sphere is deleted; the swatch ramp (including depth haze) and eyedropper follow the selection.

---

### Stage 2: Adobe Photoshop UXP Plugin Porting

* [x] **Task 2.1: UXP Manifest v5 & Packaging Configuration**
  * **State:** `Done`
  * **Description:** Configure `manifest.json` with a dockable panel entry point, panel dimensions, Photoshop 2025+ host requirements, local WebView permissions, and a repeatable `.ccx` packaging script. Include panel icons and a single-file plugin web build.
  * **Acceptance Criteria:** Manifest follows the UXP v5 schema with a valid entry point and permissions; `npm run plugin` produces a `.ccx` whose root contains `manifest.json`, the panel shell, icons, and the inlined web app. UDT validation is rechecked when the plugin is first loaded in Photoshop.

* [x] **Task 2.2: Photoshop Bridge Implementation (WebViewPhotoshopBridge + UXP host)**
  * **State:** `Done`
  * **Description:** Implement the WebView-side `WebViewPhotoshopBridge` and the UXP host relay in `plugin/main.js`: `ready`/`set-foreground`/`get-foreground` messages in, `status`/`foreground`/`error` messages out, `app.foregroundColor` reads/writes, and coalesced eyedropper writes.
  * **Acceptance Criteria:** Clicking a sphere, swatch, or dragging the picker inside the Photoshop panel updates the active brush color with no visible lag; external Photoshop foreground changes update the panel status bar. Bridge protocol is verified in a browser harness and the packaged panel is running in Photoshop.

* [ ] **Task 2.3: End-to-End Photoshop Verification & Polish**
  * **State:** `planned`
  * **Description:** Load the packaged plugin into Adobe Photoshop 2025+ via UDT or the `.ccx`, test panel docking, resizing, high-DPI scaling, WebGL startup, and paint responsiveness.
  * **Acceptance Criteria:** Plugin runs stably in Photoshop 2025+ with full bi-directional brush responsiveness and no panel-layout regressions. Deferred until after the V1.1 UI phase, then re-run against the redesigned panel.

---

### Stage 3: V1.1 - UI Design (Panel Redesign)

Full design decisions, onboarding and the task breakdown live in **[AI_CONTEXT_UI.md](./AI_CONTEXT_UI.md)**.
States are mirrored here so the parent protocol keeps working.

* [x] **Task 3.1: Panel spine, collapsible sections & live headers**
  * **State:** `Done`
  * **Description:** Rebuild the panel shell into the V1.1 spine (header, canvas, time of day, ramp, spheres, sun & atmosphere, ground, surface finish, status bar). Replace section cards with `<details>` blocks that start closed, add the header info affordance and live collapsed-header summaries.
  * **Acceptance Criteria:** At 320/420/600 px the panel shows the new spine with four closed, correctly summarised sections; opening each reveals its controls; the status bar stays pinned.

* [x] **Task 3.2: Time-of-day strip (icons + snapped slider + detach/↺)**
  * **State:** `Done`
  * **Description:** Seven icon buttons in one row above a snapping slider, chronological preset order, live relighting, and the detach rule for all six lighting controls with the `· edited ↺` reset label.
  * **Acceptance Criteria:** Clicking and dragging the strip agree; crossing a stop relights immediately; moving any lighting control clears all buttons and shows `edited`; `↺` restores the calibrated preset; one line at 320 px.

* [x] **Task 3.3: Sphere model - Near/Mid/Far toggles, merged panel, size link**
  * **State:** `Done`
  * **Description:** Rename spheres to Near/Mid/Far, replace the count control and Delete with three-state toggles, add the last-sphere guard, restore-on-re-enable, selection fallback, Link Size, and the merged sphere panel with size, albedo and the nested H/S/B disclosure.
  * **Acceptance Criteria:** Toggles enable/select/disable as specified; the last sphere cannot be disabled; re-enabling restores colour and size; link toggles equalise immediately; no count or Delete control remains.

* [ ] **Task 3.4: Ramp header, sphere indicator & albedo dot**
  * **State:** `current`
  * **Description:** Retitle the ramp with a read-only Near/Mid/Far chip and an albedo dot; keep the grid, recomputation and click-to-paint behaviour.
  * **Acceptance Criteria:** Chip follows selection; dot matches albedo; swatches still update on lighting, haze and finish changes; clicks still write to Photoshop.

* [ ] **Task 3.5: Light row and live foreground streaming**
  * **State:** `planned`
  * **Description:** Move the light chip into a labelled `Light` row in Sun & Atmosphere, make the albedo chip send on click, and stream H/S/B and hex edits at one write per animation frame.
  * **Acceptance Criteria:** The light chip is discoverable at 320 px; the albedo chip sets the foreground; H/S/B dragging streams without flooding the host; light and ground edits detach the preset.

* [ ] **Task 3.6: Controls Guide takeover and GitHub row**
  * **State:** `planned`
  * **Description:** Header `i` opens a full-panel guide overlay with its own header and `✕ Back`, rewrites the guide for the new UI, adds the GitHub row, and adds the `open-url` bridge message with an `uxp.shell.openExternal` host handler.
  * **Acceptance Criteria:** Overlay covers the whole panel; Esc, backdrop and `✕ Back` return to the tool; the GitHub row opens the repository externally; non-https URLs are rejected.

* [ ] **Task 3.7: Verification, polish and documentation sync**
  * **State:** `planned`
  * **Description:** Verify at 320/420/600 px and inside Photoshop across detach, toggle and streaming paths; polish spacing, focus states and truncation; sync the three docs and rebuild the `.ccx`.
  * **Acceptance Criteria:** `tsc --noEmit`, `npm run build` and `npm run plugin` pass; all earlier acceptance criteria demonstrated; docs match the shipped UI.
