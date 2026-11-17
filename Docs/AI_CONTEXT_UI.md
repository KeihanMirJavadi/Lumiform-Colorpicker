# AI_CONTEXT_UI.md - V1.1 UI Redesign, V1.2 Native Photoshop Skin & V1.3 Workspace Layout

> **AUDIENCE**: AI agents and developers implementing the V1.1 panel redesign, the V1.2 native Photoshop skin and
> the V1.3 workspace layout.
> **PARENT DOCUMENT**: [AI_CONTEXT.md](./AI_CONTEXT.md) - architecture, lighting model, add-on runtime and the
> authoritative roadmap states. Read that file first; this file covers the UI phases.
>
> **PHASE PLANS**: Section 10 is the locked V1.2 native-skin plan (complete). Section 11 is the locked V1.3
> workspace-layout plan (active). V1.1 lives in sections 3-6.

---

## 0. Status Snapshot

| Item | Value |
|---|---|
| Phase | **V1.1 - UI Design** (Stage 3, complete) · **V1.2 - Native Photoshop Skin** (Stage 4, complete) · **V1.3 - Workspace Layout** (Stage 5, complete) |
| Branch | V1.1: `feature/3.1-ui-redesign`; V1.2: `feature/4.1-native-ps-skin`; V1.3: `feature/5.1-workspace-layout` |
| Shipped baseline | v1.0.0, frozen on `release/1.0-uxp-plugin` @ `1181f9e` (source + `.ccx`) |
| Current release | v1.3.3 - `release/Lumiform-Colorpicker-1.3.3.ccx` (release polish) |
| Next release | Not planned; V1.3.3 is the current release. |
| Current task | None - 1.3.3 is a polish release on top of V1.3. |
| Renderer changes | None in V1.1/V1.2. V1.3 re-solves `src/core/framing.ts` (camera and slot positions per aspect); sphere geometry, materials, lighting, atmosphere, shaders and swatch maths stay untouched. |
| Reference | `_UI/ps-references/ps-reference.png` - the Dark Gray chrome capture sampled in section 10.3 |
| Deferred | The WebView keyboard focus handoff (Adobe Windows UXP bug) stays open. Shortcut forwarding was removed in 1.3.2 because it swallowed Photoshop shortcuts and added modal latency; the document gets the keyboard back when it is clicked. |

The V1.1 panel is built and packaged. V1.2 restyles its chrome to Photoshop's four built-in themes and V1.3 turns
the 3D preview into a resizable reference sheet. All three phases are complete; V1.3 shipped as
`release/Lumiform-Colorpicker-1.3.0.ccx`, and 1.3.1/1.3.2/1.3.3 are fixes on top. The V1.2 plan is section 10; the V1.3
plan is section 11.

---

## 1. How To Use This Document

1. Read [AI_CONTEXT.md](./AI_CONTEXT.md) section 1 (the operating protocol) - it still governs task states,
   the single-`current` rule and the approval gate.
2. Read this file end to end before writing UI code.
3. Find the active task: section 6 (V1.1, complete), section 10 (V1.2, complete) or section 11 (V1.3,
   complete). No task is `current`; the next phase needs a fresh plan.
4. Report, wait for approval, then sync states in **three** places: `AI_CONTEXT.md`, this file and
   `Docs/index.html`.

Sections 3-5 are the V1.1 behavioural design and remain normative. Section 10 is normative for the V1.2 visual
skin and theme behaviour. Section 11 is normative for the V1.3 workspace layout. If an implementation detail
contradicts any of them, the document wins until the user says otherwise.

---

## 2. Onboarding

### 2.1 What exists today

* The web app (`src/`) is the product. It runs in a browser with `MockPhotoshopBridge` for development and
  inside the UXP panel's WebView in Photoshop with `WebViewPhotoshopBridge`.
* The panel is a UXP Manifest v5 shell (`plugin/`) that hosts the built app in a local WebView
  (`plugin:/web/index.html`). The WebView supplies WebGL; UXP itself has none.
* The entire panel UI is plain DOM + custom CSS. There is no framework and no UI library. Keep it that way.
* All user-facing UI lives in `src/ui/`; layout styles live in `src/ui/styles/theme.css`.

### 2.2 Commands

| Command | Effect |
|---|---|
| `npm run dev` | Vite dev server, mock bridge, ideal for layout work |
| `npm run build` | Production web build into `dist/` |
| `npx tsc --noEmit` | Type check (must pass before any commit) |
| `npm run plugin:build` | Type check + build into `plugin/web` + inline into one HTML file |
| `npm run plugin:package` | Zip `plugin/` into `release/Lumiform-Colorpicker-<version>.ccx` |
| `npm run plugin` | Both of the above |

`plugin/web/` and `release/` are gitignored and generated. **Never** copy `plugin/` into Photoshop without
running `npm run plugin` first, or the WebView will 404 on `web/index.html`.

### 2.3 Where the UI lives

| File | Responsibility |
|---|---|
| `src/ui/shell.ts` | Whole panel layout, wiring, time-of-day strip, sections, state synchronisation |
| `src/ui/colorControls.ts` | HSB sliders + hex field for the selected sphere |
| `src/ui/swatchRamp.ts` | Analytical 5-value ramp grid and swatch click handling |
| `src/ui/statusBar.ts` | Photoshop connection status line |
| `src/ui/styles/theme.css` | Every panel style: sections, sliders, toggles, overlay; V1.2 four-theme token sets |
| `src/render/Viewport.ts` | Scene owner: sphere slots, selection, size, haze, links |
| `src/render/LightingEngine.ts` | Preset application and the "manual edit" flag |
| `src/core/sphereSlots.ts` | Slot ids, labels, depth labels, world positions |
| `src/core/lighting.ts` | `LIGHTING_PRESETS`, `LIGHTING_PRESET_ORDER`, elevation curve |
| `src/bridge/*` | `IPhotoshopBridge`, mock and WebView transports; V1.2 `theme` message |
| `plugin/main.js` | UXP host: foreground colour relay, polling, `open-url`, V1.2 theme relay |
| `plugin/index.html`, `plugin/style.css` | UXP host shell: loading/error overlays; V1.2 native theme variables |

### 2.4 Runtime constraints

* **Minimum panel width 320 px**, docked default 420x780, floating 460x820 (`plugin/manifest.json`).
  Every layout decision must survive 320 px; treat 600 px as the widest common case.
* The panel scrolls as a whole (`.panel-content`) in V1.1/V1.2; the header and status bar stay put. V1.3 keeps only
  the preview and splitter fixed; Time of Day, the Ramp and the four sections share one scrolling list (section 11).
* `<details>` / `<summary>` are supported by WebView2 and WKWebView and are the chosen disclosure primitive.
* No network access, no external fonts required by the build. `_AdobeCleanFont/` in the repo root is an
  untracked asset pack supplied by the user; V1.2 uses Segoe UI/system instead because the pack's licence is
  not an Adobe EULA.
* `_UI/Lumiform_UI.ai` in the repo root is an untracked Illustrator mock-up supplied by the user. Treat it as
  reference material, not as a build input.
* `_UI/ps-references/ps-reference.png` is the Photoshop chrome capture used for the V1.2 palette. It is a
  reference, not a build input.
* The WebView is isolated from the UXP host theme. `prefers-color-scheme` inside the WebView follows Windows,
  not Photoshop; V1.2 must relay the Photoshop theme name from the UXP host (section 10.4).

### 2.5 Definition of done for V1.1

* Every task in section 6 is `Done`.
* `npx tsc --noEmit`, `npm run build` and `npm run plugin` all pass.
* The panel is verified at 320, 420 and 600 px with all sections closed and then opened.
* The redesign is verified inside Photoshop: strip snapping, detach + reset, sphere toggles, link toggles,
  guide takeover and live foreground streaming.

### 2.6 Definition of done for V1.2

* Every task in section 10.5 is `Done`.
* The panel matches Photoshop's four built-in themes through the host relay, with a working manual override.
* No emoji, no card stack, no decorative shadows, no blue chrome; the time-of-day gradient is unchanged.
* `npx tsc --noEmit`, `npm run build` and `npm run plugin` pass.
* Verified at 320/420/600 px and in Photoshop by switching all four themes live.
* Version 1.2.0 and the `.ccx` are built; the three docs are synced.

### 2.7 Definition of done for V1.3

* Every task in section 11.2 is `Done`.
* The preview runs from the reference 412:227 shape up to 1:1, and the three spheres keep their reference
  composition at every allowed aspect without clipping.
* The preview and the splitter are fixed; Time of Day, the Ramp and the four collapsible sections share one
  scrolling list. Collapsed, the Time of Day slider and the Ramp swatches still float on the preview.
* The splitter, the floating time slider and the floating ramp work at 320, 420 and 600 px and in both a tall
  narrow dock and a short wide one.
