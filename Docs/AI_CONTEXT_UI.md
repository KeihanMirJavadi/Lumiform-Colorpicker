# AI_CONTEXT_UI.md - V1.1 UI Redesign & V1.2 Native Photoshop Skin

> **AUDIENCE**: AI agents and developers implementing the V1.1 panel redesign and the V1.2 native Photoshop skin.
> **PARENT DOCUMENT**: [AI_CONTEXT.md](./AI_CONTEXT.md) - architecture, lighting model, add-on runtime and the
> authoritative roadmap states. Read that file first; this file covers the UI phases.
>
> **V1.2 PLAN**: The locked native-skin plan is section 10. V1.1 is shipped; V1.2 is the active UI phase.

---

## 0. Status Snapshot

| Item | Value |
|---|---|
| Phase | **V1.1 - UI Design** (Stage 3, complete) · **V1.2 - Native Photoshop Skin** (Stage 4, 4.1 current) |
| Branch | V1.1: `feature/3.1-ui-redesign`; V1.2: `feature/4.1-native-ps-skin` |
| Shipped baseline | v1.0.0, frozen on `release/1.0-uxp-plugin` @ `1181f9e` (source + `.ccx`) |
| Current release | v1.1.0 - `release/Lumiform-Colorpicker-1.1.0.ccx` |
| Next release | v1.2.0 - `release/Lumiform-Colorpicker-1.2.0.ccx` (planned) |
| Current task | **4.1 - Theme probe, reference freeze and token foundation** |
| Renderer changes | None across V1.1/V1.2. `src/core/framing.ts` and the shaders stay untouched. |
| Reference | `_UI/ps-references/ps-reference.png` - the Photoshop chrome capture sampled in section 10.3 |
| Deferred | The 1:1 canvas request (item 1 of the original brief) is **out of scope** for both UI phases. |

The V1.1 panel is built and packaged. V1.2 restyles its chrome to Photoshop's four built-in themes; it does not
change the lighting, atmosphere, framing or swatch mathematics. The V1.2 plan is section 10.

---

## 1. How To Use This Document

1. Read [AI_CONTEXT.md](./AI_CONTEXT.md) section 1 (the operating protocol) - it still governs task states,
   the single-`current` rule and the approval gate.
2. Read this file end to end before writing UI code.
3. Find the active task: section 6 for the V1.1 tasks (complete) or section 10 for V1.2. Only **4.1** is
   `current`; implement only that task.
4. Report, wait for approval, then sync states in **three** places: `AI_CONTEXT.md`, this file and
   `Docs/index.html`.

Sections 3-5 are the V1.1 behavioural design and remain normative. Section 10 is normative for the V1.2 visual
skin and theme behaviour. If an implementation detail contradicts either, the document wins until the user
says otherwise.

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
* The panel scrolls as a whole (`.panel-content`); the header and status bar stay put.
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

The reference is `_UI/ps-references/ps-reference.png`, a native-resolution capture of the Photoshop window. Its
chrome samples as Photoshop's **Medium Gray** theme. The exact values are in 10.3; the probe in 4.1 confirms the
name and captures the other three themes.

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
| P5 | Fallback | Default to Medium Gray and expose a manual Appearance override if `document.theme` is unavailable. |
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
| P24 | Dev preview | Browser dev defaults to Medium Gray; the Appearance row previews all four themes without Photoshop. |

### 10.3 Sampled reference palette (Medium Gray)

| Role | Sampled value |
|---|---|
| Workspace / document surround | `#333333` |
| Panel body | `#535353` |
| Panel header / toolbar | `#424242` |
| Field / dropdown | `#454545` |
| Hover / selected row | `#6B6B6B` |
| Border / divider | `#383838` / `#474747` |
| Primary text | `#F0F0F0` |
| Secondary text | `#A0A0A0` / `#969696` |
| Muted text | `#787878` |
| Status bar | `#696969` with dark `#4A4A4A` text |

The current Lumiform is `#1E1E1E / #262626 / #3B82F6`. It is both too dark and too blue for this theme.
The reference confirms the selected row is neutral; there is no blue chrome to reproduce.

### 10.3.1 Theme probe (temporary, task 4.1)

The probe is a throwaway UXP panel that measures Photoshop's real theme values before any reskin code is written.
It is not part of the product and shares no code with `plugin/`.

| Item | Value |
|---|---|
| Source | `tools/theme-probe/` - `manifest.json`, `index.html`, `style.css`, `main.js` |
| Package | `npm run probe:package` -> `release/Lumiform-ThemeProbe-1.0.0.ccx` |
| Reads | `document.theme.getCurrent()`, live `onUpdated` values, every computed `--uxp-host-*` variable (with a swatch), `app.appSkinInfo` colour roles, `prefers-color-scheme`, Photoshop/UXP versions and a timestamped change log |
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

