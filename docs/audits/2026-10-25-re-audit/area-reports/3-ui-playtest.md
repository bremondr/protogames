# Re-audit, area 3: interaction, keyboard/accessibility, playtest, home/landing UI

Revision: current main `78aa7ef` (read-only checkout `scratchpad/main-now2`, `app/` and `landing.js`). Everything marked "browser" was run in headless Edge over CDP (trusted mouse, keyboard, touch events) against a static server on 127.0.0.1:8793 serving that checkout. Scripts and my CDP helper are in `scratchpad/re3/` (`cdp.js`, `lib.js`, `serve.js`, `t1.js` ... `t32.js`). The earlier `ui/`, `regress/` and `issues2/` script folders were empty, so I rebuilt the helper and re-wrote the repros from the descriptions in `C-ui.md` / `E-regressions.md`. The playtest issue report `issues2-playtest.md` was not in `scratchpad/findings`; I used the list of follow-ups from the brief.

Run: `export PATH=.../node/bin:$PATH; cd re3; node serve.js <main-now2> 8793 &; node tNN.js`.

Totals: status table 38 rows = 11 FIXED, 3 CHANGED, 24 OPEN (plus one extra row, C11). New findings: 0 High, 2 Medium, 4 Low, 3 Info.

---

## 1. Status of earlier findings

### BUG_AUDIT (second audit)