* No sphere geometry, material, lighting, atmosphere, shader or swatch-math change.
* `npx tsc --noEmit`, `npm run build` and `npm run plugin` pass; version 1.3.0 and the `.ccx` are built; the
  three docs are synced.

---

## 3. Panel Spine

Top to bottom. Everything marked *collapsible* uses `<details>` and starts **closed**.

```
+--------------------------------------------------------------+
| HEADER   Lumiform Colorpicker        v1.1.0            [ i ] |
+--------------------------------------------------------------+
| CANVAS   412:227, fixed camera, eyedropper reticle           |
+--------------------------------------------------------------+
| TIME OF DAY   label row + 7 icon buttons + snapped slider    |
+--------------------------------------------------------------+
| 5-VALUE RAMP   title + sphere chip + albedo dot              |
+--------------------------------------------------------------+
| SPHERES                                     (collapsed)      |
+--------------------------------------------------------------+
| SUN & ATMOSPHERE                            (collapsed)      |
+--------------------------------------------------------------+
| GROUND SURFACE & COLOR                      (collapsed)      |
+--------------------------------------------------------------+
| SURFACE FINISH & REFLECTIVITY               (collapsed)      |
+--------------------------------------------------------------+
| STATUS BAR   Photoshop connection                            |
+--------------------------------------------------------------+
```

`[ i ]` opens the Controls Guide overlay. Spheres holds the Near/Mid/Far toggles, both link toggles, Size,
the albedo row and the nested H/S/B disclosure. Sun & Atmosphere holds Light, Orbit, Height, Terminator and
Haze. Time of Day and the ramp are always open.

Collapsed headers carry live state:

| Section | Collapsed summary |
|---|---|
| Spheres | `Spheres · Near · #E3E3E3` |
| Sun & Atmosphere | `Sun & Atmosphere · Midday` / `· Midday · edited` |
| Ground | `Ground · #4A7C3F` |
| Surface Finish | `Surface Finish · Matte` |

---

## 4. Design Decisions

The table is the register; the subsections explain the ones with behavioural weight.

| ID | Area | Decision |
|---|---|---|
| D1 | Canvas | Keep 412:227. The 1:1 request is deferred; `src/core/framing.ts` is untouched. |
| D2 | Spine | Header, canvas, time of day, ramp, spheres, sun & atmosphere, ground, finish, status bar. |
| D3 | Collapsing | Every collapsible section starts closed, including the nested H/S/B disclosure. |
| D4 | Headers | Collapsed headers show live state, not static titles. |
| D5 | Time of day | Chronological order: Early Morning, Morning, Midday, Afternoon, Near Sunset, Golden Hour, Night. |
| D6 | Time of day | Slider snaps to seven stops; crossing a stop relights immediately. |
| D7 | Time of day | Icon-only buttons in one row; full names in tooltips and in the row label. |
| D8 | Presets | Moving any of the six lighting controls clears all seven buttons; there is no `Custom` button. |
| D9 | Presets | The row label reads `<Last preset> · edited ↺`; `↺` re-applies that calibrated preset. |
| D10 | Presets | `↺` resets only the six lighting values, never sphere colour, size, links or selection. |
| D11 | Naming | User-facing names are **Near / Mid / Far** everywhere; internal ids stay `center/right/left`. |
| D12 | Spheres | Near/Mid/Far are three-state toggles (off, on-unselected, on-selected); no count control, no Delete. |
| D13 | Spheres | The last enabled sphere cannot be disabled; re-enabling restores that sphere's previous colour and size. |
| D14 | Spheres | Disabling the selected sphere moves selection Near -> Mid -> Far. |
| D15 | Spheres | Link Colours and Link Size each adopt the selected sphere's value on enable; disabling keeps it. |
| D16 | Spheres | Merged panel: toggles, links, size, albedo chip + hex, nested `H · S · B` disclosure. |
| D17 | Ramp | Header `5-VALUE RAMP` + read-only sphere chip + albedo dot. No selector in the ramp. |
| D18 | Light | The light colour chip moves into a labelled `Light` row at the top of Sun & Atmosphere. |
| D19 | Guide | Full-panel takeover overlay opened by the header `i`; own header, `✕ Back`, Esc and backdrop close. |
| D20 | Guide | One row linking to `github.com/KeihanMirJavadi/Lumiform-Colorpicker`, opened in the system browser. |
| D21 | Writes | Albedo chip click sends immediately; H/S/B and hex stream at one write per animation frame. |
| D22 | Bridge | New `open-url` message; https only; handled by `uxp.shell.openExternal` in `plugin/main.js`. |

### 4.1 The detach model (D8-D10)

Presets are starting points, not modes.

* Clicking a preset applies it, moves every lighting slider to that preset's values and lights its button.
* Moving **any** of Orbit, Height, Terminator, Haze, Light colour or Ground colour clears **all** buttons.
  The state becomes "custom" without any control representing it. There is deliberately **no Custom button**.
* While detached the thumb stays parked on the last stop and the label reads `Near Sunset · edited ↺`.
* Clicking `↺` or any preset button applies the calibrated preset and clears every override.

Implementation note: today only `setLightAngles()` and `setKeyLightColor()` clear the preset.
`setHaze()`, `setKeyAngularRadius()` and `setGroundColor()` must do the same in V1.1, while preset
application itself must **not** trip the manual flag.

### 4.2 Sphere toggles (D12-D15)

`Near`, `Mid`, `Far` replace the `1 / 2 / 3` count control, the Delete button and the separate selector row.
Each button has three visual states:

| State | Look | Click result |
|---|---|---|
| off | dim / outline | enables and selects that sphere |
| on, unselected | filled neutral | selects it |
| on, selected | accent fill | disables it |

Selection also still works by clicking a sphere in the canvas. The last remaining enabled sphere cannot be
turned off. Re-enabling restores the colour and size the sphere had when it was disabled - toggling is not a
reset. With Link Colours or Link Size on, an enabled sphere joins the shared value.

### 4.3 Photoshop writes (D21-D22)

* Albedo chip click -> immediate foreground write of exactly that hex.
* H/S/B drag and valid hex input -> one write per animation frame, coalesced by the host. The existing
  `WebViewPhotoshopBridge` already coalesces; do not add a second debounce on top.
* Ramp swatches and the canvas eyedropper keep their current behaviour.
* `open-url` is a new web -> host message. The host must reject anything that is not `https:`.

### 4.4 Guide takeover (D19-D20)

The guide is not a section and not a second UXP panel (a second entrypoint would appear under Photoshop's
Plugins menu and cannot be opened programmatically). It is an overlay inside the panel DOM that covers the
header, canvas, scroll area and status bar, so it reads as a separate window. Include a GitHub row; the link
opens externally through the bridge.

---

## 5. Behaviour Rules (Normative)

### 5.1 Time of day

1. Order is `early-morning, morning, midday, afternoon, near-sunset, golden-hour, night`
   (`LIGHTING_PRESET_ORDER` must be reordered to match).
2. Seven icon buttons sit in a single row above one slider. At 320 px each button is ~40 px: icons only.
3. The row label reads `Time of Day · <Active>` or `Time of Day · <Last> · edited ↺`.
4. Dragging the thumb snaps to the nearest of seven positions and applies that preset as it crosses.
5. Clicking a button moves the thumb to that stop and applies the preset.

### 5.2 Section state

1. All four sections start closed; the nested `H · S · B` disclosure starts closed.
2. Summary lines update on every relevant change, including while closed.
3. Opening/closing is native `<details>` behaviour; state does not persist across panel reloads.

### 5.3 Spheres

1. Exactly one sphere may be selected at a time.
2. Selection changes update the ramp indicator, the colour panel, the size slider and the section summary.
3. Size applies to the selected sphere, or to all enabled spheres when Link Size is on.
4. Colour applies to the selected sphere, or to all enabled spheres when Link Colours is on.
5. The ramp chip is an indicator only; it is not clickable.

### 5.4 Ramp

1. `5-VALUE RAMP` title, then a chip with the selected sphere's name and a dot of its albedo.
2. The five values stay analytical (computed from surface normals), never pixel-sampled.
3. Recompute on sphere selection, lighting change, haze change and finish change.

### 5.5 Accessibility and hit areas

1. Icon-only buttons need `title` and `aria-label`.
2. Sliders keep their numeric inputs; both stay keyboard reachable.
3. Minimum hit target 22 px; the 320 px layout is the constraint, not 420 px.

---

## 6. Implementation Roadmap (Stage 3)

States follow the parent protocol: `Done`, `current`, `planned`. Only one task is `current`.

