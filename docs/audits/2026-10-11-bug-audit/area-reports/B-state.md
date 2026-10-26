# Audit B: state, persistence and file formats (main @ 39ead4a)

Scripts and harness: `<scratch>/state/` (all run with `node <file>`; `env.js` is the shared harness that loads the real modules into a vm with fakes).
No repo file was touched. No High findings; 4 Medium, 5 Low, 4 Info.

## Findings

### B1 (Medium) Share link of the largest hexagon/circle board the UI can make is refused on open
- Location: `js/shareLink.js:79-85` (`boardConfigFrom`, `MAX_DIMENSION = 100`) vs `js/ui.js:150-168` (`MAX_BOARD_RADIUS = 50`, hexagon/circle set `width = height = radius*2+1`).
- What happens: with Board shape hexagon or circle and Radius 50 (the maximum the input allows) the config is `width: 101`. `boardConfigFrom` rejects any `width/height/radius/size` > 100, so the recipient gets "The board width in the link is out of range." The sender's Share dialog gives no hint (`openDialog` builds the link without checking the limits that `openFromHash` applies). `ProjectFormat` allows up to 201 for width/height, so the project file of the same board opens fine; only the link breaks. The UI comment at `ui.js:149` claims the UI limits were chosen to fit share links; the hexagon/circle case was missed.
- Repro: `node ids.js` (second half). Output: `hexagon/hexagon r=50 ... w=101 h=101: 7651 tiles -> REJECTED: ... The board width in the link is out of range.`; same for hexagon/circle, square/circle, triangle/circle, triangle/hexagon with radius 50. All 100x100 rectangle/square/triangle boards open fine.
- Fix: in `boardConfigFrom` apply `MAX_DIMENSION` to `radius`/`size` only and `2 * MAX_DIMENSION + 1` (as `ProjectFormat.MAX_BOARD_SPAN`) to `width`/`height`; and/or run the same checks at link creation so the dialog can warn. A test: pack+open a radius-50 hexagon.
- Related (same cause, no UI repro under 20000 tiles): an infinite board with more than `MAX_TILES` (20000) painted tiles produces a link that `openFromHash` refuses ("too large").

### B2 (Medium) Infinite board: Undo does not undo tiles that were not loaded when the previous history step was taken
- Location: `js/state.js:288-322` (`recordHistory`, `restoreSnapshot`) and the hook `js/infinite.js:276-284`.
- What happens: a snapshot only lists the tiles loaded at that moment. After panning, `Infinite.sync` loads new chunk tiles that are absent from older snapshots. `restoreSnapshot` leaves polygons that are not in the snapshot untouched, and the infinite hook only adds missing painted tiles, it never blanks tiles that the snapshot does not mention. So painting in an area first loaded after the previous step and pressing Undo leaves the tile painted, while the history index moves back (the next Redo/Undo are then inconsistent with the screen). Resize/playtest regeneration (`generateBoard` with `preserveHistory`) also carries the stale colour forward.
- Repro: `node infundo.js`:
  ```
  initial tiles loaded 1786 history 1
  after pan, tiles loaded 2632
  painted inf_s_116_77 history 2 index 1
  after UNDO, tile colour is #1976d2 (expected #ffffff)  index 0
  ```
  In the app: infinite board, pan one screen away from the origin, paint one tile, Ctrl+Z: nothing visible happens.
- Fix: in the infinite `restoreSnapshot` hook (or in `AppState.restoreSnapshot` generally) treat every loaded polygon that is absent from the snapshot as blank: `color = Config.DEFAULT_TILE_COLOR; delete object`. (Finite boards always have every tile in every snapshot, so the rule is safe there.)

### B3 (Medium) Undo and Redo are never autosaved
- Location: `js/interactions.js:204-216` (`handleUndo`/`handleRedo` call only `restoreSnapshot` and `renderBoard`; no `markDirty`, no `autoSaveToLocalStorage`). The 30 s timer (`fileManager.js:87`) saves only when `isDirty`, and undo does not set it.
- What happens: paint, undo, close/reload the tab (or crash): the restored autosave still contains the stroke the user took back. The undone state is only persisted by the next other change.
- Repro: `node undoSave.js` (real `Interactions.undo`, real autosave):
  ```
  painted tiles in board: 1  in autosave: 1
  after Undo  board: 0  autosave: 1  isDirty: false
  after the 30 s timer fires, autosave: 1
  ```
- Fix: after a successful undo/redo call `AppState.markDirty(); FileManager.autoSaveToLocalStorage(true);` (same as `handleClearBoard`).