The theme names Photoshop may report are `darkest`, `dark`, `medium`, `light` and `lightest` (the same vocabulary as
the manifest icon `theme` arrays). The probe records which of those map to Black, Dark Gray, Medium Gray and Light
Gray; the mapping is only frozen once all four captures exist.

#### Frozen palettes and semantic tokens (target of 4.1)

Medium Gray is sampled from `ps-reference.png`. The other three columns stay blank until the probe captures them -
they are not guesses.

| Token | Black | Dark Gray | Medium Gray | Light Gray |
|---|---|---|---|---|
| `--ps-workspace` | pending | pending | `#333333` | pending |
| `--ps-panel` | pending | pending | `#535353` | pending |
| `--ps-header` | pending | pending | `#424242` | pending |
| `--ps-field` | pending | pending | `#454545` | pending |
| `--ps-hover` | pending | pending | `#6B6B6B` (sampled means selected; hover to confirm) | pending |
| `--ps-selected` | pending | pending | `#6B6B6B` | pending |
| `--ps-border` | pending | pending | `#383838` | pending |
| `--ps-border-strong` | pending | pending | `#474747` | pending |
| `--ps-text` | pending | pending | `#F0F0F0` | pending |
| `--ps-text-secondary` | pending | pending | `#A0A0A0` | pending |
| `--ps-text-muted` | pending | pending | `#787878` | pending |
| `--ps-status-bg` | pending | pending | `#696969` | pending |
| `--ps-status-text` | pending | pending | `#4A4A4A` | pending |
| `--ps-focus` | pending | pending | `#F0F0F0` at 60% | pending |

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
   Provisional mapping: `darkest` -> Black, `dark` -> Dark Gray, `light` -> Medium Gray, `lightest` -> Light Gray.
   `medium` may also appear. Task 4.1 replaces this provisional list with the probe's four observed names.
4. **Token sets.** Each theme defines workspace, panel, header, field, hover, selected, border, text, status and
   focus tokens. The reference populates Medium Gray; the probe populates the other three.
5. **Manual override.** The guide's Appearance row offers `Auto / Black / Dark Gray / Medium Gray / Light Gray`.
   Auto follows the host; a manual choice wins until Auto is selected. Persist in `localStorage`.
6. **Host shell.** The UXP loading/error overlay uses `--uxp-host-*` and `@media (prefers-color-scheme)` directly;
   the WebView cannot read those variables.
7. **Failure.** If `document.theme` is unavailable, default to Medium Gray and keep the manual override.
8. **Unsupported.** Custom `UIColors.txt` themes and the Gray/Blue Highlight setting cannot be read. The neutral
   sampled selection is the default.

### 10.5 Stage 4 roadmap

States follow the parent protocol. Only **4.1** is `current`.

* [ ] **Task 4.1: Theme probe, reference freeze and token foundation**
  * **State:** `current`
  * **Description:** Add a temporary UXP theme probe (`tools/theme-probe/`, packaged with
    `npm run probe:package`) that displays `document.theme.getCurrent()`, live updates, the computed
    `--uxp-host-*` colours and `app.appSkinInfo`. Capture Black, Dark Gray, Medium Gray and Light Gray. Freeze the
    four palettes and the semantic token sheet in 10.3.1.
  * **Acceptance Criteria:** The probe reports a theme name for each of the four Photoshop themes; a live change
    is observed; the four palettes are documented; the token sheet covers every role; no reskin behaviour ships
    from this task.

* [ ] **Task 4.2: Flat shell, compact header and status bar**
  * **State:** `planned`
  * **Description:** Replace section cards with flat rows on the panel background, 1 px dividers, no shadows or
    oversized radii. Add the compact Photoshop-like header, the workspace-coloured canvas frame and the 22-24 px
    status bar. Preserve the V1.1 spine, closed `<details>` defaults and live summaries.
  * **Acceptance Criteria:** At 320/420/600 the panel has no card look, the header is compact, the status bar is
    pinned, all four closed summaries remain live and the active theme palette is applied.

* [ ] **Task 4.3: Control reskin**
  * **State:** `planned`
  * **Description:** Restyle buttons, three-state sphere toggles, link rows, checkboxes, hex/number fields,
    disclosures, swatches and sliders. Use 22-24 px density, ~2 px radii, neutral hover/selected states, a 1 px
    focus outline and no transforms or glow. Leave the time-of-day control untouched.
  * **Acceptance Criteria:** Every control is usable at 320 px; selected/active states use the sampled tint; no
    blue chrome; no hover lift or glow; the time gradient, thumb and geometry are byte-for-byte unchanged.

