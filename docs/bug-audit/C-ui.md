# Audit C: interaction, tools and UI logic

Revision: current main (`39ead4a`), read-only. Every finding below was **reproduced in a real browser** (headless Edge driven over the DevTools protocol with trusted mouse, keyboard, wheel and touch input), unless it says "by code". Scripts are in `<scratch>/ui/`.

How to rerun a repro: `node serve.js` (static server on 127.0.0.1:8791, serves the repo read-only), then `node tNN.js` (Node 24, needs Edge at `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`). `cdp.js` is the small CDP helper. Each run starts a fresh Edge profile.

Totals: **0 High, 5 Medium, 11 Low, 4 Info.**

---

## Medium

### C1 (Medium) Undo, redo and the pinch/stroke rollback do not un-paint tiles on an infinite board that were loaded after the snapshot
- Location: `js/state.js:312-322` (`restoreSnapshot`), `js/infinite.js:275-287` (hook only adds *missing* tiles), used by `js/interactions.js:204-216`, `:299-323`.
- What happens: `restoreSnapshot` only touches polygons that have an entry in the snapshot. On an infinite board the tile array grows as you pan (`Infinite.sync`). A tile loaded after step N-1 was recorded has no entry in snapshot N-1. If you paint it (step N), undo goes back to snapshot N-1 and leaves the tile painted, because there is no entry to put it back. Every first paint in a freshly scrolled area is therefore not undoable. The same hole makes `cancelStroke` (second finger lands) fail to roll back a brush stroke that crossed into newly loaded tiles. The leftover tile is then kept and saved by the next autosave.
- Repro: `ui/t3.js`. Choose "Infinite canvas", Generate, pan 3000 px (`AppState.setView`), click one tile with the real mouse, call `Interactions.undo()`. Output:
  ```
  painted tiles 1 history 2 idx 1
  painted tiles after undo (expected 0) 1 idx 0
  ```
- Fix: in `restoreSnapshot` (or the Infinite hook), reset every polygon that has no entry in the snapshot to the blank colour and no object. In a snapshot, absence means "was blank", because painted tiles are never dropped from `polygons`.

### C2 (Medium) "Discard" in the auto-save prompt leaves an empty canvas (no board is ever generated)
- Location: `js/main.js:58-62` (`startBoard` returns after `promptAutosaveRestore`), `js/fileManager.js:227-240` (`handleChoice('discard')` generates nothing).
- What happens: with a restorable autosave, start-up shows the prompt and does not generate a board. Choosing Discard removes the slot and shows "Autosave discarded", but `state.polygons` stays empty. The canvas is blank, zoom and minimap do nothing, Print says "Generate a board first". It only recovers with Generate Board or a window resize.
- Repro: `ui/t2.js` part B. Paint a tile, autosave, reload, click Discard. Output: `B modal present true polys 0`, then `B after discard polys= 0`.
- Fix: on discard call `Interactions.generateBoard(AppState.getState().boardConfig, { skipDirtyFlag: true })`. Or generate the default board before showing the prompt.

### C3 (Medium) The canvas is a keyboard trap (introduced by the H6 fix)
- Location: `js/shortcuts.js:246-269` (`swatch-next/prev`, `when: 'focus-neutral'`), `index.html:207` (`<canvas tabindex="0">`).
- What happens: Tab and Shift+Tab always `preventDefault` and cycle swatches while the canvas has focus. The canvas is in the tab order, so a keyboard user who tabs onto it can never tab off. In the main layout 19 tabbable controls come after the canvas (tool bar, popovers, zoom cluster). The only way out is a mouse click elsewhere. Mouse users cannot focus the canvas, see C4, so the trap hits exactly the keyboard users H6 was meant to help. In playtest the Colors group is blocked, but Tab is still `preventDefault`ed on the canvas, so focus is stuck there too.
- Repro: `ui/t4.js`. Focus the canvas, press Tab four times. Colour changes every time and `document.activeElement` stays `gameCanvas`. Shift+Tab does the same.
- Fix: do not cycle on plain Tab. Cycle swatches with another key (for example `,` and `.`), or only while a canvas "tool" mode is explicitly entered, and give the canvas an Escape-to-leave path.