### B4 (Medium) "Discard" on the autosave prompt leaves an empty canvas (no board is generated)
- Location: `js/main.js:60-64` (`startBoard` returns right after `promptAutosaveRestore`) and `js/fileManager.js:227-240` (`handleChoice('discard')` removes the slot and notifies, nothing else). Same behaviour on `cdf317e`, so not new in #76 but never reported.
- What happens: while the prompt is up the canvas is empty (no polygons), and after Discard it stays empty: no tiles, Save says "Generate a board before saving", Share says "Generate a board before sharing". The user has to press Generate Board (or resize the window, which regenerates via `debouncedResize`).
- Repro: `node discard.js` (real `Main.startBoard` + real `FileManager.promptAutosaveRestore`, clicking Discard):
  ```
  prompt shown, tiles on canvas: 0 generateBoard calls: 0
  after DISCARD: tiles on canvas: 0 generateBoard calls: 0 removed slots: protogames_autosave:test notes: Autosave discarded
  ```
- Fix: in the discard branch call `Interactions.generateBoard(AppState.getState().boardConfig, { skipDirtyFlag: true })` (or generate the default board before showing the prompt and let Load replace it, which also makes the page look alive behind the dialog).

### B5 (Low/Medium) A pure white tile colour in an imported or edited custom theme silently becomes black
- Location: `js/themeManager.js:52-61` (`uniqueHex`): collisions are resolved with `(n + 1) & 0xffffff`; `#ffffff` is always in `usedHexes()` (it is the blank tile colour), so white always collides and `0xffffff + 1` wraps to `0x000000`.
- What happens: any theme tile whose hex is `#ffffff` (a "Snow" or "Paper" tile; both import and the in-app editor) is stored as `#000000`; the editor shows white while editing and black after saving, every time. Other collisions move by one unit (invisible).
- Repro: `node theme.js`:
  ```
  imported -> stored hexes: Snow=#000000, Ink=#000001, Forest dup=#2d5017
  edited with white -> Snow=#000000
  ```
- Fix: bump downwards when `n === 0xffffff` (e.g. `#fffffe`), or decrement/increment in the direction that stays in range; add a test with `#ffffff`.

### B6 (Low) Opening a file with `autoSaveEnabled: false` switches autosave off for the whole session, with no UI to switch it back on
- Location: `js/fileManager.js:417-420` (restoreState applies the flag) and `:115` (`autoSaveToLocalStorage` returns early); the checkbox is commented out in `index.html`.
- What happens: files from early builds that had the toggle (the validator and v0 migration explicitly allow `false`) disable autosave: no autosave at all after the load, the own slot keeps stale content (a reload then offers old work), and the next autosave payload still carries `false`. Fixture-free but legit input.
- Repro: `node autooff.js` -> `autoSaveEnabled after opening the file: false | autosave slot written: false`.
- Fix: ignore the field on load (always keep autosave on, the UI has no off switch), or keep it but not persist it.

