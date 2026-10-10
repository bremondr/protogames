# Protogames — Bug Audit

**Date:** 2026-10-11 · **Revision audited:** `39ead4a` (main, after the code-audit fixes of PR #76 and the favicon) · **Scope:** the open bug issues on GitHub, plus a hunt for unknown bugs across the whole app

This is the second audit. The first one ([AUDIT.md](AUDIT.md)) was a code review and led to PR #76. This one looks for bugs that only show up when the code *runs*: it drives the real modules with fuzzing and property checks, runs the app in real browsers, validates generated PDFs and SVGs with external tools, and reviews PR #76 for regressions. The full per-area reports, with repro commands and the lists of what was checked and found fine, are in [bug-audit/](bug-audit/).

---

## 1. Executive summary

**The bugs people reported are mostly still there, and the app is in better shape than the first audit left it, but PR #76 introduced a few problems of its own.**

Of the three open bug issues, all three still exist on `main`:

| Issue | Verdict |
|---|---|
| **#19** Load Project keeps the saved canvas geometry | **Still reproduces** (confirmed in Chrome). Loading a project or restoring an autosave on a different screen size leaves the board clipped until the next window resize. |
| **#20** SVG export ignores textures and objects | **Still reproduces.** The export is flat paths only and the app says just "SVG exported". The limitation is documented only in the README. |
| **#4** Triangles in circle look strange | **Partly.** The shape is symmetric and gap-free, but it is coarse at small radii, and at several radii (3, 4, 9–12 and more) it has single-edge "spike" triangles on the outline. |

The five closed geometry bugs (#2, #3, #8, #9, #6) have **not** regressed.

**New findings: 1 High, 17 Medium, 31 Low and about 20 Info.** Nothing here corrupts a saved project file or exposes data. The closest to data loss are M4 and M5 (undo that does not undo or does not persist) and M15 (colours of very old boards lost on resize). The most important ones:

| # | What | Why it matters |
|---|---|---|
| **H1** | An infinite-board tile id at the safe-integer limit freezes the tab forever | A crafted share link or project file hangs the browser. The link is already cleared from the address bar, so only a reload recovers. |
| **M1** | Choosing **Discard** on the "Auto-saved work found" prompt leaves an empty canvas | You see an empty canvas with live tools and nothing to paint on until you click Generate Board. (Found independently by three audits, and reproduced in Chrome.) |
| **M4** | On an infinite board, **Undo does nothing** for the first paint in a newly scrolled area | Painted tiles stay painted, and the history index moves anyway. |
| **M5** | Undo and Redo are **never autosaved** | Undo, then reload: the undone stroke comes back. |
| **M6, M7, M8** | Keyboard handling after the first audit's accessibility fix | The canvas is a keyboard trap (Tab can never leave it), a mouse click on the board leaves focus in a sidebar field so all shortcuts go dead, and Space can no longer toggle checkboxes. **Introduced by PR #76.** |
| **M9** | A share link of the largest board the UI allows (radius 50) cannot be opened | The UI lets you build it and the link is made, but the recipient is told it is out of range. **Introduced by PR #76.** |
| **M10** | Circle boards of hexagon tiles lose tiles from radius 16 up | At radius 50, 708 of 9,271 tiles are missing and the board is no longer a disc. |
| **M12, M13** | Print legends | A legend can be printed over the board, and a spaceship board's legend can name a terrain after the dungeon palette ("Trap" for "Danger Zone"). |

**What held up:** about 2,000 fixed-board geometry cases, 150 large boards (up to 72,000 tiles) and 28,800 canvas-size runs found no gaps, overlaps, wrong counts or broken adjacency. The print scale is correct (a 40 mm tile is 40 mm in the PDF, within 0.03%), all generated PDFs pass `qpdf --check`, and about 400 save/load and share-link round trips lost nothing. The new Content-Security-Policy broke nothing in real Edge, including from `file://`. A mutation run reverted PR #76's fixes one at a time in a scratch copy: about 40 were caught by at least one test and 8 were not (§6).

**Where the risk concentrates:** the interaction layer (focus, Escape, undo/redo, start-up paths), where most Medium findings live. These parts are only partly covered by tests, and PR #76's new tests there pass even when their fix is reverted (§6).

**Recommended order** (details in §7): fix the data-loss and keyboard problems first (M1, M4, M5, M6–M9), then #19 (regenerate on load) with the legacy-id question (M15), then the print and export items, and handle the geometry changes (M10, M11) separately, because they change tile ids and so touch saved data.

---

## 2. Method and limits

- **Six area audits**, each by an independent reviewer that wrote throwaway scripts against the real modules and reported only what it could demonstrate: geometry and boards; state and persistence; interaction and UI logic; rendering, export and print; a skeptical review of PR #76's diff; build, CI, security and docs. A seventh checked the GitHub issues. Reports: [bug-audit/](bug-audit/).
- **Real browsers:** the UI audit and the PR #76 review drove headless Edge/Chromium over the DevTools protocol (trusted mouse, keyboard, wheel and touch input). The rendering audit generated its PDFs in a real browser. I also reproduced the Discard bug and #19 in Chrome myself ([bug-audit/H-browser.md](bug-audit/H-browser.md)).
- **Evidence level** is given per finding: *browser* (reproduced in a real browser), *script* (reproduced in a node harness with the real modules), *code* (derived from reading the code, not reproduced).
- Severity: **High** = crash or hang on reachable input, data loss, or a broken release. **Medium** = a user-visible bug or a real hardening gap. **Low** = minor bugs, polish, robustness. **Info** = notes.
- **Not covered:** Firefox and Safari, real touch/pen devices, macOS, the real Fullscreen API, screen readers, real printers and paper, iOS canvas limits, GPU performance, and GitHub Actions concurrency behaviour (reasoned about, not run). The reports list the gaps per area.
- Findings reported by several audits are merged here; the *Source* column gives the original IDs.

---

## 3. The logged GitHub issues

Only #4, #19 and #20 are open **bugs**. The rest of the open issues are features.

### #19 Load Project keeps the saved canvas geometry — still reproduces (M2)

`FileManager.restoreState` restores the polygons with their saved pixel coordinates and never refits them. In Chrome, a board generated on a 1620×1055 canvas (x 304–1316, y 48–951), restored on a 700×500 canvas, stayed at x 304–1316; a window resize then refitted it to x 155–545. A node repro (800×600 canvas) gave the same result.

| Load path | Refits to the current canvas? |
|---|---|
| Load Project (file) | **No** |
| Autosave restore (start-up prompt, adopted slots) | **No** |
| Share link | Yes |
| Showcase | Yes |
| Window resize | Yes (that is why it repairs itself later) |

Regenerating on load, as the showcase loader does, is safe for every bundled fixture and the showcase: all saved tile ids match the regenerated ids on every canvas size tested. It would **not** be safe for very old boards that use legacy triangle ids (M15), so those need a plan. No file-format change is needed. The issue's suggestion is right. Also fit the view after loading, since a loaded file currently keeps the old pan and zoom (finding G1 in the issue report).

### #20 SVG export ignores textures and objects — still reproduces (M3)

`Exporter.buildSvg` writes one flat `<path>` per tile. The notification says only "SVG exported", the button is a plain "SVG", and the README is the only place that mentions the limitation. The SVG itself is valid (parsed with an XML parser for fixed, empty and infinite boards). The cheap fix is a notification or tooltip, and the real fix is embedding `<pattern>`/`<image>` elements using the data URLs that `Textures` and `Objects` already expose.

### #4 Triangles in circle look strange — partly (M11)

Measured for radius 1–12, both orientations:
- The shape is 6-fold symmetric and mirror-symmetric, with no overlaps and no holes.
- Radius 1 and 2 are exactly the hexagon-board layouts (6 and 24 tiles), so they are not round at all.
- The outline is saw-toothed below about radius 6. The farthest/nearest boundary ratio is 1.15 at radius 3 and 1.04 at radius 12.
- **A real defect beyond coarseness:** "spike" triangles that touch the rest of the board by only one edge, at radius 3 (6 spikes), 4 (12), 9 (12), 10 (18), 11 (24), 12 (12) and others, up to 72 at radius 30. Hexagon and square discs have no such tiles. Dropping tiles with fewer than two in-board neighbours fixes it, but changes tile counts and ids for the affected radii (see §7).
- The orientation control has no effect for this board.

Keep the issue open and rewrite it around the spikes.

### Closed bugs: no regression

| Issue | Check | Result |
|---|---|---|
| #2 triangle board with triangle tiles | N = 1..12, both orientations | N² tiles, 0 overlaps, symmetric |
| #3 hexagons in triangle board | N = 1..10 | N(N+1)/2 tiles, all full hexagons (flat-top has the documented mirror exception for even N) |
| #8 triangles in hexagon board | radius 1..12, both orientations | 6R² tiles, 0 overlaps, 6R boundary edges. The issue text's own numbers contradict each other, so the docs describe what was built. |
| #9 missing corner tiles | rings by centroid distance | rings of 6, 18, 30, … (12N−6), all six corners present |
| #6 orthogonal → isometric | UI and code | correctly closed as not planned; the option is commented out |
| #5 eraser | code and tests | fixed (sized eraser brush), not checked in a browser |

### Other open issues worth updating
- **#46** (showcase gallery) is partly done: one showcase and no thumbnails. **#44** (print) is mostly implemented, but print settings are stored in localStorage, not saved with the project. **#48** (accessibility) is partly addressed by PR #76, but M6–M8 below are new accessibility problems from that same PR. **#51** (playtest) exists only as an edit lock; there are no tokens, dice or turn tracker. **#45** (share links) is implemented.

---

## 4. Findings

### 4.1 High

#### H1 · Crafted input · An infinite-board tile id near 2^53 hangs the tab *(A1 · script)*
`js/infinite.js:97-111` (`cellsIn`), reached from `loadRect`/`sync`, entered through `js/shareLink.js:329,339` and `js/fileManager.js:423`.
`fromId` accepts any safe integer. For a tile like `inf_s_9007199254740991_0` the view is framed around that tile and `cellsIn` loops `for (let x = floor(minX/SQ); x <= floor(maxX/SQ); x++)`. Once `x` reaches 2^53, `x++` stops changing it and the loop never ends. The tab freezes while the link has already been removed from the address bar. It reproduces for all four infinite grid families.
*Repro:* `node geo/hang.js inf_s inf_s_9007199254740991_0` never returns, while `inf_s_5000000000000000_0` finishes in 9 ms.
*Fix:* bound ids in `fromId` to what the lattice can represent (for example |a|, |b| ≤ 1e9, since vertices already degenerate beyond about 1e14), and make `cellsIn` bail out for non-finite or huge rectangles. Add a test with the extreme id. The first audit's spec claim "a hostile link cannot hang the tab" does not hold for `i` ids.

### 4.2 Medium

#### M1 · Discard on the autosave prompt leaves an empty canvas *(B4, C2, my browser check · browser, script)*
`js/main.js` `startBoard` returns after `promptAutosaveRestore`; `js/fileManager.js:227-240` (`handleChoice('discard')`) only removes the slot and shows a notice. Same behaviour in the original code (`cdf317e`), so it is old but was never reported.
With a restorable autosave, the page shows an empty canvas behind the prompt, and after Discard it stays empty: Save and Share say "Generate a board first". It recovers with Generate Board or a window resize.
*Fix:* call `Interactions.generateBoard(AppState.getState().boardConfig, { skipDirtyFlag: true })` in the discard branch, or generate the default board before showing the prompt.

#### M2 · Issue #19: Load Project and autosave restore keep saved pixel coordinates *(B-verdict, G, my browser check · browser, script)*
See §3. `js/fileManager.js:402-441` (`restoreState`). Fix: after `setPolygons`, for finite boards call `Interactions.generateBoard(config, { preserveColors: true, preserveHistory: true, skipDirtyFlag: true })` and `ViewControls.fit()`, as the showcase loader does. Exclude infinite boards. Decide how to treat legacy ids first (M15).

#### M3 · Issue #20: SVG export ignores textures and objects, and the UI does not say so *(D, G · code)*
`js/exporter.js:34-45`, `:68`. See §3.

#### M4 · Infinite board: Undo and the pinch rollback do not un-paint tiles loaded after the snapshot *(B2, C1 · script, browser)*
`js/state.js:288-322` (`recordHistory`, `restoreSnapshot`) and the hook at `js/infinite.js:275-287`.
A snapshot only lists the tiles loaded when it was taken. After panning, new tiles are loaded that no older snapshot mentions. Painting one and pressing Undo leaves it painted, because there is no entry to restore, while the history index still moves back. The same hole stops a second finger from rolling back a brush stroke that crossed into new tiles, and a resize carries the stale colour forward. Every first paint in a freshly scrolled area is effectively not undoable.
*Repro:* infinite board, pan 3,000 px, paint one tile, Undo: `painted tiles after undo (expected 0) 1`.
*Fix:* in `restoreSnapshot` (or the infinite hook), reset every loaded tile that has no entry in the snapshot to blank. On finite boards every tile is in every snapshot, so the rule is safe.

#### M5 · Undo and Redo are never autosaved *(B3 · script)*
`js/interactions.js:204-216`. `handleUndo`/`handleRedo` only restore the snapshot; they do not mark the board dirty or save, and the 30-second timer saves only when dirty.
*Repro:* paint (autosave has 1 tile), Undo (board has 0, autosave still 1), wait for the timer: still 1. A reload brings the undone stroke back.
*Fix:* after a successful undo or redo call `AppState.markDirty()` and `FileManager.autoSaveToLocalStorage(true)`, as Clear Board already does.

#### M6 · The canvas is a keyboard trap, and Tab no longer cycles swatches for mouse users *(C3, E2 · browser; **introduced by PR #76**)*
`index.html:207` (`<canvas tabindex="0">`), `js/shortcuts.js:243-269` (swatch-next/prev on Tab, active when the canvas has focus), `js/interactions.js:455-458`.
Tab and Shift+Tab are always cancelled and cycle swatches while the canvas has focus. The canvas is in the tab order, so a keyboard user who tabs onto it can never tab off (19 controls come after it), and Escape does nothing there. This violates WCAG 2.1.2 and defeats the stated goal of the H6 fix. The other half: a mouse click on the board does not focus the canvas (`pointerdown` is cancelled), so for mouse users Tab no longer cycles swatches at all, which used to work.
*Fix:* do not use plain Tab for swatch cycling; use another key (for example `,` and `.`) or an explicit mode, and give the canvas an Escape-to-leave path. If the focus-based rule stays, call `canvas.focus({ preventScroll: true })` on pointerdown.

#### M7 · Painting leaves focus in a previously used sidebar field, so every shortcut stays dead *(C4 · browser)*
`js/interactions.js:455-458` (`pointerdown` is cancelled, so the browser does not move focus).
After using any sidebar `<select>` or number input, clicking and painting on the board leaves that control focused. The shortcut layer treats it as a typing target, so Ctrl+Z, E, B, G, L, 1–9, `[`, `]` and zoom keys do nothing until the user clicks a non-field element. Typed letters go into the control: in the grid-type select, pressing S or T changes the grid type.
*Repro:* focus the Grid-type select, paint a tile with the mouse, press Ctrl+Z: nothing is undone and the select is still active.
*Fix:* in `handlePointerDown`, blur a focused field that is a typing target.

#### M8 · Space-to-pan swallows Space on checkboxes, colour inputs and dialogs *(C5, E3 · browser; **introduced by PR #76**)*
`js/viewControls.js:127-144` (`ownsSpace`, `onKeyDown`).
The new rule keeps Space for text fields and focus-visible buttons, but not for checkboxes, radios, colour or file inputs. Those keydowns are cancelled and start a pan. The four Print-dialog checkboxes cannot be toggled with the keyboard, the theme editor's colour inputs cannot be opened with Space, and Space no longer scrolls a dialog. Dialogs are modal, so panning behind them makes no sense.
*Fix:* ignore Space while `FocusUtils.layerOpen()`, and treat any `input`, `select`, `textarea`, `button`, `a` or `[contenteditable]` target as owning Space. The simplest rule is to start a pan only when the target is `body` or the canvas.

#### M9 · A share link of the largest hexagon/circle board the UI allows cannot be opened *(B1, E1 · browser; **introduced by PR #76**)*
`js/ui.js:149-151` (radius max 50, so width = height = 101) versus `js/shareLink.js:22,84` (`MAX_DIMENSION = 100` applied to width and height). The project file validator allows 201.
The sender's Share dialog builds a link without complaint. The recipient gets "The board width in the link is out of range." This hits 48 combinations (every grid type × hexagon/circle × orientation at radius 50). The comment in `ui.js` claims the caps agree.
*Fix:* apply `MAX_DIMENSION` to `radius`/`size` and `2 × MAX_DIMENSION + 1` to width/height in `boardConfigFrom`, define the three caps (UI, link, file) from one constant, and add a test that round-trips a radius-50 hexagon. A related case: an infinite board with more than 20,000 painted tiles also produces a link that cannot be opened.

#### M10 · Circle board with hexagon tiles is truncated from radius 16 *(A2 · script)*
`js/geometry/hex.js:120` (`const span = radius + 2;`).
The disc test is Euclidean, but the scan window is in hex steps, which can reach about 1.155 × (radius + 0.5). From radius 16 the six tips are cut off and the board becomes a rounded hexagon. Tiles produced versus tiles inside the stated disc: R16 971/979, R30 3,195/3,367, R50 8,563/9,271 (708 missing). 170 of 200 radius × orientation cases are wrong. The UI allows radius up to 50, files and links up to 100. The existing test checks only radius 1–8.
*Fix:* `const span = Math.ceil((radius + 0.5) * 2 / Math.sqrt(3)) + 1;` was verified on a patched copy for radius 1–100. **This changes tile ids and counts of existing circle boards with radius ≥ 16**, so it needs a decision under the project's versioning rule (see §7).

#### M11 · Issue #4: triangle circles have spike triangles *(A7, G · script)*
`js/geometry/triangle.js:180-190` (`buildCircleTriangleGrid`, centroid-within-radius test). See §3. Same versioning caveat as M10.

#### M12 · A legend is printed over a board that does not fit the sheet *(D1 · browser)*
`js/print.js:226-234` (the `legendOnSheet && !layout.fits && layout.boardFits === false` branch), drawn in `sheetPage` at `:356`.
Sheet mode, legend below the board, board larger than the sheet: the planner keeps a legend band that cannot exist, so the legend text is painted straight onto the bottom of the cropped board with no background. Dark tiles make the names unreadable. The only message is the "edges would be cut off" warning. A default hexagon board at 40 mm tiles on A3 reproduces it, and the generated PDF shows it.
*Fix:* when the board does not fit and a legend is requested, move the legend to its own page (the `boardFits === true` branch already does), remove the special branch, and add a test in `tests/print.test.js`.

#### M13 · The printed legend names a terrain after the wrong palette *(D2 · script)*
`js/print.js:86-91` (`terrainLabels`, first palette wins); the same pattern is in `js/textures.js:28-37` (`getLabel`).
`#C62828` is "Trap" in the dungeon palette and "Danger Zone" in the spaceship palette. The legend maps hex to label across all palettes in order, so every Danger Zone tile on a spaceship board is listed as "Trap". It is the only duplicated hex among the built-in palettes.
*Fix:* prefer the palette active on the board when resolving labels. Changing one of the two hex values would change saved data (versioning rule).

#### M14 · The board canvas ignores `devicePixelRatio` *(D3, C17 · browser)*
`js/renderer.js:44-55` (backing store sized in CSS pixels) and `:188-199` (export canvas the same).
On any HiDPI display (Retina, Windows scaling) the bitmap is stretched, so grid lines and textures are soft and PNG export is only CSS-pixel size. At devicePixelRatio 2 the backing store was 1100×844 on a 2200×1688 device surface. Pointer maths is already ratio-safe.
*Fix:* size the backing store by the ratio, apply it in `paint`, and give `createExportCanvas` its own scale.

#### M15 · Boards saved with legacy triangle ids silently lose their colours on the next resize *(G2 · code)*
Boards saved before the shape rewrite use ids like `triangle_hex_row_col` on hexagon and circle boards. No migration remaps them. The next window resize regenerates the board matching colours by id, so all colours and objects of such a board vanish. This happens today already, and it would happen immediately on load if #19 is fixed by regenerating. Not reproduced with a real old file (none in `tests/fixtures`); derived from the code.
*Fix:* an id-remap migration, or detect "none of the saved ids match the regenerated board" on load and either keep the saved geometry or warn.

#### M16 · A slow remote theme image blocks the whole start-up *(B9, F1 · code)*
`js/main.js:40-47` awaits `ThemeManager.init` before `AutosaveSlots.claim` and `startBoard`; `js/themeManager.js:30-32,70-74,96-100` loads each theme image one at a time with no timeout.
A theme imported with `https://` image URLs is re-fetched on every page load. If a host stalls, the board, the autosave prompt and share-link opening all wait for the browser's network timeout, once per image, so the user sees a blank canvas.
*Fix:* start the board first and apply themes afterwards (or load images in parallel with a timeout of a few seconds). Better, store imported images as data URLs at import time (this also closes L29).

#### M17 · The preview-link comment is lost whenever a run is cancelled *(F2 · gh API)*
`.github/workflows/pages.yml` (job-level `cancel-in-progress` and the comment step at the end of the same job).
The PR comment is posted only by the run that the PR's own event triggered, after a successful deploy. Any newer event cancels it, and a failed test skips it. The preview is still published, but nobody re-posts the link. `gh api` shows #77 (open, live preview) and merged #74 and #71 with no comment; #77's run was cancelled.
*Fix:* post the comment from a separate job or workflow that is not subject to cancellation, or post it first using the deterministic URL `…/preview/pr-N/`.

### 4.3 Low

| # | Finding | Location | Source |
|---|---|---|---|
| L1 | Empty **infinite** board: PNG, SVG and Print throw `TypeError … 'maxX'` on a large window (triangles from about 3000×1700; hex and square from 5120 wide). The Print button silently does nothing. `exportScene` returns `[]` when the area estimate exceeds the cap | `js/infinite.js:214-219` | A3, D4 |
| L2 | A `#ffffff` tile in an imported or edited custom theme becomes `#000000` (collision bump wraps around) | `js/themeManager.js:52-61` | B5 |
| L3 | Opening a file saved with `autoSaveEnabled: false` switches autosave off for the session; there is no UI to turn it back on | `js/fileManager.js:115,417-420` | B6 |
| L4 | Autosave stores full tile geometry: the largest allowed boards (hexagon tiles 100×100, triangle circle radius 50) exceed the ~5M-character quota, so autosave fails permanently with one notice; every stroke also costs ~110 ms to serialise. A reload then offers a stale board | `js/fileManager.js:100-136` | B7, C16 |
| L5 | Without Web Locks (insecure context) abandoned autosave slots are never deleted and accumulate to the quota | `js/autosaveSlots.js:162-166` | B8 |
| L6 | Cancelling a fill by pinch loses the redo branch and, at the 50-step limit, the oldest undo step | `js/state.js:357`, `js/interactions.js:301-311` | B10, C11 |
| L7 | The last tiles of a fast brush stroke are dropped: moves inside the 16 ms throttle are discarded and nothing is painted on pointer-up | `js/interactions.js:511-516,547-557` | C7 |
| L8 | A stroke is not tied to its pointer: a stray touch ends a pen stroke; a lost pointer-up leaves the stroke running (later moves with no button keep painting) | `js/interactions.js:455-557` | C8 |
| L9 | Any window resize, and entering or leaving playtest or focus mode, resets zoom and pan even when the canvas size did not change | `js/main.js:8-15`, `js/playtest.js:49` | C9, B12 |
| L10 | No-op undo steps remain: Clear on a blank board; painting with a colour a tile already shows when the case differs (share links pack lower-case hex, palettes are upper-case); `hasUserWork` compares case-sensitively | `js/interactions.js:182-184,218-229`, `js/fileManager.js:43` | C10 |
| L11 | `[` and `]` (brush size) cannot be typed on AltGr layouts (Czech, German); digit shortcuts fire on the physical key rather than the typed character | `js/shortcuts.js:92-101` | C12 |
| L12 | Board number fields read `1e2` as 1 (`parseInt`), and an empty field uses the default without showing it | `js/ui.js:154-159` | C13, E13 |
| L13 | One Escape can close two stacked dialogs (a file-manager modal over the Print dialog) | `js/printDialog.js:202`, `js/shareLink.js:378-380`, `js/themeEditor.js:43` | C14 |
| L14 | Dynamic dialogs (help overlay, file-manager modals) lose their Escape and Tab-trap once focus falls to `<body>` after clicking dialog text; the other Escape handlers step aside, so Escape is dead | `js/fileManager.js:178-200`, `js/focusUtils.js:47-57,79`, `js/shortcuts.js:382-388` | C6, E5 |
| L15 | Opening a share link while the help overlay is open only hides it; the stale `#shortcutHelp` keeps `layerOpen()` true and disables Escape (leaving playtest) | `js/shareLink.js:308-312`, `js/focusUtils.js:80` | E6 |
| L16 | Two share links pasted in a row stack two confirmations; cancelling the first clears the hash the second needs, so confirming it silently does nothing | `js/shareLink.js:357-368` | E7 |
| L17 | Project files accept `#rgb` colours but share links reject them ("invalid colours"); old autosaves with `#abc` tiles no longer match their theme after the hex expansion | `js/projectFormat.js:31`, `js/shareLink.js:26` | E8 |
| L18 | The theme editor discards all edits on a backdrop click or Escape without asking | `js/themeEditor.js:42-43,150-159` | C15 |
| L19 | Imported polygons with huge bounds (validator does not tie bounds to vertices) crash the point locator on the first hover (`RangeError: Map maximum size exceeded`) | `js/geometry/neighbors.js:226-236`, `js/projectFormat.js:226-245` | A4 |
| L20 | A fractional `radius`/`size` in a file is rounded differently per tile type (radius 1.9: hexagon 7, triangle 6, square 21 tiles) | `js/geometry/helpers.js:158-161`, `hex.js`, `triangle.js` | A5 |
| L21 | Float noise adds a whole extra page when the board is exactly one page wide (e.g. 190.00000000000003 mm) | `js/print.js:127-130` | D5 |
| L22 | The 16 MP page cap is exceeded by rounding for about 45% of sheet sizes where the area cap applies | `js/print.js:189-193,270-273` | D6 |
| L23 | Crop marks reach the page edge for margins of 3–6 mm, and vertical marks use the horizontal margin | `js/print.js:334-346` | D7 |
| L24 | Hovering a tile hides the top of the object on the tile below (the hover re-fill covers the overhang) | `js/renderer.js:114-140` | D8 |
| L25 | A "fit to board" sheet can exceed the 14,400 pt PDF page limit with no warning (a 30×30 board of 200 mm tiles is 17,065 pt) | `js/print.js:157-175,253-256` | D9 |
| L26 | The 16 MP cap applies to every browser, so A1 sheets print at ~147 dpi and A0 at ~104 dpi even where far larger canvases work | `js/print.js:189-193` | E9 |
| L27 | The bot comments a preview link that is a 404 for a PR beyond the 20-preview cap or one skipped as unbuildable; skipped PRs still use up a slot | `pages.yml`, `scripts/build-site.js:21,106-157` | F3 |
| L28 | `preview:pr-N:` localStorage keys of closed PRs are never cleaned and share production's quota | `scripts/preview-runtime.js` | F4 |
| L29 | Remote theme image URLs are fetched on every start, leaking IP, User-Agent and origin to the theme author; the CSP allows any https image | `index.html:10`, `js/themeManager.js` | F6 |
| L30 | A PR head that lacks `js/` and `images/` is published as a blank page (36 unresolved references in a local build) | `scripts/build-site.js:138-150` | F7 |
| L31 | Documentation drift: the README says Tab cycles swatches without the canvas-focus condition; the project tree omits `focusUtils.js`; the spec lists orientation values the code also extends; the help footer shows the typing note only on non-Mac | README, SPECIFICATION, `js/shortcuts.js` | F8, E12 |

### 4.4 Info

- **Geometry:** a rectangle board with triangle tiles makes width 1 identical to width 2 (`max(2, cols)`); sub-pixel tiles break adjacency below a 0.05 px weld epsilon (unreachable in practice); a NaN canvas size passes the `<= 0` guard in `fitPolygonsToCanvas` and gives NaN vertices; `setScaleAt(view, 1, …)` can return 0.9999999999999999. *(A6, A8–A10)*
- **Persistence:** a share link at start-up replaces a just-found autosave of the same tab without a prompt; an infinite link mixing tile families opens as one overlapping board; `ThemeManager.init` maps every invalid stored hex to `#cccccc`, so two bad tiles of one theme share an identity. *(B11, B13, E14)*
- **UI:** the canvas size is only re-measured on a window resize, not on container changes (no `ResizeObserver`); Ctrl+S falls through to the browser's Save dialog inside the project-name prompt; `[` and `]` change a hidden brush size while Fill or Line is active but the toast says "Brush size N". *(C18–C20)*
- **Render and print:** export canvases do not get `lineJoin`/`lineCap = 'round'`; at print scale the 128 px terrain textures are enlarged 3.6–20×, so big-tile prints are soft; the minimap hashes every tile on every frame; the print dialog cannot cancel a running export; the legend and token pages take their paper size from a hidden "Paper" select. *(D10)*
- **Build:** the preview runtime wraps only `Storage`, so a future use of IndexedDB, Cache API or BroadcastChannel would bypass preview isolation (current code is safe); `pull_request_target` types omit `edited` and `converted_to_draft`. *(F5, F9)*
- **Issues and docs:** the orientations `orthogonal` and `diagonal` are still in the validator's allow-list although no geometry supports them; the bodies of issues #8 and #44 are out of date; circle boards with triangles ignore the orientation control. *(G3–G5)*

---

## 5. Regressions from PR #76

The skeptical review of the PR found that its fixes worked as designed in the places it tested, but five problems come from the PR itself:

- **M6, M7:** the H6 "Tab hijack" fix made the canvas focusable and keyed Tab to canvas focus, but never moved focus there on click, which breaks the shortcut for mouse users and traps keyboard users.
- **M8:** the shared `isTypingTarget` rule dropped checkboxes and colour inputs from Space handling.
- **M9:** the new UI size cap (radius 50) was not checked against the share-link cap.
- **L13–L15:** the new focus layer and Escape coordination leave stale or doubled state in a few dialog combinations.
- **L26:** the 16 MP print cap lowers large-format quality in every browser, not only where it was needed.

None of these loses data. In the mutation run (fixes reverted one at a time in a scratch copy), 8 of the reverted fixes were not caught by any test; they are listed in §6.

---

## 6. Test gaps

- **Script list not tested:** deleting the `<script>` tag for `textureUtils.js` or `focusUtils.js` leaves all 340 tests green, although every other module depends on them at load time. A test that every `js/**/*.js` appears once in `index.html`, with `textureUtils.js` before `textures.js` and `objects.js`, would close it. *(E4)*
- **Tests that pass with the fix reverted:** stroke-interpolation wiring (only the pure helper is tested), Escape layering in playtest and toolbar, the autosave prompt's "Escape chooses Load", the 16 MP print cap, the print `toBlob` null check, and the UI board-size clamp. *(E10)*
- **Untested modules from the first audit remain largely untested at the DOM level:** `Interactions` focus and pointer paths, dialog focus behaviour, and the start-up fallbacks. Every Medium finding in §4.2 about focus or Escape would have been caught by a browser-driven test.
- **Missing cases:** circle boards above radius 8 (M10); a share link round trip at the UI maximum (M9); infinite-board undo after a pan (M4); undo followed by a reload (M5); `restoreState` onto a different canvas size (M2); a printed legend on a board larger than its sheet (M12).

---

## 7. Recommended plan

Each stage can be its own PR. Stages 1–3 contain the user-visible problems.

1. **Data and keyboard safety (small fixes):**
   - **M1** (generate the board on Discard), **M5** (autosave after undo and redo), **M4** (blank tiles missing from a snapshot), **M9** (one source of truth for the size caps).
   - **M6, M7, M8:** decide a Tab model (a different swatch key is the simplest), blur sidebar fields on canvas pointer-down, and fix Space ownership. Add a browser-driven check, because a node test cannot see focus.
   - **H1:** bound `fromId`.
2. **Issue #19 with the legacy-id question:** regenerate and fit on load (M2), which needs the plan for old ids (M15) at the same time. No format change is needed, but write the migration or the "no ids match" fallback before enabling regeneration.
3. **Geometry changes (M10, M11): needs a decision first.** Both change tile ids and counts for existing boards. Your versioning rule says a change to saved-data semantics needs a version bump, migration, fixture, tests and a spec update. Options: apply the fix and bump the format version; apply it only for new boards and keep the old shape reachable; or accept that affected old share links change. M10 affects circle-of-hexagon boards with radius ≥ 16. M11 affects triangle circles at 22 of the first 30 radii.
4. **Print and export:** M12 (legend over board), M13 (palette-aware labels), M3/#20 (at minimum the notification, then pattern and image embedding), M14 (devicePixelRatio), and the print Lows L21–L26.
5. **Start-up and storage:** M16 (do not block start-up on remote images), L2–L5, L29.
6. **CI and previews:** M17, L27, L28, L30.
7. **Tests and docs:** the §6 tests, L31.
8. **Lows in the interaction layer** (L6–L18) can be batched with whichever of the stages above touches the same files.

Two items need a decision from you rather than a fix: how to deal with the geometry changes in stage 3, and whether `#C62828` (the duplicated palette hex) should change (M13), since both touch saved data.

---

## 8. What was checked and found fine

- **Geometry:** tile counts against the documented formulas (5,040 checks); per-tile invariants on about 2,000 fixed boards plus 150 large ones; adjacency symmetry and equality with a shared-edge computation; point-locator agreement on 72,000 points; line-path correctness on 61,000 pairs; determinism across 28,800 canvas sizes; infinite-board lattice, id round trips, `sync` idempotence.
- **State and files:** 120 save→parse→restore round trips and 150 share-link round trips (all board shapes, objects, unicode names, far-away infinite tiles); 6,000 mutated project files (no non-`ProjectFormatError` exceptions, no accepted file that breaks restore); the stricter validator against every fixture, the showcase and everything the app itself can generate.
- **Browser:** the Content-Security-Policy produced no violations in real Edge on load, painting, themes, share, print, exports, a preview build and `file://`. Right-click, middle-button pan, touch, pinch and line/fill paths all behaved. Print and share dialogs trap Tab and restore focus.
- **Print:** tile scale within 0.03% of the requested size, no gaps at page seams, valid PDFs (`qpdf --check`, PyMuPDF), valid SVGs, a 100×100 board printed in under half a second.
- **Build:** every script, icon and link in the built production and preview pages resolves; hostile PR titles are escaped; storage prefixing holds; no post-Node-22 API is used.

---

## 9. Reports and reproduction

The detailed reports are in [bug-audit/](bug-audit/): [A-geometry](bug-audit/A-geometry.md), [B-state](bug-audit/B-state.md), [C-ui](bug-audit/C-ui.md), [D-render](bug-audit/D-render.md), [E-regressions](bug-audit/E-regressions.md), [F-build](bug-audit/F-build.md), [G-issues](bug-audit/G-issues.md) and [H-browser](bug-audit/H-browser.md). They contain exact repro steps, expected and observed output, and the lists of what was checked. The repro scripts themselves (about 150 small node and DevTools scripts, plus generated PDFs and SVGs) were written in a scratch folder and are **not** committed. The reports refer to them as `<scratch>/…`. Where a script mattered, the report quotes its command and output.