* [ ] **Task 4.4: Typography and icon set**
  * **State:** `planned`
  * **Description:** Move to Segoe UI at 11 px, sentence-case section titles and tabular numerals. Replace the 14
    emoji and the info/reset/close/external-link glyphs with 16 px, 1.5 px line SVGs using `currentColor`.
  * **Acceptance Criteria:** No emoji remains; icons are crisp at 16 px and inherit the theme colour; labels and
    aria text remain intact; the seven time icons stay on one line at 320 px.

* [ ] **Task 4.5: Live theme linking and Appearance override**
  * **State:** `planned`
  * **Description:** Add the host `theme` relay, the WebView `theme` message, the URL bootstrap, the four token
    sets and the guide's Appearance row with `localStorage` persistence. Add the mock theme source for browser
    development.
  * **Acceptance Criteria:** Switching Photoshop through all four themes switches Lumiform live; a manual choice
    sticks across reloads; selecting Auto resumes following the host; the fallback default is Medium Gray; no
    flash or update loop.

* [ ] **Task 4.6: Guide and UXP host shell**
  * **State:** `planned`
  * **Description:** Restyle the guide as a native Photoshop dialog and add the Appearance row above GitHub.
    Restyle the loading/error shell with `--uxp-host-*` and a neutral spinner.
  * **Acceptance Criteria:** The guide covers the panel and is readable in all four themes; Back/Esc/backdrop still
    work; the GitHub row still opens externally; the host shell matches the active theme and has no blue accent.

* [ ] **Task 4.7: Verification, documentation and release**
  * **State:** `planned`
  * **Description:** Verify 320/420/600 across all four themes and in Photoshop by switching themes live. Check
    contrast, focus, truncation and the unchanged time gradient. Sync the three docs, bump to 1.2.0 and rebuild
    the `.ccx`.
  * **Acceptance Criteria:** `tsc --noEmit`, `npm run build` and `npm run plugin` pass; every earlier criterion is
    demonstrated; the four-theme screenshots and docs match; `Lumiform-Colorpicker-1.2.0.ccx` is produced.

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

1. **`document.theme` is undocumented for Photoshop.** The probe is the de-risking step; the manual Appearance
   row is the fallback.
2. **Exact grays for four themes.** The probe captures them; the reference gives Medium Gray now.
3. **Light Gray contrast.** Adjust Photoshop grays slightly where text would fail; this is the approved
   deviation.
4. **Time gradient on light themes.** It is the one intentional exception; keep it exactly and test the
   surrounding flat row in all four themes.
5. **Host variables are fragile.** Use them for the host shell and probe calibration, not as the WebView's
   runtime colour source.
6. **Legacy host shell literals.** `plugin/style.css` hard-codes `#1e1e1e`, `#ececec` and `#3b82f6`; replace them
   with native host variables and a neutral spinner.
7. **First-paint flash.** Pass the theme in the WebView URL and apply it before the app renders.
8. **Scope creep.** No renderer, lighting, framing or swatch-math changes.

### 10.8 Assumed defaults

* **Status bar:** match the sampled lighter Photoshop status bar (`#696969` with dark text); muted neutral
  connection dot; red only on error.
* **Focus ring:** 1 px light outline (`#F0F0F0` at ~60%), no glow.
* **Time slider:** keep the entire current control exactly.
* **Appearance row:** in the guide, directly above GitHub.
* **Probe:** temporary overlay with theme name and sampled host colours; four screenshots.
* **Icons:** sunrise, sun-behind-cloud, sun, high sun, sunset, golden sun, crescent moon; grass/leaf, neutral
  circle, soil, sand; matte circle, satin sparkle, glossy diamond; plus info, reset, close and external-link.
* **Browser dev:** defaults to Medium Gray; the Appearance row previews all four themes.

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

## 11. Change Log

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
| 2026-11-01 | Task 4.1 probe built in `tools/theme-probe/` and packaged as `Lumiform-ThemeProbe-1.0.0.ccx`. It reports the theme name, live `onUpdated` events, `--uxp-host-*` colours and `app.appSkinInfo`, and saves one JSON snapshot per theme into its `PluginData` folder so palettes are frozen from exact values instead of screenshots. Installed into Photoshop's `Plug-ins` folder for the capture run. The palette table stays `pending` until the four snapshots land. |