* [x] **Task 3.1: Panel spine, collapsible sections & live headers**
  * **State:** `Done`
  * **Description:** Rebuild the panel shell into the order in section 3. Replace every section card with a
    `<details>` block that starts closed, add the header `i` affordance and the live summary line for
    Spheres, Sun & Atmosphere, Ground and Surface Finish. No behaviour changes yet beyond the shell.
  * **Acceptance Criteria:** At 320, 420 and 600 px the panel shows header, canvas, time of day, ramp and four
    closed headers with correct summaries; opening each section reveals its current controls unchanged; the
    status bar stays pinned.

* [x] **Task 3.2: Time-of-day strip (icons + snapped slider + detach/↺)**
  * **State:** `Done`
  * **Description:** Replace the segmented preset control with the seven-icon row above a snapping slider.
    Reorder the presets chronologically. Apply presets live while dragging. Implement the detach rule for all
    six lighting controls and the `· edited ↺` label with its reset behaviour.
  * **Acceptance Criteria:** Clicking an icon jumps the thumb and the lighting sliders; dragging relights at
    each stop; moving any of the six controls clears all buttons and shows `edited`; `↺` restores the last
    preset exactly; at 320 px the row stays a single line.

* [x] **Task 3.3: Sphere model - Near/Mid/Far toggles, merged panel, size link**
  * **State:** `Done`
  * **Description:** Rename spheres to Near/Mid/Far everywhere, remove the count control and Delete, add the
    three-state toggles with the last-sphere guard and restore-on-re-enable, move selection fallback to
    Near -> Mid -> Far, and add Link Size beside Link Colours. Merge size, albedo chip/hex and the nested
    H/S/B disclosure into the Spheres panel.
  * **Acceptance Criteria:** Each toggle enables, selects and disables as specified; the last sphere cannot be
    disabled; re-enabling restores its previous colour and size; link toggles equalise immediately and keep
    applying edits; no count or Delete control remains.

* [x] **Task 3.4: Ramp header, sphere indicator & albedo dot**
  * **State:** `Done`
  * **Description:** Retitle the ramp, add the read-only sphere chip and the albedo dot, and keep the grid and
    click-to-paint behaviour unchanged.
  * **Acceptance Criteria:** The chip follows selection and reads Near/Mid/Far; the dot matches the sphere's
    albedo; the five swatches still update on every lighting, haze and finish change; clicking a swatch still
    writes to Photoshop.

* [x] **Task 3.5: Light row and live foreground streaming**
  * **State:** `Done`
  * **Description:** Move the light colour chip out of the section header into a labelled `Light` row at the
    top of Sun & Atmosphere. Make the sphere albedo chip send its exact hex on click. Stream H/S/B and valid
    hex edits at one write per animation frame.
  * **Acceptance Criteria:** The light chip is discoverable at 320 px and editable; clicking the albedo chip
    sets the Photoshop foreground; dragging H/S/B updates the foreground smoothly without flooding the host;
    editing ground or light colour clears the active preset.

* [x] **Task 3.6: Controls Guide takeover and GitHub row**
  * **State:** `Done`
  * **Description:** Add the header `i`, the full-panel overlay with its own header and `✕ Back`, rewrite the
    guide for the new UI, and add the GitHub row. Add the `open-url` bridge message and host handler.
  * **Acceptance Criteria:** The overlay covers the entire panel including the status bar; Esc, backdrop and
    `✕ Back` all return to the tool; the GitHub row opens the repository in the system browser; non-https URLs
    are rejected.

* [x] **Task 3.7: Verification, polish and documentation sync**
  * **State:** `Done`
  * **Description:** Verify the panel at 320/420/600 px, inside Photoshop, and across the detach, toggle and
    streaming paths. Polish spacing, focus states and 320 px truncation. Sync `AI_CONTEXT.md`,
    `AI_CONTEXT_UI.md` and `Docs/index.html`, then rebuild the `.ccx`.
  * **Acceptance Criteria:** `tsc --noEmit`, `npm run build` and `npm run plugin` pass; every acceptance
    criterion in 3.1-3.6 is demonstrated; docs match the shipped UI.

---

## 7. Verification Matrix

| Area | 320 px | 420 px | 600 px | In Photoshop |
|---|---|---|---|---|
| Four sections closed by default | required | required | required | required |
| Summary lines correct while closed | required | required | required | required |
| Seven icons in one row | required | required | required | required |
| Slider snapping + live relight | required | - | - | required |
| Detach + `↺` | required | - | - | required |
| Three-state toggles | required | required | - | required |
| Link Colours / Link Size | - | required | - | required |
| Ramp chip + dot | required | required | required | - |
| Light row | required | - | - | required |
| Guide takeover + GitHub link | required | required | - | required |
| Foreground streaming | - | - | - | required |

---

## 8. Out of Scope

* **1:1 canvas.** Deferred by the user. When it returns, `src/core/framing.ts` needs a second composition
  contract; do not change the current one as a side effect.
* Lighting, atmosphere, shader and swatch mathematics. V1.1 is a UI phase.
* New presets, new finish modes, camera controls, mesh rotation.
* Persisting panel state (open sections, last preset) across reloads.

---

## 9. Gotchas

1. **Branch switching deletes ignored build artefacts.** `release/*.ccx` is tracked on
   `release/1.0-uxp-plugin` but ignored elsewhere; switching branches removes it from disk. Back it up first.
2. **`plugin/web` must be rebuilt** before any Photoshop test: `npm run plugin`.
3. **Preset application must not mark a manual edit.** Wire the flag only on user-driven setters, or every
   preset click will immediately look detached.
4. **Every lighting control must detach the preset.** V1.0 kept the preset lit when Haze or Terminator moved;
   3.2 fixed those and Ground colour. Any new lighting control must clear the active preset, while preset
   application itself must never trip the flag.
5. **The last sphere guard lives in the model**, not in the button's disabled attribute, so keyboard and
   programmatic paths cannot empty the scene.
6. **Selection fallback** must run before the ramp recomputes, or the ramp will briefly show a disabled sphere.
7. **`<summary>` clicks**: keep interactive controls out of `<summary>`; only the title and summary text.
8. **WebView `window.open`** is unreliable; every external link goes through `open-url`.
9. **Naming is user-facing only.** Ids stay `center/right/left` so persisted state and tests keep working.
10. **`.ccx` version bump** is required for Photoshop to treat a reinstall as new: update
    `plugin/manifest.json` and `package.json` together when shipping V1.1.

---

## 10. V1.2 - Native Photoshop Skin

### 10.0 Status and goal

V1.1 is shipped. V1.2 is a **chrome-only** reskin that makes the panel read as a native Photoshop panel across
Photoshop's four built-in themes. It does not touch the renderer, camera framing, lighting, atmosphere or swatch
mathematics. The only intentional non-Photoshop element is the time-of-day gradient, which stays exactly as it is.

The reference is `_UI/ps-references/ps-reference.png`, a native-resolution capture of the Photoshop window. Task 4.1
verified that its chrome is Photoshop's **Dark Gray** theme, not Medium Gray as first assumed. The exact values and
the frozen four-theme palettes are in 10.3 and 10.3.1.

### 10.1 Non-goals

* No renderer, framing, lighting, atmosphere, shader or swatch-math changes.
* No reordering of the V1.1 spine, no new controls, no new presets.
* No custom Photoshop `UIColors.txt` themes and no detection of the Gray/Blue Highlight setting. These are not
  exposed to plugins.
* No change to the time-of-day gradient, thumb or geometry.
* No attempt to make the Lumiform canvas itself look like a Photoshop document.

### 10.2 Locked decision register (P1-P24)

| ID | Area | Decision |
|---|---|---|
| P1 | Scope | Restyle the entire add-on chrome: panel, header, sections, guide, UXP loading/error shell. The canvas and swatch colours are content. |
| P2 | Fidelity | Match the sampled Photoshop themes exactly; allow only accessibility-driven deviations. |
| P3 | Themes | Support all four: Black, Dark Gray, Medium Gray, Light Gray. |
| P4 | Theme link | The UXP host reads `document.theme` and relays the name to the WebView; the WebView switches token sets live. |
| P5 | Fallback | Default to Dark Gray (the reference theme) and expose a manual Appearance override if `document.theme` is unavailable. |
| P6 | Structure | Flat Photoshop grammar: continuous surfaces, 1 px dividers, no per-section cards, no decorative shadows. |
| P7 | Header | Compact Photoshop-like title row; keep the `i` guide affordance; move the version out of the chrome. |
| P8 | Selection | Use the sampled Photoshop selection tint only for selected/active states. In the reference it is neutral `#6B6B6B`, not blue. |
| P9 | Accent scope | No Lumiform brand blue in the chrome. The only saturated element is the unchanged time-of-day gradient. |
| P10 | Density | 22-24 px rows and controls; 22 px minimum hit target. |
| P11 | Typography | Segoe UI / Windows system stack; 11 px base; no Adobe Clean pack (licence is not an Adobe EULA). |
| P12 | Section titles | Sentence case, 11 px/600, no uppercase tracking. |
| P13 | Numerals | Hex and numeric fields use the UI font with tabular numerals; hex stays uppercase. |
| P14 | Icons | 16 px line icons, 1.5 px stroke, `currentColor`; replace all 14 emoji and the info/reset/close/external-link glyphs. |
| P15 | Time gradient | Keep the entire current time-of-day control exactly as-is: gradient, thumb and geometry. |
| P16 | Guide | Native Photoshop dialog: flat, 1 px border, ~2 px radius, compact title bar, no large shadow or blur. |
| P17 | Contrast | Minimum readable contrast first; adjust Photoshop grays slightly where necessary. |
| P18 | Host shell | The UXP loading/error shell uses native `--uxp-host-*` variables and `prefers-color-scheme`; no WebView palette there. |
| P19 | Reference | Sample from `_UI/ps-references/ps-reference.png`; the values in 10.3 are the starting point, not guesses. |
| P20 | Probe | 4.1 is a dedicated probe build: capture all four themes before the full reskin. |
| P21 | Versioning | V1.2, Stage 4, version 1.2.0, new `.ccx`. |
| P22 | Bootstrap | Pass the current theme in the WebView URL and send live `theme` messages; manual override wins; no first-paint flash. |
| P23 | Unsupported | Custom `UIColors.txt` themes and Gray/Blue Highlight detection are out of scope; the neutral reference selection is the default. |
| P24 | Dev preview | Browser dev defaults to Dark Gray; the Appearance row previews all four themes without Photoshop. |

