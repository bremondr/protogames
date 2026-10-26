# Findings register

**This is the current state of the audits.** One row per finding, with its status. It is the only file in `docs/audits/` that changes after the fact; the dated reports are frozen logs. Rules, ID scheme and status words: [README.md](README.md).

- **Last audit:** A3, 2026-10-25, revision `78aa7ef` ([report](2026-10-25-re-audit/report.md)); it re-checked everything of A1 and A2.
- **Last update:** 2026-10-26, after PR #126 (the audit fixes were merged).
- **Totals:** 66 findings: 55 fixed, 2 partly fixed, 9 open. Info-level items are not tracked individually; they are listed in the report (section 3.5).
- **Where the evidence is:** each row's *Source* column points to the original ID in the A3 report (section 3) and its area reports; the older audits are cited as `AUDIT-xx` (A1) and `BUG-xx` (A2).

## High (1; 0 open)

| ID | Finding | Source | Status |
|---|---|---|---|
| A3-H1 | A tile id near 2^53 (share link or file) **and a file with coordinates around 1e18** hang the tab: `cellsIn` loops `x++` until the counter stops changing. Carried from BUG-H1; the second entry point is new (N2-1). | A2-H1, A3 (second entry point) | Fixed (#126, 2026-10-26) |

## Medium (18; 3 open)

| ID | Finding | Source | Status |
|---|---|---|---|
| A3-M1 | Infinite board: Undo and the pinch rollback do not un-paint tiles that were loaded after the snapshot. The history index moves but the tile stays. | BUG-M4 | Fixed (#126, 2026-10-26) |
| A3-M2 | Undo and Redo are never autosaved: undo, reload or reopen the project, and the undone stroke is back. | BUG-M5 | Fixed (#126, 2026-10-26) |
| A3-M3 | **The canvas is a keyboard trap.** Tab and Shift+Tab always cycle swatches while the canvas has focus. In playtest nothing after the canvas is reachable by keyboard. A mouse click does not focus the canvas, so for mouse users Tab no longer cycles swatches either. | BUG-M6 (from PR #76's Tab fix) | Fixed (#126, 2026-10-26) |
| A3-M4 | Painting leaves focus in a previously used sidebar field, so Ctrl+Z, E, B and every shortcut do nothing until a non-field click. | BUG-M7 | Fixed (#126, 2026-10-26) |
| A3-M5 | Space-to-pan swallows Space on checkboxes and other non-text inputs, so the Export dialog's checkboxes cannot be toggled with the keyboard. | BUG-M8 | Fixed (#126, 2026-10-26) |
| A3-M6 | The Share dialog builds a link for triangle-tile hexagon/circle boards at 50 layers (width 101/102) that the recipient cannot open ("width out of range"). Hexagon and square tiles are fine now. | BUG-M9 (narrowed), N2-4 | Fixed (#126, 2026-10-26) |
| A3-M7 | Circle of hexagon tiles loses tiles from radius 23 (tile centre) or 19 (point centre) and loses its symmetry. At the UI maximum, 496 of 8,887 tiles are missing. The onset moved from 16 (the scan window changed in #103) but the bug is not fixed. | BUG-M10 | Fixed (#126, 2026-10-26) |
| A3-M8 | A printed legend is drawn over a board that does not fit its sheet. | BUG-M12 | Fixed (#126, 2026-10-26) |
| A3-M9 | The printed legend names a terrain after the wrong palette (`#C62828` is "Trap" in dungeon and "Danger Zone" in spaceship). | BUG-M13 | Fixed (#126, 2026-10-26) |
| A3-M10 | The board canvas ignores `devicePixelRatio`: soft on HiDPI screens, PNG export at CSS-pixel size. | BUG-M14 | Open |
| A3-M11 | Old boards with legacy triangle ids: the next resize drops all their colours; opening them leaves the board unfitted. New in the same family: a file saved before #113 with a painted spike tile is also not refit on open. | BUG-M15, N2-9 | Open |
| A3-M12 | A slow remote theme image blocks start-up: with two hanging images the board has 0 tiles after 30 s. Worse now: with `?project=<id>` the project never opens either. | BUG-M16 | Fixed (#126, 2026-10-26) |
| A3-M13 | The preview-link comment is lost whenever a run is cancelled. Less frequent now (27 of the last 30 PRs have it). | BUG-M17 | Fixed (#126, 2026-10-26) |
| A3-M14 | **Old share links of circle boards fail with "Board size mismatch".** #113 and #103 changed tile counts for 77 of 100 radii (triangle circles R3 60 → 54, hexagon circles R16 971 → 979) without a link or format version bump. Saved files survive; links do not. The spec says a board saved earlier keeps its tiles, which is true for files only. | N1-1, N2-2 (new) | Fixed (#126, 2026-10-26) |
| A3-M15 | **Failed saves are silent and unprotected.** When storage is full, blocked, or autosave is off, nothing says so (only quota-full gets a notice), and opening a file, link, showcase or another project replaces the unsaved board without asking. | N1-2, N1-5 (new) | Fixed (#126, 2026-10-26) |
| A3-M16 | **The same project open in two tabs: last save wins, silently.** No `storage` listener, no revision check, no lock. | N1-3, N3-2 (new) | Fixed (#126, 2026-10-26) |
| A3-M17 | Escape during a tray drag, then release, still sends the piece to a start marker (the captured tray button gets the click) and counts a move. | N3-1 (new) | Fixed (#126, 2026-10-26) |
| A3-M18 | A Country board 120 tiles across takes 3–5 s to generate, and generates again on every resize, playtest toggle and project open. The default 24 across is fast (80 ms). | N2-3 (new) | Open |

## Low (47; 6 open)

| ID | Finding | Source | Status |
|---|---|---|---|
| A3-L1 | Empty infinite board: PNG/SVG/Print throw on a large window; the **Export… button now does nothing** (the dialog throws before it opens) | BUG-L1 | Fixed (#126, 2026-10-26) |
| A3-L2 | A `#ffffff` tile in an imported or edited theme becomes `#000000` | BUG-L2 | Fixed (#126, 2026-10-26) |
| A3-L3 | A file with `autoSaveEnabled: false` is never saved and nothing can turn saving back on; reload says "Project not found" | BUG-L3, N5-2 | Fixed (#126, 2026-10-26) |
| A3-L4 | Autosave stores full tile geometry; the biggest boards exceed the quota (hexagon 100×100 is 5.1M characters) and all projects and themes now share it | BUG-L4 | Open |
| A3-L5 | Cancelling a fill with a pinch loses the redo branch | BUG-L6 | Fixed (#126, 2026-10-26) |
| A3-L6 | The last tiles of a fast brush stroke are dropped (16 ms throttle) | BUG-L7 | Fixed (#126, 2026-10-26) |
| A3-L7 | A stroke is not tied to its pointer; a lost pointer-up keeps painting | BUG-L8 | Fixed (#126, 2026-10-26) |
| A3-L8 | Any resize or playtest toggle resets zoom and pan | BUG-L9 | Partly fixed (#126, 2026-10-26): zoom and pan are kept on same-size resizes; toggling playtest changes the canvas size, so the board is still re-laid out |
| A3-L9 | No-op undo steps (Clear on a blank board; colour case mismatch) | BUG-L10 | Fixed (#126, 2026-10-26) |
| A3-L10 | `[` and `]` unusable on AltGr layouts (Czech, German) | BUG-L11 | Fixed (#126, 2026-10-26) |
| A3-L11 | Number fields: `1e2` read as 1; an empty field uses the default without showing it | BUG-L12 | Fixed (#126, 2026-10-26) |
| A3-L12 | Dynamic dialogs (help, file-manager modals, "Name your project") lose Escape and the Tab trap once focus falls to `<body>` | BUG-L14 | Fixed (#126, 2026-10-26) |
| A3-L13 | A share link opened while the help overlay is open leaves a stale `#shortcutHelp` that disables Escape | BUG-L15 | Fixed (#126, 2026-10-26) |
| A3-L14 | `#rgb` colours: project files accept them, share links reject them | BUG-L17, N5-1 | Fixed (#126, 2026-10-26) |
| A3-L15 | The theme editor discards all edits on Escape or a backdrop click | BUG-L18 | Fixed (#126, 2026-10-26) |
| A3-L16 | Imported polygons with huge bounds crash the point locator on hover (out of memory) | BUG-L19 | Fixed (#126, 2026-10-26) |
| A3-L17 | A fractional radius is rounded differently per tile type | BUG-L20 | Open |
| A3-L18 | Print: float noise adds a whole extra page when the board is exactly one page wide | BUG-L21 | Fixed (#126, 2026-10-26) |
| A3-L19 | Print: the 16 MP cap is exceeded by rounding for about 47% of area-capped sheet sizes | BUG-L22 | Fixed (#126, 2026-10-26) |
| A3-L20 | Print: crop marks reach the page edge for small margins | BUG-L23 | Fixed (#126, 2026-10-26) |
| A3-L21 | Hovering a tile hides the top of an object on the tile below | BUG-L24 | Fixed (#126, 2026-10-26) |
| A3-L22 | Print: a "fit" sheet can exceed 14,400 pt with no warning | BUG-L25 | Fixed (#126, 2026-10-26) |
| A3-L23 | Print: the 16 MP cap lowers A1/A0 sheets to ~147/~104 dpi in every browser | BUG-L26 | Open |
| A3-L24 | The bot comments a preview link that is a 404 for a PR over the 20-preview cap, one skipped as unbuildable, or one still on the old layout (now more likely) | BUG-L27, N4-1 | Fixed (#126, 2026-10-26) |
| A3-L25 | `preview:pr-N:` storage keys of closed PRs are never cleaned and share production's quota | BUG-L28 | Open |
| A3-L26 | Remote theme image URLs are fetched on every start (IP and origin leak); CSP allows any https image | BUG-L29 | Open |
| A3-L27 | A PR head that lacks `app/js` and images is published as a blank page (48 unresolved references in a test build) | BUG-L30 | Fixed (#126, 2026-10-26) |
| A3-L28 | Documentation residuals: README Tab claim, project tree, `square` shape listed, `TILE_GENERATION_EXPLANATION.md` stale again after #113 (documents 6/24/60, measured 6/24/54), `SPECIFICATION.md` orientation values | BUG-L31, N5-4, N5-5 | Fixed (#126, 2026-10-26) |
| A3-L29 | A project deleted on the home page while open in the editor is recreated by the next save | N1-4 | Fixed (#126, 2026-10-26) |
| A3-L30 | Opening the Load dialog or switching projects rewrites the open project and bumps "Edited just now"; the list reorders | N1-6 | Fixed (#126, 2026-10-26) |
| A3-L31 | Old per-tab autosaves are imported silently; the editor then shows only a name prompt | N1-7 | Fixed (#126, 2026-10-26) |
| A3-L32 | Share links carry the sender's `?project=<id>` (longer; the recipient may get "Project not found" or the sender's project) | N1-8 | Fixed (#126, 2026-10-26) |
| A3-L33 | Legacy import copies before deleting, so it fails when storage is more than half full; and it deletes a newer autosave of a still-open old tab | N1-9, N4-3 | Fixed (#126, 2026-10-26) |
| A3-L34 | A corrupt project timestamp breaks the Load dialog and the home list (`RangeError`), and that project cannot be deleted from either page | N3-3 | Fixed (#126, 2026-10-26) |
| A3-L35 | The landing page ignores a share link pasted as a same-tab hash change | N3-4 | Fixed (#126, 2026-10-26) |
| A3-L36 | The home page's two-step Delete is silent to screen readers and drops focus | N3-5 | Open |
| A3-L37 | With NumLock off, numpad navigation keys pick swatches | N3-6 | Fixed (#126, 2026-10-26) |
| A3-L38 | Saved export options with `png: null` or `svg: null` make the Export dialog fail to open on every visit | N2-5 | Fixed (#126, 2026-10-26) |
| A3-L39 | The orientation control is shown for triangle circles built around a point but does nothing | N2-6 | Fixed (#126, 2026-10-26) |
| A3-L40 | SVG draws country borders under objects and start markers; screen, PNG and print draw them on top | N2-7 | Fixed (#126, 2026-10-26) |
| A3-L41 | Print always prints start markers, with no switch, and keeps them in "tokens only" mode (issue #87) | N2-8 | Fixed (#126, 2026-10-26) |
| A3-L42 | On an infinite board the Export dialog recomputes the export scene (about 0.2 s) on every control change | N2-10 | Fixed (#126, 2026-10-26) |
| A3-L43 | In previews the home page project list never refreshes (the `storage` key is prefixed) | N4-2 | Fixed (#126, 2026-10-26) |
| A3-L44 | The move to protogames.eu strands projects saved on the old github.io origin, while DEPLOYMENT.md says saved data survives the move | N4-4 | Fixed (#126, 2026-10-26) |
| A3-L45 | The Share dialog makes links for boards over 20,000 tiles that the opener refuses | N5-3 | Fixed (#126, 2026-10-26) |
| A3-L46 | Ctrl+S in the new permanent "Project name" field opens the browser's Save Page dialog | BUG-C19, now more exposed | Fixed (#126, 2026-10-26) |
| A3-L47 | Playtest follow-ups (tracked in issues #85 and #86): a lone tray is not centred on its edge; at 390 px wide with side or four seats the board is about 80 px wide and trays overlap the controls; overlapping two-finger taps fire no click for dice or "send"; a folded tray hides the dice; "column, row" labels on infinite boards count loaded tiles and change when panning; piece keys and Esc missing from the help overlay and README; an off-board drop is silent for screen readers; Reset has no confirmation | playtest check, N3-7…9 | Partly fixed (#126, 2026-10-26): keys documented in #119; layout, taps, dice, labels and announcements in #120; on landscape phones the board cannot reach 260 px height |

## How to update this file

Change the *Status* cell in the pull request that fixes, accepts or drops the finding (see [README.md](README.md), rule 5). Add new findings only together with a new audit report. Never change an ID.