### C4 (Medium) Painting on the canvas leaves focus in a previously focused input or select, so every shortcut stays dead
- Location: `js/interactions.js:455-458` (`event.preventDefault()` on `pointerdown`).
- What happens: cancelling `pointerdown` suppresses the compatibility `mousedown`, so the browser does not move focus. After using any sidebar `<select>` or number input, clicking and painting on the board leaves that control focused. `Shortcuts.shouldIgnore` then treats it as a typing target. Ctrl+Z, E, B, G, L, 1-9, [ ], zoom keys and the rest all do nothing until the user clicks a non-field element. Typed letters go into the control: in a number field "e" is accepted, in a select a letter jumps to the matching option (for the grid-type select, S or T would change the grid type without a change confirmation).
- Repro: `ui/t10.js`. Focus the Grid-type select, click a tile with the real mouse (it paints), press Ctrl+Z, E, B:
  ```
  after painting: {"active":"gridType","painted":1,"idx":1,...}
  after Ctrl+Z:   {"active":"gridType","painted":1,"idx":1,...}   (undo did nothing)
  after E:        {"active":"gridType",...,"eraser":false}        (eraser not toggled)
  ```
  `ui/t9.js` shows the same for `boardRadius`.
- Fix: in `handlePointerDown`, after the early returns, blur a focused field: `const a = document.activeElement; if (a && a !== canvas && FocusUtils.isTypingTarget(a)) a.blur();`. Or call `canvas.focus({preventScroll: true})`, but only after C3 is fixed.

### C5 (Medium, accessibility) Pan-with-Space swallows Space on checkboxes, colour inputs, file inputs and dialog content
- Location: `js/viewControls.js:127-144` (`ownsSpace`, `onKeyDown`).
- What happens: `ownsSpace` keeps Space for text-like fields and `button:focus-visible, a:focus-visible`. `FocusUtils.isTypingTarget` deliberately returns false for checkbox, radio, range, colour and file inputs (NON_TEXT_INPUTS). `ownsSpace` then does not treat them as buttons either, so `onKeyDown` calls `preventDefault()` and sets `spaceDown`. The four checkboxes in the Print dialog (page labels, crop marks, textures, legend) cannot be toggled with the keyboard. The theme editor's colour inputs cannot be opened with Space, and Space no longer scrolls a dialog. The dialogs are modal, so a pan makes no sense while they are open.
- Repro: `ui/t1b.js`. Open Print, focus the "legend" checkbox, press Space: it does not toggle. Control run with a window-capture `stopImmediatePropagation` for Space: it toggles. Output:
  ```
  with handler: checked= false
  control (ViewControls bypassed): checked= true
  ```
- Fix: in `onKeyDown`, ignore Space when `FocusUtils.layerOpen()`, and treat `input` (any type) and `[role=checkbox|switch|button]` as owning Space. Simplest: only start the pan when `event.target` is `body` or the canvas.

---

## Low

### C6 (Low) Escape and Tab stop working inside a dialog after focus falls to `<body>` (help overlay, file-manager modals)
- Location: `js/shortcuts.js:382-388` (Escape bound on the overlay element only), `js/fileManager.js:190-194` (`presentModal`, Escape bound on the backdrop), `js/focusUtils.js:47-57` (trap bound on the root).
- What happens: a click on non-focusable text inside the dialog moves focus to `body`. Key events no longer reach the dialog element, so Escape and "?" do nothing. Every other layer ignores the key because `FocusUtils.layerOpen()` is true (Toolbar, Playtest, Shortcuts all step aside). Nobody closes the dialog. Tab or Shift+Tab then leaves it: the browser continues from the click point into the page behind the backdrop, and the trap never sees the key.
- Repro: `ui/t1.js` (help overlay) and `ui/t12.js` (a) (`FileManager.confirmReplace`):
  ```
  T2 active after click on text: BODY
  T2 help still open after Escape: true
  T2 after Tab, focus is: A inside overlay: false
  (a) modal still open after Escape: true state pending
  ```
  The print, share and theme-editor dialogs are fine: their Escape handler is on `document`, and `t19.js` shows their trap holds over 45 Tab and 45 Shift+Tab presses.
- Fix: bind Escape and the Tab trap on `document` while the dialog is open (as print and share do), or give `.modal` `tabindex="-1"` and focus it on mousedown so focus stays inside.