### 10.3 Reference palette (Dark Gray sample)

`_UI/ps-references/ps-reference.png` samples as Photoshop's **Dark Gray** theme. The controlled 4.1 pass confirmed
it: workspace `#333333`, panel `#535353` and field `#454545` are exactly Adobe's Dark Gray values. The earlier
"Medium Gray" label was an assumption and was wrong; Medium Gray is the third (`light`) token and looks lighter.

| Role | Sampled value | Status |
|---|---|---|
| Workspace / document surround | `#333333` | Matches `ApplicationBackground` exactly |
| Panel body | `#535353` | Matches `ContentBackground` exactly |
| Field / dropdown | `#454545` | Matches `TextFieldBackgroundDefault` exactly |
| Hover / selected row | `#6B6B6B` | Matches the host `toggle-selected` token |
| Panel header | `#424242` | Not a theme token - toolbar chrome |
| Border / divider | `#383838` / `#474747` | Between the host `border` and `border-strong` tokens |
| Primary text | `#F0F0F0` | Approximate; the host token is `#FFFFFF` |
| Secondary text | `#A0A0A0` / `#969696` | Approximate; the host token is `#E5E5E5` |
| Muted text | `#787878` | Not a theme token; the disabled token is `#747474` |
| Status bar | `#696969` with `#4A4A4A` text | Not a theme token - application chrome |

Panel, field and workspace are authoritative. The header, status bar and the sampled text greys are **not** part of
Adobe's four-theme palette - they appear in neither `host-theme.css`, `DesignAppColorThemesV5.xml` nor
`UIColors.txt` - so 10.3.1 uses host tokens and flat dividers instead of inventing values per theme.

The current Lumiform is `#1E1E1E / #262626 / #3B82F6`. It is both too dark and too blue for Dark Gray.
The reference confirms the selection is neutral; there is no blue chrome to reproduce.

### 10.3.1 Theme probe (temporary, task 4.1)

The probe is a throwaway UXP panel that measures Photoshop's real theme values before any reskin code is written.
It is not part of the product and shares no code with `plugin/`.

| Item | Value |
|---|---|
| Source | `tools/theme-probe/` - `manifest.json`, `index.html`, `style.css`, `main.js` |
| Package | `npm run probe:package` -> `release/Lumiform-ThemeProbe-1.0.0.ccx` |
| Reads | `document.theme.getCurrent()`, live `onUpdated` values, every computed `--uxp-host-*` variable (with a swatch), `app.appSkinInfo` colour roles, `prefers-color-scheme`, Photoshop/UXP versions and a timestamped change log |
| Result (PS 26.8 / UXP 8.3) | `document.theme` works and fires live; the four tokens are `darkest`, `dark`, `light`, `lightest`. No `--uxp-host-*` variable resolves in a third-party panel, `app.appSkinInfo` is unavailable, `app.version` is undefined and `matchMedia` does not exist. |
| Writes | `theme-<name>.json` plus `theme-latest.json` into the probe's own `PluginData` folder (`%APPDATA%\Adobe\UXP\PluginsStorage\PHSP\<version>\External\com.lumiform.themeprobe\PluginData`). No document, foreground-colour or product-panel writes. |
| Install | Copy `tools/theme-probe/` into `C:\Program Files\Adobe\Adobe Photoshop 2025\Plug-ins\Lumiform Theme Probe` (admin), or install `release/Lumiform-ThemeProbe-1.0.0.ccx`. Restart Photoshop, then open Plugins > Lumiform Theme Probe. |
| Capture | Switch Photoshop Settings > Interface > Color Theme through Black, Dark Gray, Medium Gray and Light Gray. Each switch writes one JSON automatically; screenshots are optional. |

Why a separate plugin: `document.theme` is undocumented for Photoshop and may change shape. Keeping the probe out of
`plugin/` means no diagnostic code can leak into a 1.2.0 build, and a broken probe cannot break the shipping panel.

The probe also accepts the older `onUpdated.add` / `.on` shapes and polls `getCurrent()` once per 1.2 s, so a build
where the event never fires still reports changes. The change log labels each entry `live` (event) or `poll`
(fallback); a `live` entry is the evidence for "a live change is observed".

The JSON snapshot is the source of truth for the palettes. It carries the theme name, the full host-variable list
with raw and hex values, `appSkinInfo`, the environment and the event log, so the four themes can be frozen by
reading files rather than transcribing screenshots. The panel shows `Saved theme-<name>.json` when a write succeeds
and the failure reason when `localFileSystem` is unavailable.

A controlled pass - Black, then Dark Gray, then Medium Gray, then Light Gray - produced the four tokens in exactly
that order, so the mapping is confirmed:

| Photoshop label | `document.theme` | Panel |
|---|---|---|
| Black | `darkest` | `#323232` |
| Dark Gray | `dark` | `#535353` |
| Medium Gray | `light` | `#B8B8B8` |
| Light Gray | `lightest` | `#F0F0F0` |

`medium` also exists in the manifest icon vocabulary but Photoshop 26.8 never reports it.

#### Frozen palettes and semantic tokens

Every value below comes from Adobe's own files, not from a guess:

* **`Required/UXP/host-theme.css`** - the palette UXP intends plugins to use for panel, text, secondary text,
  border, hover and selected states.
* **`xml/DesignAppColorThemesV5.xml`** - Photoshop's Drover theme roles: `ApplicationBackground` (workspace),
  `ContentBackground` (panel), `TextFieldBackgroundDefault` (field), `ControlTextDefault`, `StaticTextDefault`,
  `StaticTextDisabled`.
* **`Required/UIColors.txt`** - cross-check: `PaletteFill` is 240 / 184 / 83 / 50, the same four panel values.

| Token | Black `darkest` | Dark Gray `dark` | Medium Gray `light` | Light Gray `lightest` |
|---|---|---|---|---|
| `--ps-workspace` | `#1A1A1A` | `#333333` | `#A7A7A7` | `#DCDCDC` |
| `--ps-panel` | `#323232` | `#535353` | `#B8B8B8` | `#F0F0F0` |
| `--ps-header` | `#323232` | `#535353` | `#B8B8B8` | `#F0F0F0` |
| `--ps-field` | `#262626` | `#454545` | `#E2E2E2` | `#FFFFFF` |
| `--ps-hover` | `#3D3D3D` | `#5B5B5B` | `#9D9D9D` | `#CECECE` |
| `--ps-selected` | `#474747` | `#6B6B6B` | `#A5A5A5` | `#BFBFBF` |
| `--ps-border` | `#292929` | `#454545` | `#9C9C9C` | `#D1D1D1` |
| `--ps-border-strong` | `#494949` | `#5A5A5A` | `#CACACA` | `#D3D3D3` |
| `--ps-text` | `#FFFFFF` | `#FFFFFF` | `#424242` | `#4B4B4B` |
| `--ps-text-secondary` | `#9B9B9B` | `#E5E5E5` | `#424242` | `#606060` |
| `--ps-text-muted` | `#525252` | `#747474` | `#8E8E8E` | `#BDBDBD` |
| `--ps-status-bg` | `#323232` | `#535353` | `#B8B8B8` | `#F0F0F0` |
| `--ps-status-text` | `#9B9B9B` | `#E5E5E5` | `#424242` | `#606060` |
| `--ps-focus` | `#FFFFFF` | `#FFFFFF` | `#424242` | `#4B4B4B` |

Notes:

* **Header and status bars use the panel surface** with 1 px dividers. Photoshop exposes no separate token for them,
  and the sampled `#424242` / `#696969` are toolbar/app chrome, not panel roles. Keeping them flat is P6-compliant
  and avoids inventing four more values.
* **Muted text is Adobe's disabled colour.** On the two light themes it fails 4.5:1 as hint text (`#8E8E8E` on
  `#B8B8B8`, `#BDBDBD` on `#F0F0F0`). Task 4.3 darkens it only where it is used for readable hints, which is the
  P17 accessibility deviation.
* **Selection stays neutral.** `#6B6B6B` on Dark Gray is the sampled reference selection; there is no blue in the
  chrome on any theme.

### 10.4 Theme architecture

```
Photoshop Interface ▸ Color Theme
        │ document.theme.getCurrent() / onUpdated
        ▼
UXP host (plugin/main.js)
        │ postMessage({ type: "theme", theme })
        ▼
WebView bridge ──► data-ps-theme
        │
        ▼
Four token sets: black / darkGray / mediumGray / lightGray
```

Rules:

1. **Host detection.** `document.theme.getCurrent()` returns a theme name; `document.theme.onUpdated` fires on
   change. Both are guarded because Photoshop does not officially document them.
2. **Host relay.** The host sends `{ source: 'lumiform-host', type: 'theme', theme }` on `ready` and on every
   change. It also appends `?theme=<name>` to the WebView URL so the first paint is correct.
3. **WebView mapping.** The bridge exposes the theme to the shell; the shell sets `data-ps-theme` on the root.
   Confirmed by the 4.1 controlled pass: `darkest` -> Black, `dark` -> Dark Gray, `light` -> Medium Gray,
   `lightest` -> Light Gray. `medium` exists in the manifest icon vocabulary but Photoshop 26.8 never reports it.
4. **Token sets.** Each theme defines workspace, panel, header, field, hover, selected, border, border-strong,
   text, text-secondary, text-muted, status and focus tokens; the frozen values are in 10.3.1.
5. **Manual override.** The guide's Appearance row offers `Auto / Black / Dark Gray / Medium Gray / Light Gray`.
   Auto follows the host; a manual choice wins until Auto is selected. Persist in `localStorage`.
6. **Host shell.** The UXP loading/error overlay uses `--uxp-host-*` and `@media (prefers-color-scheme)` directly;
   the WebView cannot read those variables.
7. **Failure.** If `document.theme` is unavailable, default to Dark Gray and keep the manual override.
8. **Unsupported.** Custom `UIColors.txt` themes and the Gray/Blue Highlight setting cannot be read. The neutral
   sampled selection is the default.

### 10.5 Stage 4 roadmap

States follow the parent protocol. Every Stage 4 task is `Done`; Stage 5 (section 11) is active.

* [x] **Task 4.1: Theme probe, reference freeze and token foundation**
  * **State:** `Done`
  * **Description:** Added the temporary UXP theme probe (`tools/theme-probe/`, packaged with
    `npm run probe:package`) reporting `document.theme.getCurrent()`, live updates, `--uxp-host-*`,
    `app.appSkinInfo`, environment and a timestamped log, with one JSON snapshot per theme. The controlled pass
    confirmed Black/Dark Gray/Medium Gray/Light Gray -> `darkest`/`dark`/`light`/`lightest`; the four palettes and
    the semantic token sheet were frozen in 10.3.1 from Adobe's `host-theme.css`, `DesignAppColorThemesV5.xml` and
    `UIColors.txt`. No reskin behaviour shipped.
  * **Acceptance Criteria:** Met - a theme name was captured for each of the four Photoshop themes, live changes
    were observed (`onUpdated`), the four palettes and token sheet are documented, and no reskin code shipped.
  * **Evidence:** probe captures at 18:12 and the controlled pass at 18:34-18:35; `theme-d/darkest/light/lightest.json`
    and `theme-latest.json` in the probe's `PluginData` folder.

* [x] **Task 4.2: Flat shell, compact header and status bar**
  * **State:** `Done`
  * **Description:** Replaced section cards with flat rows on the panel surface, 1 px dividers, no shadows and 2 px
    radii. Added the 28 px header, the workspace matte around the unchanged 412:227 canvas and the 24 px pinned
    status bar. Added the four frozen palettes behind `data-ps-theme` (Dark Gray default) and neutralised the
    remaining blue chrome. Preserved the V1.1 spine, closed `<details>` defaults and live summaries.
  * **Acceptance Criteria:** Met - at 320/420/600 there is no card look, the header is 28 px, the status bar is
    24 px and pinned, all four closed summaries remain live (24 px rows), and the active palette is applied for all
    four themes. Verified with computed styles and width sweeps; no horizontal control overflow.

* [x] **Task 4.3: Control reskin**
  * **State:** `Done`
  * **Description:** Reskinned buttons, three-state sphere toggles, link rows, a custom checkbox, hex/number fields,
    disclosures, swatches and sliders at 24 px with 2 px radii. Selected states use the neutral token, hover has no
    lift or glow, focus is a 1 px ink outline, and fields use Segoe UI with tabular numerals. Slider rules are
    scoped with `:not(.time-range)`, leaving the time gradient, thumb and geometry untouched.
  * **Acceptance Criteria:** Met - no clipped controls at 320 px (ground presets reflow to 2x2), selected states use
    the sampled tint, no blue chrome, no hover lift, and the time control geometry is unchanged.

* [x] **Task 4.4: Typography and icon set**
  * **State:** `Done`
  * **Description:** Segoe UI at 11 px, sentence-case section titles and tabular numerals. Replaced all 14 emoji and
    the info/reset/close/external-link glyphs with 19 inline SVGs on a 16x16 grid, 1.5 px stroke, `currentColor`.
  * **Acceptance Criteria:** Met - no emoji remains in the DOM, icons render at 16 px (14 px inline) and inherit the
    theme ink, labels and aria text are intact, and the seven time icons stay on one row at 320 px.

* [x] **Task 4.5: Live theme linking and Appearance override**
  * **State:** `Done`
  * **Description:** The UXP host reads `document.theme` and relays `{ type: "theme" }` on ready and on every
    `onUpdated`; the WebView URL carries `?theme=<token>` for first paint. The bridge exposes `onThemeChange`, and
    the guide gains an `Auto / Black / Dark Gray / Medium Gray / Light Gray` row persisted in
    `localStorage`. The mock bridge mirrors the host for browser development.
  * **Acceptance Criteria:** Met - a simulated host switch changes the panel live in Auto, a pinned choice survives
    reloads and ignores host changes, Auto resumes following the host, the fallback is Dark Gray, and there is no
    update loop. The in-Photoshop live check is part of 4.7.

* [x] **Task 4.6: Guide and UXP host shell**
  * **State:** `Done`
  * **Description:** Restyled the guide as a native dialog: 1 px border, 2 px radius, 28-30 px title bar, flat
    sections with hairline dividers, no large shadow, sentence-case headings, and the Appearance row above GitHub.
    Rewrote the UXP host shell to follow Photoshop with `prefers-color-scheme` blocks and `--uxp-host-*` fallbacks,
    with a neutral spinner and button.
  * **Acceptance Criteria:** Met in the browser: the guide covers the panel and is readable in all four themes
    (verified by computed colours), Back/Esc/backdrop close it, sections stay flat, and there is no blue in the
    guide or host shell. The in-Photoshop host-shell check is part of 4.7.

* [x] **Task 4.7: Verification, documentation and release**
  * **State:** `Done`
  * **Description:** Verified 320/420/600 across all four themes and in Photoshop by switching themes live, and
    checked contrast, focus, truncation and the unchanged time gradient. Closed the defects found during install:
    per-panel reset buttons for Spheres, Sun & Atmosphere, Ground Surface & Color and Surface Finish &
    Reflectivity; the time-of-day slider alignment at 320/420/600; the GitHub link (`launchProcess.schemes:
    ["https"]`); and Windows UXP keyboard forwarding (`plugin/command-queue.js`, one interactive modal session
    reused across a shortcut burst, released after 750 ms idle or on pointer-leave). Synced the three docs, bumped
    to 1.2.0 and rebuilt `release/Lumiform-Colorpicker-1.2.0.ccx`.
  * **Acceptance Criteria:** Met - `tsc --noEmit`, `npm run build` and `npm run plugin` pass; every earlier
    criterion is demonstrated; the four-theme screenshots and docs match; `Lumiform-Colorpicker-1.2.0.ccx` is
    produced and installed. In-Photoshop live acceptance of the session-modal latency remains a manual check; the
    known limit (the WebView cannot hand keyboard focus back to Photoshop on Windows) is documented and worked
    around by forwarding shortcuts.

### 10.6 Verification matrix

