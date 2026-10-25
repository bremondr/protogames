# Re-audit, area 1: state, persistence, project library, menus/dialogs, start-up (main @ 78aa7ef)

Scripts: `scratchpad/re1/` (browser runs: headless Edge over CDP against an in-process static server of `main-now2`, fresh profile per script; node runs with the real modules). Nothing in `main-now2` or any repo was touched. Project format is now v7 (not v6): #103 added `boardConfig.center`.
Counts: BUG_AUDIT ids 23 = 4 FIXED, 15 STILL OPEN, 4 CHANGED. AUDIT.md ids in this area: 14 FIXED, 2 CHANGED. New findings: 0 High, 4 Medium, 5 Low, 4 Info.

## 1. Status of earlier findings

Two things changed the picture: #107 removed the per-tab autosave slots, the Web Locks code (`autosaveSlots.js`) and the "restore autosave?" prompt (every board is now a project `protogames_project:<id>`, opened with `?project=<id>`); and #109 replaced the confirm-before-replace dialogs with "open as a new project" (nothing is asked).

| ID | Status | Evidence | Note |
|---|---|---|---|
| BUG M1 Discard leaves empty canvas | FIXED (gone) | #107. `main.js:41-45` -> `FileManager.startNewProject` (`fileManager.js:111`) generates the board first, then asks for a name. `t_start.js`: every start-up path ends with 91 tiles + "Name your project" | No prompt with a Discard button exists any more |
| BUG M2 / #19 | FIXED by #114 (1c02f67) | `fileManager.js:448-467` `refitToCanvas`, called at `:504`. Browser (`t_m2.js`, `t_m2b.js`): project saved on 1200x844 canvas, reopened on 700x600 / 600x500 / 500x500 (stored project, file via `openProject`): bounds inside canvas; painted 22/22, objects and start markers kept (1/1), players kept, history reset to 1 step, view identity. Same for rectangle/square, circle/triangle, country (async, waits for outlines) and infinite (left as saved, `resetView` frames content, 360/360 painted tiles kept). Share link and showcase already fitted. Autosave restore no longer exists | Review notes: (a) boards whose painted ids are not all found (legacy ids) are left as saved, so #19 itself is still there for them and the next resize wipes their colours (see M15). (b) The stored copy keeps the old pixel geometry until the next save, harmless because every open refits. (c) Cost for the biggest boards: parse 46 ms + restore 180 ms (hex 100x100), fine. (d) `refitToCanvas` generates the grid twice (once to build the id set, once in `generateBoard`); harmless. (e) For a share link and showcase it regenerates again after they already built a fresh grid. No defect found |
| BUG M4 infinite undo | STILL OPEN | `infinite.js:276-286` hook only adds missing painted tiles, `state.js:369-380` ignores polygons absent from the snapshot. `t_m4m5.js`: infinite board, pan 3000 px, paint one tile via real mouse click, `Interactions.undo()`: painted 1 -> 1, `historyIndex` 1 -> 0 | Unchanged |
| BUG M5 undo/redo not autosaved | STILL OPEN | `interactions.js:231-243` no markDirty/save. `t_m4m5.js` (real undo button): board 1 -> 0 tiles, stored project still 1 and `isDirty=false`, still 1 after the 30 s timer. Now matters more: reopening the project from the home page brings the undone stroke back | Unchanged |
| BUG M9 radius-50 share link | CHANGED (narrower) | The UI input counts layers now (`ui.js:175-188`), so hexagon/square tiles at 50 layers give width 99/100 and open. `t_m9.js` over 24 UI-maximum configs: 20 open; refused with "The board width in the link is out of range": triangle tiles on a hexagon or circle board at 50 layers (width 101 tile-centred, 102 point-centred), 4 combinations. Cause unchanged: `shareLink.js:113-116` applies 100 to width/height. Files accept 201 (`projectFormat.js:30`) | Fix: width/height limit `2*MAX+2` |
| BUG M15 legacy triangle ids | CHANGED | `fileManager.js:455`: if some painted saved id is not in the regenerated grid, the board is kept as saved (colours kept, but unfitted: `t_m15.js` maxX 988 on a 600 px canvas, 23 painted kept). The next resize still regenerates and drops every colour (23 -> 0 painted, `t_m15.js`), and the next stroke autosaves the blank board over the stored one | Still a latent data-loss path; no id-remap migration. (Current generator still writes `triangle_hex_*` ids, so only truly old files are hit) |
| BUG M16 remote theme image blocks start-up | STILL OPEN | `main.js:41-43` awaits `ThemeManager.init`, `themeManager.js:138-139` sequential `await loadImage` without timeout. `t_m16.js`: theme with two image URLs on a host that never answers: after 10 s `readyState=interactive`, 0 tiles, no dialog | Worse than before: with `?project=<id>` the project never opens either |
| BUG L2 white theme tile -> black | STILL OPEN | `themeManager.js:52-61`. `t_l2.js`: Snow `#ffffff` stored as `#000000`, Ink `#000000` -> `#000001`, `#fff` -> `#000002` | |
| BUG L3 `autoSaveEnabled:false` file | STILL OPEN, worse | `fileManager.js:198-200` + `:487-490`. `t_l2.js`: after opening such a file the new project is registered but never written (`protogames_project:<id>` absent); reload says "Project not found" | See N1-2 for the data-loss side |
| BUG L4 autosave stores full geometry | STILL OPEN | `fileManager.js:194` (`clonePolygons`, only infinite boards are reduced). `t_l4.js` (Edge, quota about 5.24M chars): hexagon 100x100 5.11M chars (fits alone), 50x50 1.28M, triangle circle 50 layers 7.18M -> `QuotaExceededError`. All projects and themes now share this quota, so four 50x50 hexagon projects fill it | Fix as before: save config + painted tiles only |
| BUG L5 abandoned slots without Web Locks | FIXED (removed) | `autosaveSlots.js` no longer exists (#107); legacy slots are imported once by `ProjectLibrary.importLegacy` | |
| BUG L6 pinch cancels fill | STILL OPEN | `state.js:415-420`, `interactions.js:326-338` unchanged (code) | Not re-run |
| BUG L9 resize/playtest resets view | STILL OPEN | `main.js:8-15`. `t_l9.js`: zoom 2.5 -> `resize` event with identical size -> view `{1,0,0}` | |
| BUG L10 no-op undo steps | STILL OPEN | `t_lows.js`: brush with a swatch whose tile already shows it in other case: history 1 -> 2 (`interactions.js:218-229` compares case-sensitively; fill/line use `ToolOps.norm`). Clear on a blank board: `interactions.js:244-256` still records a step (code; my button selector was wrong, not re-run). `hasUserWork` `fileManager.js:127` still case-sensitive | |
| BUG L12 `1e2` / empty number field | CHANGED | `ui.js:161-166`: `1e2` still reads as 1 but the field now shows 1; an empty field still silently uses the default and stays empty (`t_lows.js`: `{"1e2":[1,"1"],"empty":[11,""],"-5":1,"500":100}`) | |
| BUG L16 two share links stack confirms | CHANGED (moot) | Links open as new projects without confirmation (`shareLink.js:428`, `onHashChange :444`). Two quick links give two projects; no stuck state found (code) | |
| BUG L17 `#rgb` file vs link | STILL OPEN | `t_lows.js`: file with `#abc` parses (colour kept as `#abc`), `ShareLink.unpack` of the same tile: "The link has invalid colours." (`projectFormat.js:42` vs `shareLink.js:37`) | |
| BUG L18 theme editor discards on backdrop/Escape | STILL OPEN | `themeEditor.js:42-43` (code) | |
| BUG L19 huge polygon bounds crash locator | STILL OPEN | `neighbors.js:230-239` unchanged, validator `projectFormat.js:326` only checks finiteness. `l19.js`: 900 tiles + one tile with +-3e6 bounds -> `buildLocator` runs out of memory (node: fatal heap OOM after 37 s) | The old exact `RangeError` depends on where the odd tile sits in the list |
| BUG L20 fractional radius | STILL OPEN | `t_lows.js`: radius 1.9: hexagon 7, square 19, triangle 1 tiles; validator accepts non-integers (`projectFormat.js:291-296`) | |
| BUG Info B11 link replaces same-tab autosave | FIXED (obsolete) | no per-tab autosave; links open as new projects | |
| BUG Info B12 resize resets view / clears dirty | STILL OPEN | same as L9; `interactions.js:662-667` `skipDirtyFlag` still clears `isDirty` | |
| BUG Info B13 infinite link mixing families | STILL OPEN | `shareLink.js:413-416` no family check (code) | |
| AUDIT H2 theme edit bypasses history | FIXED | `state.js:398-409` `remapColors`, `themeManager.js:190-192` | |
| AUDIT H3 share link replaces board unasked | FIXED, differently | opens as new project (`shareLink.js:428`); but see N1-2 for the failed-save case | |
| AUDIT M2 modal removal | FIXED | `shareLink.js:388-392` hides static dialogs | |
| AUDIT M3 failed link leaves empty canvas | FIXED | `t_start.js`: `#b=AAAA` -> notification "Could not open the shared link" and the name prompt on a 91-tile board | |
| AUDIT M4 alert loop on full storage | FIXED | `fileManager.js:216-223` `quotaWarned`; `t_quota.js` shows the notice once | |
| AUDIT M5 `localStorage` read outside try | FIXED | `fileManager.js:206-208`; `t_blocked.js`: start-up with a throwing `localStorage` works | but see N1-5 |
| AUDIT M6 Generate without confirmation | FIXED | `interactions.js:222-226` `confirmReplace` | |
| AUDIT M8 theme hex validation | FIXED | `cleanHex` `themeManager.js:44-50` | |
| AUDIT M13 theme editor closes during save | FIXED | `themeEditor.js:151-153` | |
| AUDIT Low: older app deletes newer autosaves | CHANGED (moot) | slots no longer exist; unreadable legacy slots are still deleted (`projectLibrary.js:154`) | |
| AUDIT Low: `updateBoardConfig` merges | FIXED | `state.js:129-139` `setBoardConfig` | |
| AUDIT Low: file open asks even for blank board | CHANGED | nothing is asked any more (N1-2) | |
| AUDIT Low: empty polygons for infinite | FIXED | `projectFormat.js:419` | |
| AUDIT Low: `revokeObjectURL` too early | FIXED | `utils.js:74-75` | |
| AUDIT Low: link `v` type / v1 infinite | FIXED | `shareLink.js:122-131` `checkEnvelope` | |
| AUDIT Low: `fromId` non-canonical ids | FIXED | `infinite.js:57-67` `CANONICAL_INT` | |

## 2. New findings

### N1-1 (Medium) Share links of circle boards made before #103/#113 no longer open ("Board size mismatch")
- Location: `shareLink.js:153-154` (tile list length must equal the regenerated grid) against `geometry/hex.js` (circle span, #103) and `geometry/triangle.js` (spikes removed, #113). No link version or format bump separates the two generators.
- What happens: a link stores only per-tile colour indices in generated order. The generator output for existing settings changed: hexagon-tile circle boards of radius 16 and up gained tiles (r16 971 -> 979, r20 1479 -> 1519, ... r50 8563 -> 8731), triangle-tile circle boards of radius 3, 4, 9-14, 16-20, 22-32 lost their rim spikes (r3 60 -> 54, r4 108 -> 96, r10 708 -> 690). 77 of 100 radii differ. Links made earlier for those boards fail with "Could not open the shared link: Board size mismatch." Saved project files survive (explicit geometry, refit keeps them or regenerates only when all painted ids are found).
- Repro: `node re1/cmpgen2.js` (old generator from commit eb0d5ec via `git show`, new from main: 77 differing radii); `node re1/oldlink.js`: link built with the old generator, `unpack` against the new one: `FAIL hexagon circle 20 -> Board size mismatch.`, `FAIL triangle circle 4`, `FAIL triangle circle 3`; hexagon/hexagon and triangle/hexagon links still OK. Other shapes: 880 of 924 compared old/new configs identical (`cmpgen.js`).
- Fix: accept the old tile count by keeping the old generator behind the link's `f` (<7 / <8) for circle boards, or at least say "this link was made with an older board generator" instead of "size mismatch"; the project-format rule (version bump + migration) should have covered the generator change.

### N1-2 (Medium) Opening a file, link, showcase or another project replaces unsaved work with no prompt when the autosave did not succeed
- Location: `fileManager.js:57-61` `detachProject`/`:79-89` `showAsNewProject` (comment "nothing is asked and nothing is lost"), `:382-393` `startAnotherProject`/`openProjectById`; the removed `confirmReplace` guard used `hasUserWork`.
- What happens: the open board is saved best-effort and then replaced. If that save failed (storage full, storage blocked, `autoSaveEnabled:false` from an opened file, N1-5) the work on screen is gone and no confirmation was shown.
- Repro: `node re1/t_quota.js`: storage filled with junk, 60 more painted tiles with objects -> "Auto-save failed: storage is full" notice, stored project 20 tiles vs 80 on screen; `FileManager.openProject(chess)` -> no modal, screen replaced, stored still 20 (screen had 80).
- Fix: make `autoSaveToLocalStorage` return whether it wrote; in `detachProject` and the Load/New paths ask `confirmReplace` when it returned false and `hasUserWork()`.

### N1-3 (Medium) The same project open in two tabs overwrites silently (last writer wins)
- Location: `projectLibrary.js:119-124` `write`, no `storage` listener or version check in the editor; header comment claims projects cannot overwrite each other.
- What happens: duplicate a tab, or open a project from the Load dialog of a second tab (the dialog only blocks the project open in the same tab, `fileManager.js:390`). Each tab saves its own whole copy on every stroke, so edits of the other tab vanish without notice.
- Repro: `node re1/t_lib.js` S1: tabs 1 and 2 on the same project, tab 1 paints tile 3, tab 2 paints tile 10: stored project has only tile 10; tab 1 still shows its stroke.
- Fix: listen for `storage` events on the project key and warn/reload, or store a per-tab revision and refuse to overwrite a newer one.

### N1-4 (Low) A project deleted on the home page while it is open in the editor is silently recreated
- Location: `landing.js:56-60` `ProjectLibrary.remove`, editor `autoSaveToLocalStorage` keeps `currentProjectId`.
- Repro: `t_lib.js` S2: remove the key, paint one more tile in the open tab: the project is back in storage (and on the home page). Also, opening the Load dialog or switching rewrites the open project (N1-6).
- Fix: with N1-3's `storage` listener, drop the id when the key disappears.

### N1-5 (Medium) No notice at all when storage is blocked; the project then silently does not exist
- Location: `fileManager.js:216-223` only announces `QuotaExceededError`; `projectLibrary.js:117-118` throws a plain `Error` when storage is unavailable.
- What happens: with `localStorage` throwing `SecurityError` (cookies blocked, some privacy modes) start-up and editing work, "Create" succeeds, nothing is ever saved and nothing says so; reload shows "Project not found"; the home page lists nothing. Combined with N1-2 every open silently discards the board.
- Repro: `node re1/t_blocked.js`: `Object.defineProperty(window,'localStorage',{get(){throw new DOMException('denied','SecurityError')}})` before load: notification bar empty after a stroke, console only `Auto-save error: SecurityError`.
- Fix: show the same notice for any save failure (different text for "storage not available: save to a file").

### N1-6 (Low) Opening the Load dialog or switching projects rewrites the open project and bumps "Edited just now"
- Location: `loadDialog.js:49`, `fileManager.js:59,383,391` force-save with a fresh `Date.now()` timestamp (`projectFormat.js:458`).
- Repro: `t_lib.js` S20: project untouched for 1.5 s, open Load dialog: stored timestamp +1506 ms. The list is sorted newest edit first, so merely looking reorders it, and "Edited N minutes ago" is wrong. With N1-3 the force-save also writes a stale copy over another tab's edits.
- Fix: force-save only when `isDirty`, or keep the timestamp when nothing changed.

### N1-7 (Low) Work of the old per-tab autosave is imported silently; the editor then shows an empty "Name your project" prompt
- Location: `main.js:30-31` `importLegacy`, then `startNewProject`.
- Repro: `t_lib.js` S6 and `t_legacy.js`: `protogames_autosave:tab-abc123` becomes `recovered-tab-abc123` (fixture v0 and v4 files import and open correctly through `?project=`), but visiting `/app/` shows only the name prompt; the work is found only via Load... or the home page, named after the old project, with "Never saved" when the old payload had no timestamp.
- Fix: say so ("2 projects were recovered, see Load...") once after import.

### N1-8 (Low) Share links carry the sender's `?project=<id>`
- Location: `shareLink.js:344,251-253` (`urlFor(location.href, ...)` keeps the query). Links are longer and expose the id; if the link is bad or the recipient has the same id, the recipient gets "Project not found" or the sender's project instead of the board (`startBoard` falls through to `projectIdFromUrl`, `main.js:57-58`).
- Fix: build the link from `origin + pathname`.

### N1-9 (Low) Legacy import copies before it deletes, so it fails when the storage is more than half full
- Location: `projectLibrary.js:147-150` `setItem` of the copy before `removeItem` of the slot; a `QuotaExceededError` aborts the loop with only a console error (`:158`), every start retries. Fix: remove first when the copy would not fit, or write under the same quota check and tell the user.

### Info
- N1-10 Folding the Project panel (persisted in `protogames_panels`) hides Export, Share, Load and the name field; only Save has a shortcut (`t_panels.js`: Export button has no client rects). Corrupt `protogames_panels` values (`{"a":1}`, `not json`, wrong types) are handled.
- N1-11 `#b=` followed by characters outside base64url (`#b=!!!`) is not recognised as a link: no message, hash stays (`shareLink.js:36`, `t_start.js`).
- N1-12 `?showcase=nope&project=missing...` stacks two message dialogs, the name prompt waits only for the last one (`fileManager.js:229-232`, `t_start.js`). A summarisable but invalid project (e.g. `polygons:"x"`) is listed as openable in Load and fails with a message (`t_lib.js` S3).
- N1-13 "Back to home" in the name prompt goes to `../` (`fileManager.js:119`), which is a directory listing when the app is opened from `file://` as the README suggests; the landing page's `storage` listener (`landing.js:67`) never fires in previews because the preview runtime prefixes the key; `ProjectFormat` v7 has a migration and tests but no `v7-*.json` fixture (tests derive it from the v6 fixture).

## 3. Checked and fine
- Start-up: 7 entry URLs (`/app/`, bad/garbage link, unknown showcase, valid showcase, missing project, both), `file://`, blocked `localStorage`: all reach a board; deferred scripts load in order, `DOMContentLoaded` listener registered in time; no console errors.
- Library: create/reopen/rename path (`t_m2.js`), corrupt and garbage entries (listed, disabled or message, name prompt follows), legacy v0 autosave and v4 per-tab slots import and open, double import is idempotent, preview storage prefix (`preview-runtime.js`) works with `key()`/`length`/`importLegacy` by reading.
- Dialogs: Export (4 tabs, all four downloads produced, dialog closes, PDF 2 pages), Load, Share: focus moves in, Tab trap 0/30 escapes, Escape closes with focus in or on body and returns focus to the opener (`t_dlg.js`, `t_dlg2.js`).
- Panels: fold state saved/restored, 4 corrupt storage values ignored.
- Generator: 560 configs (3 tile shapes x hexagon/circle x centre tile/point x 2 orientations x 2 triangle orientations x 1-14 layers) on 4 canvases (1200x844, 360x500, 3000x300, 5x5): no throw, no duplicate id, no NaN, same ids on every canvas, connected, all pass `ProjectFormat.validate` (`genfuzz.js`).
- Format v7: migration from v6 writes the old fixed centre; old and new generators agree for 880 of 924 compared configs; the 44 differences are all N1-1 (circle boards).
- Share link round trips of UI maximum boards: 20 of 24 open (the 4 refused are M9).

## 4. Not covered
- Real two-device/mobile behaviour, bfcache/back-forward restoring an editor tab (only `history.back()` smoke), drag-and-drop of files (none found in the code), `Import` button file chooser path (only `openProject` with the parsed payload), `ThemeEditor` UI, Safari/Firefox, L6 (code only), B13 (code only), exact `RangeError` of L19 in a browser. Browser quota numbers are from Edge (Chromium, about 5.24M chars).
