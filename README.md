# Protogames

A browser-based drawing tool for tabletop board prototyping with multiple grid types, themed palettes, and a dedicated eraser.

## Overview
Protogames lets designers sketch and iterate on board layouts quickly—no build step, just open the page and paint tiles. Boards can be saved/loaded as JSON and exported to image/vector formats.

**Target Users:** Board game designers and prototypers  
**Platform:** Web (static hosting friendly)  
**Status:** MVP development

## Key Features
- Grid types: Hexagon, Square, Triangle
- Building a board: pick the **tile shape** first, then the **board shape** from a list with a small picture of every layout (the pictures are the real generator, drawn for your tile shape, orientation and centre, with each layer from the centre in its own colour). Hexagon and circle boards are built outwards from a centre that is **a tile or a point between tiles**, for every tile shape, and the size is the number of layers from the centre (layer 1 is the centre). Triangles and hexagons choose their orientation (point up or down, pointy- or flat-top)
- Board outlines: Rectangle (a square when width and height are equal), Hexagon, Triangle, Circle, an **Infinite canvas** (prototype): an endless hex / square / triangle lattice that you pan across; only drawn tiles are saved and shared, and **Country**: a board cut to the outline of a real country (Natural Earth 1:50m, shipped in `data/`), with a choice of tiles across and which islands to include, also for multi-country regions (Scandinavia, Balkans, European Union and more) with the borders between the countries highlighted
- Painting: one drawing tool with a Brush / Fill / Line switch (and brush size, theme and colours) in its settings popover; the eraser has its own size; objects are placed one per click, ignoring the draw mode and size
- Fill and line tools: flood-fill a connected region in one click, or drag from tile A to tile B to paint a gap-free tile path (works on hexagon, square and triangle grids; each is a single undo step; they apply to colours only)
- Palettes: Switchable themed color palettes (e.g., Landscape, Simple nordic, Space) with labeled swatches; item sets to match (Medieval, Simple nordic, Space)
- Projects: every board is a named project kept in the browser and autosaved as you work. The home page lists them (open, delete); a new project asks for a name; share links, project files and the showcase map open as new projects instead of replacing the one you are working on
- History: Undo/redo
- File ops: Save/load JSON projects; export PNG and SVG (SVG is a flat-colour outline of the tiles: no textures or objects)
- Print: **Print…** makes a PDF at a real-world tile size (in mm): split across A4 / Letter / A3 home-printer pages with overlap, page labels and assembly hints, or one large sheet (fit to board, A3–A0) with crop marks; objects on the board, as cut-out tokens, or both; optional legend of the terrains and objects used; a live preview shows how the board sits on the paper. Settings are remembered per browser.
- Sharing: **Share Link** puts the whole board in the address (nothing is uploaded); whoever opens it gets their own copy
- Playtest: the play button locks editing so the board can be played on; pan and zoom keep working, **Esc** or the pill returns to editing. With **players** defined (a colour, a seat at one screen edge and a set of pieces each) and **start markers** painted on the map, every player gets a tray at their seat, turned to face outwards: click a piece to send it to a free start, drag it anywhere, roll the design's dice (d3 to d20) from the tray, undo moves, reset the game. Several people can move pieces at once on a touch screen. See [docs/PLAYTEST.md](docs/PLAYTEST.md)
- Layout: the tools sit in a column at the right edge, under the full screen and playtest buttons; their settings open to the left
- Input: Mouse, touch, stylus; responsive layout
- View: a button in the zoom cluster switches between textured tiles and plain colours (remembered; PNG export follows it and the Print dialog starts from it; SVG export always draws flat colours without textures or objects)
- Navigation: wheel/pinch zoom at the pointer, pan, fit-to-screen and actual-size buttons, and an optional minimap for large boards (exports are always independent of the current zoom and pan)

## Keyboard shortcuts
Press **?** (or use the keyboard button in the bottom-right corner) for the full list. On macOS use Cmd instead of Ctrl. Shortcuts are paused while you type in a field or a dialog is open.

| Action | Key |
|---|---|
| Undo / Redo | Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y |
| Brush / Fill / Line | B / G / L |
| Eraser on/off | E |
| Start markers on/off | M |
| Smaller / larger brush or eraser (1-7) | [ / ] |
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

The cluster in the bottom-right corner has zoom out / in, the zoom level (click it for **actual size**, where a typical tile is 64 px wide), **fit to screen**, and a **minimap** toggle. The minimap shows the whole board with the visible area outlined; click or drag on it to move the view. Zoom is clamped between 25% of the fitted size and 24x, and the board can never be panned completely out of sight.

## Deployment and previews
`main` is published as the production site (landing page at the root, the editor at `/app/`); every open pull request from this repository is published as a preview under `/preview/pr-<number>/` (editor at `/preview/pr-<number>/app/`), with its own saved data and a badge, and the link is commented on the pull request. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Project Structure
File paths such as `js/shortcuts.js` in this README and in `docs/` are relative to `app/`, where the editor lives.

