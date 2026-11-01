# AI_CONTEXT_UI.md - V1.1 UI Redesign

> **AUDIENCE**: AI agents and developers implementing the V1.1 panel redesign.
> **PARENT DOCUMENT**: [AI_CONTEXT.md](./AI_CONTEXT.md) - architecture, lighting model, add-on runtime and the
> authoritative roadmap states. Read that file first; this file only covers the UI phase.

---

## 0. Status Snapshot

| Item | Value |
|---|---|
| Phase | **V1.1 - UI Design** (Stage 3) |
| Branch | `feature/3.1-ui-redesign`, cut from `feature/2.1-uxp-plugin` @ `ca05c15` |
| Shipped baseline | v1.0.0, frozen on `release/1.0-uxp-plugin` @ `1181f9e` (source + `.ccx`) |
| Current task | **3.2 - Time-of-day strip (icons + snapped slider + detach/↺)** |
| Renderer changes | None planned. `src/core/framing.ts` and the shaders stay untouched. |
| Deferred | The 1:1 canvas request (item 1 of the original brief) is **out of scope** for V1.1. |

The V1.0 panel is running inside Photoshop. V1.1 restructures that panel; it does not change the lighting,
atmosphere or swatch mathematics.

---

## 1. How To Use This Document

1. Read [AI_CONTEXT.md](./AI_CONTEXT.md) section 1 (the operating protocol) - it still governs task states,
   the single-`current` rule and the approval gate.
2. Read this file end to end before writing UI code.
3. Find the task with `State: current` in section 6 and implement **only** that task.
4. Report, wait for approval, then sync states in **three** places: `AI_CONTEXT.md`, this file and
   `Docs/index.html`.

Sections 3-5 are the agreed design and are normative. If an implementation detail contradicts them,
the document wins until the user says otherwise.

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
| `src/ui/styles/theme.css` | Every panel style: sections, sliders, toggles, overlay |
| `src/render/Viewport.ts` | Scene owner: sphere slots, selection, size, haze, links |
| `src/render/LightingEngine.ts` | Preset application and the "manual edit" flag |
| `src/core/sphereSlots.ts` | Slot ids, labels, depth labels, world positions |
| `src/core/lighting.ts` | `LIGHTING_PRESETS`, `LIGHTING_PRESET_ORDER`, elevation curve |
| `src/bridge/*` | `IPhotoshopBridge`, mock and WebView transports |
| `plugin/main.js` | UXP host: foreground colour relay, polling, `open-url` handler |

### 2.4 Runtime constraints

* **Minimum panel width 320 px**, docked default 420x780, floating 460x820 (`plugin/manifest.json`).
  Every layout decision must survive 320 px; treat 600 px as the widest common case.
* The panel scrolls as a whole (`.panel-content`); the header and status bar stay put.
* `<details>` / `<summary>` are supported by WebView2 and WKWebView and are the chosen disclosure primitive.
* No network access, no external fonts required by the build. `_AdobeCleanFont/` in the repo root is an
  untracked asset pack supplied by the user; using it is optional and not part of V1.1 unless asked.
* `_UI/Lumiform_UI.ai` in the repo root is an untracked Illustrator mock-up supplied by the user. Treat it as
  reference material, not as a build input.

### 2.5 Definition of done for the phase

* Every task in section 6 is `Done`.
* `npx tsc --noEmit`, `npm run build` and `npm run plugin` all pass.
* The panel is verified at 320, 420 and 600 px with all sections closed and then opened.
* The redesign is verified inside Photoshop: strip snapping, detach + reset, sphere toggles, link toggles,
  guide takeover and live foreground streaming.

---

## 3. Panel Spine

Top to bottom. Everything marked *collapsible* uses `<details>` and starts **closed**.