| Area | 320 px | 420 px | 600 px | In Photoshop |
|---|---|---|---|---|
| Four themes, closed sections | required | required | required | required |
| Live theme switch | required | required | required | required |
| Manual Appearance override | required | required | required | required |
| Flat shell / no cards | required | required | required | required |
| Controls at 22-24 px | required | required | required | required |
| No emoji / line icons | required | required | required | required |
| Time gradient unchanged | required | required | required | required |
| Guide native dialog | required | required | required | required |
| Host loading/error shell | - | - | - | required |
| Contrast / focus states | required | required | required | required |

### 10.7 Risks and fallbacks

1. **`document.theme` is undocumented for Photoshop.** Resolved for 26.8: `getCurrent()` and `onUpdated` both work.
   Keep the manual Appearance row as the fallback for other builds.
2. **Exact grays for four themes.** Resolved in 4.1 from Adobe's files; the probe cannot read them directly
   because third-party panels get no host variables and no `appSkinInfo`.
3. **Light Gray contrast.** Adobe's disabled colour fails 4.5:1 as hint text on the light themes; darken only the
   hint usage, which is the approved P17 deviation.
4. **Time gradient on light themes.** It is the one intentional exception; keep it exactly and test the
   surrounding flat row in all four themes.
5. **Host variables are fragile.** Use them for the host shell and probe calibration, not as the WebView's
   runtime colour source.
6. **Legacy host shell literals.** `plugin/style.css` hard-codes `#1e1e1e`, `#ececec` and `#3b82f6`; replace them
   with native host variables and a neutral spinner.
7. **First-paint flash.** Pass the theme in the WebView URL and apply it before the app renders.
8. **Scope creep.** No renderer, lighting, framing or swatch-math changes.

### 10.8 Assumed defaults

* **Status bar:** panel surface with a 1 px top divider and secondary text; muted neutral connection dot; red only
  on error. The sampled `#696969` is application chrome, not a panel token.
* **Focus ring:** 1 px text-colour outline at ~60%, no glow.
* **Time slider:** keep the entire current control exactly.
* **Appearance row:** in the guide, directly above GitHub.
* **Probe:** temporary plugin with theme name, host-variable scan, environment and one JSON snapshot per theme.
* **Icons:** sunrise, sun-behind-cloud, sun, high sun, sunset, golden sun, crescent moon; grass/leaf, neutral
  circle, soil, sand; matte circle, satin sparkle, glossy diamond; plus info, reset, close and external-link.
* **Browser dev:** defaults to Dark Gray; `?theme=<token>` bootstraps the mock and
  `window.__lumiformMockTheme('lightest')` simulates a live host switch. The Appearance row previews all four
  themes.

### 10.9 Definition of done

See 2.6. In short: all four themes live, manual override works, flat native chrome, no emoji or blue, time
gradient unchanged, 1.2.0 `.ccx` built, and the three docs synced.

### 10.10 File map for V1.2

| File | V1.2 responsibility |
|---|---|
| `src/ui/styles/theme.css` | Four theme token sets; flat surface/control styles |
| `src/ui/shell.ts` | Theme data attribute, Appearance row, compact header, flat layout |
| `src/ui/colorControls.ts` | Flat fields, sentence-case labels, line icons |
| `src/ui/swatchRamp.ts` | Flat ramp header/tiles, no hover lift |
| `src/ui/statusBar.ts` | Native status bar treatment |
| `src/bridge/*` | `theme` host-to-web message and mock theme source |
| `plugin/main.js` | `document.theme` probe, relay, URL bootstrap |
| `plugin/index.html`, `plugin/style.css` | Native loading/error shell and host theme variables |
| `Docs/AI_CONTEXT_UI.md` | This plan |
| `Docs/index.html` | Human tracker: tab 8 and Stage 4 |

---

## 11. V1.3 - Workspace Layout

### 11.0 Status and goal

V1.2 shipped a chrome-only skin and the preview stayed locked to 412:227. In a docked 235-260 px column that is a
130-145 px picture: the fixed shape is the reason artists cannot fit the panel to their workspace. V1.3 makes the
preview a resizable reference sheet with a bounded aspect range, keeps the preview fixed above one scrolling list,
and floats the Time of Day slider and the Ramp swatches on the render when those rows are collapsed. It is the first
phase since V1.0 that touches framing, and only framing: the camera and the three sphere slot positions are re-solved
per aspect, while sphere geometry, materials, lighting, atmosphere, shaders and swatch maths stay exactly as they are.

### 11.1 Locked decision register (W1-W14)

| # | Decision | Locked value |
|---|---|---|
| W1 | Phase | V1.3, Stage 5. Starts only after 1.2.0 is closed out and pushed. |
| W2 | Aspect range | Bounded, never portrait: `height <= width`. Snap stops at the reference 412:227 (`height = 0.551 x width`) and 1:1 (`height = width`). No arbitrary ratios beyond the range. |
| W3 | Framing behaviour | Fill. The three spheres keep their reference fractions of frame height (40.0 / 27.8 / 10.4 %) and their centre X fractions (49.9 / 79.0 / 18.8 %); the horizon stays at 55.1 % of height. Camera and slot positions are re-solved for the actual aspect. Because the aspect never drops below 1.0, the composition never clips. |
| W4 | Resize source | Photoshop's native panel resize sets the width. A 6 px drag splitter directly under the preview sets its height. |
| W5 | Panel width change | Keep the height the user set and clamp it to the new width. Double-click toggles the two snap stops (reference <-> 1:1). |
| W6 | Splitter affordance | 6 px grab strip, 1 px rule in the middle, transparent until hover; strong line plus `row-resize` on hover and while dragging. `role="separator"`, focusable; Arrow 8 px, Shift+Arrow 32 px, Home = reference, End = 1:1. |
| W7 | Dock order | `header -> preview (+ floating slider / ramp swatches) -> splitter -> scrolling list (Time of Day, Ramp, Spheres, Sun, Ground, Finish) -> status bar`. One scrollbar belongs to the list. |
| W8 | List minimum | None. The list may be dragged to 0 and hidden completely. The splitter stays reachable above the Time of Day row; "Reset layout" in the guide restores a working split. |
| W9 | Wheel | Hovering the preview or the splitter never scrolls anything; the list scrolls only with the pointer over it. |
| W10 | Time of Day | Row: `Time of Day` + state (`Midday`, `Midday - edited`) + reset (always visible, in both states) + chevron. Expanded: the seven icons and the slider in place. Collapsed: a bare slider track floats on the bottom inside edge of the preview - 35 % at rest, 100 % while the pointer is in the bottom 28 px band, back to 35 % on leave; clickable and draggable at all times; sampling under the band still works unless the track itself is pressed. |
| W11 | 5-Value Ramp | No in-body header. Row: `5-Value Ramp` + selected sphere name + albedo dot + chevron. Expanded body: the five labelled tiles. Collapsed: five small swatches float centred on the preview's bottom edge; both surfaces paint. |
| W12 | Persistence | `localStorage`: preview height, Time of Day collapsed, Ramp collapsed, the four section open states. "Reset layout" in the guide clears all of them. |
| W13 | Existing resets | The four per-panel reset buttons (Spheres, Sun, Ground, Finish) and the Time of Day reset are unchanged. |
| W14 | Scope guard | No sphere geometry, material, light, atmosphere, shader or swatch-math change. Only `src/core/framing.ts`, the viewport layout code, the panel DOM/CSS and layout persistence change. |

### 11.2 Stage 5 roadmap

States follow the parent protocol. Stage 5 is complete; no task is `current`.

* [x] **Task 5.1: Aspect-aware framing**
  * **State:** `Done`
  * **Description:** `src/core/framing.ts` now exposes a pure `buildFraming(aspect)` and keeps the reference
    `FRAMING`. The lens, camera, horizon and the three depth distances stay fixed, so the sphere diameters remain
    fractions of the frame height and every world-space haze constant keeps its meaning; only the horizontal slot
    positions follow the frame width, solving each centre back onto its reference width fraction. `Viewport`
    rebuilds the framing on every resize and moves the three meshes in one callback, and the swatch ramp reads the
    fixed view depth instead of the Euclidean distance.
  * **Acceptance Criteria:** Met - at 412:227 the framing is arithmetically identical (asserted by test); at 1:1
    the three spheres keep 40.0/27.8/10.4 % of height and 49.9/79.0/18.8 % of width, the horizon stays at 55.1 %,
    and no sphere clips from 1:1 to 6:1. No lighting, material, atmosphere or shader value changed.
  * **Evidence:** `npm run test:framing` (5 tests), `tsc --noEmit`, `npm run build`; browser checks at 1:1 and
    3.26:1. Commit `d07615e`.

