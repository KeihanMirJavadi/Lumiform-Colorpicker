# AI_CONTEXT.md - Lumiform Colorpicker

> **AUDIENCE NOTICE**: This file is strictly for **AI Agents** working on this repository. It provides complete onboarding context, architectural specifications, and the exact protocol for step-by-step development.

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
│      .Docs/index.html                                  │
└────────────────────────────────────────────────────────┘
```

### Strict Rules:
1. **Task States:** Exactly three allowed states: `Done`, `current`, `planned`.
2. **Single Concurrency:** Exactly **one** task may be in the `current` state at any time.
3. **Approval Gate:** Never mark a task `Done` or advance to the next task without explicit user approval.
4. **Documentation Synchronization:** Whenever roadmap states change, update both `AI_CONTEXT.md` and `.Docs/index.html` simultaneously.

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
│  ├─ Time-of-Day Presets (Daylight, Golden Hour, Night)                 │
│  └─ Surface Finish Toggle (Matte / Satin / Glossy)                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     3D Viewport (Three.js WebGL)                       │
│  ├─ High-Resolution Sphere Mesh                                        │
│  ├─ Directional Key Light + 360° Circular Orbit Gizmo                  │
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
│  ├─ MockPhotoshopBridge   (Web browser dev preview & verification)     │
│  └─ UXPPhotoshopBridge    (Adobe Photoshop 2025 UXP batchPlay)         │
└────────────────────────────────────────────────────────────────────────┘
```

### Technology Matrix
* **Language:** TypeScript (strict mode)
* **3D Library:** Three.js
* **Build Tool:** Vite
* **Target 1 (Phase 1):** Standalone Web Application with Mock Photoshop Bridge for rapid iteration.
* **Target 2 (Phase 2):** Adobe UXP Plugin (Manifest v5) targeting Adobe Photoshop 2025.

---

## 4. Key Subsystem Specifications

### 4.1 3D Viewport & Pointer Interactions
* **Scoped Pointer Events:** Viewport events are strictly bounded to the panel canvas. Never capture or interfere with the Photoshop document canvas or global pointer.
* **Click / Drag on Sphere:** Eyedropper mode. Samples the rendered pixel under the pointer and dispatches it to the active brush color via `requestAnimationFrame` throttling.
* **Background Drag / `Alt` + Drag:** Orbits the camera around the sphere.
* **Light Orbit Gizmo:** Circular ring around the sphere allowing direct manipulation of the key light's azimuth and elevation.

### 4.2 Lighting & Environment Engine
* **Lighting Model:**
  $$\mathbf{I}_{\text{total}} = \mathbf{I}_{\text{key}} \cdot \max(0, \hat{N} \cdot \hat{L}) + \mathbf{I}_{\text{ambient}}(\hat{N}) + \mathbf{I}_{\text{specular}}$$
* **Ambient 3-Zone Model:**
  * **Sky ($\hat{N}_y > 0$):** Fills upper hemisphere.
  * **Horizon ($\hat{N}_y \approx 0$):** Soft lateral transition.
  * **Ground Bounce ($\hat{N}_y < 0$):** Underside reflection warming the shadow.
* **Curated Presets (Phase 1):**
  1. **Daylight:** Bright warm sun ($5500\text{K}$) overhead, clear cool sky-blue shadow, warm ground bounce.
  2. **Golden Hour:** Low-angle amber sun ($3200\text{K}$), deep violet/blue ambient, warm saturated ground bounce.
  3. **Night:** Cool pale blue moonlight rim, deep dark navy fill.

### 4.3 Surface Finish Modes
* **Matte:** Roughness 1.0, 0% Specular (pure diffuse Lambertian).
* **Satin:** Roughness 0.5, 30% Specular (soft, spread highlight).
* **Glossy:** Roughness 0.1, 90% Specular (sharp specular point + Fresnel falloff).

