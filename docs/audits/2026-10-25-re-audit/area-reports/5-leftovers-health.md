# Re-audit area 5: leftovers of the first audit, dead code and duplication, tests, documentation drift

Revision checked: main `78aa7ef` (545 tests). Method: reading the code, greps, scripts in `scratchpad/re5/` (`unused-api.js`, `dead-fns.js`, `unused-css.js`, `ids.js`, `load-order.js`, `test-quality.js`, `check-links.js`, `fn-size.js`, `mutate.js`/`mutate2.js`/`mutate3.js`), and the suite run in a private `git clone` of the checkout (`re5/repo`). `$MAIN` was never modified. All paths below are relative to the repo root; `app/js/x.js:N` is a line on 78aa7ef.

Headline numbers
- First audit, 58 items (§3.3 Low 26, §4 table 14, §4 duplication 9, §6 drift 9): **FIXED 41, OPEN 8, CHANGED 9**.
- New findings: **0 High, 0 Medium, 6 Low, 7 Info**.
- Mutation spot check: 105 mutations, 86 killed, **19 survived (16 real gaps, 3 equivalent or near-equivalent)**.
- Suite: 545/545 on 3 runs plus 5 environment variants; no flakes found. 12 to 15 s wall time, of which `tests/buildSite.test.js` alone is about 14.7 s.

---

## 1. Status of the first audit's items

Evidence key: "gone" means `grep -rn` over `app dev tests index.html landing.js scripts` returns nothing. Fix commits were not bisected; "(#NNN)" is given only where the git log subject names it.

### 1.1 §3.3 Low bullets

**Persistence and import**