* [x] **Task 5.2: Fixed dock, splitter and scroll region**
  * **State:** `Done`
  * **Description:** The panel is a fixed preview + splitter above one scrolling list (Time of Day, Ramp, Spheres,
    Sun, Ground, Finish). The splitter is a focusable `separator` with a 6 px grab strip inside the 8 px matte,
    pointer capture, rAF-throttled height updates, reference and 1:1 snaps, a double-click toggle and Arrow/Home/End
    keys. The preview height is clamped from live panel, dock and frame measurements so a short panel collapses the
    list instead of squeezing the preview.
  * **Acceptance Criteria:** Met - one scrollbar belongs to the list, scrolling leaves the preview fixed, the splitter
    reaches reference, 1:1 and a 0-height list on a short panel, and both pointer and keyboard work.
  * **Evidence:** Preview stays at `y = 28` while the list scrolls 300 px; Time of Day scrolls with the list; the
    panel and `document` never scroll; drag 268 -> 348 px, `End` -> square, `Home` -> reference, double-click
    toggles; a 620 px panel clamps the preview and the list becomes 0. `tsc`, `npm run build`, framing and queue
    tests pass. Commits `8f54584`, `f28eb3b`.

* [x] **Task 5.3: Collapsible Time of Day and floating slider**
  * **State:** `Done`
  * **Description:** Time of Day is a `<details>` row with the preset name, edited marker, reset and chevron. Collapsed,
    the single slider element moves into a full-bleed band below the canvas (36 px) and the preview frame grows to
    host it; the track is 35 % at rest, 100 % while the pointer is in the band, and clickable throughout. The whole
    band also starts the splitter drag, except the track, so resizing works from the natural grab area.
  * **Acceptance Criteria:** Met - expanded shows icons + slider, collapsed shows the row + floating slider, both stay
    in sync with the lighting engine, the reset works in both and never toggles the row, and sampling is untouched
    because the band sits below the render.
  * **Evidence:** Slider parent flips between `#time-strip` and `#preview-time-slider`; opacity 0.35/1.0 tracks the
    28 px band; a collapsed drag 292 -> 332 px, `End` -> 530, `Home` -> 292; a press on the track does not resize;
    the canvas is full-bleed (border 0, padding 0) with 13 px above and 19 px below the track. Commits `1191005`,
    `acfd09e`, `14053a0`, `2ddbb09`.

* [x] **Task 5.4: Compact 5-Value Ramp**
  * **State:** `Done`
  * **Description:** The ramp matches the approved mockup. Expanded, the section body keeps the full labelled
    `HL / HT / TERM / CORE / BNC` tiles with hex values; the row carries the albedo dot and the selected sphere
    name. Minimized, the body is hidden and five 24 px swatches float centred 8 px above the canvas bottom, sharing
    the click-to-paint path and the flash feedback.
  * **Acceptance Criteria:** Met - clicking still paints from both surfaces, the ramp follows the selected sphere
    and every lighting change, and the minimized palette appears only while the section is closed.
  * **Evidence:** Expanded 5 labelled tiles (`HL #D3D0CC`) at 108 px; minimized 5 swatches, 132 x 24, centred, 8 px
    above the canvas; clicking TERM sets `#3D605E`; the row updates to `Mid` on selection. Commit `9c144ec`.

* [x] **Task 5.5: Layout persistence and Reset layout**
  * **State:** `Done`
  * **Description:** A versioned `lumiform.layout.v1` entry stores the preview height, Time of Day and Ramp disclosure
    and the four section open states. It is restored before the widgets bind; the splitter saves on commit and every
    disclosure saves on `toggle`. The guide gained a Layout section with Reset layout.
  * **Acceptance Criteria:** Met - the pinned height, both essentials' collapsed state and the open sections survive a
    reload; corrupt or out-of-range values fall back to defaults; Reset layout restores the shipped state.
  * **Evidence:** 1:1 + Time collapsed + Ramp collapsed + Spheres/Ground open restored exactly after reload; corrupt
    JSON produced the reference layout with no error; Reset layout returned 268 px, both essentials open and all
    sections closed. Commit `4d34e69`.

* [x] **Task 5.6: Verification, documentation and release**
  * **State:** `Done`
  * **Description:** The 11.3 matrix ran in the browser at 320/420/600 and in Photoshop, the three docs were synced to
    the revised scroll order, the version moved to 1.3.0 and the `.ccx` was built, installed and accepted.
  * **Acceptance Criteria:** Met - `tsc --noEmit`, `npm run build`, the framing and queue tests and `npm run plugin`
    pass; the browser matrix and the in-Photoshop pass both hold; the docs match; `Lumiform-Colorpicker-1.3.0.ccx` is
    produced.
  * **Evidence:** Reference 320x176 / 420x231 / 600x331 and 1:1 320x320 / 420x420 / 600x550 (height-capped) with no
    horizontal overflow; a 320x420 panel clamps to 277 and the list goes to 0; widening 320 -> 420 keeps the set
    height; the four themes map to `#323232`, `#535353`, `#B8B8B8`, `#F0F0F0`; the 1.3.0 build was installed with all
    six files hash-matching and passed the user's in-Photoshop check. Commits `c76ac64`, `13b5d47`.

### 11.3 Verification matrix

| Area | 320 px | 420 px | 600 px | Tall narrow dock | Short wide dock | In Photoshop |
|---|---|---|---|---|---|---|
| Reference 412:227 render identical | required | required | required | - | - | required |
| 1:1 render, no clip | required | required | required | required | - | required |
| Intermediate aspect via splitter | required | required | required | required | required | required |
| Panel width change keeps height | - | - | - | required | required | required |
| Dock fixed, list scrolls | required | required | required | required | required | required |
| List hidden to 0 and restored | required | - | - | required | required | required |
| Floating time slider reveal/opacity | required | required | required | required | required | required |
| Compact ramp, click to paint | required | required | required | required | required | required |
| Layout persistence | - | - | - | - | - | required |
| Four themes unchanged | required | required | required | required | required | required |

### 11.4 Risks and fallbacks

1. **Framing re-solve moves the spheres.** The eyedropper reticle and sampling use container coordinates, so
   verify that sampling still matches the rendered pixel after a resize. Fallback: sample from the renderer
   readback the same way, independent of slot positions.
2. **Renderer resize cost while dragging.** Throttle `setSize` and the camera update to one animation frame and
   avoid reallocating geometry.
3. **A DOM slider over a WebGL canvas.** Keep the overlay outside the canvas element, with pointer events only on
   the track, and do not put a compositing layer over the whole canvas.
4. **Hidden list discoverability.** The splitter is always visible above the Time of Day row; double-click returns
   to a snap stop; the guide documents Reset layout.
5. **`localStorage` inside the UXP WebView.** The theme preference already persists there; verify layout values
   survive a full panel reload and fall back to defaults when invalid.
6. **Short-panel arithmetic.** The preview plus the two rows can exceed a very short panel; clamp the preview first
   and let the list reach 0 rather than overflowing the panel.
7. **Scope creep.** No lighting, material, atmosphere, shader or swatch change in this phase.

### 11.5 File map for V1.3

| File | V1.3 responsibility |
|---|---|
| `src/core/framing.ts` | `buildFraming(aspect)`, reference export retained |
| `src/render/Viewport.ts` | Re-solve camera and slots on resize inside one frame |
| `src/ui/shell.ts` | Dock structure, splitter, Time of Day disclosure, floating slider, persistence wiring |
| `src/ui/swatchRamp.ts` | Compact body, row summary and mini chips |
| `src/ui/layout.ts` | New: splitter controller and `localStorage` layout store |
| `src/ui/styles/theme.css` | Dock/scroll regions, splitter, floating slider, compact ramp |
| `Docs/AI_CONTEXT_UI.md` | This plan |
| `Docs/index.html` | Human tracker: Stage 5 |

---

## 12. Change Log

