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
- Palettes: Switchable themed color palettes (e.g., Landscape, Space) with labeled swatches
- History: Undo/redo, autosave to localStorage
- File ops: Save/load JSON projects; export PNG/PDF/SVG
- Input: Mouse, touch, stylus; responsive layout

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
3. Pick a palette theme, select a color (or click **Eraser**), then click or drag on tiles.
4. Save projects as `.protogames.json`; export PNG/PDF/SVG as needed.

## Development Notes
- Stack: Vanilla JS + HTML5 Canvas; no build tooling required.
- Modules use IIFEs; configuration lives in `config.js`.
- Defaults: `DEFAULT_TILE_COLOR` defines the blank/erased color; palettes are declared in `COLOR_PALETTES`.

## Roadmap (near-term)
- Further polish of triangle-hex tessellation and palette/eraser UX
- Additional palette themes
- Keyboard shortcuts and improved visual feedback

## Status
Active development — MVP. Last updated: November 2025.