### B7 (Low) Autosave stores the full tile geometry, so the biggest boards the UI allows cannot be autosaved; and every stroke costs ~110 ms
- Location: `js/fileManager.js:100-111` (`serializeAppState` writes every polygon with all vertices as full-precision floats).
- What happens: payload size in characters (Chrome's localStorage quota is about 5M chars per origin, shared with orphan slots and themes). `node size.js`: hexagon tiles 100x100 = 5.12M chars; triangle tiles in a circle radius 50 = 7.32M chars; triangle 100x100 = 3.54M. The first two exceed the quota on their own: autosave fails permanently (one "storage is full" notice, then silence) although the board is within UI limits. Clone + stringify of 18k tiles takes ~110 ms on every stroke end (`node perf.js`), before the write even fails.
- Fix: autosave only what is needed to rebuild: config plus per-tile `id, color, object` for painted tiles (geometry is regenerated, as for infinite boards and share links); this also removes the #19 problem for autosave. If the format must stay, round vertex coordinates to 2 decimals (roughly halves the size).

### B8 (Low) Without Web Locks, abandoned autosave slots are never reclaimed or deleted
- Location: `js/autosaveSlots.js:162-166` (`liveIds` = every other slot when `navigator.locks` is missing) together with `choose`, which never removes live ids.
- What happens: in an insecure context (e.g. the app served over `http://192.168.x.x`, or any browser/context without `navigator.locks`) every tab session leaves a slot that is treated as "live" forever: never offered, never expired. They accumulate until the quota is hit, and slots up to several MB each (see B7) make that quick.
- Repro: `node slots.js` last line: `no-locks: 12 month-old slots from closed tabs, offered: null  slots still in storage: 14`. (With locks the same script correctly offers/deletes: new tab not offered a live tab's slot, duplicated tab gets a new id, closed tab's slot is adopted, reload gets its own slot.)
- Fix: without locks fall back to age-based cleanup (slot older than a few minutes without a newer own write is stale), or at least apply `MAX_AGE_MS`/`MAX_ORPHANS` to the unprovable ones. Not verified in a real browser whether `file://` (README says "open index.html") exposes `navigator.locks`; the browser tool was disabled.

### B9 (Low) Start-up waits, one image at a time, for the network images of stored custom themes
- Location: `js/themeManager.js:70` and `:96` (`for ... await applyTileTheme`, each tile `await loadImage(t.image)`), awaited by `main.js:44-47` before `claim()` and `startBoard()`.
- What happens: the documented theme format allows `https://` image URLs (stored as such in localStorage). With a slow or hanging host the board, the autosave prompt and share-link opening wait for each image in turn (no timeout; `img.onload/onerror` can take as long as the browser's connection timeout). Offline it fails fast. Not reproduced in a browser (argued from code).
- Fix: load images in parallel with a timeout (`Promise.race` 3-5 s) or start the board without waiting for textures and re-render when they arrive (`Textures.registerImage` + `Renderer.renderBoard`).

### Info items
- B10 `AppState.discardLastStep` (`state.js:357`): when history is at `HISTORY_LIMIT` the fill that is being taken back had already pushed the oldest step out with `shift()`, so cancelling a fill via pinch permanently loses one old undo step. Harmless in practice.
- B11 Share link opened at start-up (`main.js:51-55`) goes through `restoreState`, which force-saves into this tab's own slot, replacing an autosave that `loadAutoSave` had just found for the same tab (only reachable on same-tab navigation / reload with a link, since new tabs get new ids). No prompt unlike `onHashChange`. Orphan slots are left untouched.
- B12 A window resize or playtest/full-screen toggle regenerates the finite board (`main.js:8-15`) which resets pan/zoom (`setPolygons` -> identity view). Intended for re-fit; on phones the URL-bar collapse fires `resize` and will also reset zoom (not verified on a device). `generateBoard(... skipDirtyFlag)` also clears `isDirty` even if an earlier forced save had failed (quota), ending the 30 s retry.
- B13 Infinite share links/files do not check that tile ids belong to the configured grid family: a link `i` mixing `inf_s_*` and `inf_hp_*` ids opens as one overlapping board (`isActive` only looks at the first id). Cosmetic, hostile only.

## Issue #19 verdict

**Still reproduces on main for "Load Project" (file) and for autosave restore. Does NOT reproduce for showcases or share links.** Repro: `node t19.js` (board radius 8, hexagon, saved on a 1920x1000 canvas and loaded on 800x600):

```
saved on canvas A {"width":1920,"height":1000} x 480..1440  y 48..896
FILE      loaded on canvas B {"width":800,"height":600} x 480..1440  y 48..896   <- clipped: x runs to 1440 on an 800 px canvas
AUTOSAVE  loaded on canvas B x 480..1440  y 48..896                              <- same
SHOWCASE  loaded on canvas B x 146..654  y 48..496  color kept: #1976d2           <- fitted
SHARELINK loaded on canvas B opened=true x 146..654  y 48..496 color kept #1976d2 <- fitted
FILE, after the next window resize event  x 146..654  y 48..496                  <- fixed only by a resize
```
- File: `openProject` -> `restoreState` (`fileManager.js:402-437`) clones the saved polygons and calls `AppState.setPolygons` with the saved pixel coordinates; there is no `generateGrid`/`fitPolygonsToCanvas` call and the view is the identity. Only `Main.debouncedResize` (`main.js:8-15`, window `resize`, also fired 30 ms after toggling Playtest or full screen) regenerates and fits. Infinite boards are not affected (world coordinates; `resetView` frames the content).
- Autosave: `promptAutosaveRestore` -> `restoreState`: same code path, so a tab restored after a window resize/on another monitor shows a clipped board. Also affects own-slot restore after resizing the window between sessions.
- Showcase: `loadShowcase` calls `restoreState` then `Interactions.generateBoard(config, { preserveColors, preserveHistory, skipDirtyFlag })`, so it re-fits (the issue's own observation).
- Share link: `openFromHash` builds fresh tiles with `Geometry.generateGrid(config, currentCanvas)` and only transplants colours/objects by tile order, so it always fits the recipient canvas.
- Fix check for the issue's suggestion: regenerating on load is safe for current files. `node ids.js` (first half) generated 280 board configs (every grid/shape/orientation, sizes 1-8) on four canvas sizes (1920x1000, 800x600, 360x500, 3000x400): tile ids and tile order are identical on every canvas, no duplicates, none empty. `node fixtures.js`: all four fixtures and the showcase keep 100% of their painted tiles after a regenerate and re-open identically through a share link. The caveat in the issue (very old hexagon-with-triangle boards using `triangle_hex_row_col` ids lose their colours when regenerated) is real but already happens today on the first window resize; if the regenerate-on-load fix is applied, those files lose colours immediately instead (consider keeping the saved geometry when none of the saved ids exist in the regenerated board, i.e. fall back to "as saved").
- Suggested implementation: in `restoreState`, after `setPolygons(polygons)` (finite boards only) call `Interactions.generateBoard(AppState.getState().boardConfig, { preserveColors: true, preserveHistory: true, skipDirtyFlag: true })` exactly like `loadShowcase` does, and make sure `restoreState` still ends with `resetHistory(); recordHistory(); clearDirty()` (generateBoard's preserveHistory branch restores `history[historyIndex]`, so call it before the history reset or accept the same result). Note `Interactions` is a late-bound global in `fileManager.js`, which already uses it in `loadShowcase`.

## Checked and fine (counts)
- serialize -> storage -> `ProjectFormat.parse` -> `restoreState` round trips: 120 random boards (all board shapes incl. infinite, both grids/orientations, sizes 1-12, 1-5 history steps, objects, unicode project name): tile colours/objects, board config, project name equal, history length 1, not dirty, undo after restore is a no-op, undo after paint works, regenerate keeps tiles (`rt.js`: 0 problems).
- Share link round trips: 150 random boards (all shapes, infinite with far-away tiles `inf_*_1234567_-7654321`, objects incl. custom `set:item` ids and 200-char ids, project names empty / emoji / CJK / 3000 chars / quotes / NUL / lone surrogate), sender canvas != recipient canvas: all equal by id and colour, config, palette, name (`sharefuzz.js`: 0 problems). All 14 UI-maximum boards generated; 10 open, 4 are B1.
- Bounded inflate, tile cap before build, hostile configs (missing sizes, unknown grid/shape/orientation, radius 80 triangles, infinite in a v1 link): all refused in under 400 ms, nothing thrown out of `openFromHash` (`linkcfg.js`, 12 cases).
- `ProjectFormat`: 6000 mutated copies of the v0/v2 fixtures and the showcase (random junk values, deletions): 786 accepted, 5214 rejected, 0 non-`ProjectFormatError` exceptions, 0 accepted files that make `restoreState` throw or lack bounds, input never mutated (`pffuzz.js`). All 4 fixtures + the showcase parse. Largest accepted configs (201x201 triangles, radius 100) generate in under 0.7 s, adjacency under 0.4 s (`bigcfg.js`), so the new limits do bound the hang risk.
- Stricter validator vs what the app itself writes: colours are always `#rrggbb`/`#RRGGBB` (palettes, picker, theme import via `cleanHex`), no code path writes `object: null`, ids unique over all 280 configs. Only theoretical rejects: object ids > 200 chars (custom item `custom-<theme>:<slug(label)>` from a very long file name) and nothing else found.
- `AutosaveSlots` with fake Web Locks: new tab not offered a live tab's slot, duplicated tab gets a fresh id, closed tab's slot adopted (`own=false`), reload gets own slot (`slots.js`).
- `remapColors`/theme edit: swapping two rows' colours and collision bumping verified by reading (Map lookup applies once per entry, no chaining); existing unit test covers undo after edit.
- State: `recordHistory` truncation/limit, `setBoardConfig` (no inheritance, unknown keys dropped, covered by existing tests), `restoreState` clones before mutating (nothing half-applied on a bad file), hash pattern/base64url edge cases (length%4==1 throws inside the `try`), hashchange `confirmReplace` path.
- Existing tests: not re-run (unchanged); no repo file modified.

## Not covered
- No real browser run (browser tool disabled): Web Locks behaviour on `file://` and in duplicated/restored tabs, real quota limits (B7 sizes are character counts), mobile resize behaviour (B12), real network image latency (B9).
- Two-tab races beyond the fake-locks scenarios above (simultaneous start of two tabs adopting the same orphan: both offer it, harmless duplicate).
- `onHashChange` re-entrancy with two links in quick succession (argued only: both `openFromHash` calls run to completion, the one whose decode finishes last wins; stacked confirm dialogs if work exists). Not reproduced.
- `themeManager` import UI paths with real `FileReader`/`Image` (image loading, `persist()` quota failure reporting), `ThemeEditor`, palettes persisted for deleted custom themes (falls back to the default palette silently by design).
- Exporter/print/render scope belongs to other areas.
