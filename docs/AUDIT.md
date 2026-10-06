# Protogames — Code Audit

**Date:** 2026-10-05 · **Revision audited:** `cdf317e` (main, clean tree) · **Scope:** whole repository (≈10k lines of app JS, `index.html`, `styles.css`, tests, scripts, CI, docs)

---

## 1. Executive summary

Protogames is in good shape for a no-build, vanilla-JS app. The architecture is consistent: each file is a module that returns its public API, and the core is pure, well-tested logic (geometry, project format, share links, print planning, view maths). CI passes, with 261 of 261 tests green on the latest run. The print-engine maths, geometry determinism across screen sizes, tile adjacency and canvas `save`/`restore` balance were all checked and found correct. No classic XSS was found: every user-supplied string reaches the DOM through `textContent`.

The weak spots sit at the **edges of the system**: data coming in (project files, share links, theme files), data that can be lost (unconfirmed board replacement, theme edits that revert) and the deploy pipeline.

**Top issues to fix first**

| # | Issue | Why it matters |
|---|-------|----------------|
| H1 | The Pages workflow can publish `main` without running tests | Merging a PR starts a `push` run and a `pull_request_target: closed` run, and the later one cancels the earlier. The PR-event run skips `npm test`, so main can go live untested. The run history shows this happened for #68 and #69. |
| H2 | Editing a tile theme recolours tiles outside the undo history | The next resize, playtest, focus mode or undo puts back colours that no longer exist in any palette. The tiles lose their textures and labels, and the autosave keeps the stale colours. |
| H3 | Share links replace the current board with no confirmation | A `hashchange` throws away unsaved work and overwrites the tab's autosave. |
| H4 | Project-file validation is shallow | A file the validator accepts can crash rendering (no `bounds`), hang the tab (no upper limit on `width`/`radius`), throw on every frame (`object: "__proto__"`), or inject markup into exported SVG (unchecked `color`). |
| H5 | Infinite-board export builds every cell in the area before applying its cap | Two tiles painted far apart make PNG export or print allocate around 1 GB, which freezes or crashes the tab. |
| H6 | Tab is taken over to cycle swatches when focus is on `body` | When the page loads, a keyboard-only user can't Tab to any control. |

**Overall verdict:** no critical vulnerabilities. The app is static and client-only and holds no secrets, so the realistic risks are **losing user data and crashing the tab on hostile input**, not server compromise. About 6 High, 20 Medium and 30 Low/Info findings are listed below. Most fixes are small and local. The single best investment is a stricter `ProjectFormat.validate` (with tests), which closes four findings at once.

**Dead code** is modest: about 15 unused functions or exports, 2 unused state fields, 2 unused CSS blocks, 4 unused SVG images, a DOM hook (`.canvas-placeholder`) whose element no longer exists, and an auto-save toggle wired to a checkbox that is commented out.

**Tests:** strong for pure logic, but `FileManager`, `Interactions`, `ThemeManager`/`ThemeEditor`, `Objects` and the PDF and PNG output paths have no tests. Most of the High/Medium bugs below live in those untested modules.

---

## 2. Method and limits

- Four parallel reviews (state and persistence; geometry, rendering and textures; UI and interaction; build, CI and docs) each read every file in their scope in full. I verified the headline findings myself against the source. Line numbers are for `cdf317e`.
- Exports nobody uses were found with a script that compares each module's returned API against references in other files, then confirmed with `grep`.
- Node is not on this machine's PATH, so the full suite was **not run locally**. The geometry reviewer ran the 122 tests in its scope, with a bundled Node runtime, and they all passed. CI run 37217678655 shows 261/261 passing.
- No browser-based dynamic testing was done. UI findings come from reading and tracing the code.

Severity scale: **High** means data loss, a crash or hang on reachable input, or a broken release safeguard. **Medium** means a user-visible bug or a hardening gap. **Low** means minor bugs, polish and robustness. **Info** means notes.

---

## 3. Findings

### 3.1 High

