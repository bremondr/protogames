# Protogames — Current Audit

**Date:** 2026-10-25 · **Revision audited:** `78aa7ef` (main, 545 tests green) · **Replaces the status of:** [AUDIT.md](AUDIT.md) (first audit, 2026-10-05, revision `cdf317e`) and [BUG_AUDIT.md](BUG_AUDIT.md) (second audit, 2026-10-11, revision `39ead4a`)

This report merges both earlier audits with a fresh pass over the project as it is now. Five independent reviewers each re-checked every earlier finding in their area against the current code (re-running the old repros, in a real browser where the finding was about behaviour) and looked for new bugs in the code that appeared since. The full reports, with repro commands, are in [audit-2026-10-25/](audit-2026-10-25/). Section 7 is the plan for tonight.

---

## 1. Where we are

**The three open bug issues are fixed. The stability and keyboard problems from the second audit are mostly still there.**

Since the second audit the project grew a lot: several named projects in the browser with a home page, a new Project panel and tabbed Export/Load dialogs, the board generator by layers, the Country board, the playtest game (players, trays, pieces, dice), new showcases and themes, a landing page with the editor at `/app/`, a custom domain, and deferred script loading. The app code grew from about 9,300 to about 13,400 lines and the tests from 261 to 545. The project format is now v7 and share links are v4.

| | Result |
|---|---|
| **Issue #4** triangle circle spikes | **Fixed** (#113). No spikes at radius 1–40, still symmetric. |
| **Issue #19** Load Project keeps saved geometry | **Fixed** (#114). Checked in a browser for files, stored projects, country and infinite boards, with colours, objects, start markers and players kept. Old boards with legacy tile ids are the exception (M11). |
| **Issue #20** SVG export ignores textures and objects | **Fixed** (#115). Valid XML, matches the PNG export to within about 0.1% of pixels. |
| First audit, 6 High and 17 Medium findings | All fixed or superseded (the Tab fix became the keyboard trap, M3). |
| Second audit, 49 findings (1 High, 17 Medium, 31 Low) | **6 fixed, 6 changed, 37 still open.** The fixed ones are the three issue bugs, the discard-leaves-empty-canvas bug (gone with the new project library), and two Lows that went away with removed code. |

**The current register (Section 3) holds 1 High, 18 Medium and 47 Low findings**: the earlier ones that are still open plus the new ones from this pass, merged and de-duplicated. Nothing in it breaks the build, the deploy or the site, and the closest thing to a privacy issue is remote theme images being fetched on every start (L26). The risks are the same two kinds as before: **losing user work** and **keyboard users getting stuck**.

**The five things that matter most right now:**

