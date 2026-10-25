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

**Progress (2026-10-26):** the High finding, 15 of the 18 Medium findings and 41 of the 47 Low ones have fixes ready in draft PRs #118-#126 (none merged yet); see the Status column in Section 3 and the table in Section 7.4. Left open on purpose: the high-DPI canvas (M10), legacy-id migration (M11), Country board caching (M18), compact autosave (L4), fractional radius (L17), the 16 MP print cap in every browser (L23), preview storage cleanup (L25), remote theme image tracking (L26) and the home-page delete announcement (L36).

**Housekeeping:** the test suite is healthy (545 green on three runs and five environment variants, no flakes). A mutation check found 16 real gaps, mostly in `restoreState`. The deploy workflow is sound (tests run on every deploy, no open redirect, no CSP violations).

---

## 2. Method and limits

- **Five re-audits**, one per area: (1) state, persistence, project library, menus, start-up; (2) geometry, board generator, rendering, export; (3) interaction, keyboard, playtest, home page; (4) build, CI, security, deploy; (5) leftovers of the first audit, dead code, tests, docs. Each wrote scripts against the real modules and, for behaviour, drove headless Edge with real mouse, keyboard and emulated touch. Nothing in the repo was touched.
- **Evidence levels:** *browser*, *script* (node, real modules), *code* (citation only). Findings that were only read from code are marked.
- **Severity:** High = crash/hang/data loss/broken release on reachable input. Medium = user-visible bug or real hardening gap. Low = minor. Info = notes.
- **Not covered:** Firefox and Safari, real touch/pen devices, screen readers, macOS, real printers and paper, iOS canvas limits, GPU performance, two-device behaviour, Node 22 and Linux for the test suite (only Node 24 on Windows was available).
- Reports from several reviewers were merged; IDs in brackets are the original ones (BUG-xx = second audit, N1…N5 = this pass, AUDIT-xx = first audit).

---

## 3. The register (open findings, with live status)

The **Status** column is updated as fixes land: *Open* → *Fixed in #N (pending merge)* → *Fixed*. Last update: 2026-10-26: the eight wave-1 packages are in draft PRs #118-#125 (listed per row); the generator version (M7, M14) and the tests-and-docs package (L28) are in the combined draft PR #126, which contains everything. The findings still marked Open are not planned for this round.

### 3.1 High

| ID | Finding | Where | Evidence | Status |
|---|---|---|---|---|
| **H1** | A tile id near 2^53 (share link or file) **and a file with coordinates around 1e18** hang the tab: `cellsIn` loops `x++` until the counter stops changing. Carried from BUG-H1; the second entry point is new (N2-1). | `infinite.js:92-117`, `:66`; `projectFormat.js:316-335` (accepts any finite coordinates) | script: `inf_s_9007199254740991_0` and a polygon at 1e18 both time out; 1e17 finishes | Fixed in #121 (pending merge) |

*Fix:* bound ids in `fromId` (|a|, |b| ≤ 1e9), reject huge rectangles in `cellsIn`, tie polygon `bounds` to the vertices and cap coordinates in the validator (this also fixes L16 and N2-1). No format change is needed.

### 3.2 Medium