| ID | Status | Evidence | Note |
|---|---|---|---|
| M6 canvas keyboard trap, Tab swatch cycling needs canvas focus | OPEN | browser `t1.js`, `t14.js`, `t6.js`; `shortcuts.js:40-41` (bindings), `:249-255` (`isFocusNeutral` = canvas has focus), `:257-272` (`onKeyDown` always `preventDefault`s); `index.html:247` `<canvas tabindex="0">` | Tab x4 from the focused canvas: colour changes each time, `activeElement` stays `CANVAS#gameCanvas`; Shift+Tab and Escape also stay. Real Tab walk (`t14.js`): editor reaches the canvas at stop 30, then 189 more presses never leave it. A mouse click on the board leaves `BODY` focused (`interactions.js:486`), so Tab then moves to `#focusButton`, no swatch cycling, as before. **Worse in playtest**: the sidebar is hidden, so the canvas is one of the first tab stops and nothing after it (trays, dice, piece list, Reset, Back) can be reached by keyboard (Tab from canvas, 6 presses: never reaches `#trayLayer`, `#boardPieceList` or `#playtestPill`). `docs/PLAYTEST.md:31-34` promises keyboard play. |
| M7 painting leaves focus in a sidebar field, shortcuts die | OPEN | browser `t1.js`; `interactions.js:483-486` (`event.preventDefault()` on pointerdown, no blur) | Focus the orientation select, click a tile (paints), then `E` and Ctrl+Z do nothing (eraser stays off, history index unchanged); activeElement is still `SELECT`. Same for the number input. |
| M8 Space-to-pan swallows Space on checkboxes etc. | OPEN | browser `t1.js`; `viewControls.js:127-134` (`ownsSpace`), `:139-144` | Export dialog, Print tab, "Page labels" checkbox focused, real Space: not toggled (`checked` stays true). Note the CDP helper must send `code: 'Space'`; with `code: ''` the handler is skipped and the box toggles. |
| L7 last tiles of a fast stroke dropped | OPEN | browser `t4.js` (controlled clock); `interactions.js:540-542` (throttle), `:575-585` (`handlePointerUp` paints nothing) | Row a,b,c,d: `#2D5016 #2D5016 #ffffff #ffffff`. |
| L8 stroke not tied to its pointer, lost release | OPEN | browser `t2.js`; `interactions.js:483-557` no `pointerId`/`buttons` check, no blur handler | After mouse press, moves with `buttons=0`: `isDrawing` stays true and tiles keep painting (7 painted). |
| L9 resize/playtest toggle resets zoom and pan | OPEN | browser `t2.js`; `main.js:8-15`, `state.js:103-109` (`setPolygons` resets view), `playtest.js:144-147` (synthetic resize) | zoom 1.56 -> playtest on: `{"scale":1,"x":0,"y":0}`; a plain `resize` event at the same size: 1.25 -> 1. |
| L10 spurious undo steps, case-sensitive compares | OPEN | browser `t23.js`, `t24.js`; `interactions.js:209`, `:245-257`, `fileManager.js:127` | Clear on a blank board twice: history 1 -> 3. Brush on a tile showing `#2d5016` with current `#2D5016`: history 2 -> 3. `hasUserWork()` is true with one `#FFFFFF` tile. |
| L11 `[` `]` unusable on AltGr layouts | OPEN | browser `t2.js`; `shortcuts.js:93-104` (`matchesCombo`: `altKey === combo.alt`) | Ctrl+Alt (AltGr) + BracketRight: brush size 1 -> 1; plain `]`: 2. |
| L12 `1e2` read as 1, empty field not shown | OPEN | browser `t2.js`; `ui.js:161-166` (`parseInt`) | `1e2` -> radius 0 (layer 1) and the field is rewritten to "1". |
| L13 one Escape closes two stacked dialogs | CHANGED (latent) | code: `exportDialog.js:360`, `loadDialog.js:66`, `shareLink.js:457`, `themeEditor.js:43` still ignore `defaultPrevented` | The reachable trigger is gone: a share link no longer opens a confirm (see L16), Share/Export/Load close themselves before `saveProjectFile`/import, and `exportDownload` on the Project-file tab saves directly (`t3.js`, `t2.js` tried them: never two layers). I found no path that puts a file-manager modal over a static dialog. Any new one would reproduce it. |
| L14 dynamic dialogs lose Escape and the Tab trap after focus falls to `<body>` | OPEN | browser `t2.js` (help overlay), `t3b.js` (confirm modal); `shortcuts.js:385-391`, `fileManager.js:237-259` (`presentModal`), `focusUtils.js:47-59` | Click dialog text: `activeElement` BODY; Escape does nothing (help and the "Replace current board?" modal stay open); Tab moves to `A` outside the overlay. Static dialogs are fine. The new "Name your project" prompt and `showMessage` use the same `presentModal`, so they have it too. |
| L15 share link while help overlay open leaves a stale `#shortcutHelp` | OPEN | browser `t3.js`; `shareLink.js:388-392`, `focusUtils.js:80` | After `location.hash = '#b=...'`: `className "modal-backdrop hidden"`, `layerOpen()` true, in playtest Escape no longer leaves; the next `?` removes the stale node instead of opening help. |
| L16 two share links in a row stack confirms | FIXED (by design, #107) | code `shareLink.js:444-446`, `:402-437` (no confirm; opens as a new project) | The confirm dialog is gone, so the cancel-clears-hash race cannot happen. Two valid links make two projects. (My second test link was corrupt, so only the code path and the error toast were exercised.) |
| L17 project files accept `#rgb`, links reject it | OPEN (by code) | `projectFormat.js:42` (`#rgb\|#rrggbb`) vs `shareLink.js:37`, `:150` (`#rrggbb` only) | Not re-run in a browser. |
| L18 theme editor discards edits on Escape/backdrop | OPEN | browser `t3.js`; `themeEditor.js:41-43` | Typed a name, Escape: editor closed with no prompt. |
| C18 canvas not re-measured on container resize | OPEN | `grep ResizeObserver app/js` finds nothing; resize path is the window event only (`main.js:8-15`) | Info. |
| C19 Ctrl+S falls through in text fields | OPEN, more exposed | browser `t23.js` (`defaultPrevented` false in the field, true on body); `shortcuts.js:130-134` | There is now a permanent "Project name" field in the sidebar (`index.html:65`), so Ctrl+S in it (the habit after renaming) opens the browser's Save Page dialog, not only in the old name prompt. Info -> Low in practice. |
| C20 `[`/`]` change a hidden brush size in Fill/Line | OPEN | browser `t2.js`; `shortcuts.js:236-238`, `interactions.js:458-463` | Fill mode, `]`: brush 1 -> 3 (earlier press), toast "Brush size 3". |
| (extra) C11 fill taken back by pinch drops the redo branch | OPEN | browser `t32.js`; `state.js:415-420`, `interactions.js:327-340` | `{len:3,idx:1}` -> `{len:2,idx:1}`, redo gone. Not in the asked list; not counted above. |

### BUG_AUDIT playtest follow-ups (from the previous issue check)

| Item | Status | Evidence | Note |
|---|---|---|---|
| Canvas swallows Tab in playtest | OPEN | browser `t6.js` (h), `t14.js`, `t19b.js`; same code as M6 (`shortcuts.js:257-272`: in playtest the Colors group is not allowed but the key is still `preventDefault`ed) | See M6. Keyboard play is unreachable. |
| Lone tray not centred on its edge | OPEN | browser `t7.js`; `styles.css:2490-2494` (seat is 48rem wide, centred), `:2526-2529` (`.tray { flex: 1 1 0; max-width: 26rem }`, seat has no `justify-content`) | 1280 px wide, bottom only: tray x 256-672 (centre 464, screen centre 640). Top: 608-1024. Left seat: y 72-488 (centre 280, canvas centre 428). Right: 368-784. Screenshot `re3/s7a.png`. Fix: `justify-content: center` on `.tray-seat`. |
| Phone width (390 px): board ~80 px, trays overlap controls | OPEN | browser `t8.js` (screenshots `s8_*.png`) | Left+right seats: canvas 154-236 (82 px wide); zoom cluster at `left = -48` (off screen); pill `right = 544` (off screen). Four seats: canvas 82x414, bottom/top trays 50 px wide, zoom controls overlap trays and the pill overlaps trays. One seat: fine (pill is 1 px too wide). |
| Overlapping two-finger taps on dice fire no click | OPEN | browser `t9.js` (CDP touch) | Single tap: 1 click. Two fingers down and up together: 0 die clicks; staggered overlap: 0. Rolls and piece sends use `click` (`playtestTray.js:226-241`). |
| Folded tray hides dice | OPEN | browser `t31.js`; `styles.css:2605-2607` | Folded: 0 of 7 dice visible, tray 34 px high. |
| "column, row" labels on infinite boards count loaded tiles | OPEN | browser `t11.js`; `pieces.js:340-353` (axes from the loaded `polygons` array) | Same tile `inf_hp_9_6`: "column 47, row 19" at the start view, "column 84" after panning right, "column 28" after panning left, "column 47" back. This is what the announcer and the piece list say. |
| Piece keys missing from help/README | OPEN | `shortcuts.js` BINDINGS has no arrow/Delete entry; browser `t31.js` help text has none; `README.md:33-45` has none; only `docs/PLAYTEST.md:34` documents them | Also Esc (leave playtest, cancel drag/line, close dialogs) is nowhere in the help overlay or README table. |
| Off-board drop silent for screen readers | OPEN | browser `t31.js`; `playtestDrag.js:349-360` (`message` stays `''` when the drop is off the canvas) | Announcer cleared, piece dropped on the header: announcer stays `""`. |

### AUDIT.md (first audit) ids in this area

| ID | Status | Evidence | Note |
|---|---|---|---|
| H6 Tab hijacked on `body` | CHANGED | `shortcuts.js:249-255` | `body` is no longer neutral (browser: Tab after load moves focus), but the fix made the canvas a trap, see BUG_AUDIT M6. |
| M7 board inputs `parseInt \|\| default`, no limits | FIXED (#76) | `ui.js:161-166` clamps 1..max | Remaining: `1e2` (L12). |
| M9 click on already-coloured tile records history | FIXED (#76) | browser `t28.js`: same colour again, history `2/1` unchanged; `interactions.js:187-212`, `:588-596` (`strokeChanged`) | Case-insensitivity and Clear remain (L10). |
| M10 fill not rolled back on pinch | FIXED (#76) | browser `t28.js`: fill + second finger, tiles 1 -> 1, history `2/1`; `interactions.js:327-340` (`fillPending`) | Redo branch loss remains (C11). |
| M11 right click paints | FIXED (#76) | browser `t28.js`; `interactions.js:485` | 1 painted tile after a right click. |
| M12 two `isTypingTarget` functions, Space on buttons | FIXED (#76) | `focusUtils.js:21-28` shared; `viewControls.js:127-134` | Regressed into M8 for non-text inputs. |
| Low: dialogs do not trap focus / lack role, initial focus | FIXED (#76, #109) | browser `t12.js`: export (4 tabs), share, load: 70 Tab and 70 Shift+Tab presses never left the dialog; focus returns to the opener on Escape; `fileManager.js:237-259` sets role/aria-modal/label/initial focus | Gaps: L14. |
| Low: `role=listitem` on object buttons, palette `aria-live` | FIXED | `grep listitem\|aria-live app/js index.html`: only the theme editor rows and the intended live regions | |
| Low: Escape handlers not coordinated | CHANGED | `playtest.js:154-160`, `toolbar.js:89-95`, `focusUtils.js:79-81` | Layering works (dialog, popover/full screen, playtest) apart from L14/L15 and the open Latent L13. |
| Low: colour input focus invisible | FIXED | `styles.css:1279` `.editor-color:focus-within` | |
| Low: print number field `''` -> 0 | FIXED | `print.js:195-198` (`num` treats `''`/null as default) | |
| Low: print blocking decided by regex over text | FIXED | `print.js:216` (`warning(text, blocking)`), `:257` | |

---

## 2. New findings

### N3-1 (Medium) Escape-cancelled tray drag still places the piece on release
- Location: `app/js/playtestDrag.js:312` (pointer capture on the tray button), `:374-380` and `:459-461` (Escape handler `cancel()`), `:334-345` (`onPointerUp` returns early when no drag is left and never sets `suppressClick`), `app/js/playtestTray.js:226-232` (`onClick` -> `sendFromTray`).
- What happens: the documented behaviour is "Esc during the drag puts the piece back where it came from" (`docs/PLAYTEST.md:24`). After Escape the drag is gone, but the pointer is still captured by the tray button, so the button release still produces a `click`. `suppressClick` is only set for a drag that is still in `drags` at `pointerup`, so `PlaytestTray.onClick` treats it as "send one to the first free start": the piece jumps to a start marker and a move is counted (and is undoable). The user pressed Escape to cancel and gets a move.
- Repro (browser, `t6.js` part a, `t5.js`): game with one Red player (4 pawns, two start markers). Press on the Red pawn in the tray, move 60 px so the ghost shows, press Escape (ghost disappears), release the mouse. `play.pieces.filter(p => p.tileId !== null).length` is 1 and `play.moves` is 1 (expected 0 and 0). A drag that starts on a board piece is not affected (no click on the canvas).
- Fix: in `cancel()` remember the cancelled `pointerId`s (or set `suppressClick = true`) and consume it in `onPointerUp` and the next `click`; or release pointer capture in `cancel()`.

### N3-2 (Medium) The same project open in two tabs: the last save silently wins
- Location: `app/js/fileManager.js:198-224` (`autoSaveToLocalStorage` writes the whole payload), `app/js/projectLibrary.js:118-123` (`write`); no `storage` event listener and no lock anywhere in `app/js` (`grep "locks\|'storage'"` finds nothing).
- What happens: since the multi-project library (#107) a project is one localStorage key. Open the same project twice (landing "Your maps" link opened in a second tab, a duplicated tab, a bookmarked `?project=` URL), edit in both: each save replaces the entire project, so the other tab's strokes vanish from storage with no warning. The tab that lost keeps showing its own (now unsaved-looking) board and is never told. The Load dialog only blocks opening the project that is open in the *same* tab (`loadDialog.js:38`).
- Repro (browser, `t25.js`): open the app, note the `currentProjectId`, open a second tab at `/app/?project=<id>`, paint a different tile in each tab (each autosaves). Stored project holds only tab B's tile: `hex_1_-4:#1976D2`; tab A still shows its own tile (`#7CB342`).
- Fix: save with a revision/timestamp and refuse (or merge, or warn) when the stored copy is newer than what the tab last loaded; or take a Web Lock / `storage` listener per project id and mark the second tab read-only or ask. (Rated Medium: both tabs have to be edited. It is data loss, so High if you count it as such.)

### N3-3 (Low) A corrupt timestamp breaks the Load dialog and the home page list
- Location: `app/js/projectLibrary.js:95` (`new Date(timestamp).toISOString()` throws `RangeError` for a very negative/large finite value), `:52` (`summarize` accepts any finite number), callers `app/js/loadDialog.js:30` / `:50` and `landing.js:38`, `:71`.
- What happens: one stored project whose `timestamp` is e.g. `-1e20` makes `describeAge` throw. In the app, `LoadDialog.open()` throws before it shows the dialog, so "Load..." does nothing. On the landing page `render()` throws mid-list (later entries are not shown) and the `storage` listener at `landing.js:73-75` is never attached. The library already lists "unreadable" projects so they can be deleted, but this entry is "readable" and cannot be deleted from either page.
- Repro (browser, `t16.js`): `localStorage.setItem('protogames_project:poison01', JSON.stringify({projectName:'Poison', timestamp:-1e20, appState:{boardConfig:{}, polygons:[]}}))`, also a normal project; open `/`: 1 of 2 items rendered, console `RangeError: Invalid time value at describeAge (projectLibrary.js:95) at render (landing.js:38)`. In `/app/`, click Load...: no dialog, same exception from `renderList (loadDialog.js:30)`.
- Needs hand-edited or foreign storage, so Low. Fix: in `summarize` accept only `0 <= timestamp <= Date.now() + 1 day` (else 0), and wrap the per-entry render in try/catch.

### N3-4 (Low) The landing page does not forward a share link that arrives as a same-tab hash change
- Location: `landing.js:12-15` (forwarding runs once at load; no `hashchange` listener).
- What happens: old-style share links (`https://site/#b=...`) are forwarded to `app/` only when the landing document loads. If the landing page is already open in that tab and the link is pasted into the address bar, the browser does a same-document fragment navigation, nothing runs, and the user stays on the landing page with the hash left in the URL.
- Repro (browser, `t16.js`): open `/`, run `location.hash = '#b=abc'`: URL stays `/#b=abc`. A fresh load of `/#b=abc`, `/?x=1#b=abc`, `/index.html#b=abc` and `/#b=` all forward correctly to `/app/` (`t15.js`).
- Fix: `window.addEventListener('hashchange', forwardIfLink)` using the same check.

### N3-5 (Low, accessibility) Home page "Delete" confirm is silent for screen readers and loses focus
- Location: `landing.js:47-62` (`aria-label` set once to `Delete <name>`; first press only changes the visible text to "Delete for good?"), `:67` (`render()` rebuilds the list).
- What happens: after the first press the accessible name is still "Delete <name>" and nothing is announced, so a screen-reader user does not learn that a second press deletes for good. After the second press the list is rebuilt, the focused button is destroyed and focus drops to `<body>` (`t15.js`: `focus now BODY#`); the "Deleted ..." note is a live region but keyboard users must Tab again from the top.
- Fix: update `aria-label`/announce on the first press, and after deleting move focus to the next item (or the heading).

### N3-6 (Low) Numpad navigation keys with NumLock off pick swatches
- Location: `app/js/shortcuts.js:82` (`/^(?:Digit|Numpad)(\d)$/` on `event.code`).
- What happens: with NumLock off, numpad 1-9 report `key` = End, ArrowDown, PageDown, ... but `code` = `Numpad1`.. so they pick swatches 1-9 (and are `preventDefault`ed, so they no longer scroll or move).
- Repro (browser, `t20.js`): key `ArrowDown` with `code: 'Numpad2'`: colour `#2D5016` -> `#7CB342`; `PageDown`/`Numpad3` -> `#1976D2`.
- Fix: match numpad digits only when `event.key` is a digit (or require `key` to equal the digit when `code` starts with `Numpad`).

### N3-7 (Info) Leaving playtest by Escape from a tray control drops focus to `<body>`
- Location: `app/js/playtest.js:108-148` (tray layer is emptied on leave, `PlaytestTray.setVisible(false)` -> `layer.innerHTML = ''`).
- Repro (browser, `t30.js`): focus a die, Escape: playtest off, `activeElement` is `BODY`. The same happens when the last piece of a kind is sent (`playtestTray.js:165-169` only refocuses a sibling that exists). Move focus to `#playButton` on leave.

### N3-8 (Info) Help overlay and README: Escape is undocumented, and the help overlay lists editing keys that playtest disables
- Location: `shortcuts.js:20-52` (BINDINGS), `shortcuts.js:318-368` (overlay built from all bindings), `allowedInPlaytest` at `:117-119`; `README.md:33-45`.
- `t31.js`: in playtest the overlay still lists Brush, Fill, Line, Eraser, Start markers, Next swatch, Save... although every one of those keys is swallowed. Documentation only; the registry-vs-overlay-vs-README comparison otherwise agrees (every non-`available:false` binding is in all three, `v` is shown as "(not available yet)", the README table matches the registry), see "Checked and fine".

### N3-9 (Info) Reset in the playtest pill has no confirmation and cannot be undone
- Location: `app/js/playtest.js:83-90`, `app/js/play.js:153-159` (`reset` clears `undo`/`redo`/`rolls`).
- One click on "Reset", next to "Back to editing", sends every piece home and discards the move history. The pill (`index.html:261-266`) has no confirm. Info because the game is disposable by design.

---

## 3. Checked and fine

- **Dialogs (browser `t12.js`, `t26.js`)**: Export (all 4 tabs), Share and Load: initial focus inside, 70 Tab + 70 Shift+Tab presses never left (0 of 140 outside, per dialog), Escape closes and returns focus to the opener, `role=dialog aria-modal aria-labelledby` on all four static dialogs, backdrop `role=presentation`. Export tab list: roving `tabindex`, `aria-selected`, ArrowRight/Home/End move and focus tabs, panels `hidden` correctly. PDF generation completes; Escape/Close are inert while `busy` (by design).
- **Collapsible panels (`t13.js`)**: 4 toggles; Enter and Space on a focused toggle fold/unfold (`aria-expanded` and `.collapsed` agree), no tabbable control inside a folded panel (0), Space on a toggle does not start a pan, state persists (`protogames_panels`), hostile stored values (`{"a":1}`, `["players-title","__proto__"]`) are ignored without errors.
- **Board shape picker (`t29.js`)**: Space/Enter/arrows/Escape work, selection returns focus to the trigger, no reopen on key-up.
- **Home page (`t15.js`, `t16.js`)**: root forwarding of `/#b=...` keeps search and hash and goes to `app/` (tested `/#b=abc`, `/?x=1#b=abc`, `/index.html#b=abc`, `/#b=`, `/?//evil.com/#b=x`, `/?%0d%0a#b=x`); `/#B=abc`, `/#saga` and hostile fragments (`%0A%22'%3E%3Cscript%3E`, `a/../../x`) stay on the landing page; the target is always the relative `app/` so it cannot leave the origin; no forwarding loop (the app has no redirect back except the explicit "Back to home" `../`). Project names with markup render as text (`<img src=x onerror=...>` shown literally, `aria-label` safe), 3 entries including an unreadable one listed with links `app/?project=<id>`, the two-step delete works with Enter. Landing text contrast: no failing pair found (below).
- **Playtest game (browser `t5.js`, `t6.js`, `t17.js`, `t21.js`)**: four seats at 1280x800 (all four trays shown, no overlap with zoom/pill), click-to-start, drag tray -> tile, board -> tray, Esc cancels the ghost and stays in playtest, Ctrl+Z / Ctrl+Y step moves, dice roll, two simultaneous touch drags from two trays (2 ghosts, 2 pieces placed, no leftover ghost), one-finger drag on empty board in playtest neither paints nor pans, country board (229 tiles) and infinite board play and show pieces, keyboard piece list (ArrowRight/Up move and announce "moved to column..", Delete returns the piece and focuses the tray piece, 30x ArrowLeft ends with "cannot move that way").
- **Resize during a drag (`t6.js` f)**: resize to 900x700 mid-drag, then release: piece ends on a tile, ghost removed, `drag` state null, no exception.
- **Leaving playtest mid-drag (`t30.js`)**: ghost gone, no painting, `isDrawing` false. **Pointer capture** after tray and board drags: `hasPointerCapture` false.
- **Listener and memory growth (`t10.js`)**: instrumented `addEventListener`/`removeEventListener`; 40 enter/leave cycles plus 8 drags: listener count delta 0 for every target/type; heap 1816 -> 1967 KB after GC, DOM nodes 996 -> 1012 (noise).
- **Names/ids/roles (`t13.js`)**: 0 duplicate ids in the editor, 0 `img` without `alt`, 0 tabbable elements under `aria-hidden`; the only control without a name is the theme-editor "Add" button inside the hidden dialog (its label is set when the editor opens). Tab walks (220 steps editor, 120 playtest) stop only on visible controls, except three 1x1 visually-hidden file inputs (labelled).
- **Contrast (`t18.js`)**: every visible text node with a solid background, app editor, playtest and landing: 0 pairs under 4.5:1 (3:1 for large text). Gradient backgrounds were skipped.
- **Reduced motion**: `styles.css:2747-2750` disables the dice tumble; landing `index.html:126` turns off smooth scroll; the other animations are short transitions.
- **Focus rings**: no `outline: none` in `styles.css`; `button:focus-visible`, inputs, canvas, tabs, picker and load items have rules.
- **Shortcuts**: registry has no conflicts (`findConflicts` pattern checked by code); README table (`README.md:35-46`) matches `BINDINGS` for every key except Esc/Tab behaviour; AltGr never triggers a wrong shortcut (ctrl+alt matches nothing), it only fails to match brackets (L11).
- **Deferred scripts (`t22.js`)**: with `js/main.js` held for 4 s the page is `interactive`, the sidebar is visible but empty/inert (0 swatches, empty board picker), clicks on Export, Playtest, Load and Share do nothing and break nothing; once `main.js` runs everything is wired and no exception is logged. Script order is correct; there are no inline handlers.
- **No-ops in the new code**: `Dice.roll` uses rejection sampling; `Play` undo/redo/reset/sync logic reads correctly; `Pieces` caches are `WeakMap`s keyed by the tile array.

## 4. Not covered

- Safari/Firefox (Space activation on keydown/keyup, `getCoalescedEvents`, pointer capture and click targeting for the Escape-drag case N3-1), real devices (the two-finger click behaviour was shown with CDP touch emulation only; a real OS gesture layer may differ), screen readers (all aria findings are by DOM inspection), real fullscreen.
- Visual layout beyond the geometry numbers (tray rotation correctness on left/right seats was seen in one screenshot at desktop size only; phone layouts only measured, screenshots `s8_*.png` not inspected pixel by pixel).
- Playtest with 8 players sharing one seat, 500 pieces, and very long project names; export/print output content (other areas); share-link payload validation (other area).
- Whether a second tab's `storage` events should drive a UI (product decision for N3-2).
