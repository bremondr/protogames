# Area G: GitHub bug issues vs current main

Repo state: main, 340/340 tests green. Scripts (all in `<scratch>/issues/`): `geo.js` (circle/hex/triangle boards, counts, symmetry, overlaps), `topo.js` (edge manifold / Euler check), `i19.js` (restoreState vs canvas), `idmatch.js` (fixture ids vs regenerated ids).

## Verdict table
| Issue | State | Verdict |
|---|---|---|
| #4 triangles in circle look strange | open | PARTLY (symmetry fixed; coarse outline remains, by design) |
| #19 Load Project keeps saved geometry | open | STILL REPRODUCES for Load Project and autosave restore (share link and showcase are fine) |
| #20 SVG export ignores textures/objects | open | STILL REPRODUCES; limitation documented in README only, not in the UI |
| #2, #3, #8, #9 | closed | FIXED, no regression (numbers below) |
| #6 orthogonal -> isometric | closed (not planned) | Correctly closed; mode hidden in UI, no isometric exists |
| #5 eraser/brush removal | closed | FIXED (eraser exists as a sized brush); not browser-verified |

## #4 triangles in circle (open)
Verdict: PARTLY. The issue image cannot be viewed; the owner comment says #59 made it symmetric, and I confirm that numerically.
Evidence (`issues/geo.js`, canvas 1200x800, radius 1..12, both orientations):
- Tile counts 6, 24, 60, 108, 180, 258, 348, 450, 576, 708, 870, 1044 (docs say "6, 24, 60" for r1-3: matches). Up/down triangles are always equal halves.
- 6-fold rotation misses = 0 and left-right mirror misses = 0 for every radius; no overlaps; checkPolygons issues = []; Euler characteristic V-E+F = 1 (no holes) in `topo.js`.
- Roundness (farthest centre / nearest boundary centre): r1 1.00, r2 1.00, r3 1.15, r4 1.08, r5 1.09, r6 1.06, r8 1.03, r12 1.04. Boundary edge count r3 24, r4 36, r5 36, r8 54, r12 96.
- Outline vertex distance max/min: r3 1.73, r5 1.32, r8 1.18, r12 1.14. The outline is a saw-tooth polygon, visibly polygonal below about r6.
- r1 and r2 are identical to the hexagon-board triangle layout (6 and 24 tiles, boundary 6 and 12 edges): a "circle" at those radii is a hexagon. r3 is the worst (spiky 12-gon, roundness 1.15).
- Orientation (pointy/flat-top) has no effect: identical geometry and ids (`triangle_disc_...`). Whether the orientation control is shown for this combination was not checked in a browser.
Next step: keep open but retitle/redescribe as "circle with triangle tiles is a coarse approximation at small radius", or close as by-design after deciding what radius means for triangles (e.g. smaller triangles for circles, or a hint in the sidebar). A browser look is needed to judge "strange".