**H1 · CI · The Pages deploy can publish untested `main`.** `.github/workflows/pages.yml:25-27, 46-48`
The workflow-level `concurrency: pages` with `cancel-in-progress: true` is shared by `push` and `pull_request_target` runs. Merging a PR fires both at once. When the `closed` run cancels the `push` run, the surviving run checks out `ref: main` and builds it, but skips `npm test` (line 47, `if: github.event_name != 'pull_request_target'`). That breaks the promise in `docs/DEPLOYMENT.md` that "a failing main is not published". Fork-PR events, whose job is skipped by `if:`, probably also cancel in-flight deploys, because concurrency is evaluated before the job condition.
*Fix:* always run the tests, which are cheap. Alternatively, split production and preview into separate concurrency groups, or move `concurrency` to the job level.

**H2 · Bug / data integrity · Editing a tile theme bypasses history.** `js/themeManager.js:157`
`polygons.forEach(p => p.color = n)` mutates state in place but never calls `recordHistory`, `markDirty` or autosave. Anything that restores `history[historyIndex]` puts the old hex values back: undo, or a regenerate on resize (`main.js:8-15`, then `interactions.js:607-613`, which playtest and focus mode trigger). Those hex values no longer exist in any palette, so the tiles lose their texture and label, and the autosave keeps the stale hex values.
*Fix:* record a history step, or rewrite the colours inside all history snapshots too, then mark the board dirty and save.

**H3 · Bug / data loss · Share links replace the board with no confirmation.** `js/shareLink.js:262-299`
The `hashchange` listener calls `openFromHash()` directly. `restoreState` resets undo and calls `autoSaveToLocalStorage(true)`, which overwrites the tab's own autosave slot. Opening a file (`confirmReplace`) and opening a showcase (`hasUserWork`) both ask first.
*Fix:* run the same `hasUserWork()` and `confirmReplace` check before applying a link that arrives after start-up.

**H4 · Security / robustness · `ProjectFormat.validate` lets through data that breaks the app.** `js/projectFormat.js:193-213`
- `bounds` is never checked. `Renderer.paint` → `ViewMath.rectsIntersect(polygon.bounds, …)` then throws on every frame, and `Print.plan` (`print.js:53-58`) throws before the Print dialog opens. `restoreState` has already applied part of the file by then, so the user is left with a half-loaded, unrenderable board. From `confirmReplace` the exception isn't even caught.
- `width`/`height` have no upper limit, and `radius`, `size`, `orientation` and `triangleOrientation` are not checked at all. `radius: 1e6` loads, then hangs the tab on the first window resize, because `generateBoard` → `Geometry.generateGrid` has no cap. Share links cap dimensions at 100 (`shareLink.js:22,82`), so the two import paths disagree.
- `object` only has to be a string. `Objects.canvasFor` indexes a plain object (`objects.js:412-418`), so `"__proto__"` resolves to `Object.prototype` and `G[id](ctx)` throws on every frame.
- `color` is any string, and `exporter.js:53` interpolates it raw into `fill="${fill}"`. A colour such as `red" onload="alert(1)` gives an exported SVG that runs script when opened in a browser.
*Fix:* validate `bounds`, numeric ranges matching the share-link limits, `color` against `/^#[0-9a-f]{6}$/i` (as `shareLink.js` already does), and object ids with `Object.hasOwn` or a `Map`. Escape attribute values in the SVG exporter anyway. Add the hostile cases as tests.

**H5 · Performance / crash · Infinite export runs `cellsIn` before applying its cap.** `js/infinite.js:193-201`
`cellsIn(familyOf(...), rect)` builds every lattice cell in the drawn area, and only afterwards does `EXPORT_MAX_TILES` (30k) fall back to painted tiles. The reviewer measured a span of 20,000 px at 229k cells, 0.65 s and about 260 MB, and a span of 40,000 px at 910k cells, 3.1 s and about 1 GB. Two tiles painted far apart are enough to trigger it, through PNG export (`exporter.js`) or print (`print.js`).
*Fix:* estimate the cell count from the rectangle's area and cell size before building any cells.

**H6 · Accessibility · Tab is hijacked when focus is "neutral".** `js/shortcuts.js:251-255` (plus the `tab` binding)
`focusNeutral()` treats `document.body` as neutral. At page load, and after any focused element is destroyed (the object grid is rebuilt on every sync, `toolbar.js:193`; swatch popovers close on a 120 ms timer), Tab cycles colours instead of moving focus. The project has no `tabindex` anywhere, so a keyboard-only user can't reach the controls.
*Fix:* only cycle swatches when the canvas has focus (give it `tabindex="0"`), and leave Tab alone when focus is on `body`.

