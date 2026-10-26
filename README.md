# Protogames

A browser-based drawing tool for tabletop board prototyping: hexagon, square and triangle tiles, boards from simple shapes to real countries, themed palettes and objects, a playtest mode, and export to PNG, SVG, a print-ready PDF or a share link. Try it at [protogames.eu](https://protogames.eu/).

## Overview
Protogames lets designers sketch and iterate on board layouts quickly—no build step, just open the page and paint tiles. Boards are saved in the browser as projects, can be saved/loaded as JSON files, shared as a link, and exported to image/vector formats or a PDF at real-world scale.

**Target Users:** Board game designers and prototypers  
**Platform:** Web (static hosting friendly)  
**Status:** Active development (see [Status](#status))

## Key Features
- Tile shapes: Hexagon, Square, Triangle
- Building a board: pick the **tile shape** first, then the **board shape** from a list with a small picture of every layout (the pictures are the real generator, drawn for your tile shape, orientation and centre, with each layer from the centre in its own colour). Hexagon and circle boards are built outwards from a centre that is **a tile or a point between tiles**, and the size is the number of layers from the centre (layer 1 is the centre); square tiles cannot fill a hexagon, so that one combination is switched off. Triangles and hexagons choose their orientation (point up or down, pointy- or flat-top)
- Board outlines: Rectangle (a square when width and height are equal), Hexagon, Triangle, Circle, an **Infinite canvas** (prototype): an endless hex / square / triangle lattice that you pan across; only drawn tiles are saved and shared, and **Country**: a board cut to the outline of a real country (Natural Earth 1:50m, shipped in `app/data/`), with a choice of tiles across and which islands to include, also for multi-country regions (Scandinavia, Balkans, European Union and more) with the borders between the countries highlighted
- Painting: one drawing tool with a Brush / Fill / Line switch (and brush size, theme and colours) in its settings popover; the eraser has its own size; objects are placed one per click, ignoring the draw mode and size
- Fill and line tools: flood-fill a connected region in one click, or drag from tile A to tile B to paint a gap-free tile path (works on hexagon, square and triangle grids; each is a single undo step; they apply to colours only)
- Palettes and objects: switchable themed colour palettes (Landscape, Simple nordic, Space, Dungeon, Spaceship, Arctic and the palettes of the board-game showcases) with labelled swatches; item sets to match (Medieval, Simple nordic, Space); your own tile themes and item sets, made in the app or imported (see [Themes and item sets](#themes-and-item-sets))
- Projects: every board is a named project kept in the browser and autosaved as you work. The home page lists them (open, delete); a new project asks for a name; share links, project files and the showcase maps open as new projects instead of replacing the one you are working on
- History: Undo/redo
- Project panel: the name of the project and three buttons. **Export…** opens one dialog with tabs for **Print**, **PNG**, **SVG** and **Project file**, each with its own options and a preview; **Share Link** (see below); **Load…** opens another project from this browser or imports a project file (and starts a new project, or goes to the home page)
- Export options: PNG at 1× to 4× the size on screen, with or without textures, objects, grid lines, on a transparent or white background; SVG (flat colours, or with textures embedded as pictures) with or without objects and start markers, grid lines, background; the borders between countries of a region board are always drawn
- Print: the **Print** tab of Export… makes a PDF at a real-world tile size (in mm): split across A4 / Letter / A3 home-printer pages with overlap, page labels and assembly hints, or one large sheet (fit to board, A3–A0) with crop marks; objects on the board, as cut-out tokens, or both; optional legend of the terrains and objects used; a live preview shows how the board sits on the paper. Settings are remembered per browser.
- Sharing: **Share Link** puts the whole board in the address (nothing is uploaded); whoever opens it gets their own copy
- Playtest: the play button locks editing so the board can be played on; pan and zoom keep working, **Esc** or the pill returns to editing. With **players** defined (a colour, a seat at one screen edge and a set of pieces each) and **start markers** painted on the map, every player gets a tray at their seat, turned to face outwards: click a piece to send it to a free start, drag it anywhere, roll the design's dice (d3 to d20) from the tray, undo moves, reset the game. Several people can move pieces at once on a touch screen. See [docs/PLAYTEST.md](docs/PLAYTEST.md)
- Layout: the tools sit in a column at the right edge, under the full screen and playtest buttons; their settings open to the left
- Input: Mouse, touch, stylus; responsive layout
- View: a button in the zoom cluster switches between textured tiles and plain colours (remembered; the PNG and Print tabs of the Export dialog start from it; an SVG is flat colours unless you tick Textures)
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
| Pick swatch | 1 - 9 |
| Next / previous swatch | . / , |
| Zoom in / out / fit | + / - / 0 |
| Pan | Space + drag (Space keeps its normal job on buttons, checkboxes and in dialogs) |
| Save project | Ctrl+S, also inside a text field (the only key taken over from the browser); downloads the project file |
| Show shortcuts | ? |
| Move between controls | Tab / Shift+Tab (the app never takes Tab, so the board is not a keyboard trap) |
| Cancel a line or a drag, close the top dialog, leave playtest | Esc (one layer at a time, topmost first) |

In playtest, keyboard play uses the same keys on real controls: **Tab** to a tray piece and press **Enter** or **Space** to send it to a free start; Tab to the piece list, then the **arrow keys** move the focused piece one tile and **Delete** or **Backspace** returns it to its tray; **Esc** cancels a drag, then leaves playtest. Undo and redo step through piece moves.

`V` is reserved for the Select tool, which does not exist yet.

## Navigating large boards
Painting and navigating never share a gesture, so you cannot pan by accident while painting:

| Input | Paint | Navigate |
|---|---|---|
| Mouse | click / drag | wheel = zoom at the pointer; **Space + drag** or **middle-button drag** = pan |
| Touch | one finger | **two fingers**: drag to pan, pinch to zoom (a stroke in progress is undone when the second finger lands; the finger left behind does not paint until you lift it) |
| Stylus | pen | wheel, Space + drag, or the on-screen controls |

The cluster in the bottom-right corner has zoom out / in, the zoom level (click it for **actual size**, where a typical tile is 64 px wide), **fit to screen**, and a **minimap** toggle. The minimap shows the whole board with the visible area outlined; click or drag on it to move the view. Zoom is clamped between 25% of the fitted size and 24x, and the board can never be panned completely out of sight.

## Projects, sharing and printing
- **A project** is one board with its name, colours, objects, players and dice. It lives in this browser's `localStorage` (about 5 MB per site, shared by all projects; the editor says so when it is full), is saved as you work, and is not uploaded anywhere. The home page (`/`) lists your projects. Clearing the site's data deletes them, so keep a file of anything you care about.
- **Keep a copy:** **Export…** > **Project file** (or Ctrl+S) downloads `<name>.protogames.json`; **Load…** > **Import a project file…** opens it again, here or on another computer. Files from older versions of the app are upgraded when opened; files from a newer version are refused with a message. The formats are in [docs/SPECIFICATION.md](docs/SPECIFICATION.md).
- **Share:** **Share Link** shows a link that contains the whole board; there is no server. Long links get a warning (above about 2,000 and 8,000 characters) and a "Download project file instead" button. A link that uses a custom theme or item set shows flat colours or missing items for people who do not have it.
- **Print at real scale:** **Export…** > **Print**. Set the tile size in mm and choose **Home printer** (pages of A4, Letter or A3 that you tape together; overlap, page labels and assembly hints) or **Single sheet** (fit to board, or A3, A2, A1, A0, with crop marks). Print the PDF at 100% ("actual size", not "fit to page"). Choose whether objects stay on the board, become cut-out tokens, or both, and whether to add a legend.
- **Examples:** the landing page links to showcase maps (a fantasy landscape, chess, island settlers, triangle peg solitaire, Chinese checkers); they open as new projects of your own.
- **Themes and item sets** are stored in the browser, not inside projects or links (see below).

### Themes and item sets
The **Themes** panel in the sidebar has two groups, **Tile themes** (a colour palette whose tiles may have a texture picture) and **Item sets** (the pictures of placeable objects). For each: **Create** opens an editor in the app, the file button imports a `.json` file or plain images (an image becomes a tile or an item named after its file), the export button saves a theme as JSON, and **JSON template** downloads an example to edit:
```
{ "type": "protogames-tile-theme", "name": "My Tile Theme", "tiles": [ { "label": "Bog", "hex": "#4b5d3a", "image": null } ] }
{ "type": "protogames-item-set", "name": "My Item Set", "items": [ { "label": "Outpost", "image": "https://example.com/outpost.png" } ] }
```
`image` is a web address or a `data:` URL. Imported themes are kept per browser (`localStorage`).

## Deployment and previews
`main` is published as the production site at `https://protogames.eu/` (landing page at the root, the editor at `/app/`); every open pull request from this repository (at most 20) is published as a preview under `/preview/pr-<number>/` (editor at `/preview/pr-<number>/app/`), with its own saved data and a badge, and the link is commented on the pull request. Production loads one third-party script, anonymous page-view analytics; previews and the landing page do not. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Project Structure
File paths such as `js/shortcuts.js` in this README and in `docs/` are relative to `app/`, where the editor lives.

```
protogames/
├─ index.html            (landing page; landing.js forwards old share links to the app)
├─ landing.js
├─ package.json
├─ LICENSE               (GNU AGPL v3)
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
│  │  ├─ textureUtils.js    (colour helpers and blob-URL cache shared by textures and objects; loads before both)
│  │  ├─ textures.js        (procedural tile textures)
│  │  ├─ objects.js         (placeable map objects)
│  │  ├─ interactions.js
│  │  ├─ toolOps.js         (fill and line tool logic)
│  │  ├─ toolbar.js         (the tool column and its settings popovers)
│  │  ├─ panels.js          (folding of the sidebar panels, remembered per browser)
│  │  ├─ boardPicker.js     (the board-shape list with a picture of every layout)
│  │  ├─ focusUtils.js      (keyboard-focus rules: typing targets, Tab trap, open layers; loads before the modules that use it)
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
│  │  ├─ exportDialog.js    (the Export… dialog: Print, PNG, SVG and project file tabs)
│  │  ├─ loadDialog.js      (the Load… dialog: projects of this browser, file import)
│  │  ├─ exporter.js        (PNG and SVG export and their options)
│  │  ├─ ui.js
│  │  ├─ utils.js
│  │  └─ main.js
│  ├─ showcases/         (example .protogames.json projects)
│  ├─ images/            (the logo and the favicon)
│  └─ data/              (countries-50m.json: outlines for the Country shape; its README has source and licence)
├─ tests/                (node:test suites, roughly one per module, plus generatorVersion, scriptOrder and
│                         others that guard the whole app; fixtures/ of old file formats; support/ with load.js and fakes.js)
├─ dev/                  (geometry-gallery.html, geometry-checks.js, build-showcases.js: writes the board-game showcases)
├─ scripts/              (build-site.js: assembles production + previews for Pages; preview-runtime.js: storage prefix and badge of a preview)
├─ .github/              (workflows/ test.yml and pages.yml, issue templates, FUNDING.yml)
└─ docs/
   ├─ README.md          (index of all documents, each marked reference / research / proposal / archive)
   ├─ SPECIFICATION.md   (file, autosave and share-link formats, generator versions)
   ├─ DEPLOYMENT.md      (production, previews, how the site is built)
   ├─ PLAYTEST.md        (how playtest works)
   ├─ TILE_GENERATION_EXPLANATION.md
   ├─ audits/            (register.md = the current state of all findings; dated audit reports and their area reports are frozen logs;
   │                      start with audits/README.md for the rules)
   ├─ research/          (board-topologies/: survey of the maps of published games with its schematics; hex-maps-reading-list.md; playtest-ideas.md: backlog)
   ├─ proposals/         (playtest-secret-screens.md: a proposal for hidden information on several devices, not built)
   └─ archive/           (original-prd.md: the original product requirements, historical)
```

## Notable Recent Changes
Almost all of this happened in October 2026; before that the project was the board generator, the palettes and the eraser (November 2025).
- **Projects**: every board is a named project in the browser, autosaved, listed on the home page; the Project panel, the tabbed Export dialog and the Load dialog replace the old menu. Opening a file, a share link or a showcase makes a new project instead of replacing the open one.
- **Boards**: the tile shape is chosen first; hexagon and circle boards are built in layers around a tile or a point; the board shape is picked from a list of pictures. New shapes: **Infinite canvas** (prototype) and **Country** (real outlines, regions with borders). The old square board is now a rectangle with equal sides.
- **Generator versions**: a board remembers which version of the tile generator made it (project format 8, share link 5), so improving the generator never changes a saved board. Circles of triangles lost their one-tile spikes; very large circles of hexagons no longer lose tiles at the rim.
- **Playtest**: players with seats and piece sets, start markers, trays, movable pieces, dice; see [docs/PLAYTEST.md](docs/PLAYTEST.md).
- **Print and export**: a PDF at real tile size (home-printer pages or one sheet, legend, tokens, crop marks); SVG export with textures, start markers and country borders.
- **Safer files and links**: stricter project validation, bounded decoding of share links, a Content-Security-Policy, and blocked or full browser storage is reported instead of ignored.
- **Showcases** (five example projects), per-pull-request **previews** of the site, and a test suite of over 700 tests.
- Earlier: geometry split into submodules, themed palettes, a dedicated eraser.

## Usage
1. Go to [protogames.eu](https://protogames.eu/), or run it locally: serve the repository, for example `python -m http.server 8000 --bind 127.0.0.1`, and open `/` for the landing page or `/app/` for the editor. Opening `app/index.html` directly from the disk also works for drawing, but the **Country** shape and the showcases load files and need a server.
2. A new project asks for a name. Choose the tile shape, board shape and parameters in the sidebar; click **Generate Board**.
3. Pick a palette theme, select a colour (or click the eraser), then click or drag on tiles. Switch the drawing tool to **Fill** to repaint a whole connected region of one colour, or **Line** to drag out a straight path of tiles (Esc cancels a line in progress).
4. Projects are saved in the browser as you work; **Export…** downloads a `.protogames.json` file, a PNG/SVG, or a PDF at real-world scale; **Share Link** copies a link to the board.

## Development Notes
- Stack: Vanilla JS + HTML5 Canvas; no build tooling required.
- Modules use IIFEs; configuration lives in `js/config.js`.
- Defaults: `DEFAULT_TILE_COLOR` defines the blank/erased colour; palettes are declared in `COLOR_PALETTES`.

## Development
The app itself needs no tooling. The tests need [Node.js](https://nodejs.org) 22 or newer (no dependencies to install).

### Unit tests
```
npm test
```
Runs the Node test runner over `tests/**/*.test.js` (over 700 tests, about half a minute). The app's browser scripts are plain IIFE files, so `tests/support/load.js` evaluates them in an isolated `vm` context instead of needing a bundler or a DOM.

The geometry tests (`tests/geometry.test.js`, `tests/neighbors.test.js`) cover every fixed board shape (hexagon, rectangle, triangle, circle; the infinite canvas is tested in `tests/infinite.test.js`, the country board in `tests/countryBoard.test.js`) x tile shape x orientation combination: expected tile counts, no duplicate or overlapping tiles, correct bounds, centring inside the drawable area, hit-testing and tile adjacency (symmetric, correct neighbour counts). Every fixed shape bug has a regression test. When you fix a geometry bug, add a case there.

### Geometry gallery
`dev/geometry-gallery.html` renders every combination as a thumbnail, runs the same checks as the tests, and marks failing combinations in red and unsupported ones as dashed "invalid" cards with the reason. Serve the repository root with any static server and open the page:
```
python -m http.server 8000 --bind 127.0.0.1
# then visit http://localhost:8000/dev/geometry-gallery.html
```
Optional query parameters change the sizes, e.g. `?radius=5&size=8&width=10&height=6`.

### Adding a keyboard shortcut
All shortcuts live in `BINDINGS` in `js/shortcuts.js` (id, label, group, keys). Add the binding there, add its action to `ACTIONS` further down the same file, and mark any button that triggers it with `data-shortcut="<id>"` so its tooltip shows the key. `tests/shortcuts.test.js` fails if two bindings use the same key.

### Adding a script
There is no bundler: `app/index.html` lists every script with `defer` and the browser runs them in that order, so a module must come after the ones it uses while loading (for example `textureUtils.js` before `textures.js` and `objects.js`, `focusUtils.js` before the modules that use it, `projectFormat.js` before `shareLink.js` and `fileManager.js`). `tests/scriptOrder.test.js` fails when a file under `app/js/` is missing from the page or listed twice, when one of those orders is broken, and when the list does not load in a bare context.

### Adding a showcase
A showcase is an ordinary project file. Save a project from the editor (Export… > Project file) as `app/showcases/<id>.protogames.json`, then add `{ id, name, description, file }` to `SHOWCASES` in `js/config.js` (the file must be `showcases/<id>.protogames.json`). It opens at `app/?showcase=<id>`, which is how the landing page links to it. `tests/showcases.test.js` checks that every listed file exists and loads, and that every file in the folder is listed. The board-game showcases (chess, island settlers, peg solitaire, Chinese checkers) are written by `node dev/build-showcases.js` from the app's own geometry; rerun it after changing their palettes or layouts.

### Adding a built-in theme or item set
A tile theme is an entry in `COLOR_PALETTES` in `js/config.js` (`id`, `name`, `description`, `colors` as `{ label, hex }`). A tile's colour is its identity: it selects the texture and the label (`js/textures.js`), and a colour that is retired from an existing palette needs a migration of saved files (see "v1 to v2 colour map" in [docs/SPECIFICATION.md](docs/SPECIFICATION.md)). An item set is an entry in `THEMES` in `js/objects.js`, with the drawings of its items. For a theme that is only yours, use the **Themes** panel instead (see above).

### Changing saved data
A change to anything that is saved (project file, share link, board generator) follows the rules in [docs/SPECIFICATION.md](docs/SPECIFICATION.md): bump the version, add a migration, add a fixture of the old format to `tests/fixtures/`, and update the specification. The tiles a generator produces for existing settings never change; that is a new generator version.

### Continuous integration
`.github/workflows/test.yml` runs `npm test` on every push to `main` and on every pull request, so a failing test fails the check.

## Contributing
- Report a bug or suggest a feature with an [issue](https://github.com/bremondr/protogames/issues/new/choose); the templates ask for what is needed to reproduce a bug (browser, address, project file).
- Work on a branch and open a pull request against `main`. The tests must pass; the pull request gets its own preview of the site (see [Deployment and previews](#deployment-and-previews)), so you can try a change before it is merged.
- Where things are written down: [docs/README.md](docs/README.md) is the index of all documents; [docs/SPECIFICATION.md](docs/SPECIFICATION.md) specifies the saved formats; [docs/audits/](docs/audits/README.md) holds the audits of the code (read `audits/README.md` for the rules; `audits/register.md` is the one file with the current state of every finding, dated reports are frozen).

## Roadmap
The plan is tracked in the [Roadmap issue (#52)](https://github.com/bremondr/protogames/issues/52), grouped into phases that are ordered by dependency: 1 Foundations and quick wins (done), 2 Editing power and data, 3 Edges, roads, borders, 4 Output, sharing, onboarding, 5 Later. Each item is an issue with a `phase-<n>` label. Besides that:
- A Select tool (`V` is reserved for it) and an editor for the dice set are not built yet.
- Ideas for playtest are in [docs/research/playtest-ideas.md](docs/research/playtest-ideas.md), a proposal for hidden information on several devices in [docs/proposals/playtest-secret-screens.md](docs/proposals/playtest-secret-screens.md).
- Open findings of the audits are in [docs/audits/register.md](docs/audits/register.md).
- The original product requirements, with their post-MVP list, are kept in [docs/archive/original-prd.md](docs/archive/original-prd.md).

## License
Protogames is free software under the [GNU Affero General Public License v3](LICENSE) (`AGPL-3.0-only`). The country outlines in `app/data/` are under their own terms, see [app/data/README.md](app/data/README.md).

## Status
Active development. Last updated: October 2026.