| Item | Status | Evidence | Note |
|---|---|---|---|
| `fileManager.js:159` older app deletes autosaves it cannot parse, incl. `newer-version` | CHANGED | `AutosaveSlots` no longer exists. `ProjectLibrary.importLegacy` (`app/js/projectLibrary.js:136-164`) turns every readable legacy slot into a project and deletes only unreadable ones; `summarize` (`:45-57`) does not look at the version, so newer-format slots are kept | Per-tab autosave replaced by the project library (#107). The "old cached app deletes newer data" risk now only exists for the legacy keys |
| `fileManager.js:360` `updateBoardConfig` merges the file config | FIXED | `AppState.setBoardConfig` (`app/js/state.js:129-139`) starts from defaults and keeps only known keys plus `SHAPE_SETTINGS`; `restoreState` uses it (`app/js/fileManager.js:474`). Killed by mutation S07 | `updateBoardConfig` (`state.js:116`) remains for UI partial updates only |
| `:343` vs `:48` confirmation on a blank board | CHANGED | Opening a file/link/showcase never asks: `openProject` -> `showAsNewProject` (`fileManager.js:79-89, 426-433`). The only remaining question, "Generate Board", uses `hasUserWork` (`interactions.js:221`) | Superseded by "open = new project" (SPECIFICATION.md:176) |
| `projectFormat.js:231` empty `polygons` accepted for infinite | FIXED | `projectFormat.js:419`. Killed by V09 | Empty polygons stay valid for fixed boards (test `projectFormat.test.js:433`) |
| `utils.js:57-59` `revokeObjectURL` right after `click()` | FIXED | `app/js/utils.js:73-75` (10 s timer). **Mutation S11 survived**: no test | See N5-6 |
| `shareLink.js:94-95` `v` compared before type, v1 vs infinite | FIXED | `checkEnvelope` `app/js/shareLink.js:121-131`. Killed by M02, M03 | |
| `infinite.js:57-62` `fromId` uses `Number()` | FIXED | `app/js/infinite.js:56-66` (`CANONICAL_INT`, `isSafeInteger`). Killed by H03. **H04 (safe-integer guard) survived** | `tests/infinite.test.js:53` covers the canonical forms only |

**Rendering and assets**

| Item | Status | Evidence | Note |
|---|---|---|---|
| `renderer.js:23-31` `lineJoin/lineCap` wiped by `resizeCanvas` | FIXED | `applyContextDefaults` re-applied after every resize, `app/js/renderer.js:19-23, 48-49`. **Mutation S19 survived**: no test | See N5-6 |
| `textures.js:742` unlabelled hex cached as `null` | FIXED | `app/js/textures.js:862` ("not cached"). Killed by S18 | |
| `textures.js:21-23`, `objects.js:405` blob URLs leak | FIXED | `TextureUtils.createUrlCache().drop` revokes (`app/js/textureUtils.js:30-42`), used at `textures.js:24,26`, `objects.js:545,583`. Killed by S17; test `objects.test.js:18` | |
| `renderer.js:75+` `paint` filters and sorts every polygon each frame | OPEN | `app/js/renderer.js:119-122`: `polygons.filter(...).sort(...)` still runs over all tiles every frame; the start-marker loop (`:106-107`) and hover/preview loops also visit all tiles | Culling happens after the full scan |
| `neighbors.js:150-180` `linePath` falls back to `[prev, next]` on a disconnected board | OPEN | `app/js/geometry/neighbors.js:180` still `shortestPath(...) \|\| [previousId, nextId]`. **Mutation S25 survived**: no test has a disconnected board | Reachable on Country boards with islands |
| `interactions.js:478-488` fast brush drags leave gaps | FIXED | `getCoalescedEvents` and interpolated `strokePoints`, `app/js/interactions.js:544-553` | |
| `images/protogames proto logo.png` 1.4 MB, `loading="lazy"` | FIXED | File is now 30,502 bytes; `app/index.html:25` has no `loading` attribute; a 5,360-byte `favicon.ico` was added | |
| Radius 0: hexagon allows it, triangle clamps to 1 | CHANGED | Meaning is now "layers": hexagon/square `radius` 0 = layer 1, triangle `radius` 1 = layer 1 (SPECIFICATION.md:234); `buildHexagonTriangleGrid` clamps `rings >= 1` by design | Validator allows 0 to 100 (`projectFormat.js:293`) |

**UI and accessibility**

| Item | Status | Evidence | Note |
|---|---|---|---|
| Dialogs do not trap focus; FileManager modals lack `role="dialog"` | FIXED | `presentModal` (`app/js/fileManager.js:237-259`): role, `aria-modal`, `aria-labelledby`, `FocusUtils.trapTab`, initial focus, Escape, focus restore. Static dialogs: `index.html:413,595,614,632` plus `toolbar.js:103-106`. Killed by B19 | |
| `toolbar.js:199` `role="listitem"` on object buttons; palette `aria-live` | FIXED | Object buttons no longer carry it. Remaining `listitem` uses are rows inside `role="list"` containers (`toolbar.js:363` with `index.html:207,223`; `themeEditor.js:185` with `index.html:652`). `aria-live` only on size outputs and status regions | |
| Escape handlers not coordinated | FIXED | `FocusUtils.layerOpen` (`focusUtils.js:79`) checked at `toolbar.js:93`, `playtest.js:158`; modals `preventDefault` (`fileManager.js:251`); drag cancel claims the key (`playtestDrag.js:296`) | Residual: N5-13 |
| `styles.css:1271-1280` colour input has no focus style | FIXED | `app/styles.css:1279` `.editor-color:focus-within` | |
| `print.js:191` cleared number field becomes 0; stored settings unchecked | FIXED | `Print.normalize` (`app/js/print.js:197-215`): `''`/`null` fall back to default, every enum is whitelisted. Killed by S20 | |
| `printDialog.js:15` regexes over warning text decide "blocked" | FIXED | `printDialog.js` is gone; warnings carry `blocking` (`print.js:221,257`), dialog reads `p.blocked` (`exportDialog.js:190`). Killed by S21 | |

**Build and CI**

| Item | Status | Evidence | Note |
|---|---|---|---|
| `build-site.js:146-150` only `sha()` in `try` | FIXED | Both `sha(...)` and the whole export/rewrite sit in `try` blocks that skip the preview, `scripts/build-site.js:159-182`. I ran `node scripts/build-site.js --out ... --main HEAD --previews previews.json` successfully | |
| Actions pinned to tags not SHAs; `test.yml` v4 and no `permissions` | OPEN (partly fixed) | Still tags (`.github/workflows/*.yml`: checkout@v7, setup-node@v7, configure-pages@v6, upload-pages-artifact@v5, deploy-pages@v5, github-script@v9; `gh api` shows all are the latest majors). `test.yml` now has `permissions: contents: read` and the same versions as `pages.yml` | Accepted and written down in DEPLOYMENT.md:30 |
| No `.gitignore` | FIXED | `.gitignore` lists `_site/`, `previews.json`, `node_modules/`, OS files | |
| Previews share the production origin | CHANGED | `scripts/preview-runtime.js` prefixes every storage key per preview (DEPLOYMENT.md:44); trust boundary documented (:56) | Web Locks are gone with `AutosaveSlots` |
| `http.server` binds to all interfaces | FIXED (README:134 residual) | `--bind 127.0.0.1` at `DEPLOYMENT.md:37`, `README.md:158` | `README.md:134` still says plain `python -m http.server` |

### 1.2 §4 Unused and dead code

| Item | Status | Evidence |
|---|---|---|
| `Interactions.applyColorToPolygon` | FIXED | gone |
| `Renderer.clearCanvas` | FIXED | gone |
| `Utils.formatTimestamp` | **OPEN** | still defined and exported, `app/js/utils.js:99-102,112`; zero callers anywhere |
| `GeometryHelpers.createDiamondVertices` | FIXED | gone; no "diamond" left in `app/js/geometry/` |
| `clampH` | FIXED | gone |
| `snowcap` option | FIXED | gone |
| `pointingUp` polygon metadata | **OPEN** | written at `geometry/triangle.js:86,144,364` and `infinite.js:53`, never read (`grep "\.pointingUp"` finds no reader); still inconsistent (`{}` when rotated, `triangle.js:144`) |
| `state.availablePalettes`, `lastSaveTime` | FIXED | gone; every field of the `state` object is now read (checked field by field, `drag`/`selectedPieceId`/`hoverIds` via destructuring in `renderer.js:168`) |
| `.canvas-placeholder` hook | FIXED | gone from JS, CSS and HTML. Leftover: `updateCanvasMessage` stubs in `tests/support/fakes.js:37` and `tests/main.test.js:20` mock a function that no longer exists |
| `autoSaveToggle` wiring | FIXED | gone. Vestige remains: see N5-2 and CSS below |
| Unused CSS | CHANGED | `.icon-button`/`.action-buttons` gone. New unused block: `.autosave-toggle`, `.checkbox-label`, `.checkbox-label input[type='checkbox']` at `app/styles.css:458-476` (no markup or JS use anywhere) |
| Unused images | FIXED | `app/images/` has only the logo and `favicon.ico`; both referenced |
| Exports nobody uses (`Exporter.exportToPNG/SVG`, `Main.initializeApp`, `ViewControls.isSpaceDown`, `ViewMath.IDENTITY`, `Textures.TILE_SIZE`, `AutosaveSlots.*`) | FIXED | Exporter's are now called by `exportDialog.js:323-324`; the others are gone. New instances: N5-7 |
| Test-only exports (`ToolOps.planLine`, `Geometry.findPolygonAtPoint`/`isPointInPolygon`) | **OPEN** | `planLine` (`toolOps.js:53,142`) is still used only by `tests/tools.test.js:265,276` while the app calls `Geometry.linePath` directly (`interactions.js:306`). `geometry.js:34-35` still re-exports the two helpers; the app never calls them through `Geometry`, tests use `Helpers.` or `Geometry.isPointInPolygon` once (`infinite.test.js:38`) |

Duplication bullets

| Item | Status | Evidence |
|---|---|---|
| `rgb`, `shade`, `toObjectUrl`, `urlFor` cache copied | FIXED | `app/js/textureUtils.js` (loaded by both). A third copy of hex parsing and `shade` appeared in `pieces.js:97-109` (N5-8) |
| Bounds reductions written about five times | CHANGED | `ViewMath.boundsOf` is used by `helpers.js`, `countryBoard.js`, `infinite.js`, `print.js`, `viewControls.js`; hand-written min/max loops remain at `exporter.js:95-96,157-158`, `objects.js:573-574`, `countryBoard.js:120`, `projectFormat.js:392-394` |
| Two different `isTypingTarget` | FIXED | one in `FocusUtils.isTypingTarget` (`focusUtils.js:19`); `shortcuts.js:127` delegates, `viewControls.js:128` calls it. Killed by S23 |
| Pointer-to-canvas maths in `interactions.js` and `viewControls.js` | **OPEN** | `interactions.js:622-632`, `viewControls.js:39-46` and the minimap copy `:364-369` |
| Stroke-commit copied between `handlePointerUp`/`Cancel` | FIXED | shared `endStroke` (`interactions.js:588-595`, called at `:583,608`) |
| Four near-identical modal builders in `fileManager.js` | CHANGED | shared `presentModal` (`:237`); three builders remain (`promptForText`, `showMessage`, `confirmReplace`, `:271-365`) |
| Per-builder sizing and centring in hex/square/triangle is dead work | **OPEN** | `geometry/hex.js:30-46, 273-278`, `triangle.js:55, 331` still compute a size that `fitPolygonsToCanvas` overwrites (`helpers.js:51-73`); TILE_GENERATION_EXPLANATION.md:70 acknowledges it |
| `objects.js:405` `typeof objUrls` guard before its declaration | FIXED | gone |
| `textures.js:726` `glacier` alternative unreachable | FIXED | `textures.js:845` now has `glacier` as its own rule, no earlier rule matches it |

### 1.3 §5 Test coverage gaps

| Gap | Now | Tests |
|---|---|---|
| 1 `FileManager`, `Interactions`, `ThemeManager`/`ThemeEditor`, `Objects`, `Exporter`, `Utils.sanitizeFileName` | Mostly covered. **`Utils.sanitizeFileName` still has no test** (`grep -rn sanitizeFileName tests` is empty) | `fileManager.test.js` (13 `test()` blocks), `restoreRefit.test.js` (7), `interactions.test.js` (13), `themeManager.test.js` (2), `themeManagerImport.test.js` (3), `themeEditor.test.js` (2), `objects.test.js` (2), `exporter.test.js` (16) |
| 2 hostile `ProjectFormat.parse` input | Covered | `projectFormat.test.js` (61 blocks, `hostile()` fixtures; V01-V15 all killed) |
| 3 `ShareLink.openFromHash` | Covered | `shareLinkOpen.test.js` (8); inflate limit, MAX_TILES, modal handling killed (M01, M04, M06, M08) |
| 4 `AutosaveSlots` | Moot: module deleted. `ProjectLibrary` has `projectLibrary.test.js` (12) | |
| 5 history overflow, redo truncation | Covered | `state.test.js` (16); B01, B02 killed |
| 6 infinite export cap, `fromId` round-trips, chunk-key reuse | Export cap and `fromId` covered (`infinite.test.js:17,53,146`); **chunk-key reuse in `sync` still untested** (`grep sync tests/infinite.test.js` is empty) | |
| 7 print output: `toPdf`, page renderers, crop marks | **Still untested**: `print.test.js` (17) covers planning and `buildPdf` only; no test mentions `toPdf`, `drawPreview` or crop marks | |
| 8 textures seamless wrapping, cache invalidation | Covered | `textures.test.js` (6): S16, S17, S18 killed |
| 9 every JS id exists in `index.html` | Covered | `indexHtml.test.js:99-114` |
| 10 geometry matrix and gallery omit `infinite` | Unchanged by design: `dev/geometry-checks.js` has no `infinite`; covered by `infinite.test.js` (13) and README.md:153 now says so | |

### 1.4 §6 Documentation drift

| Item | Status | Evidence |
|---|---|---|
| TILE_GENERATION_EXPLANATION.md entirely stale | CHANGED | Rewritten around `buildLatticeTriangles` with correct 6, 18, 30 rings, but it went stale again after #101/#103/#113: N5-4 |
| README "Orthogonal Square" grid | FIXED | not listed; the option is only an HTML comment (`app/index.html:110-111`) |
| README project tree missing modules, `dev/`, `tests/`, `showcases/`, `images/` | CHANGED | Tree rewritten; still lacks `boardPicker.js`, `focusUtils.js`, `panels.js`, `dev/build-showcases.js`, `scripts/preview-runtime.js`; see N5-5 |
| README says tests cover "every board shape" but infinite excluded | FIXED | README.md:153 says infinite is in `tests/infinite.test.js` (but it still lists a `square` board shape: N5-5) |
| README "Last updated: November 2025" | FIXED | README.md:175 "October 2026" |
| SPECIFICATION.md:7 autosave key; error codes `no-migration`/`bad-migration` | FIXED | line 7 says `protogames_project:<id>`; line 77 lists all seven codes (verified against `projectFormat.js`) |
| PRD asks for a component framework and "no external data transfer" | FIXED | "Historical document" banner at the top of the file |
| README "exports follow the current view" / SVG flat only / `alert()` in exporter | FIXED | statement gone; no `alert(`, `confirm(` or `prompt(` left in `app/js` |
| `package.json` has no `license` | FIXED | `"license": "AGPL-3.0-only"` |

---

## 2. New findings

No High and no Medium finding. Everything below is Low or Info.

### N5-1 (Low) Share link refuses boards whose colours are `#rgb`, although project files accept them
- `app/js/projectFormat.js:42` accepts `#rgb` and `#rrggbb` for tile, start and player colours (and `tests/projectFormat.test.js:423` asserts `#FfF` loads). `app/js/shareLink.js:37` accepts only `#rrggbb`, and `unpack` checks the colour list (`:150`), start colours (`:196`) and player colours (`:215`) with it. `pack` copies the colour as is, lower-cased (`:56,79,99`).
- Repro (`re5/rt.js`): a valid project with one tile `#fff` loads in `ProjectFormat.parse`; `ShareLink.pack` then `unpack` throws "The link has invalid colours." The same happens with a player colour `#f00`. The share dialog (`shareLink.js:337-367`) shows such a link without warning.
- Reach: only files that were hand-edited or written by another tool (the app's own palettes and pickers write `#rrggbb`; `themeManager.js:47-48` expands short hex).
- Fix: normalise short hex when packing (or accept `#rgb` in `unpack` and expand it); add a round-trip test `parse -> pack -> unpack -> parse` on a project with short colours.

### N5-2 (Low) `autoSaveEnabled: false` in a loaded file switches saving off with no way back
- `fileManager.js:487-490` applies a saved `autoSaveEnabled` boolean; `autoSaveToLocalStorage` (`:200`) and `setupAutoSave` (`:167`) then do nothing. The only setter is `AppState.setAutoSaveEnabled` (`state.js:275`), called only there. The checkbox was removed from the page (no id or markup in `app/index.html`; orphan CSS at `styles.css:458-476`). The format still requires the key (`projectFormat.js:413`) and permits `false`.
- Effect: a file from an older build that had the toggle, or a hand-edited one, opens as a project that is never saved to the library and the user is not told. A project opened from the library keeps its stored `false` forever.
- Fix: ignore the key on load (always write `true`), or restore the toggle; drop the CSS either way. Removing the key from the format needs a version bump (project policy).

### N5-3 (Low) The Share dialog creates links the same app refuses to open
- `ShareLink.openDialog` (`shareLink.js:337-367`) never checks the tile count. `openFromHash` refuses more than `MAX_TILES = 20000` tiles (`:424`) and more than 160,000 estimated (`:419`). The board form caps at 50 layers (`ui.js:158`), but project files validate up to radius 100 and width/height 201 (`projectFormat.js:287-296`), e.g. a hexagon board of radius 100 has 30,301 tiles.
- Reach: boards imported from a file (by reading the code; not reproduced in a browser).
- Fix: refuse or warn in `openDialog` when `state.polygons.length > MAX_TILES`.

### N5-4 (Low) TILE_GENERATION_EXPLANATION.md went stale again
- `docs/TILE_GENERATION_EXPLANATION.md:64` says the circle counts are "6, 24 and 60 for radius 1, 2 and 3". With the spike removal of #113 (`geometry/triangle.js:272-290`) the generator gives 6, 24, 54, 96, 180 (point centre, both orientations; measured with `loadApp` + `Geometry.generateGrid`). Around a tile it gives 1, 13, 37, 82, 136.
- `:19,:50-54` state `6 * radius^2` for hexagon boards without saying it holds only for `center: 'point'`; around a tile the counts are 1, 13, 37, 73 (`layersAroundTriangle`, `triangle.js:169-196`, undocumented). The same sentence is in the code comment `geometry/triangle.js:222` ("exactly 6 * radius^2 tiles").
- `:26,:29` describe `buildLatticeTriangles(canvas, colorMap, { span, accepts, rotate, idPrefix })`; the code also takes `origin` and calls `accepts(x, y, triangle)` (`triangle.js:112-134`). `withoutSpikes` is not mentioned at all.

### N5-5 (Low) README drift (mismatches, README on the left, code on the right)
- `README.md:113` "images/ (logo and tile-shape illustrations)" vs `app/images/` = `favicon.ico` + the logo only.
- `README.md:153` lists "square" among fixed board shapes vs `BOARD_SHAPES = ['hexagon','rectangle','triangle','circle']` (`dev/geometry-checks.js:11`) and the v5 merge of square into rectangle.
- `README.md:68-123` tree omits `app/js/boardPicker.js`, `focusUtils.js`, `panels.js`, `dev/build-showcases.js` (named in SPECIFICATION.md:177), `scripts/preview-runtime.js`, `.github/FUNDING.yml`, `docs/PLAYTEST.md`/`PLAYTEST_DEVICES.md`/`PLAYTEST_IDEAS.md`/`BOARD_TOPOLOGIES.md`/`AUDIT.md`/`notes.md`/`board-topologies/`.
- `README.md:134` serves with a bare `python -m http.server` (all interfaces) while `:158` and `DEPLOYMENT.md:37` bind to 127.0.0.1.
- `README.md:41` "Pick swatch ... or Tab / Shift+Tab to cycle": Tab only cycles while the canvas has focus (`shortcuts.js:249-251`, `when: 'focus-neutral'`).
- `docs/SPECIFICATION.md:76` lists the checks the validator makes but leaves out `center`, `start` colour, players and dice (they are described in later sections); `docs/SPECIFICATION.md:230` says squares around a tile add "a square, 2n - 1 across" while the hexagon board of square tiles is clipped by the outline (measured: 1, 7, 19, 37 tiles for layers 1-4, not 1, 9, 25, 49; the text at `:232` does say "clipped").

### N5-6 (Low) Behaviour with no test: mutation survivors
See section 3. The ones with the most reach: `restoreState` does not have a test for resetting the view (`fileManager.js:494`), resetting history (`:501`, so undo cannot cross into the previous project) or telling a running playtest (`:507`); `hasUserWork` is not tested with players only (`:126`); `ProjectFormat.parse` is not tested for leaving a current-version input untouched although SPECIFICATION.md:79 promises it; `uniqueHex` clash avoidance (`themeManager.js:54`) and the country-outline failure of a share link (`shareLink.js:399`) have no test.

### N5-7 (Info) Dead code and exports that nothing uses on current main
Evidence from `re5/unused-api.js` (every module's returned API against all other app, test, dev and page files) confirmed with `grep -rnw`:
- No reference anywhere: `Config.AUTO_SAVE_KEY` (`config.js:36,296`, also stale: the key `protogames_autosave` is now only the legacy name), `BoardPicker.selectable` (`boardPicker.js:154`, 2 references = definition and export), `Utils.formatTimestamp`, `Shortcuts.overridePlatform` (`shortcuts.js:403,428`).
- Tests only: `Play.piecesOn`, `Play.SEAT_ROTATION`, `ToolOps.planLine`, `Geometry.findPolygonAtPoint`, `ViewMath.toScreen` (only `tests/view.test.js`), `Pieces.shade`, `Pieces.SIZE_FACTOR`.
- Exported but used only inside their own file (API wider than needed): `Dice.secureRandom32`, `Play.occupiedTiles`, `Players.nextSeat`, `Playtest.resetGame`, `Playtest.syncGame`, `PlaytestTray.sendFromTray`, `PlaytestTray.rollDie`, `Exporter.PNG_DEFAULTS`, `Exporter.SVG_DEFAULTS`, `Print.PAPERS`, `Renderer.drawPolygon`, `FocusUtils.wrapTarget` (tests only), `Interactions.handleUndo/handleRedo/setEraserSize/applyFill/finishLine/cancelLine`, `ViewControls.actualSize/toggleMinimap/zoomPercent`, `FileManager.showMessage`, `CountryBoard.MAX_ACROSS`.
- `pointingUp` metadata (see 1.2). `ProjectFormat.ORIENTATIONS` accepts `orthogonal` and `diagonal` (`projectFormat.js:27`) which no UI can create (commented out at `app/index.html:110-111`).
- Stray JSDoc: the comment above `outlinesFor` (`shareLink.js:394`) describes `openFromHash`.
- Not found: unused script tags (all 41 modules are loaded by `app/index.html` and nothing loads a missing file), unused images or data files, unused fixtures (`tests/fixtures/*` all referenced), unused ids (`ids.js`: only aria-labelledby targets), duplicate ids, unknown `data-shortcut` ids. Unused CSS: only the block listed in 1.2. No module-level function is defined and never called.

### N5-8 (Info) Duplicated helpers and limits (updated for the new modules)
- Limits defined in three places with no test that ties them together: `MAX_PLAYERS`, `MAX_PIECES`, `SEATS`, `PIECE_KINDS` in `config.js:188-209`, `projectFormat.js:34-37` and `shareLink.js:25-27`; dice `MIN_SIDES`/`MAX_SIDES` in `dice.js:13-14` and `projectFormat.js:39-40`; board caps 100/201/120 in `projectFormat.js:29-30`, `shareLink.js:29-33`, `countryBoard.js:26-27`, `ui.js:157-158`; three different `HEX_COLOR` rules (`projectFormat.js:42`, `shareLink.js:37`, `themeManager.js:47`), which causes N5-1.
- Colour helpers: `pieces.js:97-109` (`parseHex`, `shade`) duplicates `TextureUtils.rgb`/`shade` (differs: `#rgb` support, `rgb()` not `rgba()`); `themeManager.js:56` has another hex parse; `same(a, b)` colour comparison in `players.js:10` and `play.js:20`.
- Clone helpers: `Utils.clone` (`utils.js:53`), `players.js:12`, `projectFormat.js:57`, `themeManager.js:200`.
- Object placement: `exporter.js:93-101` (`objectBox`) re-derives the geometry of `Objects.drawOnPolygon` (`objects.js:569-578`) and a third copy of the bounds loop sits in the texture-feature code (`exporter.js:157-161`, size factor 0.95 vs 0.85); the comment admits they must be kept in step by hand.
- `$ = (id) => document.getElementById(id)` is declared in 10 modules (`countryBoard`, `countryRegions`, `exportDialog`, `loadDialog`, `playersPanel`, `playtest`, `playtestTray`, `shareLink`, `themeEditor`, `toolbar`; the id test at `indexHtml.test.js:99` depends on the exact text).
- Dialog open/close/backdrop/Escape code is written separately in `exportDialog.js`, `loadDialog.js`, `shareLink.js`, `themeEditor.js`, `shortcuts.js` (`pointerdown` on the backdrop at `exportDialog.js:359`, `loadDialog.js:65`, `shareLink.js:455`, `shortcuts.js:384`).
- Size and complexity (crude counts in `re5/fn-size.js`): largest function `exporter.js:111 buildSvg` 102 lines; next `toolbar.js:18 init` 97, `print.js:509 drawPreview` 93, `geometry/hex.js:16 buildHexGrid` 87, `renderer.js:78 paint` 85 lines. Largest files: `textures.js` 974 (a table of generators), `interactions.js` 696, `print.js` 604, `objects.js` 590, `fileManager.js` 536. `fileManager.js` does persistence, project lifecycle, three dialog builders and `refitToCanvas`; `interactions.js` mixes tools, history, board generation and pointer handling. Nothing is unmanageable; no function over about 100 lines.

### N5-9 (Info) Monkey-patching and load-order fragility
- Patches applied at load: `Geometry.generateGrid` by `infinite.js:233` and `countryBoard.js:319` (the second wraps the first); `AppState.setPolygons/setView/resetView/restoreSnapshot` and `ViewMath.clampToBounds` by `infinite.js:253-290`; `Config.ZOOM_MIN` is reassigned by `infinite.js:131`; `UI.getBoardConfig/updateBoardControls` by `countryBoard.js:394,407` and `countryRegions.js:152,158`; `Renderer.paint/createExportCanvas` by `countryRegions.js:104,116`.
- Internal calls bypass the patches (e.g. `Renderer.renderBoard` calls the local `paint`, so on-screen borders are drawn through `Renderer.onRender` instead, `countryRegions.js:94-100`, and only print pages go through the patched `Renderer.paint`). It works because nothing caches a reference at load time (grep for `const { ... } = Geometry|Renderer|UI|ViewMath|AppState` finds only `AppState.getState()` destructuring).
- Experiment (`re5/load-order.js`, all 41 scripts of `app/index.html` in a `vm` context with DOM stubs): baseline loads with no error. Moving any module to the very first or very last position raises a new load-time error in 22 of 82 cases and swapping neighbours in 4 of 40 (e.g. `textureUtils` after `textures`, `helpers` after `hex`, `neighbors` after `geometry`, `countryBoard` after `countryRegions`); every one is a loud `ReferenceError`/TypeError, none is silent. Putting `infinite.js`, `countryBoard.js` or `countryRegions.js` early also fails loudly. Adjacent swaps among `infinite.js`, `boardPicker.js` and `countryBoard.js` raise nothing, and each `generateGrid` wrapper only handles its own board shape and delegates the rest, so their relative order is not significant (the non-adjacent swap was not run). Order is documented only by the script list itself (the index test checks `defer` and count, not order).
- Risk: a future patch that replaces a function another module captured earlier (or `Renderer.renderBoard` calling `paint` by a captured name) would be silent. No such case exists today.

### N5-10 (Info) Modules with no or thin tests
Modules no test file loads (by `grep` of file names and module names in `tests/`): `exportDialog.js` (395 lines), `loadDialog.js` (75), `playersPanel.js` (167), `playtest.js` (164), `playtestDrag.js` (315), `playtestTray.js` (252), `toolbar.js` (393), `viewControls.js` (479), `dev/build-showcases.js` (output checked indirectly: it regenerates all four board-game showcases byte-identical to the committed files, apart from CRLF on this Windows checkout). PLAYTEST.md:77 says the trays and drag handling "are checked by hand". Thin (one or two test blocks): `objects.js` 2, `themeManager.js` 2, `themeEditor.js` 2, `themeManagerImport` 3, `texturesScale` 4, `nordic` 5, `panels` 5, `textures` 6, `main` 7. Test blocks per file (regex count of `test(`; the runner reports 545 because of loops and subtests): see `re5/test-quality.out`.

### N5-11 (Info) Test environment notes
- `tests/buildSite.test.js` needs a real git checkout with history (`execFileSync('git', ['rev-parse', 'HEAD'])`, `:174`); run from a `git archive` or ZIP copy it fails with "fatal: not a git repository" (status 128). It also dominates the run time (see 3.2). It sets its own git identity (`:228`), so a missing global identity is fine.
- Wall clock in a test: `tests/infinite.test.js:157-159` asserts `Date.now() - started < 2000` for the export of far-apart tiles. It is the H5 regression guard and the bound is generous (the old code never finished), but it is the only timing-dependent assertion.
- Waits: `shareLinkOpen.test.js:55-59` polls in 10 ms steps up to 5 s instead of a fixed delay (good); `themeEditor.test.js:44` (5 ms) and `restoreRefit.test.js:135` (0 ms) are only macrotask yields after promises.
- Weak-assert scan (`re5/test-quality.js`): no test without assertions; the "no assertion" hits were helpers (`throwsFormatError`, `near`). Tests that only assert "does not throw" (`projectFormat.test.js:423,433,487,631,644,676,682,744`) sit next to rejecting counterparts, so they pin the accepted edge. Source-text tests (HTML/CSS/`config.js` read as text) exist in `boardPicker`, `panels`, `landing`, `indexHtml` and `buildSite` tests; they are intentional structure guards and will break on markup renames.

### N5-12 (Info) Documents
- `docs/AUDIT.md` is a snapshot at `cdf317e` with no status marker; 41 of its items are now fixed, and README does not link it.
- `docs/notes.md` is four bare URLs with no title.
- External links in README/docs: 57 checked with `curl`; 52 answer 200 (including the two Commons URLs with parentheses). Not reachable from here: the Terra Mystica rulebook PDF (no answer), the Agricola rulebook PDF (403) and naturalearthdata.com (406), all looking like bot blocking. Relative links, anchors and backticked repo paths all resolve (`re5/check-links.js`; the only hit is a code snippet in AUDIT.md).

### N5-13 (Info) Four dialogs still keep their own document-level Escape handler
`exportDialog.js:360`, `loadDialog.js:66`, `themeEditor.js:43` and `shareLink.js:457` close their dialog on Escape without checking `event.defaultPrevented` or whether a modal made by `presentModal` sits above them. Playtest and the toolbar do check (`FocusUtils.layerOpen`). Whether two of these can be open at once was not tested in a browser.

---

## 3. Test health

### 3.1 Flakes, environment
- 3 full runs (Node 24.19, Windows 11): 545/545 each, 12.0 s, 14.1 s, 14.8 s.
- Variants, all 545/545: `TZ=America/Los_Angeles`, `TZ=Asia/Tokyo`, `TZ=Pacific/Kiritimati` (UTC+14), `LANG=cs_CZ.UTF-8 LC_ALL=cs_CZ.UTF-8` (note: on Windows these variables have little effect on Node's ICU locale), `GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null`.
- Not run: Node 22 (CI version; only Node 24 is installed), Linux (case-sensitive file system).
- The suite leaves the working tree clean (`git status` empty after runs).

### 3.2 Duration per file (single `node --test <file>`, includes about 190 ms start-up, measured while other runs were going)
`buildSite` 14.8 s; `tools` 1.9 s; `geometry` 1.2 s; `countryBoard` 0.65 s; `boardPicker` 0.61 s; `shareLinkOpen` 0.53 s; `renderer` 0.49 s; `infinite` 0.46 s; `projectFormat` 0.35 s; `countryRegions` 0.34 s; everything else 0.19 to 0.30 s. Full list: `re5/perfile.txt`.

### 3.3 Mutation spot check
Method: the clone's source file is changed in one place, the suite is run (all test files except `buildSite.test.js`, which only exercises `scripts/`), the file is restored. 105 mutations: **86 killed, 19 survived.** Scripts and lists: `re5/mutate.js`, `list2.js`, `list3.js`; raw output `re5/mutate.out`, `mutate2.out`.

Killed (examples of the requested ones): bounded inflate (M01), share-link envelope and size checks (M02-M08), every project-format validator cap and check (V01-V15, V17, V18), `__proto__` object ids (H01), `escapeAttribute` identity and its use in the SVG exporter (H02, P115), `fromId` canonical check (H03), the infinite export cap (H05), spike removal on/off (P113b, C01), regenerate-on-open call and its three guards (P114-P114d), record-only-if-changed (S01), right-click (S02), quota warning once (S03), theme history recolour and dirty/autosave (S12, S13), theme hex cleaning (S14), texture seam fix (S16), dismissModals (M06, C08), SVG textures/markers/borders (C02-C04), Tab trap and typing-target rules (S22, S23, B17-B19).

Survivors:

| ID | Mutation | Where | Genuine gap? | Note |
|---|---|---|---|---|
| V16 | "migration did not set version" guard removed | `projectFormat.js:267` | yes | developer-error path of SPECIFICATION.md:77 (`bad-migration`) |
| H04 | `Number.isSafeInteger` check in `fromId` removed | `infinite.js:66` | yes | with it a 30-digit coordinate is refused (verified); without it the id would be accepted and silently renamed (`1e+30`) |
| P113 | spike removal runs one pass instead of repeating | `geometry/triangle.js:284` | yes | the "repeat until every tile touches two" rule is untested (switching removal off or changing the threshold is killed) |
| S04 | `window.localStorage` read outside `try` | `fileManager.js:207-208` | yes | blocked storage: the M5 fix has no test |
| S05 | autosave not skipped before the project has an id | `fileManager.js:203` | near-equivalent | `ProjectLibrary.write` then throws and the error is logged |
| S11 | blob URL revoked immediately after `click()` | `utils.js:75` | yes | needs fake timers |
| S19 | `applyContextDefaults` not re-applied after resize | `renderer.js:48-49` | yes | the original Low finding was fixed without a test |
| S25 | `linePath` bridge fallback removed | `geometry/neighbors.js:180` | yes | no disconnected-board test (country islands) |
| B04 | autosave ignores `isDirty` | `fileManager.js:204` | yes | timer would rewrite unchanged projects and bump the "edited" time |
| B05 | `Playtest.designChanged()` not called on restore | `fileManager.js:507` | yes | tests have no `Playtest` global |
| B06 | view not reset on restore | `fileManager.js:494` | yes | |
| B07 | history not reset on restore | `fileManager.js:501` | yes | undo could step back across projects |
| B08 | `hasUserWork` ignores players | `fileManager.js:126` | yes | "Generate Board" would not ask when only players exist |
| B09 | file input value not cleared | `fileManager.js:416` | yes (trivial) | the same file cannot be opened twice |
| B26 | country outlines failure of a link ignored | `shareLink.js:399` | yes | |
| B28 | `uniqueHex` collision loop removed | `themeManager.js:54` | yes | duplicate tile colours between themes |
| B32 | 9th player allowed | `players.js:35` | no (equivalent) | there are only 8 player colours, so the colour check stops it first |
| C05 | no wait for country outlines guard | `fileManager.js:459` | near-equivalent | only a `typeof` guard for a missing module |
| C06 | `migrate` does not clone a current-version input | `projectFormat.js:259` | yes | `fillBounds` then mutates the caller's object; SPECIFICATION.md:79 says parsing never mutates its input |

So 16 real gaps, most of them in `restoreState` and in the ""fixed without a test" items of PR #76.

### 3.4 Where tests exist, by area
Pure logic (geometry, format, share links, print planning, view maths, shortcuts, play/players/dice/pieces) is thick: 20 files with 10 to 61 test blocks. UI wiring is tested through fakes for `FileManager`, `Interactions`, `Panels`, `BoardPicker`, `ThemeEditor`, `ThemeManager`. No test: the eight modules listed in N5-10.

---

## 4. Checked and fine
- Suite is stable across three runs and five time zone / locale / git-identity variants.
- Format and limit documentation: `SPECIFICATION.md` version 7, the version table, all seven error codes, validator ranges (width/height 201, radius/size 100, 3 to 64 vertices, object id 200, players 8, pieces 500, dice 20 and 2 to 1000), share link keys `v f n c p k t ob o i pl sc s`, link versions 1 to 4, `MAX_INFLATED_BYTES` 2 MB, 2,000 and 8,000 character link warnings, 30 s autosave, 50 undo steps, key `protogames_project:<id>`, id rule 6 to 64 characters: all match the code.
- README key table matches `BINDINGS` (`shortcuts.js:20-58`); zoom 25% to 24x, actual size 64 px, brush size 1 to 7, paper sizes A4/Letter/A3 and sheets to A0, dice d3 to d20 match `config.js` / `print.js`.
- Layer counts in SPECIFICATION.md:228-229 for hexagon and triangle tiles (1, 6, 12, 18 / 3, 9, 15, 21 / 1, 12, 24, 36 / 6, 18, 30, 42) match generated boards.
- DEPLOYMENT.md: published paths (`APP_PATHS` in `scripts/build-site.js:22`), 20 previews (`MAX_PREVIEWS`), concurrency on the job (`pages.yml:30-32`), tests on every run, the build command runs and produces `app/`, `app/data`, `app/showcases`, `preview/pr-66/...` with the runtime script. `https://protogames.eu/` answers 200 from GitHub Pages and `https://bremondr.github.io/protogames/` answers 301.
- `app/data/README.md` SHA-256 `04342cdc...` equals the committed blob (the Windows working copy has CRLF, so hash the git blob).
- Showcases: all five files parse in `tests/showcases.test.js`; the four generated ones are reproduced byte for byte by `node dev/build-showcases.js`.
- Every script of `app/index.html` exists and all 41 modules are loaded; no id missing; no duplicate ids; every `data-shortcut` names a binding.
- `npm test` (the only documented command) works; `dev/geometry-gallery.html` loads the same geometry script list as the tests.

## 5. Not covered
- No browser run: Escape interplay of the four dialogs (N5-13), focus behaviour, share dialog for over-sized boards (N5-3) and the `autoSaveEnabled:false` consequence (N5-2) are from reading the code.
- Node 22 and Linux were not run.
- The first audit's H and M items (other agents' areas) were not re-checked except where a mutation or bullet touched them.
- The surveys in `docs/BOARD_TOPOLOGIES.md` (facts about other games, 25 SVGs) were checked for links and files only, not for content; `PLAYTEST_DEVICES.md` is a proposal and only its references to code (`share link helpers`, CSP `connect-src`, PLAYTEST_IDEAS section 10) were checked.
- Real performance of `Renderer.paint` was not measured.