| # | Finding | Source | Evidence | Status |
|---|---|---|---|---|
| **M1** | Infinite board: Undo and the pinch rollback do not un-paint tiles that were loaded after the snapshot. The history index moves but the tile stays. | BUG-M4 | script and browser: still reproduces (`infinite.js:276-286`, `state.js:369-380`) | Fixed in #121 (pending merge) |
| **M2** | Undo and Redo are never autosaved: undo, reload or reopen the project, and the undone stroke is back. | BUG-M5 | script: board 1 → 0 tiles, stored project still 1, still 1 after the 30 s timer | Fixed in #118 (pending merge) |
| **M3** | **The canvas is a keyboard trap.** Tab and Shift+Tab always cycle swatches while the canvas has focus. In playtest nothing after the canvas is reachable by keyboard. A mouse click does not focus the canvas, so for mouse users Tab no longer cycles swatches either. | BUG-M6 (from PR #76's Tab fix) | browser: 189 Tab presses never leave the canvas; Tab from the canvas in playtest never reaches the trays, dice or Reset | Fixed in #119 (pending merge) |
| **M4** | Painting leaves focus in a previously used sidebar field, so Ctrl+Z, E, B and every shortcut do nothing until a non-field click. | BUG-M7 | browser: still reproduces | Fixed in #119 (pending merge) |
| **M5** | Space-to-pan swallows Space on checkboxes and other non-text inputs, so the Export dialog's checkboxes cannot be toggled with the keyboard. | BUG-M8 | browser: "Page labels" checkbox stays checked on Space | Fixed in #119 (pending merge) |
| **M6** | The Share dialog builds a link for triangle-tile hexagon/circle boards at 50 layers (width 101/102) that the recipient cannot open ("width out of range"). Hexagon and square tiles are fine now. | BUG-M9 (narrowed), N2-4 | script: 4 of 10 UI-maximum boards (14,701–18,048 tiles) | Fixed in #123 (pending merge) |
| **M7** | Circle of hexagon tiles loses tiles from radius 23 (tile centre) or 19 (point centre) and loses its symmetry. At the UI maximum, 496 of 8,887 tiles are missing. The onset moved from 16 (the scan window changed in #103) but the bug is not fixed. | BUG-M10 | script: R49 8,391 of 8,887; suggested `span = ceil((radius + 0.72) * 2 / √3) + 2`. **Changes ids and counts again, see M14** | Fixed in #126 (pending merge) |
| **M8** | A printed legend is drawn over a board that does not fit its sheet. | BUG-M12 | script and PDF: A3 sheet, 40 mm hex tiles, legend on | Fixed in #122 (pending merge) |
| **M9** | The printed legend names a terrain after the wrong palette (`#C62828` is "Trap" in dungeon and "Danger Zone" in spaceship). | BUG-M13 | script: still "Trap" on a spaceship board | Fixed in #122 (pending merge) |
| **M10** | The board canvas ignores `devicePixelRatio`: soft on HiDPI screens, PNG export at CSS-pixel size. | BUG-M14 | browser: DPR 2 → backing 1100×844 on a 2200×1688 surface | Open |
| **M11** | Old boards with legacy triangle ids: the next resize drops all their colours; opening them leaves the board unfitted. New in the same family: a file saved before #113 with a painted spike tile is also not refit on open. | BUG-M15, N2-9 | script: 23 painted → 0 after resize; spike-painted file keeps old pixel coordinates (maxX 850 on a 900 px canvas) | Open |
| **M12** | A slow remote theme image blocks start-up: with two hanging images the board has 0 tiles after 30 s. Worse now: with `?project=<id>` the project never opens either. | BUG-M16 | browser | Fixed in #123 (pending merge) |
| **M13** | The preview-link comment is lost whenever a run is cancelled. Less frequent now (27 of the last 30 PRs have it). | BUG-M17 | gh run history | Fixed in #124 (pending merge) |
| **M14** | **Old share links of circle boards fail with "Board size mismatch".** #113 and #103 changed tile counts for 77 of 100 radii (triangle circles R3 60 → 54, hexagon circles R16 971 → 979) without a link or format version bump. Saved files survive; links do not. The spec says a board saved earlier keeps its tiles, which is true for files only. | N1-1, N2-2 (new) | script: old generator vs new, links refused for R3, R4, R10, R16, R20, R30 | Fixed in #126 (pending merge) |
| **M15** | **Failed saves are silent and unprotected.** When storage is full, blocked, or autosave is off, nothing says so (only quota-full gets a notice), and opening a file, link, showcase or another project replaces the unsaved board without asking. | N1-2, N1-5 (new) | script: 80 tiles on screen, 20 in storage, `openProject` replaced the screen with no prompt; blocked storage gives only a console line | Fixed in #118 (pending merge) |
| **M16** | **The same project open in two tabs: last save wins, silently.** No `storage` listener, no revision check, no lock. | N1-3, N3-2 (new) | browser: tab A's stroke gone from storage, still on tab A's screen | Fixed in #118 (pending merge) |
| **M17** | Escape during a tray drag, then release, still sends the piece to a start marker (the captured tray button gets the click) and counts a move. | N3-1 (new) | browser | Fixed in #120 (pending merge) |
| **M18** | A Country board 120 tiles across takes 3–5 s to generate, and generates again on every resize, playtest toggle and project open. The default 24 across is fast (80 ms). | N2-3 (new) | script: Norway 120 hex 4.8 s | Open |

### 3.3 Low (carried from the second audit)

| # | Finding | Source | Status |
|---|---|---|---|
| L1 | Empty infinite board: PNG/SVG/Print throw on a large window; the **Export… button now does nothing** (the dialog throws before it opens) | BUG-L1 | Fixed in #121 (pending merge) |
| L2 | A `#ffffff` tile in an imported or edited theme becomes `#000000` | BUG-L2 | Fixed in #123 (pending merge) |
| L3 | A file with `autoSaveEnabled: false` is never saved and nothing can turn saving back on; reload says "Project not found" | BUG-L3, N5-2 | Fixed in #118 (pending merge) |
| L4 | Autosave stores full tile geometry; the biggest boards exceed the quota (hexagon 100×100 is 5.1M characters) and all projects and themes now share it | BUG-L4 | Open |
| L5 | Cancelling a fill with a pinch loses the redo branch | BUG-L6 | Fixed in #125 (pending merge) |
| L6 | The last tiles of a fast brush stroke are dropped (16 ms throttle) | BUG-L7 | Fixed in #125 (pending merge) |
| L7 | A stroke is not tied to its pointer; a lost pointer-up keeps painting | BUG-L8 | Fixed in #125 (pending merge) |
| L8 | Any resize or playtest toggle resets zoom and pan | BUG-L9 | Partly fixed in #125 (pending merge): zoom and pan are kept on same-size resizes; toggling playtest changes the canvas size, so the board is still re-laid out |
| L9 | No-op undo steps (Clear on a blank board; colour case mismatch) | BUG-L10 | Fixed in #125 (pending merge) |
| L10 | `[` and `]` unusable on AltGr layouts (Czech, German) | BUG-L11 | Fixed in #119 (pending merge) |
| L11 | Number fields: `1e2` read as 1; an empty field uses the default without showing it | BUG-L12 | Fixed in #123 (pending merge) |
| L12 | Dynamic dialogs (help, file-manager modals, "Name your project") lose Escape and the Tab trap once focus falls to `<body>` | BUG-L14 | Fixed in #119 (pending merge) |
| L13 | A share link opened while the help overlay is open leaves a stale `#shortcutHelp` that disables Escape | BUG-L15 | Fixed in #119 (pending merge) |
| L14 | `#rgb` colours: project files accept them, share links reject them | BUG-L17, N5-1 | Fixed in #123 (pending merge) |
| L15 | The theme editor discards all edits on Escape or a backdrop click | BUG-L18 | Fixed in #123 (pending merge) |
| L16 | Imported polygons with huge bounds crash the point locator on hover (out of memory) | BUG-L19 | Fixed in #121 (pending merge) |
| L17 | A fractional radius is rounded differently per tile type | BUG-L20 | Open |
| L18 | Print: float noise adds a whole extra page when the board is exactly one page wide | BUG-L21 | Fixed in #122 (pending merge) |
| L19 | Print: the 16 MP cap is exceeded by rounding for about 47% of area-capped sheet sizes | BUG-L22 | Fixed in #122 (pending merge) |
| L20 | Print: crop marks reach the page edge for small margins | BUG-L23 | Fixed in #122 (pending merge) |
| L21 | Hovering a tile hides the top of an object on the tile below | BUG-L24 | Fixed in #122 (pending merge) |
| L22 | Print: a "fit" sheet can exceed 14,400 pt with no warning | BUG-L25 | Fixed in #122 (pending merge) |
| L23 | Print: the 16 MP cap lowers A1/A0 sheets to ~147/~104 dpi in every browser | BUG-L26 | Open |
| L24 | The bot comments a preview link that is a 404 for a PR over the 20-preview cap, one skipped as unbuildable, or one still on the old layout (now more likely) | BUG-L27, N4-1 | Fixed in #124 (pending merge) |
| L25 | `preview:pr-N:` storage keys of closed PRs are never cleaned and share production's quota | BUG-L28 | Open |
| L26 | Remote theme image URLs are fetched on every start (IP and origin leak); CSP allows any https image | BUG-L29 | Open |
| L27 | A PR head that lacks `app/js` and images is published as a blank page (48 unresolved references in a test build) | BUG-L30 | Fixed in #124 (pending merge) |
| L28 | Documentation residuals: README Tab claim, project tree, `square` shape listed, `TILE_GENERATION_EXPLANATION.md` stale again after #113 (documents 6/24/60, measured 6/24/54), `SPECIFICATION.md` orientation values | BUG-L31, N5-4, N5-5 | Fixed in #126 (pending merge) |

### 3.4 Low (new in this pass)

| # | Finding | Source | Status |
|---|---|---|---|
| L29 | A project deleted on the home page while open in the editor is recreated by the next save | N1-4 | Fixed in #118 (pending merge) |
| L30 | Opening the Load dialog or switching projects rewrites the open project and bumps "Edited just now"; the list reorders | N1-6 | Fixed in #118 (pending merge) |
| L31 | Old per-tab autosaves are imported silently; the editor then shows only a name prompt | N1-7 | Fixed in #118 (pending merge) |
| L32 | Share links carry the sender's `?project=<id>` (longer; the recipient may get "Project not found" or the sender's project) | N1-8 | Fixed in #123 (pending merge) |
| L33 | Legacy import copies before deleting, so it fails when storage is more than half full; and it deletes a newer autosave of a still-open old tab | N1-9, N4-3 | Fixed in #118 (pending merge) |
| L34 | A corrupt project timestamp breaks the Load dialog and the home list (`RangeError`), and that project cannot be deleted from either page | N3-3 | Fixed in #118 (pending merge) |
| L35 | The landing page ignores a share link pasted as a same-tab hash change | N3-4 | Fixed in #123 (pending merge) |
| L36 | The home page's two-step Delete is silent to screen readers and drops focus | N3-5 | Open |
| L37 | With NumLock off, numpad navigation keys pick swatches | N3-6 | Fixed in #119 (pending merge) |
| L38 | Saved export options with `png: null` or `svg: null` make the Export dialog fail to open on every visit | N2-5 | Fixed in #122 (pending merge) |
| L39 | The orientation control is shown for triangle circles built around a point but does nothing | N2-6 | Fixed in #123 (pending merge) |
| L40 | SVG draws country borders under objects and start markers; screen, PNG and print draw them on top | N2-7 | Fixed in #122 (pending merge) |
| L41 | Print always prints start markers, with no switch, and keeps them in "tokens only" mode (issue #87) | N2-8 | Fixed in #122 (pending merge) |
| L42 | On an infinite board the Export dialog recomputes the export scene (about 0.2 s) on every control change | N2-10 | Fixed in #122 (pending merge) |
| L43 | In previews the home page project list never refreshes (the `storage` key is prefixed) | N4-2 | Fixed in #123 (pending merge) |
| L44 | The move to protogames.eu strands projects saved on the old github.io origin, while DEPLOYMENT.md says saved data survives the move | N4-4 | Fixed in #124 (pending merge) |
| L45 | The Share dialog makes links for boards over 20,000 tiles that the opener refuses | N5-3 | Fixed in #123 (pending merge) |
| L46 | Ctrl+S in the new permanent "Project name" field opens the browser's Save Page dialog | BUG-C19, now more exposed | Fixed in #119 (pending merge) |
| L47 | Playtest follow-ups (tracked in issues #85 and #86): a lone tray is not centred on its edge; at 390 px wide with side or four seats the board is about 80 px wide and trays overlap the controls; overlapping two-finger taps fire no click for dice or "send"; a folded tray hides the dice; "column, row" labels on infinite boards count loaded tiles and change when panning; piece keys and Esc missing from the help overlay and README; an off-board drop is silent for screen readers; Reset has no confirmation | playtest check, N3-7…9 | Partly fixed in #119 and #120 (pending merge): keys documented in #119; layout, taps, dice, labels and announcements in #120; on landscape phones the board cannot reach 260 px height |

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

**Principle:** independent agents in separate worktrees, one branch per package, every package test-first, nothing pushed until I have reviewed the diff and run the full suite. You get draft PRs with previews and one combined integration PR to try in the morning. I do not merge anything. As packages are reviewed, pushed and merged, I update the Status column in Section 3 on the PR of this report.

### 7.1 Decisions taken

1. **Tab (M3, M4, M5): the default.** The app never claims Tab. "Next/previous swatch" moves to `,` and `.`. The canvas stops being a trap; clicking the board no longer leaves focus in a sidebar field; Space belongs to inputs and dialogs. Help overlay and README are updated.
2. **Geometry (M7, M14): old links may break, but the fix is done properly.** Nothing has been shared, so old circle-board links are not worth keeping alive. What we want is that **future generator changes cannot silently change existing boards again**. That means package I below:
   - the board settings get a **generator version** (`boardConfig.generator`); the current generator is version 2 (spike-free triangle circles, the corrected hexagon-circle scan window);
   - project format v8 with a migration that marks every older file as generator 1, a v7 fixture, validation (an unknown newer value is refused like a newer format), tests and a spec update, following the project's versioning rule;
   - boards of generator 1 keep generating the old shapes (the differences are small parameter switches: scan window and spike removal), so old files still regenerate on resize with their colours instead of losing them;
   - share links of circle boards carry the generator version (link v5, only for circle boards, as with country boards); a link without it is read as generator 1, which as a side effect opens most old links again, and a mismatch gets a clear message instead of "size mismatch";
   - the spec states the rule "change the generator = new generator version".
3. **Print legends (M9): the default.** Labels prefer the board's active palette, then fall back to the first match; no saved-data change.

### 7.2 Work packages

| Pkg | Wave | What | Findings | Files it owns |
|---|---|---|---|---|
| **A. Saved work** | 1 | Saving reports success; any failure shows a notice (including blocked storage); opening a file, link, showcase or project asks when the save failed and there is work; `autoSaveEnabled:false` is ignored on load; Undo/Redo autosave; save only when dirty (the Load dialog stops bumping "edited"); warn when another tab saved the same project (`storage` listener or revision check); a deleted project is not recreated; legacy import order and quota; corrupt timestamp tolerated | M2, M15, M16, L3, L29, L30, L33, L34 | `fileManager.js`, `projectLibrary.js`, `loadDialog.js`, `handleUndo`/`handleRedo` in `interactions.js` |
| **B. Keyboard and focus** | 1 | Tab never claimed, swatches on `,` `.`; blur a focused field on canvas pointer-down; Space ownership; dialogs listen on `document` for Escape and the Tab trap; numpad with NumLock off; Ctrl+S in the name field; AltGr brackets; help overlay and README list every key including Esc and the piece keys | M3, M4, M5, L10, L12, L13, L37, L46, part of L47 | `shortcuts.js`, `viewControls.js`, `focusUtils.js`, `handlePointerDown` in `interactions.js`, README keys table |
| **C. Playtest** | 1 | Escape during a tray drag fully cancels; tray centring; a folded tray keeps the dice reachable; roll and send on `pointerup`; phone-width layout; announce off-board drops; stable labels on infinite boards | M17, rest of L47 | `playtestDrag.js`, `playtestTray.js`, `playtest.js`, `pieces.js`, `styles.css` |
| **D. Hang and infinite** | 1 | Bound ids and coordinates; the validator ties bounds to vertices and caps coordinates; infinite undo blanks tiles missing from a snapshot; empty-infinite export no longer throws | H1, M1, L1, L16 | `infinite.js`, `state.js` (`restoreSnapshot`), `projectFormat.js`, `neighbors.js` |
| **E. Print and export** | 1 | Legend on its own page when the board does not fit; palette-aware labels; float noise; 16 MP rounding; crop marks; 14,400 pt warning; start-outline switch; SVG border order; export settings `null`; cache of the infinite export scene; hover no longer hides object overhang | M8, M9, L18–L23, L38, L40, L41, L42 | `print.js`, `exportDialog.js`, `exporter.js`, `renderer.js`, label lookup in `textures.js` |
| **F. Share links and start-up** | 1 | Link width cap for 50 layers; `#rgb` normalised; the Share dialog refuses boards over the tile cap; do not carry `?project`; landing hash change and the preview `storage` key; start the board before applying themes and load theme images in parallel with a timeout; `1e2` and empty number fields; orientation control for triangle circles; white theme tile; the theme editor asks before discarding | M6, M12, L2, L11, L14, L15, L32, L35, L39, L43, L45 | `shareLink.js`, `ui.js`, `main.js`, `themeManager.js`, `themeEditor.js`, `landing.js` |
| **G. CI and previews** | 1 | Preview comment from a job that cannot be cancelled and only when the preview was built; skip PRs without the app layout; check references of exported pages; note on the domain move | M13, L24, L27, L44 | `.github/workflows/`, `scripts/build-site.js`, `docs/DEPLOYMENT.md`. **Only takes effect after you merge it** (the workflow runs from `main`) |
| **J. Interaction details** | 1 | Last tiles of a fast stroke; a stroke tied to its pointer and ended on lost release; resize and playtest keep zoom and pan; no-op undo steps (Clear on a blank board, colour case); a pinch-cancelled fill keeps the redo branch | L5–L9 | `handlePointerMove`/`Up`/`Cancel`, `handleClearBoard`, `applyToolToPolygon` in `interactions.js`, the debounced resize in `main.js`, `setPolygons` and the view reset in `state.js` |
| **I. Generator version** | 2 (after D and F, on the combined tree) | Everything in 7.1 point 2, including the hexagon-circle scan-window fix | M7, M14 | `geometry/hex.js`, `geometry/triangle.js`, `config.js`, `projectFormat.js`, `shareLink.js`, fixtures, `docs/SPECIFICATION.md`, `docs/TILE_GENERATION_EXPLANATION.md` |
| **H. Tests and docs** | 3 (last) | Tests for the 16 mutation survivors (`restoreState` resets, `fromId` guard, spike repetition, blocked storage, `uniqueHex`, `linePath` on islands), a test that every script tag is present and in a valid order, browser-driven keyboard checks for M3-M5 where feasible; README, SPECIFICATION and TILE_GENERATION brought in line | L28, test gaps | `tests/`, `docs/` |

Not tonight: M10 `devicePixelRatio` (needs a look on a real HiDPI screen), M18 Country board caching, M11 legacy-id migration (needs real old files), converting theme images to data URLs at import (L26), compact autosave (L4), L17 fractional radius, the Info items.

### 7.3 Order

1. **Wave 1, in parallel:** A, B, C, D, E, F, G, J. File ownership above keeps them apart; `interactions.js` is shared by A, B and J, split by function, and I resolve any textual conflict at integration.
2. **Review:** I read every diff, rerun the full suite on each branch and on the combined result.
3. **Wave 2:** I (generator version) on top of the combined result of wave 1.
4. **Wave 3:** H (tests and docs) on top of that.
5. **Browser verification:** I drive the combined build in Chrome (Tab walk in the editor and in playtest, shortcuts after a canvas click, two-tab overwrite warning, failed-save prompt, tray Escape, Export dialog on a large window, old and new circle boards).
6. **Push:** one draft PR per package and one combined integration PR; the Status column of this report is updated at each step; no force-pushes, no merges.

**Rules for the agents:** work only in their own worktree; no `taskkill` by image name (only the PIDs they started); no change to saved data outside package I and D's back-compatible validation; do not edit this report.

### 7.4 Progress (2026-10-26)

| Package | Draft PR | Findings | State |
|---|---|---|---|
| A. Saved work | #118 | M15, M16, M2, L3, L29, L30, L33, L34 | done, 562 tests |
| B. Keyboard and focus | #119 | M3, M4, M5, L10, L12, L13, L37, L46 | done, 550 tests, checked in a real browser |
| C. Playtest | #120 | M17, L47 | done, 561 tests, checked in a real browser (touch emulated) |
| D. Hang and infinite | #121 | H1, M1, L1, L16 | done, 555 tests |
| E. Print and export | #122 | M8, M9, L18-L22, L38, L40-L42 | done, 560 tests |
| F. Share links and start-up | #123 | M6, M12, L2, L11, L14, L15, L32, L35, L39, L43, L45 | done, 560 tests |
| G. CI and previews | #124 | M13, L24, L27, L44 | done, 549 tests; takes effect only after merge |
| J. Interaction details | #125 | L5-L9 | done, 556 tests |
| Integration | #126 (`night/integration`) | all of the above | merged, 709 tests; checked in Chrome: undo autosave, swatch keys, Space in Export, two-tab warning, infinite undo |
| I. Generator version | in #126 | M7, M14 | done, 675 tests; checked in Chrome (v7 fixture migrates to generator 1 and survives a resize; new circle boards are generator 2; share link v5 round trip) |
| H. Tests and docs | in #126 | L28, test gaps | done, 709 tests; 16 mutation survivors now have tests, each proven by reverting the fix; script-order test; README, SPECIFICATION, TILE_GENERATION and notes updated |

## 8. Reports

Per-area reports with exact repros and the lists of what was checked: [1-state](audit-2026-10-25/1-state.md), [2-geometry-render](audit-2026-10-25/2-geometry-render.md), [3-ui-playtest](audit-2026-10-25/3-ui-playtest.md), [4-build-security](audit-2026-10-25/4-build-security.md), [5-leftovers-health](audit-2026-10-25/5-leftovers-health.md). They refer to repro scripts as `<scratch>/…`; the scripts (several hundred small node and DevTools scripts, generated PDFs and screenshots) were written in a scratch folder and are not committed.
