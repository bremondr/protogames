# Changes to feedback-kit

Each version is released as the tag `feedback-kit-vX.Y.Z`. A new major version (the first number) means a project using the kit may need changes; the notes say which.

## 1.0.1 (2026-11-22)

- The panel no longer shows an empty canvas next to "Making the picture…" while the picture is being made.
- `embedFonts` keeps `@font-face` rules that have no `unicode-range`, as a stylesheet for self-hosted fonts often has. Before, it dropped them, and the picture fell back to another font without saying so.

## 1.0.0 (2026-11-21)

- First release, taken from Ultimate Playbook.
- `createFeedback`: a panel with a picture to draw on (four pen colours, Undo, Clear), kept on the clipboard, with Share and Save, and a link to a new GitHub issue filled in with what was on screen and the device.
- `svgPicture` and `embedFonts`: a picture of an SVG as it looks now, with web fonts inlined.
- `createSketch`: drawing on a picture with a finger, the Apple Pencil or the mouse.
- `issueUrl`: the new-issue address, kept under GitHub's length limit.