```
+--------------------------------------------------------------+
| HEADER   Lumiform Colorpicker        v1.0.0            [ i ] |
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

* [ ] **Task 3.2: Time-of-day strip (icons + snapped slider + detach/↺)**
  * **State:** `current`
  * **Description:** Replace the segmented preset control with the seven-icon row above a snapping slider.
    Reorder the presets chronologically. Apply presets live while dragging. Implement the detach rule for all
    six lighting controls and the `· edited ↺` label with its reset behaviour.
  * **Acceptance Criteria:** Clicking an icon jumps the thumb and the lighting sliders; dragging relights at
    each stop; moving any of the six controls clears all buttons and shows `edited`; `↺` restores the last
    preset exactly; at 320 px the row stays a single line.

* [ ] **Task 3.3: Sphere model - Near/Mid/Far toggles, merged panel, size link**
  * **State:** `planned`
  * **Description:** Rename spheres to Near/Mid/Far everywhere, remove the count control and Delete, add the
    three-state toggles with the last-sphere guard and restore-on-re-enable, move selection fallback to
    Near -> Mid -> Far, and add Link Size beside Link Colours. Merge size, albedo chip/hex and the nested
    H/S/B disclosure into the Spheres panel.
  * **Acceptance Criteria:** Each toggle enables, selects and disables as specified; the last sphere cannot be
    disabled; re-enabling restores its previous colour and size; link toggles equalise immediately and keep
    applying edits; no count or Delete control remains.

* [ ] **Task 3.4: Ramp header, sphere indicator & albedo dot**
  * **State:** `planned`
  * **Description:** Retitle the ramp, add the read-only sphere chip and the albedo dot, and keep the grid and
    click-to-paint behaviour unchanged.
  * **Acceptance Criteria:** The chip follows selection and reads Near/Mid/Far; the dot matches the sphere's
    albedo; the five swatches still update on every lighting, haze and finish change; clicking a swatch still
    writes to Photoshop.

* [ ] **Task 3.5: Light row and live foreground streaming**
  * **State:** `planned`
  * **Description:** Move the light colour chip out of the section header into a labelled `Light` row at the
    top of Sun & Atmosphere. Make the sphere albedo chip send its exact hex on click. Stream H/S/B and valid
    hex edits at one write per animation frame.
  * **Acceptance Criteria:** The light chip is discoverable at 320 px and editable; clicking the albedo chip
    sets the Photoshop foreground; dragging H/S/B updates the foreground smoothly without flooding the host;
    editing ground or light colour clears the active preset.

* [ ] **Task 3.6: Controls Guide takeover and GitHub row**
  * **State:** `planned`
  * **Description:** Add the header `i`, the full-panel overlay with its own header and `✕ Back`, rewrite the
    guide for the new UI, and add the GitHub row. Add the `open-url` bridge message and host handler.
  * **Acceptance Criteria:** The overlay covers the entire panel including the status bar; Esc, backdrop and
    `✕ Back` all return to the tool; the GitHub row opens the repository in the system browser; non-https URLs
    are rejected.

* [ ] **Task 3.7: Verification, polish and documentation sync**
  * **State:** `planned`
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
4. **Haze and Terminator currently keep the preset lit.** That is the v1.0 behaviour; V1.1 changes it. Do not
   "fix" it in a task other than 3.2.
5. **The last sphere guard lives in the model**, not in the button's disabled attribute, so keyboard and
   programmatic paths cannot empty the scene.
6. **Selection fallback** must run before the ramp recomputes, or the ramp will briefly show a disabled sphere.
7. **`<summary>` clicks**: keep interactive controls out of `<summary>`; only the title and summary text.
8. **WebView `window.open`** is unreliable; every external link goes through `open-url`.
9. **Naming is user-facing only.** Ids stay `center/right/left` so persisted state and tests keep working.
10. **`.ccx` version bump** is required for Photoshop to treat a reinstall as new: update
    `plugin/manifest.json` and `package.json` together when shipping V1.1.

---

## 10. Change Log

| Date | Change |
|---|---|
| 2026-11-01 | Document created. V1.1 UI decisions captured and Stage 3 roadmap added. |
| 2026-11-01 | Task 3.1 verified and marked Done. Panel spine, closed `<details>` sections and live summaries are implemented; Task 3.2 is current. |