### C7 (Low) The last piece of a fast brush stroke is dropped (16 ms throttle, nothing is painted on pointerup)
- Location: `js/interactions.js:511-516` (throttle) and `:547-557` (`handlePointerUp` does not paint).
- What happens: moves arriving less than 16 ms after the last processed one are discarded entirely, including their coalesced events. If the release comes before the next processed move, the tiles between the last processed position and the release point are never painted. The tile you release on stays unpainted.
- Repro: `ui/t11.js` (controlled clock, synthetic pointer events). Row of tiles a, b, c, d. down at a, move to b at +20 ms, move to c at +4 ms, move to d at +3 ms, up at d:
  ```
  "a":"#2D5016","b":"#2D5016","c":"#ffffff","d":"#ffffff"
  ```
- Fix: in `handlePointerUp` (when `isDrawing`), run the same probe step once for the release position with no throttle, then `endStroke()`. Also reset `lastMoveTimestamp` on pointerdown.

### C8 (Low) A stroke is not tied to its pointer, and nothing ends it when the release is lost
- Location: `js/interactions.js:455-557` (no `pointerId` or `event.buttons` checks; no `blur` or `lostpointercapture` handling).
- What happens:
  1. A stray second pointer ends the first one's stroke. A pen stroke is cut and the touch paints at its own position: pen down and move, touch down and up elsewhere (touch is not a "gesture" with a single finger), pen continues: nothing more is painted. `ui/t25.js`: `drawing=false hist=2`, tiles after the touch stay `#ffffff`.
  2. When the `pointerup` is lost (window blur mid-drag, macOS Ctrl+click context menu), `isDrawing` stays true. Later `pointermove` events with `buttons=0` keep painting. `ui/t29.js`: `{"drawing":true,"painted":"#####......"}` after moves with no button pressed.
  Real browsers usually send `pointercancel` or `pointerleave`, which cover most cases, so this is Low.
- Fix: remember `pointerId` at pointerdown and ignore other pointers. In `handlePointerMove` end the stroke when `event.pointerType === 'mouse' && event.buttons === 0`. Add a `window` `blur` handler that calls `handlePointerCancel`.

### C9 (Low) Any window `resize` (and entering or leaving playtest or focus mode) resets zoom and pan
- Location: `js/main.js:8-15` (debounced regenerate) → `js/interactions.js:612-640` → `AppState.setPolygons` resets the view (`js/state.js:88-94`). `js/playtest.js:49` and `js/toolbar.js:242` both dispatch a synthetic `resize`.
- What happens: zoom in and pan, then toggle playtest, or resize the window (or the mobile viewport changes when the on-screen keyboard or URL bar appears): the view jumps back to "fit", even when the canvas size did not change. The playtest comment promises that pan and zoom "keep working".
- Repro: `ui/t2.js` part A: `view before {"scale":1.5625,"x":-274.2,...}`, `view after playtest on {"scale":1,"x":0,"y":0}`. `ui/t7.js`: a plain `resize` event gives the same.
- Fix: in `generateBoard` with `preserveColors`/`preserveHistory` (the resize path), keep the previous view when the canvas size did not change. Or only regenerate when `Renderer.resizeCanvas().changed`.

### C10 (Low) Spurious "no change" undo steps still exist (siblings of M9)
- Location: `js/interactions.js:218-229` (`handleClearBoard`, no change check), `:182-184` (`applyToolToPolygon` compares colours case-sensitively).
- What happens:
  a. Clear on an already blank board still records a history step, marks dirty and autosaves. `ui/t23.js` ends with `"clear again (blank): hist 9->10 idx 9"`.
  b. Built-in palette hex values are upper case (`#7CB342`), but share links pack colours in lower case (`js/shareLink.js:42`), and any board that carries a lower-case colour is affected. Painting with the colour a tile already shows then counts as "changed": the tile's string is rewritten and a history step is pushed. `ui/t24.js`: tile `#2d5016`, current `#2D5016`, one click gives `hist 2 -> 3` with the tile visually unchanged. Fill, line and the eraser use `ToolOps.wouldChange`, which normalises case, so only the brush is affected.
  c. `hasUserWork()` (`js/fileManager.js:43`) also compares case-sensitively with `Config.DEFAULT_TILE_COLOR`, so a board holding `#FFFFFF` counts as having work.
- Fix: compare with `String(a).toLowerCase()` in `applyToolToPolygon` and `hasUserWork`. In `handleClearBoard` skip when no tile has a colour other than blank or an object.