1. **A project file or share link can freeze the tab** (H1). Both an infinite-board tile id near 2^53 and a file with coordinates around 1e18 make the board loop forever on open. The reviewers confirmed both.
2. **Saving can fail without anyone noticing, and work is then replaced** (M15, M16). With the new project library every board is one stored project. When storage is full or blocked, nothing says so, and opening another file, link or project replaces the unsaved board without asking. The same project open in two tabs overwrites silently (last writer wins).
3. **Undo does not stick** (M1, M2). On an infinite board the first paint in a newly scrolled area cannot be undone, and Undo/Redo are never autosaved, so reopening a project from the home page brings the undone stroke back. The home page makes this more visible than before.
4. **The canvas swallows Tab** (M3, M4, M5). In the editor a keyboard user who reaches the canvas cannot leave it. In playtest the canvas is among the first tab stops, so trays, dice, the piece list and Reset cannot be reached by keyboard at all, although the docs promise keyboard play. Clicking the board also leaves focus in a sidebar field so shortcuts go dead, and Space can't toggle checkboxes.
5. **The generator changes broke old share links** (M14). The spike removal (#113) and the new generator (#103) changed tile counts for 77 of 100 circle radii without a format or link version bump, so links made before for those boards fail with "Board size mismatch".

**Housekeeping:** the test suite is healthy (545 green on three runs and five environment variants, no flakes). A mutation check found 16 real gaps, mostly in `restoreState`. The deploy workflow is sound (tests run on every deploy, no open redirect, no CSP violations).

---

## 2. Method and limits

- **Five re-audits**, one per area: (1) state, persistence, project library, menus, start-up; (2) geometry, board generator, rendering, export; (3) interaction, keyboard, playtest, home page; (4) build, CI, security, deploy; (5) leftovers of the first audit, dead code, tests, docs. Each wrote scripts against the real modules and, for behaviour, drove headless Edge with real mouse, keyboard and emulated touch. Nothing in the repo was touched.
- **Evidence levels:** *browser*, *script* (node, real modules), *code* (citation only). Findings that were only read from code are marked.
- **Severity:** High = crash/hang/data loss/broken release on reachable input. Medium = user-visible bug or real hardening gap. Low = minor. Info = notes.
- **Not covered:** Firefox and Safari, real touch/pen devices, screen readers, macOS, real printers and paper, iOS canvas limits, GPU performance, two-device behaviour, Node 22 and Linux for the test suite (only Node 24 on Windows was available).
- Reports from several reviewers were merged; IDs in brackets are the original ones (BUG-xx = second audit, N1…N5 = this pass, AUDIT-xx = first audit).

---

## 3. Open findings (the current register)

### 3.1 High

| ID | Finding | Where | Evidence |
|---|---|---|---|
| **H1** | A tile id near 2^53 (share link or file) **and a file with coordinates around 1e18** hang the tab: `cellsIn` loops `x++` until the counter stops changing. Carried from BUG-H1; the second entry point is new (N2-1). | `infinite.js:92-117`, `:66`; `projectFormat.js:316-335` (accepts any finite coordinates) | script: `inf_s_9007199254740991_0` and a polygon at 1e18 both time out; 1e17 finishes |

*Fix:* bound ids in `fromId` (|a|, |b| ≤ 1e9), reject huge rectangles in `cellsIn`, tie polygon `bounds` to the vertices and cap coordinates in the validator (this also fixes L16 and N2-1). No format change is needed.

### 3.2 Medium

| # | Finding | Source | Evidence |
|---|---|---|---|
| **M1** | Infinite board: Undo and the pinch rollback do not un-paint tiles that were loaded after the snapshot. The history index moves but the tile stays. | BUG-M4 | script and browser: still reproduces (`infinite.js:276-286`, `state.js:369-380`) |
| **M2** | Undo and Redo are never autosaved: undo, reload or reopen the project, and the undone stroke is back. | BUG-M5 | script: board 1 → 0 tiles, stored project still 1, still 1 after the 30 s timer |
| **M3** | **The canvas is a keyboard trap.** Tab and Shift+Tab always cycle swatches while the canvas has focus. In playtest nothing after the canvas is reachable by keyboard. A mouse click does not focus the canvas, so for mouse users Tab no longer cycles swatches either. | BUG-M6 (from PR #76's Tab fix) | browser: 189 Tab presses never leave the canvas; Tab from the canvas in playtest never reaches the trays, dice or Reset |
| **M4** | Painting leaves focus in a previously used sidebar field, so Ctrl+Z, E, B and every shortcut do nothing until a non-field click. | BUG-M7 | browser: still reproduces |
| **M5** | Space-to-pan swallows Space on checkboxes and other non-text inputs, so the Export dialog's checkboxes cannot be toggled with the keyboard. | BUG-M8 | browser: "Page labels" checkbox stays checked on Space |
| **M6** | The Share dialog builds a link for triangle-tile hexagon/circle boards at 50 layers (width 101/102) that the recipient cannot open ("width out of range"). Hexagon and square tiles are fine now. | BUG-M9 (narrowed), N2-4 | script: 4 of 10 UI-maximum boards (14,701–18,048 tiles) |
| **M7** | Circle of hexagon tiles loses tiles from radius 23 (tile centre) or 19 (point centre) and loses its symmetry. At the UI maximum, 496 of 8,887 tiles are missing. The onset moved from 16 (the scan window changed in #103) but the bug is not fixed. | BUG-M10 | script: R49 8,391 of 8,887; suggested `span = ceil((radius + 0.72) * 2 / √3) + 2`. **Changes ids and counts again, see M14** |
| **M8** | A printed legend is drawn over a board that does not fit its sheet. | BUG-M12 | script and PDF: A3 sheet, 40 mm hex tiles, legend on |
| **M9** | The printed legend names a terrain after the wrong palette (`#C62828` is "Trap" in dungeon and "Danger Zone" in spaceship). | BUG-M13 | script: still "Trap" on a spaceship board |
| **M10** | The board canvas ignores `devicePixelRatio`: soft on HiDPI screens, PNG export at CSS-pixel size. | BUG-M14 | browser: DPR 2 → backing 1100×844 on a 2200×1688 surface |
| **M11** | Old boards with legacy triangle ids: the next resize drops all their colours; opening them leaves the board unfitted. New in the same family: a file saved before #113 with a painted spike tile is also not refit on open. | BUG-M15, N2-9 | script: 23 painted → 0 after resize; spike-painted file keeps old pixel coordinates (maxX 850 on a 900 px canvas) |
| **M12** | A slow remote theme image blocks start-up: with two hanging images the board has 0 tiles after 30 s. Worse now: with `?project=<id>` the project never opens either. | BUG-M16 | browser |
| **M13** | The preview-link comment is lost whenever a run is cancelled. Less frequent now (27 of the last 30 PRs have it). | BUG-M17 | gh run history |
| **M14** | **Old share links of circle boards fail with "Board size mismatch".** #113 and #103 changed tile counts for 77 of 100 radii (triangle circles R3 60 → 54, hexagon circles R16 971 → 979) without a link or format version bump. Saved files survive; links do not. The spec says a board saved earlier keeps its tiles, which is true for files only. | N1-1, N2-2 (new) | script: old generator vs new, links refused for R3, R4, R10, R16, R20, R30 |
| **M15** | **Failed saves are silent and unprotected.** When storage is full, blocked, or autosave is off, nothing says so (only quota-full gets a notice), and opening a file, link, showcase or another project replaces the unsaved board without asking. | N1-2, N1-5 (new) | script: 80 tiles on screen, 20 in storage, `openProject` replaced the screen with no prompt; blocked storage gives only a console line |
| **M16** | **The same project open in two tabs: last save wins, silently.** No `storage` listener, no revision check, no lock. | N1-3, N3-2 (new) | browser: tab A's stroke gone from storage, still on tab A's screen |
| **M17** | Escape during a tray drag, then release, still sends the piece to a start marker (the captured tray button gets the click) and counts a move. | N3-1 (new) | browser |
| **M18** | A Country board 120 tiles across takes 3–5 s to generate, and generates again on every resize, playtest toggle and project open. The default 24 across is fast (80 ms). | N2-3 (new) | script: Norway 120 hex 4.8 s |

### 3.3 Low (carried from the second audit)

| # | Finding | Source |
|---|---|---|
| L1 | Empty infinite board: PNG/SVG/Print throw on a large window; the **Export… button now does nothing** (the dialog throws before it opens) | BUG-L1 |
| L2 | A `#ffffff` tile in an imported or edited theme becomes `#000000` | BUG-L2 |
| L3 | A file with `autoSaveEnabled: false` is never saved and nothing can turn saving back on; reload says "Project not found" | BUG-L3, N5-2 |
| L4 | Autosave stores full tile geometry; the biggest boards exceed the quota (hexagon 100×100 is 5.1M characters) and all projects and themes now share it | BUG-L4 |
| L5 | Cancelling a fill with a pinch loses the redo branch | BUG-L6 |
| L6 | The last tiles of a fast brush stroke are dropped (16 ms throttle) | BUG-L7 |
| L7 | A stroke is not tied to its pointer; a lost pointer-up keeps painting | BUG-L8 |
| L8 | Any resize or playtest toggle resets zoom and pan | BUG-L9 |
| L9 | No-op undo steps (Clear on a blank board; colour case mismatch) | BUG-L10 |
| L10 | `[` and `]` unusable on AltGr layouts (Czech, German) | BUG-L11 |
| L11 | Number fields: `1e2` read as 1; an empty field uses the default without showing it | BUG-L12 |
| L12 | Dynamic dialogs (help, file-manager modals, "Name your project") lose Escape and the Tab trap once focus falls to `<body>` | BUG-L14 |
| L13 | A share link opened while the help overlay is open leaves a stale `#shortcutHelp` that disables Escape | BUG-L15 |
| L14 | `#rgb` colours: project files accept them, share links reject them | BUG-L17, N5-1 |
| L15 | The theme editor discards all edits on Escape or a backdrop click | BUG-L18 |
| L16 | Imported polygons with huge bounds crash the point locator on hover (out of memory) | BUG-L19 |
| L17 | A fractional radius is rounded differently per tile type | BUG-L20 |
| L18 | Print: float noise adds a whole extra page when the board is exactly one page wide | BUG-L21 |
| L19 | Print: the 16 MP cap is exceeded by rounding for about 47% of area-capped sheet sizes | BUG-L22 |
| L20 | Print: crop marks reach the page edge for small margins | BUG-L23 |
| L21 | Hovering a tile hides the top of an object on the tile below | BUG-L24 |
| L22 | Print: a "fit" sheet can exceed 14,400 pt with no warning | BUG-L25 |
| L23 | Print: the 16 MP cap lowers A1/A0 sheets to ~147/~104 dpi in every browser | BUG-L26 |
| L24 | The bot comments a preview link that is a 404 for a PR over the 20-preview cap, one skipped as unbuildable, or one still on the old layout (now more likely) | BUG-L27, N4-1 |
| L25 | `preview:pr-N:` storage keys of closed PRs are never cleaned and share production's quota | BUG-L28 |
| L26 | Remote theme image URLs are fetched on every start (IP and origin leak); CSP allows any https image | BUG-L29 |
| L27 | A PR head that lacks `app/js` and images is published as a blank page (48 unresolved references in a test build) | BUG-L30 |
| L28 | Documentation residuals: README Tab claim, project tree, `square` shape listed, `TILE_GENERATION_EXPLANATION.md` stale again after #113 (documents 6/24/60, measured 6/24/54), `SPECIFICATION.md` orientation values | BUG-L31, N5-4, N5-5 |

### 3.4 Low (new in this pass)

| # | Finding | Source |
|---|---|---|
| L29 | A project deleted on the home page while open in the editor is recreated by the next save | N1-4 |
| L30 | Opening the Load dialog or switching projects rewrites the open project and bumps "Edited just now"; the list reorders | N1-6 |
| L31 | Old per-tab autosaves are imported silently; the editor then shows only a name prompt | N1-7 |
| L32 | Share links carry the sender's `?project=<id>` (longer; the recipient may get "Project not found" or the sender's project) | N1-8 |
| L33 | Legacy import copies before deleting, so it fails when storage is more than half full; and it deletes a newer autosave of a still-open old tab | N1-9, N4-3 |
| L34 | A corrupt project timestamp breaks the Load dialog and the home list (`RangeError`), and that project cannot be deleted from either page | N3-3 |
| L35 | The landing page ignores a share link pasted as a same-tab hash change | N3-4 |
| L36 | The home page's two-step Delete is silent to screen readers and drops focus | N3-5 |
| L37 | With NumLock off, numpad navigation keys pick swatches | N3-6 |
| L38 | Saved export options with `png: null` or `svg: null` make the Export dialog fail to open on every visit | N2-5 |
| L39 | The orientation control is shown for triangle circles built around a point but does nothing | N2-6 |
| L40 | SVG draws country borders under objects and start markers; screen, PNG and print draw them on top | N2-7 |
| L41 | Print always prints start markers, with no switch, and keeps them in "tokens only" mode (issue #87) | N2-8 |
| L42 | On an infinite board the Export dialog recomputes the export scene (about 0.2 s) on every control change | N2-10 |
| L43 | In previews the home page project list never refreshes (the `storage` key is prefixed) | N4-2 |
| L44 | The move to protogames.eu strands projects saved on the old github.io origin, while DEPLOYMENT.md says saved data survives the move | N4-4 |
| L45 | The Share dialog makes links for boards over 20,000 tiles that the opener refuses | N5-3 |
| L46 | Ctrl+S in the new permanent "Project name" field opens the browser's Save Page dialog | BUG-C19, now more exposed |
| L47 | Playtest follow-ups (tracked in issues #85 and #86): a lone tray is not centred on its edge; at 390 px wide with side or four seats the board is about 80 px wide and trays overlap the controls; overlapping two-finger taps fire no click for dice or "send"; a folded tray hides the dice; "column, row" labels on infinite boards count loaded tiles and change when panning; piece keys and Esc missing from the help overlay and README; an off-board drop is silent for screen readers; Reset has no confirmation | playtest check, N3-7…9 |

### 3.5 Info

Carried: rectangle of triangles with width 1 equals width 2; sub-pixel tiles break adjacency; a NaN canvas gives NaN vertices; `setScaleAt(…, 1)` returns 0.9999…; export canvases keep `lineJoin: 'miter'`; print textures are soft at large tile sizes; the minimap hashes every tile per frame; the Export dialog cannot cancel a running export (a 140-page PDF took 150 s); the canvas is not re-measured on container resize; `[`/`]` change a hidden brush size in Fill/Line mode; infinite share links mixing tile families open as one board.
New: a panel folded in the Project panel hides Export/Share/Load; `#b=` with non-base64url characters is ignored without a message; invalid `?showcase` and `?project` stack two dialogs; "Back to home" goes to `../`, a directory listing on `file://`; no v7 fixture file (derived from v6); the landing CSP has an unused `data:` source and the landing page has no analytics (only `/app/` is counted); `Object.keys(localStorage)` would bypass preview isolation (the app does not use it); controls are visible but inert until the deferred scripts run; share-link visitors load the whole landing page before being forwarded; the SVG uses `href` without `xlink:href` (old Inkscape and some cutters may show empty tiles); a 4× PNG on a 4K window is a 131 MB data URL with no warning; focus is lost on leaving playtest; wording of README and help.
Dead code (first audit leftovers, 8 items): `Utils.formatTimestamp`, the `pointingUp` flag (kept: it is saved in files), `ToolOps.planLine` and the Geometry facade helpers (tests only), duplicated pointer maths, dead per-builder sizing in the hex and triangle builders, per-frame full tile scan in `paint`, `linePath` fallback on disconnected boards. New dead or test-only exports: `Config.AUTO_SAVE_KEY`, `BoardPicker.selectable`, `Shortcuts.overridePlatform`, and about 25 exports used only inside their own file or by tests (list in the area 5 report).

---

## 4. What changed since the earlier audits

### 4.1 Second audit (BUG_AUDIT.md) ledger

49 numbered findings (1 High, 17 Medium, 31 Low):

| Status | Count | IDs |
|---|---|---|
| **Fixed** | 6 | M1 (Discard leaves empty canvas: the prompt is gone, every start path generates a board), M2 = issue #19 (#114), M3 = issue #20 (#115), M11 = issue #4 (#113), L5 (orphan autosave slots: module removed), L16 (stacked confirms: confirm dialogs removed) |
| **Changed** | 6 | M9 (narrower: only triangle tiles at 50 layers), M10 (truncation moved from radius 16 to 23/19), M15 (kept as saved, no id remap), L12 (field now shows 1), L13 (only latent), L31 (docs mostly fixed) |
| **Still open** | 37 | H1; M4–M8, M12–M14, M16, M17; L1–L4, L6–L11, L14, L15, L17–L30 (the register above) |

### 4.2 First audit (AUDIT.md) ledger

- **Findings H1–H6 and M1–M17:** all fixed except H6, which changed: the Tab fix became the keyboard trap (M3). H2, H3, H5 and the M-series fixes were re-confirmed by the reviewers. H4 (validator) and M1 (inflate bound) were confirmed by mutation tests.
- **Low bullets (26), unused code (14), duplication (9), documentation drift (9) = 58 items:** 41 fixed, 8 open, 9 changed. The open ones are minor: per-frame tile scan, `linePath` on disconnected boards, `Utils.formatTimestamp`, `pointingUp`, test-only `planLine`, duplicated pointer-to-canvas maths, dead per-builder sizing, actions pinned by tag (accepted in DEPLOYMENT.md).
- **§5 test gaps:** mostly closed. Still untested: `Utils.sanitizeFileName`, the PDF page renderers and crop marks, the infinite `sync` chunk-key reuse, and eight UI modules.

### 4.3 Things that were fixed along the way (not on either list)

The project library removed the per-tab autosave slots and Web Locks, the "restore autosave?" prompt and the confirm-before-replace dialogs (opening something now creates a new project). Start-up with blocked storage works. The `autoSaveToggle` and canvas-placeholder dead code is gone. The logo is 30 KB. Previews are isolated from production storage, including for the project library.

---

## 5. Test health

- **545 tests, 3 consecutive runs and 5 variants** (Los Angeles, Tokyo and Kiritimati time zones, a Czech locale, no git identity): all green, no flakes, 12–15 s (the site-build test alone is 14.7 s and needs a real git checkout). Node 22 and Linux were not run. No Node 22+ API is used.
- **Mutation check:** 105 fixes reverted one at a time; 86 caught, 19 survived (16 real gaps). The fixes of #76, #113, #114 and #115 are well covered. **Survivors:** `restoreState` does not test the view reset, the history reset (so undo could cross projects), notifying a running playtest, or `hasUserWork` with only players; the `fromId` safe-integer guard (H1); the repeat-until-stable spike removal; blocked-storage handling; `uniqueHex`; autosave ignoring `isDirty`; `linePath` on disconnected boards; `parse` mutating a current-version input; the blob-URL revoke delay; `applyContextDefaults` after resize; the country-outline failure of a link; the `bad-migration` guard.
- **No test at all:** `exportDialog`, `loadDialog`, `playersPanel`, `playtest`, `playtestDrag`, `playtestTray`, `toolbar`, `viewControls`. This is where M3–M5, M17 and most of L5–L12 live, and the earlier audits showed that only a browser-driven check catches them.
- **Fragility:** moving a module to the first or last script slot fails loudly in 22 of 82 cases, none silently. The `index.html` test checks `defer` and the count but not order.

---

## 6. Release, deploy and security

No High or Medium finding. Tests run on every deploy and `main` cannot publish untested. 19 hostile hash and query cases found no open redirect or loop. There are no CSP violations on the landing page, the app, every Export tab or `file://`. Storage isolation between production and previews holds for everything the app uses, including the new project library. Remaining: M13, L24, L25, L27, L43, L44 and the info items above. The accepted risk of the third-party analytics script is documented.

---

## 7. Plan for tonight

**Principle:** the same way as last time — independent agents in separate worktrees, one branch per package, every package test-first, nothing pushed until I have reviewed the diff and run the full suite. You get draft PRs with previews and one combined integration PR to try in the morning. I do not merge anything.

### 7.1 Decisions I need from you before I start

1. **Tab key (M3).** Default if you don't say: remove Tab as the swatch key entirely and move "next/previous swatch" to `,` and `.`; Tab then always navigates, and the canvas is no longer a trap. Say so if you would rather keep Tab with a canvas-focus rule.
2. **Geometry fixes (M7 and the generator change behind M14).** These change tile counts and ids of existing boards. Default: tonight I only make old share links fail with a clear message ("made with an older board generator") and add tests; the hexagon-circle span fix (M7) and a generation flag for old links wait for your decision (format bump, or accept that those links change).
3. **Print legends (M9).** Default: prefer the palette active on the board; no change to saved data.

### 7.2 The work packages (8 agents, no two touch the same files)

| Pkg | What | Findings | Main files | Needs a decision? |
|---|---|---|---|---|
| **A. Saved work** | `autoSaveToLocalStorage` reports success; any save failure shows a notice (including blocked storage); opening a file/link/showcase/project asks when the save failed and there is work; ignore `autoSaveEnabled:false` on load; autosave after undo/redo; save only when dirty (Load dialog no longer bumps "edited"); warn when another tab changed the same project (`storage` listener or revision check), drop the id when its key disappears; fix legacy import order | M2, M15, M16, L3, L29, L30, L33 | `fileManager.js`, `projectLibrary.js`, `interactions.js` | no |
| **B. Keyboard and focus** | Tab never claimed (per decision 1), canvas gets focus on click or the shortcut layer stops depending on it, blur a focused field on canvas pointer-down, Space owned by inputs and dialogs, dialogs listen on `document` for Escape and the Tab trap, numpad keys, Ctrl+S in the name field, AltGr brackets, help overlay and README list all keys incl. Esc and piece keys | M3, M4, M5, L10, L12, L13, L37, L46, part of L47 | `shortcuts.js`, `viewControls.js`, `interactions.js`, `focusUtils.js`, README | decision 1 |
| **C. Playtest** | Escape during a tray drag fully cancels (no click), tray centring, folded tray keeps dice reachable or shows the last roll, roll and send on `pointerup`, phone-width layout so trays never hide zoom controls and the board stays usable, announce off-board drops, stable labels on infinite boards | M17, rest of L47 | `playtestDrag.js`, `playtestTray.js`, `playtest.js`, `pieces.js`, `styles.css` | no |
| **D. Hang and infinite** | Bound ids and coordinates (H1 incl. the file entry point), validator ties bounds to vertices and caps coordinates (L16), infinite undo blanks tiles missing from a snapshot (M1), empty-infinite export and Export dialog no longer throw (L1), export settings null (L38), corrupt timestamp (L34), recompute cache for the export scene (L42) | H1, M1, L1, L16, L34, L38, L42 | `infinite.js`, `state.js`, `projectFormat.js`, `neighbors.js`, `exporter.js`, `exportDialog.js`, `projectLibrary.js` | no (back-compatible validation, checked against all fixtures like last time) |
| **E. Print and export** | Legend onto its own page when the board does not fit (M8), palette-aware labels (M9), float noise, rounding of the 16 MP cap, crop marks, 14,400 pt warning, optional start-outline switch (L41), SVG border order (L40), progress and cancel for long exports (info) | M8, M9, L18, L19, L20, L22, L40, L41 | `print.js`, `exportDialog.js`, `exporter.js` | decision 3 |
| **F. Share links and start-up** | Link width cap for 50 layers (M6), `#rgb` normalisation (L14), Share dialog refuses boards over the tile cap (L45), clear message for old-generator links (part of M14), do not carry `?project` (L32), landing hash change (L35), start the board before applying themes and load theme images in parallel with a timeout (M12), numbers: `1e2`/empty field (L11), orientation control for triangle circles (L39) | M6, M12, L11, L14, L32, L35, L39, L45 | `shareLink.js`, `ui.js`, `main.js`, `themeManager.js`, `landing.js` | decision 2 (partly) |
| **G. CI and previews** | Post the preview comment from a job that cannot be cancelled, only when the preview was really built; skip PRs without the app layout; check refs of exported pages; fix the landing `storage` key for previews; note on the domain move in the docs | M13, L24, L27, L43, L44 | `.github/workflows/`, `scripts/build-site.js`, `landing.js`, docs | no. **Only takes effect after you merge it** (the workflow runs from `main`) |
| **H. Tests and docs (last)** | Tests for the 16 mutation survivors (`restoreState` resets, `fromId` guard, spike repetition, blocked storage, `uniqueHex`, `linePath` on islands), a test that every script tag is present and in a valid order, browser-driven keyboard checks for M3–M5 where feasible, tests for the eight untested UI modules where cheap; README, `TILE_GENERATION_EXPLANATION.md`, SPECIFICATION and help text brought in line; banners in the first two audits pointing here | L28, E4-type gaps | `tests/`, `docs/` | no |

Not tonight: M7 and M14's generation flag (decision 2), M10 `devicePixelRatio` (a rendering change that needs a careful look on a real HiDPI screen), M18 Country board caching (needs a design for the tile-id cache), M11 legacy id migration (needs real old files to test against), converting theme images to data URLs at import (L26), L4 compact autosave (a format-level change), the Info items.

### 7.3 Order and parallelism

1. **Wave 1, in parallel:** A, B, C, D, E, F, G (no shared files between them; B touches `interactions.js` for one handler and A for undo-autosave: I assign the undo/redo handler to A and tell B to leave that function alone).
2. **Review:** I read every diff, rerun the full suite, check that each branch passes alone and that the combined merge is conflict-free.
3. **Wave 2:** H, on top of the combined result, so the new tests describe the final behaviour.
4. **Verification in a browser:** I drive the combined build with Chrome for the keyboard and playtest checks (Tab walk, shortcut after canvas click, two-tab overwrite warning, failed-save prompt, tray Escape), and for the touch layout at 390 px as far as the browser window allows.
5. **Push:** one draft PR per package plus one combined integration PR (preview), no force-pushes, no merges. The morning summary lists the PRs, what to try in each preview, and anything I could not verify.

**Risks:** the keyboard changes touch every shortcut, so B is the package most likely to need your eye; A changes when the app prompts, so its wording needs a read; G only has an effect after you merge it. Agents will be told not to kill browser processes by name (the geometry reviewer's `taskkill /IM msedge.exe` closed every Edge window on this machine).

---

## 8. Reports

Per-area reports with exact repros and the lists of what was checked: [1-state](audit-2026-10-25/1-state.md), [2-geometry-render](audit-2026-10-25/2-geometry-render.md), [3-ui-playtest](audit-2026-10-25/3-ui-playtest.md), [4-build-security](audit-2026-10-25/4-build-security.md), [5-leftovers-health](audit-2026-10-25/5-leftovers-health.md). They refer to repro scripts as `<scratch>/…`; the scripts (several hundred small node and DevTools scripts, generated PDFs and screenshots) were written in a scratch folder and are not committed.