## #19 Load Project keeps saved canvas geometry (open)
Verdict: STILL REPRODUCES for Load Project and autosave restore. The issue's claim that the resize handler regenerates the grid is correct (js/main.js:6-14, debounced 250 ms; it only fires on a window resize or the synthetic resize events from playtest/toolbar).
Path trace:
| Path | Code | Re-fits to current canvas? |
|---|---|---|
| Load Project (file) | fileManager.js:375 -> openProject :390 -> restoreState :402 (setPolygons of saved polygons :421, no generateBoard) | NO |
| Autosave restore (startup prompt) | fileManager.js:233 restoreState | NO (usually same machine, but window size / devtools / zoom differences stay stale until a resize) |
| Orphan autosave slot adopted from another tab | same handleChoice | NO |
| Share link (startup or hashchange) | shareLink.js:331 regenerates from config with current canvas, then restoreState, then `ViewControls.fit()` :339 | YES |
| Showcase | fileManager.js:65-71 restoreState + generateBoard({preserveColors, preserveHistory, skipDirtyFlag}) | YES |
| Window resize | main.js:6 regenerate preserving colours | YES, only when a resize happens |
Repro `issues/i19.js`: with state.canvas = 500x400 and `Interactions.generateBoard` stubbed, restoreState of each fixture leaves polygons at the saved coordinates (v2 fixture bbox x 112..488, y 48..396) and `generateBoard` is called 0 times.
Additional facts:
- The suggested fix is safe for every bundled file: `issues/idmatch.js` shows all saved ids match the regenerated ids for all 4 fixtures and the showcase (0 painted tiles lost). Data would be lost only for old triangle-on-hexagon/circle ids (no migration rewrites them; see G2). The same loss already happens today on the next resize.
- restoreState does not reset pan/zoom for fixed boards (only for infinite, :423); see G1.
- Infinite boards must be excluded from a regenerate-in-restoreState fix (infinite.js hooks setPolygons).
Next step: keep open. Fix in `restoreState`: after setPolygons, for non-infinite boards call `Interactions.generateBoard(config, {preserveColors:true, preserveHistory:true, skipDirtyFlag:true})` (move the showcase logic in) and `ViewControls.fit()`; add tests in tests/fileManager.test.js with an Interactions stub. Decide how to treat legacy ids (warn or migrate). No file-format change, so no version bump.

## #20 SVG export ignores textures and objects (open)
Verdict: STILL REPRODUCES.
- `js/exporter.js:30-41` buildSvg emits only `<path d fill stroke>` per tile (fill = polygon.color). No `<pattern>`, no `<image>`; objects are never drawn.
- exportToSVG (:43-65) only shows "SVG exported" (:62). The button label is just "SVG" (index.html:136). The limitation is stated only in README.md:19 and :25, not in the UI, so the issue's "at minimum a notification" option is not done.
- Infinite boards are framed correctly via Infinite.exportScene; colours are escaped (tests/exporter.test.js:22).
- PNG uses `Renderer.createExportCanvas()` and follows the texture toggle, so the PNG/SVG mismatch is real.
Next step: keep open. Cheap first fix: a tooltip/notification "SVG: flat colours only, no textures or objects". Real fix: embed `<pattern>` and `<image>` using `Textures.dataUrlFor` / `Objects.dataUrlFor`.

## #2 Broken triangle board with triangle tiles (closed): FIXED, no regression
`issues/geo.js`, triangle board / triangle tiles, N = 1..12, point-up and point-down: tiles = N^2 exactly, 0 overlaps, 0 mirror misses, 0 three-fold rotation misses, checkPolygons empty. The full board x tile x orientation matrix has zero issues on both a 1200x800 and a 360x420 canvas. Also covered by tests/geometry.test.js.

## #3 Broken hexagons in triangle board (closed): FIXED, no regression
Triangle board / hexagon tiles, N = 1..10: tiles = N(N+1)/2 (1, 3, 6, 10, ...), every tile a full 6-vertex hexagon, 0 overlaps, no issues. Pointy-top is mirror-symmetric for all N. Flat-top has mirror misses for even N: the known exception documented in dev/geometry-checks.js `expectedMirror` (staggered columns). Info only.

## #8 Broken triangles in hexagon board (closed): FIXED; issue text is self-inconsistent
Hexagon board / triangle tiles, radius 1..12, both orientations: tiles = 6R^2 (6, 24, 54, 96, 150, 216, ...), 0 overlaps, 6-fold rotation misses 0, checkPolygons empty, Euler = 1 and boundary edges = 6R exactly (clean regular hexagon outline, no gaps; `topo.js`). Geometry rows: 2R rows, e.g. R=3 has 7, 9, 11, 11, 9, 7 triangles (reconstructed from centroid pairing; sum 54).
The issue body's literal numbers (R=3 "2R-1 = 5 rows", then lists of 7 rows 3,5,7,9,7,5,3 and 5,7,9,7,5; R=1 = 3 triangles in 1 row) contradict each other and do not describe what was built. The implementation follows the ring definition of #9 / docs/TILE_GENERATION_EXPLANATION.md ("6 * N^2", radius = rings). Nothing to fix.