### 3.2 Medium

| ID | Area | Location | Finding |
|----|------|----------|---------|
| M1 | Security (DoS) | `js/shareLink.js:184-187` | `decode` inflates the whole `deflate-raw` stream with no output limit. A hash of a few MB can expand to GBs. `MAX_TILES` is checked only after inflating, parsing JSON and building polygons (`:273`), and the hash is cleared only after decoding, so a crashed tab that reloads hits the same link again. Stream through a reader and stop at N bytes. |
| M2 | Bug | `js/shareLink.js:275` | `querySelectorAll('.modal-backdrop:not(.hidden)').forEach(m => m.remove())` also removes the static `#printDialog`, `#shareDialog` and `#themeEditor` from the DOM if one is open (`index.html:352,461,479`), which breaks that feature until reload. Remove only dynamically created modals, or hide the static ones. |
| M3 | Bug | `js/main.js:48-58` | When a share link is present, `startBoard` returns after calling `openFromHash()`, which is async and not awaited. If the link fails (corrupt, newer version, no `DecompressionStream`), no board is generated, the autosave that was just found is never offered, and the user sees an empty canvas. |
| M4 | Bug / UX | `js/fileManager.js:128-131` | When storage is full, a native `alert()` fires on every failed save. Every committed stroke forces a save and the 30 s interval keeps trying, so the user gets a blocking alert loop. Show it once, using the app's own notifications. |
| M5 | Bug | `js/fileManager.js:116-118`, `js/autosaveSlots.js:160` | `window.localStorage` is read outside `try`. With storage blocked, that read throws a `SecurityError`, so a file or link that loaded fine is reported as failed, and `takeRestorable` makes start-up abort before a board is generated. |
| M6 | Bug / data loss | `js/interactions.js:593` (`generateBoard`) | "Generate Board" replaces the painted board, clears undo and overwrites the autosave with no confirmation. |
| M7 | Bug | `js/ui.js:173-176` | Board inputs use `parseInt(v) \|\| default`, which allows negative numbers and has no maximum. A 1000×1000 board freezes the tab, and any board over 100 makes share links that recipients reject. |
| M8 | Security / bug | `js/themeManager.js:42, 104` | Imported theme `hex` values are not validated (`t.hex \|\| '#cccccc'`). A value like `url(https://…)` ends up in `--swatch-color`, used in a `background:` shorthand (`styles.css:422`), so the page fetches any URL. Non-hex values also break share links (`unpack` requires `#rrggbb`), and `uniqueHex` turns them into `#000000`. |
| M9 | Bug | `js/interactions.js:484, 512-518` | Clicking a tile that already has the colour (or erasing a blank one) still records a history step, so Undo appears to do nothing and real steps are pushed out of the 50-step limit. Only record when `paintAt` actually changed something. |
| M10 | Bug | `js/interactions.js:433-436`, `js/viewControls.js:161-169` | In fill mode the fill is applied on the first `pointerdown`. When a second finger starts a pinch, `cancelStroke` only rolls back brush strokes and lines, so the fill stays. |
| M11 | Bug | `js/interactions.js:425-452` | `handlePointerDown` doesn't check `event.button`, so right-click paints, records undo and opens the browser context menu. |
| M12 | Bug | `js/viewControls.js:124-138` vs `js/shortcuts.js:126` | Two `isTypingTarget` functions disagree: ViewControls counts a focused `BUTTON` as typing. Holding Space to pan after clicking Undo or Clear presses that button instead. |
| M13 | Bug | `js/themeEditor.js:254` and `close()` | `close()` doesn't check `editor.saving`. Closing the editor during the async save makes `editor.id` throw, the `catch` block throws again, and the promise rejection goes unhandled. If the editor was reopened in the meantime, the old save closes the new dialog. |
| M14 | Bug | `js/print.js:265, 418, 488` | A single-sheet PDF at A1/A0 needs canvases of 57 MP or more, two of them at once (about 460 MB), which is beyond iOS Safari's 16.7 MP limit. A `null` from `getContext` or `toBlob` then fails with an unclear TypeError. |
| M15 | Bug (visual) | `js/textures.js:122-133` (also nebula wisps around `:559`) | `R()` is called inside the `wrap()` callback, so each of the 9 wrapped copies of a blotch gets a different colour, which leaves faint seams on these "seamless" textures. Draw the random values once, outside the callback. Fixing this changes how the textures look. |
| M16 | Performance | `js/state.js:185-203`, `js/infinite.js` sync | On the infinite board, every chunk crossing swaps the polygons array, and the next hover rebuilds both the adjacency graph and the point locator. The reviewer measured 93 + 43 ms on 21k triangles. Build the adjacency lazily, only when fill or line needs it. |
| M17 | Security (Info+) | `index.html:544` | The third-party `simpleanalyticscdn.com/latest.js` loads with no SRI (SRI isn't possible for a "latest" URL), and there's no Content-Security-Policy. The original PRD says "No user data shall be transmitted to external servers". This is an accepted risk, but it should be written down. A CSP `<meta>` would also limit the impact of M8 and of future injection bugs. |

### 3.3 Low

**Persistence and import**
- `js/fileManager.js:159`: an older cached copy of the app deletes orphan autosaves it can't parse, including ones written by a newer version (`newer-version`).
- `js/fileManager.js:360`: `updateBoardConfig` *merges* the file's config, so keys the file doesn't have (`orientation`, `radius`…) are inherited from the previous board, and unknown keys are kept and saved again.
- `js/fileManager.js:343` vs `:48`: opening a file asks for confirmation whenever `polygons.length` is non-zero, which is true even for a blank board. Showcases use `hasUserWork()`.
- `js/projectFormat.js:231`: an empty `polygons` array is accepted, although the spec says infinite files keep at least one tile.
- `js/utils.js:57-59`: `revokeObjectURL` runs synchronously after `anchor.click()`, and some browsers (Safari, older Firefox) can cancel the download. Defer it with `setTimeout`.
- `js/shareLink.js:94-95`: `v` is compared with `>` before its type is checked (`"3"` shows the "newer version" message), and a v1 link is never checked against `boardShape: 'infinite'`.
- `js/infinite.js:57-62`: `fromId` parses with `Number()`, so non-canonical ids are accepted and silently renamed (`inf_s_01_2` → `inf_s_1_2`, `inf_s_1e1_0x10` → `inf_s_10_16`), including ids from share links.

**Rendering and assets**
- `js/renderer.js:23-31`: `lineJoin`/`lineCap = 'round'` are set and then wiped by `resizeCanvas()`, because assigning `canvas.width` resets the context. The settings never apply; set them after every resize.
- `js/textures.js:742`: a hex with no label is cached as `null` permanently, and `resetLabels()` doesn't clear that cache. Importing the matching theme later has no visible effect until reload.
- `js/textures.js:21-23`, `js/objects.js:405`: blob URLs are dropped from caches without `URL.revokeObjectURL`, so they leak on every theme re-import or detach.
- `js/renderer.js:75+` (`paint`): every frame filters and sorts every polygon for objects, loops over all of them for hover and line preview, and lowercases colour strings per tile.
- `js/geometry/neighbors.js:150-180`: on a disconnected board, `linePath` falls back to `[prev, next]`, which breaks the "gap-free line" promise.
- `js/interactions.js:478-488`: fast brush drags leave gaps. Only the tile under the latest event is painted, the 16 ms throttle drops the events in between, and `getCoalescedEvents` isn't used.
- `images/protogames proto logo.png` is 1.4 MB but shown at 48×48, with `loading="lazy"` even though it is above the fold.
- Radius 0: hexagon tiles allow it, triangle tiles clamp it to 1. That only matters if the UI or a share link ever sends 0.

**UI and accessibility**
- None of the dialogs traps focus, despite `aria-modal="true"`. The FileManager modals (`fileManager.js:169-286`) have no `role="dialog"`, no initial focus, and (for the autosave prompt) no Escape handling.
- `js/toolbar.js:199`: `role="listitem"` on object buttons removes their button role and `aria-pressed`. The palette grid's `aria-live` re-announces every swatch on each re-render.
- Escape handlers aren't coordinated (`playtest.js:57`, `toolbar.js:241`, the file-name prompt): one key press can leave playtest *and* focus mode.
- `styles.css:1271-1280`: the colour input has `opacity: 0` and no `:focus-within` style, so keyboard focus on it is invisible.
- `js/print.js:191`: a cleared number field becomes `0`, which clamps to 5 mm. Print settings read from localStorage aren't checked (`objects: 'x'`).
- `js/printDialog.js:15` vs `js/print.js:459`: whether a print is blocked is decided by regexes over the warning *text*, so rewording a warning silently unblocks the export. Use a structured flag instead.

**Build and CI**
- `scripts/build-site.js:146-150`: only `sha(preview.ref)` is inside `try`. A PR missing `index.html` or `<head>` aborts the whole build, production included.
- Actions are pinned to tags, not SHAs, which matters more under `pull_request_target` with `pages: write`. `test.yml` uses `checkout@v4`/`setup-node@v4` while `pages.yml` uses v7, and `test.yml` has no `permissions:` block (the repo default is read).
- There is no `.gitignore`, although the workflow and the local recipe write `previews.json` and `_site/` into the repo root.
- All previews share the production origin, so preview JS can read production localStorage, and Web Lock names aren't prefixed per preview. This is documented, but the trust boundary is "anyone with push access".
- `docs/DEPLOYMENT.md:33` and `README.md:118` recommend `python -m http.server`, which binds to all interfaces. Suggest `--bind 127.0.0.1`.

---

## 4. Unused and dead code

All verified with `grep` across `js/`, `tests/`, `dev/` and `index.html`.

| Item | Location | Note |
|------|----------|------|
| `Interactions.applyColorToPolygon` | `js/interactions.js:574` | Not exported or called |
| `Renderer.clearCanvas` | `js/renderer.js:54` | Never called |
| `Utils.formatTimestamp` | `js/utils.js:83` | Never called; `fileManager.js:170` re-implements it |
| `GeometryHelpers.createDiamondVertices` | `js/geometry/helpers.js:222` | Only destructured in `square.js:12`; that file's header still mentions "diamond" grids |
| `clampH` | `js/textures.js:226` | Defined, never used |
| `snowcap` option | `js/textures.js:748` | Passed, read by no generator |
| `pointingUp` polygon metadata | `triangle.js`, `infinite.js` | Written, never read (and inconsistent: rotated lattices store `{}`) |
| `state.availablePalettes`, `state.lastSaveTime` | `js/state.js:16, 51` | Written, never read |
| `.canvas-placeholder` hook | `js/ui.js:14, 162-167`; `styles.css:193` | The element doesn't exist in `index.html`, so `updateCanvasMessage` does nothing (3 callers) |
| `autoSaveToggle` wiring | `js/ui.js:45-62`, `fileManager.js:372` | The checkbox is commented out in `index.html:190-195` |
| Unused CSS | `styles.css:280-329` (`.icon-button`), `:466` (`.action-buttons`) | No matching markup |
| Unused images | `images/Regular_hexagon*.svg`, `Regular_triangle.svg` | Not referenced anywhere, yet published |
| Exports used by nobody (also not by tests) | `Exporter.exportToPNG/exportToSVG`, `Main.initializeApp`, `ViewControls.isSpaceDown`, `ViewMath.IDENTITY`, `Textures.TILE_SIZE`, `AutosaveSlots.PREFIX/LEGACY_KEY/LEGACY_ID/MAX_AGE_MS/MAX_ORPHANS` | Used only inside their own module; drop them from the public API, or have the tests import the constants instead of hard-coding the strings |
| Test-only exports | `ToolOps.planLine`, `Geometry.findPolygonAtPoint`/`isPointInPolygon` | `planLine` duplicates what `interactions.js:262` does through `Geometry.linePath`, so the test exercises a different path from the app |

**Duplication worth consolidating**
- `rgb`, `shade`, `toObjectUrl` and the `objUrls`/`urlFor` cache are copied between `textures.js` and `objects.js`.
- Bounds reductions are written about five times (`helpers.js`, `viewMath.js`, `geometry-checks.js`).
- There are two `isTypingTarget` functions with different rules, which causes M12.
- Pointer-to-canvas coordinate maths appears in both `interactions.js` and `viewControls.js`.
- Stroke-commit code is copied between `handlePointerUp` and `handlePointerCancel`.
- Four near-identical modal builders sit in `fileManager.js:169-286`.
- The per-builder sizing and centring in `hex.js`, `square.js` and `triangle.js` is dead work, because `fitPolygonsToCanvas` overwrites it.
- `objects.js:405` has a `typeof objUrls` guard on a `const` declared later, at `:447`. Because of the temporal dead zone, the guard would throw rather than protect.
- `textures.js:726`: the `glacier` alternative can never match, because an earlier rule catches it.

---

## 5. Test coverage gaps

The pure-logic suites are good: geometry matrix, neighbours, project-format migrations with fixtures, share links, print planning and shortcuts. The gaps match where the bugs are:

1. **No tests at all:** `FileManager` (`restoreState`, `serializeAppState`, quota and blocked-storage paths), `Interactions` (M9–M11), `ThemeManager`/`ThemeEditor` (H2, M8, M13), `Objects`, `Exporter` (SVG escaping) and `Utils.sanitizeFileName`.
2. **Hostile-input tests** for `ProjectFormat.parse`: missing `bounds`, huge `radius`/`width`, non-hex `color`, `object: "__proto__"`. These would fail today.
3. `ShareLink.openFromHash`: the infinite `i` rebuild, the `MAX_TILES` check, which modals get removed, start-up failure, and a size limit on inflation.
4. `AutosaveSlots`: only `choose()` is tested. `claim`, the duplicated-tab lock fallback and the no-Web-Locks branch are not.
5. `state.js`: history-limit overflow and truncation of the redo branch.
6. `infinite.js`: the export cap on huge areas (H5), `fromId` round-trips, chunk-key reuse in `sync`.
7. Print output: `toPdf`, the tiled and sheet page renderers, and crop marks (only the planning maths and `buildPdf` are covered).
8. Textures: seamless wrapping (would catch M15) and the cache-invalidation paths.
9. A test that every id used by JS exists in `index.html`. None are missing today, but the canvas-placeholder and auto-save-toggle cases above show how it drifts.
10. The geometry matrix and `dev/geometry-gallery.html` leave out the `infinite` board shape.

---

## 6. Documentation drift

- `docs/TILE_GENERATION_EXPLANATION.md` is entirely stale. It describes `maxHexSize`, `anchorX` and a distance filter, none of which exist. The code now uses `buildLatticeTriangles` with an `accepts` predicate. Its own ring arithmetic is also wrong: "6 + 12 + 18 = 54" adds up to 36, and the real rings are 6, 18, 30.
- `README.md`:
  - It lists an "Orthogonal Square" grid that is commented out.
  - Its project tree is missing about 12 modules plus `dev/`, `tests/`, `showcases/` and `images/`.
  - It says the tests cover "every board shape", but `infinite` is excluded.
  - It still says "Last updated: November 2025".
- `docs/SPECIFICATION.md:7` gives the autosave key as `protogames_autosave`. It is really `protogames_autosave:<tab id>` (the same document has it right at line 125). The error codes `no-migration`/`bad-migration` aren't listed.
- `docs/Protogames - Development Specification Document.md` asks for a "component-based framework" and "no external data transfer", and the app now does neither. Mark it as a historical PRD.
- The README says "exports follow the current view", but SVG export draws flat colours only (no objects or textures). `exporter.js:20,33` still uses `alert()`.
- `package.json` has no `license` field (the repo is AGPL-3.0).

---

## 7. Recommended plan

1. **Now (safety):** H1 (run the tests on every deploy), H3 and M6 (confirm before replacing a board), H2 (record theme edits in history).
2. **Next (hardening):** tighten `ProjectFormat.validate` and share-link decoding (H4, M1, M8), escape SVG attributes, and add a CSP `<meta>`. Add the hostile-input tests at the same time. If a stricter rule changes what counts as a valid saved file, follow the project's versioning practice: decide on a version bump, add a migration and fixture, and update the spec.
3. **Then (robustness and UX):** H5, M2–M5, M7, M9–M14, and keyboard access (H6, focus traps).
4. **Cleanup:** remove the dead code in §4, consolidate the duplicated helpers, add `.gitignore`, refresh the README and TILE_GENERATION docs, and shrink the logo.