| Date | Change |
|---|---|
| 2026-11-01 | Document created. V1.1 UI decisions captured and Stage 3 roadmap added. |
| 2026-11-01 | Task 3.1 verified and marked Done. Panel spine, closed `<details>` sections and live summaries are implemented; Task 3.2 is current. |
| 2026-11-01 | Task 3.2 verified and marked Done. Chronological icon strip, snapped slider, live relighting and the six-control detach/reset model are implemented; Task 3.3 is current. |
| 2026-11-01 | Task 3.3 verified and marked Done. Near/Mid/Far three-state toggles, the merged Spheres panel, Link Size and restore-on-re-enable are implemented; Task 3.4 is current. |
| 2026-11-01 | Task 3.4 verified and marked Done. The ramp header now shows the selected sphere and an albedo dot; the analytical grid and click-to-paint path are unchanged. Task 3.5 is current. |
| 2026-11-01 | Task 3.5 verified and marked Done. The labelled Light row is in place, the albedo chip sends immediately, and H/S/B plus valid hex stream at one write per frame. |
| 2026-11-01 | Task 3.6 verified and marked Done. The full-panel guide takeover, GitHub row and https-only `open-url` bridge are implemented. |
| 2026-11-01 | Task 3.7 verified and marked Done. Version bumped to 1.1.0, `tsc`/build/plugin pass, docs synced, and the 1.1.0 `.ccx` packaged. In-Photoshop acceptance remains the user's manual check. |
| 2026-11-01 | V1.2 plan locked. The Photoshop reference sampled Medium Gray chrome; the four-theme host relay, flat native skin, line icons, Segoe UI, neutral selection and manual Appearance override were agreed. Stage 4 added with Task 4.1 current. |
| 2026-11-01 | Task 4.1 probe built in `tools/theme-probe/` and packaged as `Lumiform-ThemeProbe-1.0.0.ccx`. It reports the theme name, live `onUpdated` events, `--uxp-host-*` colours and `app.appSkinInfo`, and saves one JSON snapshot per theme into its `PluginData` folder so palettes are frozen from exact values instead of screenshots. Installed into Photoshop's `Plug-ins` folder for the capture run. |
| 2026-11-01 | Task 4.1 Done. The probe confirmed live `document.theme` changes but found no `--uxp-host-*` variables and no `app.appSkinInfo` in a third-party panel. Photoshop's own `host-theme.css`, `DesignAppColorThemesV5.xml` and `UIColors.txt` supplied the authoritative four-theme palette. A controlled Black -> Dark Gray -> Medium Gray -> Light Gray pass confirmed `darkest` / `dark` / `light` / `lightest`. The reference was re-identified as **Dark Gray**, not Medium Gray, and the sampled header/status greys were found not to be theme tokens. The four palettes and the semantic token sheet are frozen in 10.3.1. Task 4.2 is current. |
| 2026-11-01 | Task 4.2 Done. Flat surfaces replace the card stack: 28 px header, 1 px dividers, workspace matte around the unchanged canvas, 24 px status bar and no decorative shadows. The four frozen palettes live behind `data-ps-theme` with Dark Gray as the P5/P24 fallback; the legacy V1.1 tokens alias the new semantic ones. Verified at 320/420/600 with no control overflow. Task 4.3 is current. |
| 2026-11-01 | Task 4.3 Done. Controls use 24 px rows, 2 px radii, a custom neutral checkbox, Segoe UI tabular numerals in hex/number fields, and neutral hover/selected states with no lift or glow. Slider changes are scoped with `:not(.time-range)`, so the time-of-day gradient, thumb and geometry remain untouched. Ground presets reflow to 2x2 below 380 px; no controls clip at 320. |
| 2026-11-01 | Task 4.4 Done. All 14 emoji and the info/reset/close/external glyphs are replaced by 19 inline 16 px line SVGs (1.5 px stroke, `currentColor`); the seven time icons stay on one row at 320 px and labels/aria text are unchanged. Version bumped to 1.2.0 and `release/Lumiform-Colorpicker-1.2.0.ccx` packaged for the first in-Photoshop review. Task 4.5 is current. |
| 2026-11-01 | Task 4.5 Done. The host relays `document.theme` live and appends `?theme=` to the WebView URL; the bridge exposes `onThemeChange`; the guide's Appearance row offers Auto plus the four themes and persists the choice in `localStorage`. Verified in the browser with the mock: Auto follows simulated host switches, a pinned theme survives reloads and ignores host changes, and the URL bootstrap paints the right palette before the shell renders. The 1.2.0 package was rebuilt with the relay. Task 4.6 is current. |
| 2026-11-01 | Task 4.6 Done. The guide is a flat native dialog (1 px border, 2 px radius, compact title bar, hairline section dividers, no shadow) with the Appearance row above GitHub; Back/Esc/backdrop all close it. The UXP loading/error shell now follows the four themes through `prefers-color-scheme` with `--uxp-host-*` fallbacks, a neutral spinner and no blue. Verified in the browser; the host-shell theme check remains for 4.7, which is current. |
| 2026-11-02 | Task 4.7 Done and V1.2 closed. Per-panel reset buttons for Spheres, Sun & Atmosphere, Ground Surface & Color and Surface Finish & Reflectivity; the time-of-day slider re-centred at 320/420/600; the GitHub link fixed through `launchProcess.schemes: ["https"]`; Windows UXP keyboard forwarding added (`command-queue.js`, one interactive modal session reused across a burst, released after 750 ms idle or pointer-leave). `tsc`/build/plugin pass, `Lumiform-Colorpicker-1.2.0.ccx` packaged and installed, docs synced. |
| 2026-11-02 | V1.3 plan locked as Stage 5 (section 11). The preview becomes a resizable reference sheet: bounded aspect from 412:227 to 1:1, fill framing with re-solved slots, a splitter under the preview, a fixed dock for the preview + Time of Day + Ramp, a scrolling section list that can be hidden to 0, a bare floating time slider at 35/100/35 % opacity, a compact ramp with no in-body header, and persisted layout state. No lighting, material, atmosphere, shader or swatch change. |
| 2026-11-02 | Task 5.1 Done. `buildFraming(aspect)` keeps the lens, camera, horizon and depth fixed and moves only the horizontal slot positions, so the sphere sizes, haze and swatch ramp are invariant while the composition fits any frame from 1:1 to a wide strip. `Viewport` re-solves on resize; `test:framing` covers the reference identity, 1:1, wide strips, clipping and invalid aspects. |
| 2026-11-02 | Task 5.2 Done. The panel is a fixed preview + splitter above one scrolling list (Time of Day, Ramp, Spheres, Sun, Ground, Finish) with a single scrollbar below the preview. The splitter has pointer capture, rAF-throttled heights, reference/1:1 snaps, a double-click toggle and Arrow/Home/End keys; short panels collapse the list. |
| 2026-11-02 | Task 5.3 Done. Time of Day is a details row and, collapsed, moves its single slider into a full-bleed band below the canvas (35 / 100 / 35 % opacity, 36 px band, the whole band drags the splitter except the track). The canvas lost its matte, border and radius: it now meets the panel edges. |
| 2026-11-02 | Task 5.4 Done. The ramp matches the approved mockup: expanded keeps the fully labelled tiles and the row carries the albedo dot + sphere name; minimized hides the body and floats five 24 px swatches 8 px above the canvas bottom, with the same click-to-paint path. |
| 2026-11-02 | Task 5.5 Done. The layout persists in `lumiform.layout.v1` (preview height, both essentials' disclosure and the four section rows), restores before bind, and falls back to the shipped defaults on corrupt data. The guide gained a Layout section with Reset layout. |
| 2026-11-02 | Revision during 5.6: Time of Day and the 5-Value Ramp moved from the fixed dock into the scrolling list, so only the preview and splitter stay fixed and one scrollbar covers every row. The floating slider and the floating ramp swatches stay on the preview when those rows are collapsed. |
| 2026-11-02 | Task 5.6 release pass: browser matrix at 320/420/600 (reference, 1:1, height clamp, 0-height list, width-change height retention, four themes), version 1.3.0 packaged and installed. |
| 2026-11-02 | Task 5.6 Done and V1.3 closed. The 11.3 matrix passed at 320/420/600 (reference and 1:1 renders, height clamp, 0-height list, width-change height retention, floating slider and ramp, four themes) plus the manual Photoshop pass (splitter drag/Home/End/double-click, floating controls, persistence, Reset layout, forwarded shortcuts). `release/Lumiform-Colorpicker-1.3.0.ccx` is built, installed and accepted. |
| 2026-11-02 | **1.3.1 color-picker fix.** The crosshair puck's box is now exactly the ring, so the element centre, the crosshair and the sampled pixel coincide (the old 18 px badge made the ring sit 11.5 px above the sampled point). The hex badge is absolutely positioned and appears only while dragging; the puck rests at 35 % opacity and reaches 100 % while dragged. Verified against `gl.readPixels`: the sampled hex equals the badge and the ring colour. Accepted in Photoshop. |
| 2026-11-02 | **1.3.2 removes shortcut forwarding.** The panel no longer captures letters/brackets or replays Photoshop tools, brush size, history, clipboard, save, group or color actions. The forwarding was swallowing most Photoshop shortcuts, diverging from Photoshop's behaviour (Shift+letter, tool cycling, Ctrl+Shift+N) and holding an interactive modal session open, which added lag to tool switches and painting. `command-queue.js`, its test, the bridge message types and the host handlers are gone; clicking the document returns the keyboard to Photoshop. Accepted in Photoshop: tool keys, Ctrl+Z/T/0, Shift+letter cycling and painting all behave natively with no lag. |
| 2026-11-17 | **1.3.3 release polish.** Kept the shipped 3D color picker behavior, fixed the double-encoded panel text (middle dots, degrees, dashes and the reset arrow), and added the new Lumiform Photoshop icon as 23/46 px panel icons plus 24/48 px Plugins-panel icons, with the required `@1x`/`@2x` filenames and `species` panel/pluginList. Rebuilt the inlined panel, `.ccx` and ZIP. |