## #9 Missing corner tiles (closed): FIXED, no regression
Documented (docs/TILE_GENERATION_EXPLANATION.md, "Counting"): ring k holds 6(2k-1) triangles = 6, 18, 30, ...; total 6N^2. This agrees with the issue's 12N-6 per ring (N=1: 6, N=2: 18, N=3: 30). Measured ring membership by centroid distance for R=1..12, both orientations: rings = [6, 18, 30, 42, ..., 12k-6]. Corners present (6-fold symmetry misses = 0). The issue's proposed ring-by-axial-distance function was not what shipped; the code uses a lattice-centroid predicate (js/geometry/triangle.js:108-170), with the same outcome. The issue's file references (`js/geometry.js` `buildHexagonTriangleGrid`, root `TILE_GENERATION_EXPLANATION.md`) are stale; the file is now docs/TILE_GENERATION_EXPLANATION.md.

## #6 orthogonal mode should be isometric (closed, not planned)
Current app: the "Orthogonal" and "Diagonal" orientation options are commented out (index.html:86-87) and no code in js/geometry/*.js handles them. No isometric view exists. Closing as not planned is consistent. See G3.

## #5 Eraser / brush removal (closed): FIXED
An eraser button exists as a sized brush (toolbar.js eraser group, commit 6adf46d "Make the eraser a sized brush"); tests/interactions.test.js:68 exercises it. Not verified in a browser.

## Other open issues
- #46 Showcase gallery: partly there. Sidebar "Showcase" panel (index.html:148, loadShowcase fileManager.js:60) but only ONE example in `showcases/` (fantasy-landscape) vs 5-8 asked, and no thumbnails or generator script. Keep open.
- #44 Print-ready export: largely implemented (js/print.js, js/printDialog.js, multi-page PDF). The criterion "settings are saved with the project" is not met: settings go to localStorage `protogames_print` (printDialog.js STORAGE_KEY). Update the issue checklist.
- #48 Accessibility: partly addressed by merged PR #76 (focus handling, dialogs). Keyboard tile navigation and an axe audit are not done.
- #51 Playtest mode: only the edit-lock "Playtest" (js/playtest.js) exists; no tokens, dice or turn tracker. Keep open (name clash worth noting).
- #47, #49, #50 (code is still IIFE), #39-#43, #11-#15: no implementation found (not examined in depth). #45 share links is closed and implemented (shareLink.js).
- Open bug-labelled issues: only #4, #19, #20. No other open issue describes a bug.

## New defects
- G1 (Low, UX) `js/fileManager.js:402-441`: restoreState keeps the current pan/zoom for fixed boards; loading a file while zoomed/panned shows the new board under the old view. Only the share-link path calls `ViewControls.fit()` (shareLink.js:339). Fix with #19.
- G2 (Medium, data loss) Boards saved with the old triangle ids on hexagon or circle boards (e.g. `triangle_hex_row_col`) are not migrated (projectFormat.js migrations V0-V3 contain no id remap). The next window resize (main.js:6-14 -> generateBoard preserveColors, interactions.js:612-619) silently drops all their colours and objects, since they are matched by id. Not reproduced with a real old file (none in tests/fixtures); derived from code. Fix: id-remap migration, or detect "no saved id matches the regenerated grid" on load and warn.
- G3 (Info) `projectFormat.js:24` ORIENTATIONS still allows `orthogonal` and `diagonal`, which no geometry code supports; a hand-edited file with them loads without error and falls back to default layout behaviour. Drop them from the allow-list or implement.
- G4 (Info) Circle board with triangles: r1 and r2 are the same shape as the hexagon board, and orientation has no effect (see #4).
- G5 (Info, docs) Bodies of #8 and #44 are out of date relative to what was built.
