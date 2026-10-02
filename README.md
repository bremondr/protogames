# Protogames

A browser-based drawing tool for tabletop board prototyping with multiple grid types, themed palettes, and a dedicated eraser.

## Overview
Protogames lets designers sketch and iterate on board layouts quickly—no build step, just open the page and paint tiles. Boards can be saved/loaded as JSON and exported to image/vector formats.

**Target Users:** Board game designers and prototypers  
**Platform:** Web (static hosting friendly)  
**Status:** MVP development

## Key Features
- Grid types: Hexagon, Square, Triangle, Orthogonal Square
- Board outlines: Square, Rectangle, Hexagon, Triangle, Circle
- Painting: Click or brush-drag to color tiles; eraser button resets tiles to the default color
- Fill and line tools: flood-fill a connected region in one click, or drag from tile A to tile B to paint a gap-free tile path (works on hexagon, square and triangle grids; each is a single undo step and respects the eraser and object tools)
- Palettes: Switchable themed color palettes (e.g., Landscape, Space) with labeled swatches
- History: Undo/redo, autosave to localStorage
- File ops: Save/load JSON projects; export PNG/PDF/SVG
- Input: Mouse, touch, stylus; responsive layout
- Navigation: wheel/pinch zoom at the pointer, pan, fit-to-screen and actual-size buttons, and an optional minimap for large boards (exports are always independent of the current zoom)

## Keyboard shortcuts
Press **?** (or use the keyboard button in the bottom-right corner) for the full list. On macOS use Cmd instead of Ctrl. Shortcuts are paused while you type in a field or a dialog is open.

| Action | Key |
|---|---|
| Undo / Redo | Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y |
| Brush / Fill / Line | B / G / L |
| Eraser on/off | E |
| Smaller / larger brush (1-7) | [ / ] |
| Pick swatch | 1 - 9, or Tab / Shift+Tab to cycle |
| Zoom in / out / fit | + / - / 0 |
| Pan | Space + drag |
| Save project | Ctrl+S (only this key is taken over from the browser) |
| Show shortcuts | ? |

`V` is reserved for the Select tool, which does not exist yet.

## Navigating large boards
Painting and navigating never share a gesture, so you cannot pan by accident while painting:

| Input | Paint | Navigate |
|---|---|---|
| Mouse | click / drag | wheel = zoom at the pointer; **Space + drag** or **middle-button drag** = pan |
| Touch | one finger | **two fingers**: drag to pan, pinch to zoom (a stroke in progress is undone when the second finger lands; the finger left behind does not paint until you lift it) |
| Stylus | pen | wheel, Space + drag, or the on-screen controls |

The cluster in the bottom-right corner (top-left on phones) has zoom out / in, the zoom level (click it for **actual size**, where a typical tile is 64 px wide), **fit to screen**, and a **minimap** toggle. The minimap shows the whole board with the visible area outlined; click or drag on it to move the view. Zoom is clamped between 25% of the fitted size and 24x, and the board can never be panned completely out of sight.

## Project Structure
```
protogames/
├─ index.html
├─ styles.css
├─ js/
│  ├─ config.js
│  ├─ state.js
│  ├─ geometry/          (helpers.js, hex.js, triangle.js, square.js) + geometry.js (aggregator)
│  ├─ renderer.js
│  ├─ interactions.js
│  ├─ fileManager.js
│  ├─ exporter.js
│  ├─ ui.js
│  ├─ utils.js
│  └─ main.js
└─ docs/
   └─ SPECIFICATION.md
```

## Notable Recent Changes
- Geometry split into submodules (hex/triangle/square helpers + aggregator)
- Concentric triangle-based hex generation refinements
- Themed palette system with selector; palettes defined in `config.js`
- Dedicated eraser tool (separate button) that clears tiles to the default color
- Autosave/load preserves palette and eraser state

## Usage
1. Open `index.html` in a modern browser.
2. Choose board shape, grid type, and parameters in the sidebar; click **Generate Board**.
3. Pick a palette theme, select a color (or click **Eraser**), then click or drag on tiles. Switch the tool to **Fill** to repaint a whole connected region of one colour, or **Line** to drag out a straight path of tiles (Esc cancels a line in progress).
4. Save projects as `.protogames.json`; export PNG/PDF/SVG as needed.

## Development Notes
- Stack: Vanilla JS + HTML5 Canvas; no build tooling required.
- Modules use IIFEs; configuration lives in `config.js`.
- Defaults: `DEFAULT_TILE_COLOR` defines the blank/erased color; palettes are declared in `COLOR_PALETTES`.

## Development
The app itself needs no tooling. The tests need [Node.js](https://nodejs.org) 22 or newer (no dependencies to install).

### Unit tests
```
npm test
```
Runs the Node test runner over `tests/**/*.test.js`. The app's browser scripts are plain IIFE files, so `tests/support/load.js` evaluates them in an isolated `vm` context instead of needing a bundler or a DOM.

The geometry tests (`tests/geometry.test.js`, `tests/neighbors.test.js`) cover every board shape x tile shape x orientation combination: expected tile counts, no duplicate or overlapping tiles, correct bounds, centring inside the drawable area, hit-testing and tile adjacency (symmetric, correct neighbour counts). Every fixed shape bug has a regression test. When you fix a geometry bug, add a case there.

### Geometry gallery
`dev/geometry-gallery.html` renders every combination as a thumbnail, runs the same checks as the tests, and marks failing combinations in red and unsupported ones as dashed "invalid" cards with the reason. Serve the repository root with any static server and open the page:
```
python -m http.server 8000
# then visit http://localhost:8000/dev/geometry-gallery.html
```
Optional query parameters change the sizes, e.g. `?radius=5&size=8&width=10&height=6`.

### Adding a keyboard shortcut
All shortcuts live in `BINDINGS` in `js/shortcuts.js` (id, label, group, keys). Add the binding there, add its action to `ACTIONS` further down the same file, and mark any button that triggers it with `data-shortcut="<id>"` so its tooltip shows the key. `tests/shortcuts.test.js` fails if two bindings use the same key.

### Continuous integration
`.github/workflows/test.yml` runs `npm test` on every push to `main` and on every pull request, so a failing geometry test fails the check.

## Roadmap (near-term)
- Further polish of triangle-hex tessellation and palette/eraser UX
- Additional palette themes
- Improved visual feedback

## Status
Active development — MVP. Last updated: November 2025.