### C11 (Low) Taking back a fill on pinch (`discardLastStep`) throws away the redo branch and, at the limit, the oldest undo step
- Location: `js/interactions.js:301-311`, `js/state.js:288-305` and `:357-362`.
- What happens: `applyFill` → `recordHistory` already truncated the redo branch and (at 50 steps) shifted the oldest snapshot out. Discarding the fill afterwards cannot put them back. Edit twice, undo once (redo available), fill, then a second finger lands: the fill is gone, but redo is gone too.
- Repro: `ui/t30.js`: `after 2 edits and 1 undo ... {"len":3,"idx":1} canRedo true` → `after fill cancelled by 2nd finger: {"len":2,"idx":1} canRedo false`.
- Fix: keep the removed tail in a local (`{ redoTail, droppedOldest }`) and restore it in `cancelStroke`, or defer `recordHistory` for fills until the first pointermove or the pointerup.

### C12 (Low) `[` and `]` (brush size) cannot be typed on AltGr layouts
- Location: `js/shortcuts.js:92-101` (`matchesCombo`).
- What happens: on Windows, AltGr reports `ctrlKey` and `altKey`. `matchesCombo` requires `ctrlKey === combo.mod` and `altKey === combo.alt`, so AltGr+key never matches. On Czech and German layouts `[` and `]` need AltGr, so the shortcut only fires through the physical key (`BracketLeft`, which is "ú" or "ü"). Digit shortcuts match by `event.code` only, so on Czech, German and French layouts, where the number row is the symbol row, the digits are typed with Shift but the shortcut fires on the unshifted physical key (and `shift+1` does nothing).
- Repro: `ui/t21.js`, row `AltGr+[ (ctrl+alt)`: brush size stays 3. Plain `]` raises it.
- Fix: treat `event.getModifierState('AltGraph')` as "no modifiers" (`ctrl`/`alt` ignored when it is true).

### C13 (Low) `readBoardNumber` reads exponent notation wrongly
- Location: `js/ui.js:154-159` (`parseInt(input.value, 10)`).
- What happens: `<input type="number">` accepts `1e2` and `1.5e1` as valid numbers (100 and 15), but `parseInt` reads only the leading digits. The field value is then rewritten to `1`. Empty input uses the default but the field stays empty (the comment says "the field shows the value used").
- Repro: `ui/t26.js`: `"1e2" -> radius 1 ... field now "1"`, `"1.5e1" -> radius 1`, `"" -> radius 5 ... field now ""`. Other values clamp correctly: `-3` and `0` give 1, `9999` gives 50.
- Fix: `Math.trunc(Number(input.value))` (or `input.valueAsNumber`) before the finite check; write the default back when the field is empty.

### C14 (Low) One Escape can close two stacked dialogs
- Location: `js/printDialog.js:202`, `js/shareLink.js:378-380`, `js/themeEditor.js:43` (document-level Escape handlers that ignore `event.defaultPrevented`), against `js/fileManager.js:190-194` (modal `preventDefault`).
- What happens: if a file-manager modal opens on top of one of the static dialogs, one Escape closes both: the modal calls `preventDefault`, but the print, share and theme-editor listeners still run. Reachable when a share link arrives (hashchange → `confirmReplace`) while the Print dialog is open.
- Repro: `ui/t12.js` (c): `PrintDialog.open(); FileManager.confirmReplace(...)`, one Escape → `print open false confirm open false`.
- Fix: those three handlers should `return` when `event.defaultPrevented` (the modal already marks the key), or stop propagation in `presentModal`.

### C15 (Low) The theme editor discards all edits on a backdrop click or Escape
- Location: `js/themeEditor.js:42-43` and `:150-159`. By code.
- What happens: one stray click on the dark area or Escape closes the editor with no confirmation. For a theme with several uploaded images this loses everything typed.
- Fix: ask before closing when the editor has changes, or ignore backdrop clicks.

### C16 (Low) The UI maximum board size cannot be autosaved
- Location: `js/ui.js:150-151` (limits 100 / 50) vs `js/fileManager.js:119-136`.
- What happens: browser storage (about 5 million characters) fits roughly 15,000 tiles. A circle outline with a triangle grid and radius 50 is 18,120 tiles. `ui/t20.js`: the slot kept the previous board's 4,998,772 characters (the new save was refused, `isDirty=true`). The save is attempted, and fails after serialising about 5 MB, after every stroke; the user sees one notification. A reload then offers the stale previous board.
- Fix: lower the size caps so autosave fits, or do not serialise vertices (they are regenerated from the config), or clear the slot when a save fails.

---

## Info