### 4.4 Color Controls & Swatch Ramp
* **In-Panel Controls:** HSB sliders (Hue 0–360, Saturation 0–100, Brightness 0–100) + Hex input.
* **Decoupled Input:** The 3D sphere is driven exclusively by the panel's controls to prevent unwanted canvas feedback loops while painting.
* **Analytical 5-Value Swatch Ramp:** Calculated directly from surface normal vectors:
  * **Highlight:** Half-vector $\hat{H} = \text{normalize}(\hat{L} + \hat{V})$
  * **Half-Tone:** Surface normal at $45^\circ$ toward $\hat{L}$
  * **Terminator:** Normal at $90^\circ$ to $\hat{L}$ ($\hat{N} \cdot \hat{L} = 0$)
  * **Core Shadow:** Normal facing opposite $\hat{L}$ before ground bounce
  * **Bounce Light:** Normal pointing directly down toward ground reflection
* Clicking any swatch immediately applies it to the active brush color.

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
  * **Description:** Implement Three.js scene, camera, high-resolution sphere geometry, background camera orbit controls, and resize handling.
  * **Acceptance Criteria:** Smooth 60fps rendering, responsive canvas resizing, background-drag camera orbit without interfering with UI.

* [x] **Task 1.3: Lighting Engine & Interactive Orbit Ring**
  * **State:** `Done`
  * **Description:** Implement directional key light with 360° azimuth/elevation circular gizmo, 3-zone ambient model (Sky/Horizon/Ground), and 3 presets (Daylight, Golden Hour, Night).
  * **Acceptance Criteria:** Dragging gizmo ring repositions light source smoothly; clicking presets immediately updates lighting atmosphere.

* [ ] **Task 1.4: Surface Finish (Matte / Satin / Glossy)**
  * **State:** `current`
  * **Description:** Implement 3-state surface finish selector modifying roughness and specular power in the shader.
  * **Acceptance Criteria:** Switching finish modes immediately updates highlight sharpness and material response.

* [ ] **Task 1.5: In-Panel HSB & Hex Color Controls**
  * **State:** `planned`
  * **Description:** Build compact HSB sliders and hex code input that update the 3D sphere's base diffuse albedo.
  * **Acceptance Criteria:** Changing Hue, Saturation, or Brightness updates the sphere material in real time; hex validation syncs cleanly.

* [ ] **Task 1.6: Viewport Eyedropper Sampling & Throttling**
  * **State:** `planned`
  * **Description:** Implement click-and-drag eyedropper on the sphere canvas using WebGL readPixels, throttled to `requestAnimationFrame`.
  * **Acceptance Criteria:** Clicking/dragging on the sphere samples the lit pixel under pointer and updates the active color with zero lag.

* [ ] **Task 1.7: Analytical 5-Value Swatch Ramp**
  * **State:** `planned`
  * **Description:** Compute Highlight, Half-Tone, Terminator, Core Shadow, and Bounce Light swatches from normal vectors. Clicking any swatch applies it.
  * **Acceptance Criteria:** All 5 swatches update in real time as light/base color changes; clicking a swatch sets active color and shows tooltip.

---

### Stage 2: Adobe Photoshop UXP Plugin Porting

* [ ] **Task 2.1: UXP Manifest v5 & Packaging Configuration**
  * **State:** `planned`
  * **Description:** Configure `manifest.json` with entry points, panel dimensions, and Photoshop 2025 host requirements.
  * **Acceptance Criteria:** Manifest passes Adobe UXP Developer Tool validation.

* [ ] **Task 2.2: Photoshop Bridge Implementation (UXPPhotoshopBridge)**
  * **State:** `planned`
  * **Description:** Implement `UXPPhotoshopBridge` connecting sampled colors to Photoshop's `app.foregroundColor` via UXP batchPlay.
  * **Acceptance Criteria:** Clicking sphere or swatches inside Photoshop panel updates active brush color with zero lag.

* [ ] **Task 2.3: End-to-End Photoshop Verification & Polish**
  * **State:** `planned`
  * **Description:** Load into Adobe Photoshop 2025 via UDT, test panel docking, resizing, theme consistency, and paint responsiveness.
  * **Acceptance Criteria:** Plugin runs stably in Photoshop 2025 with full bi-directional brush responsiveness.
