# Changes to feedback-kit

Each version is released as the tag `feedback-kit-vX.Y.Z`. A new major version (the first number) means a project using the kit may need changes; the notes say which.

## 2.0.0 (2026-11-22)

The picture is now the whole page, taken at the tap, and the app's own picture becomes a switch in the panel.

- **New `pagePicture(element, options)`** in the new file `page.js`: a picture of the whole page (or one element), redrawn from what is on screen, in every browser, with no prompt. `area: 'screen'` (default) or `'full'` for the whole scrollable page. It keeps typed values, scroll positions, fixed and sticky parts, canvases and `::before`/`::after`. Elements with `data-fk-skip` are left out.
- **The panel opens with the whole page.** A new `page` option is passed to `pagePicture` (`area`, `fonts`, `element`, `maxSize`, `background`).
- **The person's own screenshot**: "Use my screenshot…" in the panel, or pasting (Ctrl+V, ⌘V) or dropping an image on it, makes it the picture to draw on. Works in every browser; on the iPad the button offers Photos.
- **A real screen capture on desktop browsers**: `screenPicture()` and `canCaptureScreen()` in `page.js`, and a new `capture` option: `'button'` (default; **Take a real screenshot** in the panel), `'tap'` (the browser asks at the tap) or `'off'`. The panel is hidden while capturing; if the person says no, or there is no capture (iPad, phones), the picture is the redrawn page.
- On desktop, the issue's "On screen" table has a **Window** row: the window's size and the screen's.
- **`picture` is now optional, and a switch.** The app's own picture is offered as a button in the panel, labelled with the new `pictureLabel` option (default "Just this part"). If the whole page can't be drawn, the panel shows this picture instead.
- The panel no longer shows **Share…** in browsers that can't share the picture: the kit's own display rules beat the `hidden` attribute there.
- The picture no longer moves when the message under it changes length.

**What to change in a project:**
- Add `page.js` to the service worker's list of files, if there is one.
- Pass the web fonts the page uses as `page: {fonts}` (the same `embedFonts(...)` as for `svgPicture`), and choose `area`.
- Keep `picture` if the app's own part is still useful, and set `pictureLabel` to say what it is, for example "Just the field". Or remove it.
- Give `data-fk-skip` to anything that shouldn't be in the picture.
- Choose `capture` (`'button'` is the default, so nothing changes until someone taps it).
- Open the panel on each kind of page and check that the whole page looks right.

## 1.0.1 (2026-11-22)

- The panel no longer shows an empty canvas next to "Making the picture…" while the picture is being made.
- `embedFonts` keeps `@font-face` rules that have no `unicode-range`, as a stylesheet for self-hosted fonts often has. Before, it dropped them, and the picture fell back to another font without saying so.

## 1.0.0 (2026-11-21)

- First release, taken from Ultimate Playbook.
- `createFeedback`: a panel with a picture to draw on (four pen colours, Undo, Clear), kept on the clipboard, with Share and Save, and a link to a new GitHub issue filled in with what was on screen and the device.
- `svgPicture` and `embedFonts`: a picture of an SVG as it looks now, with web fonts inlined.
- `createSketch`: drawing on a picture with a finger, the Apple Pencil or the mouse.
- `issueUrl`: the new-issue address, kept under GitHub's length limit.