- **C17**: the canvas is not devicePixelRatio-aware (`js/renderer.js:44-55`, size is CSS pixels), so boards are soft on HiDPI screens and exports are CSS-pixel sized. Pointer maths is correct (`getCanvasCoordinates` and `toCanvas` use the real scale, checked with a canvas 649 px tall in a 560 px box).
- **C18**: the canvas size is only re-measured on a window `resize`, not when its container changes size (no ResizeObserver). In my headless run an element injected after load (not from this app) left the bitmap 649 px tall in a 560 px box until a resize event. Real layouts rarely trigger this.
- **C19**: Ctrl+S is claimed by the app only outside text fields. In the "Enter a project name" prompt itself (a text field) it falls through to the browser's Save Page dialog (`shouldIgnore` by code).
- **C20**: `[` and `]` change the hidden brush size while Fill or Line is active (the stepper row is hidden), yet the toast says "Brush size N" (`js/shortcuts.js:221-222`, `js/interactions.js:430-435`).

---

## Checked and fine

- **Pointer paths (real mouse, 14 checks):** left-only painting; right click (no paint, no history, menu untouched); middle-button pan; Space+drag pan; drag out of the canvas with the button held (stroke ends, history recorded); line tool released outside the canvas (captured, commits); Escape during a line (cancels, release does nothing); eraser and object-toggle strokes; brush size 3; fill; line.
- **Touch (CDP touch events, 8 checks):** one finger paints; a second finger rolls the brush stroke back; a fill is undone on pinch (`discardLastStep`, apart from C11); a line is cancelled; the remaining finger cannot paint after the gesture; pinch zoom works.
- **Undo/redo consistency on fixed boards:** 9 operations (brush, brush size 3, fill, line, eraser, object place and remove, clear twice), undo all the way and redo all the way: every state matches (`ui/t23.js`). Infinite boards fail (C1).
- **Numeric limits:** 15 shape × grid combinations at minimum and 15 at maximum sizes: no exception, 1-tile and 2-tile boards work for paint, fill, brush 7, zoom in/out/fit/actual size, undo/redo (`ui/t13.js`). Largest board is 18,120 tiles, generated in about 160 ms. 0-tile board (after C2): clicks, hover, shortcuts, print, share and PNG export all safe (`ui/t27.js`).
- **View maths:** wheel zoom clamps at 24x and 0.25x, `ctrl`+wheel works, the point under the cursor stays fixed once the CSS scaling of the canvas is taken into account.
- **Shortcut registry, 27 key presses with real keyboard events:** tool keys, `[`/`]`, 1-9, `+`, `=`, `-`, numpad `+`, `0`, `?`, Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z, Shift+digit (no match), Tab without canvas focus (moves focus). All as documented, apart from C3 and C12.
- **Escape layering:** print dialog first then playtest (two Escapes) works; popover and focus mode ordering is correct by registration order (Toolbar before Playtest on `document` capture); the help overlay with focus inside closes on Escape and "?".
- **Dialog focus:** Print and Share trap Tab and Shift+Tab (45 presses each, never left) and restore focus to the opener on close.
- **Leaks:** 100 generate + fill + resize cycles on a 10,000-tile board: heap back to 7 MB after GC (3 MB baseline), history length stays correct (`ui/t28.js`). Listeners are attached once (init functions run once; delegation for swatches and objects).
- **Stuck state:** no stuck drawing flag, line state, `panning` or `pan-ready` class found after lost releases outside the canvas, Escape, or pinch (apart from C8).

## Not covered (needs more than I had)

- Safari and Firefox: especially whether `preventDefault` on keydown cancels the Space activation of buttons and checkboxes (C5 was shown only in Chromium), and the `pointerleave` / `pointercancel` ordering for touch.
- Real devices: touch with a real OS gesture layer, pen pressure and barrel buttons, palm rejection, iOS pinch conflicts, on-screen keyboard resizing (C9 is by the resize event, not a real keyboard).
- macOS Ctrl+click and the context menu (C8 case 2 is shown with a synthetic lost `pointerup`).
- Fullscreen API (focus mode): headless Edge denies it, so only the CSS/class path and the Escape logic were reviewed.
- Screen readers; the file chooser dialogs; clipboard (Share copy); PDF and PNG output; print preview rendering.
- Drag-resizing the window mid-stroke (reasoned only: `strokePoint` holds old world coordinates, which may paint a streak on the next move).
- `ThemeManager` / `ThemeEditor` save logic (outside this area's listed scope).