```
protogames/
├─ index.html            (landing page; landing.js forwards old share links to the app)
├─ landing.js
├─ package.json
├─ app/                  (the editor: open or serve this folder)
│  ├─ index.html
│  ├─ styles.css
│  ├─ js/
│  │  ├─ config.js          (constants, palettes, defaults)
│  │  ├─ state.js           (application state, undo/redo)
│  │  ├─ geometry/          (helpers.js, hex.js, triangle.js, square.js, neighbors.js) + geometry.js (aggregator)
│  │  ├─ viewMath.js        (pure zoom/pan maths)
│  │  ├─ viewControls.js    (zoom, pan, fit, minimap, texture toggle)
│  │  ├─ renderer.js
│  │  ├─ textureUtils.js    (colour helpers and blob-URL cache shared by textures and objects)
│  │  ├─ textures.js        (procedural tile textures)
│  │  ├─ objects.js         (placeable map objects)
│  │  ├─ interactions.js
│  │  ├─ toolOps.js         (fill and line tool logic)
│  │  ├─ toolbar.js         (the tool column and its settings popovers)
│  │  ├─ shortcuts.js       (keyboard bindings)
│  │  ├─ projectFormat.js   (project file format: versions, migrations, validation)
│  │  ├─ projectLibrary.js  (the projects kept in the browser; the home page uses it too)
│  │  ├─ fileManager.js     (save/load files, autosave, opening projects)
│  │  ├─ shareLink.js       (share links: board in the address hash)
│  │  ├─ playtest.js        (locks editing, runs the game)
│  │  ├─ playtestTray.js    (player trays and dice)
│  │  ├─ playtestDrag.js    (moving pieces by pointer and keyboard)
│  │  ├─ playersPanel.js    (the Players panel)
│  │  ├─ players.js         (player list helpers)
│  │  ├─ play.js            (game state: pieces, moves, rolls)
│  │  ├─ pieces.js          (drawing and hit-testing of pieces)
│  │  ├─ dice.js            (dice rolling)
│  │  ├─ infinite.js        (infinite canvas board shape)
│  │  ├─ countryBoard.js    (country board shape, cut to a real outline)
│  │  ├─ countryRegions.js  (multi-country regions and their borders)
│  │  ├─ themeManager.js    (custom tile themes and item sets)
│  │  ├─ themeEditor.js     (theme editor dialog)
│  │  ├─ print.js           (print layout at real-world scale + PDF writer)
│  │  ├─ printDialog.js     (the Print… dialog)
│  │  ├─ exporter.js        (PNG and SVG export)
│  │  ├─ ui.js
│  │  ├─ utils.js
│  │  └─ main.js
│  ├─ showcases/         (example .protogames.json projects)
│  ├─ images/            (logo and tile-shape illustrations)
│  └─ data/              (countries-50m.json: outlines for the Country shape)
├─ tests/                (node:test suites, fixtures/ of old file formats, support/load.js)
├─ dev/                  (geometry-gallery.html, geometry-checks.js)
├─ scripts/              (build-site.js: assembles production + previews for Pages)
├─ .github/workflows/    (test.yml, pages.yml)
└─ docs/
   ├─ SPECIFICATION.md   (file, autosave and share-link formats)
   ├─ DEPLOYMENT.md
   ├─ TILE_GENERATION_EXPLANATION.md
   └─ Protogames - Development Specification Document.md  (original PRD, historical)
```

## Notable Recent Changes
- Geometry split into submodules (hex/triangle/square helpers + aggregator)
- Concentric triangle-based hex generation refinements
- Themed palette system with selector; palettes defined in `config.js`
- Dedicated eraser tool (separate button) that clears tiles to the default color
- Autosave/load preserves palette and eraser state

## Usage
1. Open `app/index.html` in a modern browser (or serve the repository, for example `python -m http.server`, and open `/` for the landing page or `/app/` for the editor).
2. Choose board shape, grid type, and parameters in the sidebar; click **Generate Board**.
3. Pick a palette theme, select a color (or click **Eraser**), then click or drag on tiles. Switch the tool to **Fill** to repaint a whole connected region of one colour, or **Line** to drag out a straight path of tiles (Esc cancels a line in progress).
4. Save projects as `.protogames.json`; export PNG/SVG, or print a PDF at real-world scale, as needed.

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

The geometry tests (`tests/geometry.test.js`, `tests/neighbors.test.js`) cover every fixed board shape (hexagon, square, rectangle, triangle, circle; the infinite canvas is tested in `tests/infinite.test.js`) x tile shape x orientation combination: expected tile counts, no duplicate or overlapping tiles, correct bounds, centring inside the drawable area, hit-testing and tile adjacency (symmetric, correct neighbour counts). Every fixed shape bug has a regression test. When you fix a geometry bug, add a case there.

### Geometry gallery
`dev/geometry-gallery.html` renders every combination as a thumbnail, runs the same checks as the tests, and marks failing combinations in red and unsupported ones as dashed "invalid" cards with the reason. Serve the repository root with any static server and open the page:
```
python -m http.server 8000 --bind 127.0.0.1
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
Active development. Last updated: October 2026.
