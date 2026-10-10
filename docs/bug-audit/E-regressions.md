# Area E: regression review of PR #76 (cdf317e..39ead4a)

Method: read the full diff module by module; ran the real app in headless Edge (CDP, own static server on a `git archive` copy of main, nothing touched in the repo); node scripts over every generated board shape; mutation run (50 reverts of the PR's fixes in a copy, whole suite each time). Scripts and logs: `<scratch>/regress/` (`t*.js` browser probes, `sweep.js`, `short.js`, `mutate.js`, `mutation-results.txt`).

Counts: High 0, Medium 4 (E1-E4), Low 6 (E5-E10), Info 4 (E11-E14).

---

## E1 (Medium) Share link of the largest hexagon/circle board the UI allows cannot be opened
- Location: `js/ui.js:149-151` (`MAX_BOARD_RADIUS = 50`, hex/circle width = `radius*2+1`) vs `js/shareLink.js:22,84` (`MAX_DIMENSION = 100` applied to `width`/`height`).
- What happens: the new UI clamp lets radius 50, which sets `width = height = 101`. Share creates a link fine (dialog shows it), but opening it fails with "The board width in the link is out of range." The comment at ui.js:149 claims the caps agree with the link limit; they do not.
- Repro (browser, verified): set Board Radius = 50 on the default hexagon board, Generate, Share, copy the link, load it in a fresh tab -> notification "Could not open the shared link: The board width in the link is out of range." Node: `node <scratch>/regress/sweep.js` reports 48 `LINK REJECT` lines, all `width: 101` (every grid type x hexagon/circle x orientation at radius 50).
- Note: the project-file validator allows 201, so file and link disagree too (`projectFormat.js:25-26`).
- Fix: validate `width/height <= 2*MAX_DIMENSION+1` in `boardConfigFrom` (or cap the UI radius at 49), and keep `ProjectFormat.MAX_BOARD_SPAN`, `ShareLink.MAX_DIMENSION` and the UI caps defined from one constant.

## E2 (Medium) Canvas is now a keyboard trap (Tab swatch cycling + `tabindex=0`)
- Location: `index.html:207` (`<canvas tabindex="0">`), `js/shortcuts.js:243-253` (`isFocusNeutral` = canvas has focus), bindings `swatch-next/prev` on Tab / Shift+Tab (`shortcuts.js:39-40`).
- What happens: Tab and Shift+Tab are claimed (`preventDefault`) whenever the canvas has focus, so once a keyboard user tabs onto the canvas they can never leave it with the keyboard. The PR's stated goal ("keyboard users can reach the controls") is defeated and WCAG 2.1.2 is violated. Escape does nothing there.
- Second half of the same bug: a mouse click on the board does NOT focus the canvas (`interactions.js:458` `pointerdown` `preventDefault`), so after painting with the mouse `document.activeElement` is `BODY`, `focusNeutral()` is false and Tab no longer cycles swatches for mouse users either (before the PR `BODY` counted as neutral). Net: the Tab-cycles-swatches feature now works only for someone who tabbed to the canvas, and those users are then stuck.
- Repro (browser, verified, `t5.js`, `t6.js`): load app, click on the canvas, press Tab -> focus moves to `#focusButton`, colour unchanged. `canvas.focus()`; press Tab x3 -> colour changes each time, focus stays `gameCanvas`; Shift+Tab and Escape also leave focus on the canvas.
- Fix: let Tab leave the canvas (cycle swatches on another key, or only when a modifier/explicit "swatch mode" is on), and call `canvas.focus({preventScroll:true})` in the pointerdown handler if the focus-based rule is kept.

## E3 (Medium) Space is stolen from checkboxes, colour inputs and other non-text controls (pan-with-Space)
- Location: `js/viewControls.js:126-143` (`ownsSpace`, `onKeyDown`).
- What happens: the old `isTypingTarget` treated every `INPUT/TEXTAREA/SELECT/BUTTON/A` as owning Space. The new `ownsSpace` uses `FocusUtils.isTypingTarget` (which deliberately excludes checkbox, radio, file, color, range, button inputs) plus `button:focus-visible, a:focus-visible`. So for a focused checkbox/radio/colour input the document-level handler calls `preventDefault()` and starts a pan: Space can no longer toggle a checkbox or open a colour picker. The handler does not check whether a dialog is open.
- Repro (browser, verified, `t14.js`/`t15.js`): open Print…, focus "Page labels and assembly hints" (`[data-pr=labels]`), press Space: keydown arrives `defaultPrevented === true`, checkbox state does not change. Same for a plain `<input type=checkbox>` appended to the body. Affects all four print checkboxes and the theme editor colour inputs (`.editor-color input`).
- Fix: `ownsSpace` should return true for any `input, textarea, select, button, a, [contenteditable]` target (and for anything inside an open `.modal-backdrop`); only skip the "mouse-clicked button" case.

## E4 (Medium) Tests do not cover the script list: a missing `<script>` tag for a new module breaks the whole app silently
- Location: `index.html:513,517` (`textureUtils.js`, `focusUtils.js`), `tests/indexHtml.test.js`.
- What happens: PR #76 introduced two modules that every other module depends on at load time (`Textures`/`Objects` read `TextureUtils` at module top level; `Shortcuts`/`ViewControls`/`Toolbar`/`Playtest` call `FocusUtils`). Deleting either `<script>` line leaves all 340 tests green (mutation `textureUtils-script`, `focusUtils-script`: fail=0). The index test checks CSP, ids and nesting but not that every `js/*.js` is loaded, nor load order. I verified the current order is correct and no `dev/*.html` page loads `textures.js`/`objects.js` (they only load geometry files), so there is no current bug; this is the missing guard for exactly the class of error the PR's "agents saw only part of the code" risk creates.
- Fix: add a test that every `js/**/*.js` file appears once in `index.html` and that `textureUtils.js` precedes `textures.js`/`objects.js` and `focusUtils.js` precedes `state.js` users.

## E5 (Low) Dynamic dialogs ignore Escape (and lose the Tab trap) once focus is on `<body>`
- Location: `js/fileManager.js:178-200` (`presentModal`), `js/focusUtils.js:48-57` (`trapTab`), `js/focusUtils.js:79` (`layerOpen`).
- What happens: `presentModal` attaches the Escape and Tab handlers to the backdrop element only, so they run only while focus is inside it. Clicking dialog text (non-focusable) moves focus to `<body>`; then Escape does nothing, and because `layerOpen()` is true every other Escape handler (toolbar popover/full screen, playtest) also steps aside, so Escape is dead until a button is focused. The "autosave prompt: Escape takes the safe choice" and the `wrapTarget` "focus is outside the dialog: bring it back" branch are unreachable in that state. Static dialogs (print/share/theme editor) use document-level Escape and are fine.
- Repro (browser, verified, `t18.js`): paint a tile, click Generate Board (confirm dialog), click on the dialog paragraph, press Escape -> dialog stays (1 open backdrop).
- Fix: register the Escape/Tab handlers on `document` for the lifetime of the modal (remove in the returned close function), or give the dialog `tabindex="-1"` and focus it on mousedown.

## E6 (Low) Opening a share link removes the Shortcuts help overlay only by hiding it, leaving a stale `#shortcutHelp` that disables Escape
- Location: `js/shareLink.js:308-312` (`dismissModals`: `if (modal.id) modal.classList.add('hidden')`), `js/shortcuts.js:324` (overlay has `id="shortcutHelp"` and class `modal-backdrop`), `js/focusUtils.js:80` (`layerOpen` matches `#shortcutHelp` even when hidden).
- What happens: the help overlay is a dynamically created backdrop that happens to carry an id, so it is hidden instead of removed. It stays in the DOM, `layerOpen()` stays true forever, Escape no longer leaves playtest / closes popovers / leaves full screen, and the next `?` press "closes" (removes) it instead of opening it.
- Repro (browser, verified, `t3.js`): press `?`, then set `location.hash` to a valid `#b=...` link (as when pasting a link into the address bar): board opens; `document.getElementById('shortcutHelp').className === "modal-backdrop hidden"`, `FocusUtils.layerOpen() === true`; enter playtest, press Escape: still in playtest.
- Fix: in `dismissModals` remove nodes that are not part of index.html (e.g. `if (modal.id === 'shortcutHelp' || !modal.id)`), or make `layerOpen` use `:not(.hidden)` for `#shortcutHelp`; better, call the owners' close functions (`Shortcuts.closeHelp`).

## E7 (Low) Two share links pasted in a row: stacked confirms, second one silently does nothing
- Location: `js/shareLink.js:357-368` (`onHashChange`), `openFromHash` reads `location.hash` at confirm time.
- What happens: each hashchange with painted work opens its own "Replace current board?" dialog; the dialogs are not de-duplicated and neither captures the payload it was opened for. Cancel on the first calls `forgetHash`, clearing the hash that the second dialog needs; confirming the second then runs `openFromHash` with an empty hash and returns false with no message.
- Repro (browser, verified, `t8.js`): with a painted board set `location.hash='#b='+A`, then `'#b='+B`: 2 dialogs; Cancel #1 -> hash `""`, Confirm #2 -> nothing opens, no notification.
- Fix: keep a single pending link (replace the previous dialog), capture the payload when the dialog is opened, show an error when `openFromHash` finds none.

## E8 (Low) ProjectFormat accepts `#rgb` colours but share links reject them
- Location: `js/projectFormat.js:31` (`#rgb|#rrggbb`) vs `js/shareLink.js:26` (`#rrggbb` only); `js/themeManager.js:41-46` expands short hex only for themes.
- What happens: a project/autosave with a 3-digit tile colour (hand-written, or from a theme imported before PR #76, which stored `#abc` unexpanded) loads, but its share link fails to open ("The link has invalid colours"). Also `ThemeManager.init` now expands stored `#abc` theme tiles to `#aabbcc`, so tiles already painted `#abc` in old autosaves no longer match any palette entry (flat, unlabelled).
- Repro: `node <scratch>/regress/short.js` -> "project with #fff: accepted / link rejects: The link has invalid colours."
- Fix: normalise `#rgb` -> `#rrggbb` in `ProjectFormat.parse` (a tiny migration-free normalisation step like `fillBounds`), or make `pack` expand colours.

## E9 (Low) Print: 16 MP cap lowers A1 and A0 sheets for every browser
- Location: `js/print.js:189-193` (`pageDpi`), `plan()` warning.
- What happens: `byArea = sqrt(16.7M / (w*h)) * 25.4` applies to all browsers, not only iOS Safari. A1 (594x841) drops from 200 to ~147 dpi, A0 (841x1189) from 192 to ~104 dpi, with only a non-blocking note "made at about N dpi". Desktop Chrome/Firefox handle far larger canvases (previous limit was 9000 px per side). Behaviour change by design, but it is a user-visible quality regression on the large-format feature the README advertises ("A3-A0").
- Repro: arithmetic from the formula (594*841 = 499,554 mm2 -> 147 dpi; 841*1189 = 999,949 mm2 -> 104 dpi).
- Fix: apply the area cap only when a smaller limit is detected (e.g. try-catch on `getContext`/`toBlob` and retry at lower dpi) or raise `MAX_CANVAS_PX` for non-iOS.

## E10 (Low) New tests that survive the reversal of their own fix (pass vacuously or test only the helper)
Mutation run, fix reverted in a copy, whole suite green (`<scratch>/regress/mutation-results*.txt`):
- `stroke-interp` (`interactions.js` `handlePointerMove` uses `targets` instead of `ToolOps.strokePoints(...)`): survived. Only the pure `strokePoints` is tested (`tests/tools.test.js:374-390`); the wiring, `strokePoint` bookkeeping and coalesced-event use have no test. (Behaviour verified fine in the browser: a 5-move drag painted 11 tiles, one undo step.)
- `playtest-esc` and `layerOpen-help` (Escape layering in `playtest.js:59`, `focusUtils.js:80`, `toolbar.js:76`): survived. The PR's stated Escape coordination is untested, which is how E6 got through.
- `autosave-escape` (Escape in the autosave prompt chooses discard instead of load): survived. Test for the "Escape takes the safe choice" promise is missing.
- `print-dpi` (drop the `byArea` term of `pageDpi`): survived. The 16 MP cap itself is untested; the existing warning test passes via the side limit.
- `print-blob` (remove the `toBlob` null check): survived.
- `board-max` (remove the 100/50 clamp in `readBoardNumber`): survived; no test covers the UI clamp (E1 shows the values were not checked against the link limit either).
- `revoke-delay` (revoke the download URL immediately again): survived (no jsdom, unobservable; Info).
- All other 40 mutations (inflate limit, hash dropped first, envelope check, tile estimate, hex/vertices/bounds/limits validation, escapeAttribute, record-only-if-changed, right click, fill-pending, discardLastStep, remapColors incl. history, setBoardConfig, fromId canonical, export estimate, hasOwnProperty, URL revoke, cleanHex, theme init clean, quota once, newer autosave, startBoard fallback, wrapTarget, neutral focus, editor saving guard, MAX_PER_SEGMENT, build-site skip, CSP meta, blocked storage, link `f` check) are caught by at least one test. Good.

---

## Info

- E11 (Info) Revoking blob URLs while still referenced (item 7): checked in the browser (`t10.js`). Editing a theme with the current colour replaced the brush dot's blob URL, and the new URL loads; `themeschange` re-runs `sync()`. Swatches use `dataUrlFor` (data URL), not blob URLs, so they are unaffected. No stale-URL bug found.
- E12 (Info) `README.md` "images/ (logo and tile-shape illustrations)" still lists tile-shape illustrations; the four `Regular_*.svg` were deleted (no references remain anywhere: grepped js, html, css, docs, dev, showcases).
- E13 (Info) `readBoardNumber` uses `parseInt`, so a number field value of `1e2` (allowed by `type=number`) becomes 1, and the field is rewritten to 1. Rare.
- E14 (Info) `ThemeManager.init` maps every invalid stored hex to `#cccccc` without re-uniquing, so two bad tiles of one theme (or one bad tile and a built-in `#cccccc`) share a tile identity.

## Checked and fine

1. CSP (item 1), verified in real Edge: no violation in console on load, painting, themes with data-URL images, share dialog, print dialog + PDF, PNG/SVG export, showcase `fetch`, preview build. Inline `style` attributes and `element.style` work under `'unsafe-inline'`; blob/data images fine; no `eval`/`new Function`/worker/iframe/`@font-face`/`@import` anywhere; the only script outside `'self'` is the analytics script, which loads and logs its normal warning (`queue.simpleanalyticscdn.com` connect-src covers its beacon). `file://` also works in Edge. The preview build (`previewIndexHtml` + `preview-runtime.js`, an external script, badge via `style.cssText` which is CSSOM) runs under the CSP, with its storage prefix (`preview:pr-1:...`) and no analytics script.
2. ProjectFormat limits (item 2): every generated board of every grid type x board shape x orientation x triangle orientation (480 boards, sizes 1/2/5/50, radius capped 50) parses, including infinite boards (hex/square/triangle) through a real autosave round trip; showcase and all four fixtures parse; max vertices of any tile is 6, far under 64. Only the radius-50 link issue (E1) and the `#rgb` link issue (E8) exist.
3. Share link (item 3): bounded inflate works (mutation caught); hash is dropped before decoding; a bad link at start-up falls back to the autosave prompt or a fresh board (browser verified); infinite-board links round trip with the canonical `fromId`. Remaining issues are E6/E7.
4. FocusUtils/dialogs (item 4): static dialogs (share, print) keep Tab inside, Escape closes and focus returns to the opener (browser verified); help overlay Escape returns focus to the help button; confirm/prompt open with focus on the safe button; Escape order focus mode -> playtest verified; trapTab/restoreFocusOnHide are attached once per dialog (Toolbar.init runs once).
5. Brush interpolation (item 5): `strokePoints` is bounded (`MAX_PER_SEGMENT = 200`, coalesced batches small), no infinite loop or large allocation; step is world units so zoom does not matter; one undo step per stroke, unchanged repeat click leaves no step, right-click does not paint (all browser verified).
6. Lazy topology (item 6): cache is keyed by the `polygons` array identity; the only places that replace the array (`setPolygons`, `Infinite.sync`, `Infinite.restoreSnapshot`) always assign a new array, and nothing mutates the array in place, so no stale graph. Getters are destructured on use.
7. textureUtils (item 7): script order correct in `index.html`; all test loaders include it; no dev page loads `textures.js`/`objects.js`; `TILE_SIZE`/`snowcap` removals have no users.
8. themeManager (item 8): `remapColors` rewrites tiles and every undo step (browser verified: history `[#fff, #abcdef]`, undo does not bring back the old colour); snapshots are copies, so no double application. `cleanHex` expansion is consistent for themes (see E8 for projects/links).
9. print.js (item 9): the only consumers of `warnings` (`printDialog.js`, tests) were updated to `{text, blocking}`; `blocked` replaces both regexes; no other caller.
10. CI (item 10): action versions exist (checked with `gh api`: checkout 7.0.1, setup-node 7.1.0, configure-pages 6.0.0, upload-pages-artifact 5.0.0, deploy-pages 5.0.1, github-script 9.0.0). Job-level concurrency is entered only by jobs that start, so a skipped fork PR no longer cancels a deploy; every run tests main first, so no event can publish an untested main; `pull_request_target` still deploys previews. Side effect (accepted): a red main also blocks publishing PR previews, including the PR that would fix it. `build-site.js` try/catch removes a half-written preview dir and keeps production (mutation caught).
11. Dead code (item 11): grepped every removed export/function/id/class against js, dev, tests, docs, README, showcases, scripts: `updateCanvasMessage`, `autoSaveToggle`, `setAvailablePalettes`, `lastSaveTime`, `availablePalettes`, `.canvas-placeholder`, `.icon-button`, `.action-buttons`, `clearCanvas`, `IDENTITY`, `isSpaceDown`, `createDiamondVertices`, `applyColorToPolygon`, autosaveSlots constants: no remaining references. README links resolve.

## Not covered (needs a real browser or device)

- Firefox / Safari: CSP `'self'` on `file://` (README says "open index.html"; Chromium/Edge verified, Firefox treats `file:` differently), `getCoalescedEvents` absence (code falls back), `DecompressionStream` error path for corrupt links, blob-URL download revoke timing.
- Real touch input: pinch cancelling a fill (`fillPending`), stylus barrel/eraser buttons (`event.button > 0` now ignored), `touch-action`.
- Real fullscreen: Esc handling in `focus-mode` (headless Edge does not enter true fullscreen; only the class path was exercised).
- Screen readers: `aria-modal`, `aria-labelledby` of `presentModal` dialogs, removal of `role=list`/`aria-live` on palette/object grids.
- Visual regressions from the CSS removals and the new focus rings (`.editor-color:focus-within`, `#gameCanvas:focus-visible`).
- GitHub Actions behaviour itself (concurrency cancellation, `deploy-pages` on a cancelled run) could only be reasoned about, not run.
