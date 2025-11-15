# Protogames

A browser-based digital drawing tool for tabletop game board prototyping and design.

## Overview

Protogames enables game designers to quickly sketch, edit, and iterate on tabletop game boards during the prototyping phase. It replaces paper prototyping with the ease of traditional methods while adding digital flexibility for changes and exports.

**Target Users:** Game designers, board game enthusiasts, and prototypers  
**Platform:** Web-based (GitHub Pages compatible)  
**Status:** MVP Development Phase

## Key Features

### Core Functionality
- Multiple Grid Types: Hexagon, Square, Triangle, Orthogonal Square
- Flexible Board Shapes: Square, Rectangle, Hexagon, Triangle, Circle
- Intuitive Drawing: Click or brush-drag to color tiles
- Smart Editing: Undo/redo support for iterative design
- Multi-Input Support: Works with mouse, touch, and stylus (iPad, Surface tablets)

### File Management
- Auto-Save: Automatic saves to browser localStorage every 30 seconds
- Project Files: Save/load projects as JSON files
- Export Options: PNG, PDF, and SVG formats

### User Experience
- Responsive Design: Fits viewport without scrolling
- Color Palette: Pre-defined environment colors (forest, water, mountain, etc.)
- Touch-Optimized: 44px minimum touch targets
- Clean Interface: Sidebar controls with main canvas workspace

## Technical Architecture

### Technology Stack
- Frontend: Vanilla JavaScript (ES5/ES6)
- Rendering: HTML5 Canvas API
- Storage: Browser localStorage (no backend required)
- Deployment: GitHub Pages (static hosting)

### Project Structure
protogames/
├── index.html
├── styles.css
├── js/
│   ├── config.js
│   ├── state.js
│   ├── geometry.js
│   ├── renderer.js
│   ├── interactions.js
│   ├── fileManager.js
│   ├── exporter.js
│   ├── ui.js
│   ├── utils.js
│   └── main.js
└── docs/
    └── SPECIFICATION.md

### Code Organization
- Modular Design: Each file has a single responsibility
- IIFE Pattern: Modules use Immediately Invoked Function Expressions
- Documented: Comprehensive JSDoc comments throughout
- No Dependencies: Pure vanilla JavaScript, no external libraries

## Current Development Status

### Completed Features
- HTML/CSS UI structure with sidebar and canvas
- Grid generation for Hexagon, Square, Triangle, Orthogonal grids
- Precise polygon selection (ray-casting algorithm)
- Click-to-color functionality
- Brush/drag coloring mode
- Undo/redo system with history management
- Auto-save to localStorage
- Save/load project files (JSON)
- Export to PNG, SVG, PDF
- Responsive viewport-fit layout
- Multi-input support (mouse, touch, stylus)
- Code refactored into modular files
- Comprehensive code documentation

### In Progress
- Hexagon board shape (proper hexagonal outline)
- Triangle board shape generation
- Circle board shape generation
- Dynamic UI parameter visibility
- Grid type restrictions for board shapes

### Planned for MVP
- Element movement/repositioning (drag-and-drop)
- Keyboard shortcuts (Ctrl+Z, Ctrl+Y)
- Visual feedback improvements
- Cross-browser testing
- Device testing (iPad, Surface)
- Performance optimization for large boards

## Usage

### Getting Started
1. Open the app in a modern browser
2. Select board shape and grid type from sidebar
3. Configure size/dimensions
4. Click "Generate Board"
5. Select a color from the palette
6. Click or drag on tiles to color them

### Board Configuration Options

Board Shapes:
- Square: Equal width and height
- Rectangle: Custom width and height
- Hexagon: Radius-based (only works with Hexagon/Triangle grids)
- Triangle: Regular triangle with base size
- Circle: Radius-based circular outline

Grid Types:
- Hexagon: Pointy-top or Flat-top orientation
- Square: Standard orthogonal grid
- Triangle: Tessellating triangles
- Orthogonal Square: 45° rotated diamond pattern

### File Operations
- Auto-Save: Automatic - restored on next visit
- Save Project: Download .protogames.json file
- Load Project: Upload previously saved project file
- Export PNG: Image for presentations/sharing
- Export SVG: Vector format for further editing
- Export PDF: Printable document

## Browser Compatibility

Supported Browsers:
- Chrome (last 2 versions)
- Firefox (last 2 versions)
- Safari (last 2 versions)
- Edge (last 2 versions)

Tested Devices:
- Desktop: Windows, macOS
- Tablets: iPad, Microsoft Surface

Minimum Requirements:
- Screen size: 1024x768 (10-inch tablet)
- JavaScript enabled
- localStorage enabled
- HTML5 Canvas support

## Development Roadmap

### Phase 1: MVP Completion (Current)
Timeline: 2 months  
Focus: Core functionality for workshop usage

- Complete all board shapes (Hexagon, Triangle, Circle)
- Implement element repositioning
- Add keyboard shortcuts
- Polish UX and visual feedback
- Complete testing across devices
- Deploy to GitHub Pages

### Phase 2: Enhanced Editing (Post-MVP)
Priority Features:
- Freehand drawing and annotation tools
- Custom polygon shapes
- Line and connector tools for paths/routes
- Layer management system
- Copy/paste functionality
- Element rotation capabilities

### Phase 3: AI Integration
Vision: Replace color placeholders with generated textures

- Integrate AI texture generation API
- Environment-aware texture creation
- Export boards with applied textures
- Texture library management

### Phase 4: Advanced Features
Future Enhancements:
- Board template library
- Measurement and spacing tools
- Element grouping
- Grid guidelines and rulers
- Multiple board sizes in one project
- Collaboration features (requires backend)

## Success Criteria

The MVP is considered successful when:
- Tool can be used during game design workshops
- Users can create complete boards (e.g., Amazon rainforest map) in under 15 minutes
- All core workflows function without errors
- Performance is smooth on iPad and Surface tablets
- Positive feedback from workshop testing

## Contributing

This is an experimental project in active development. The codebase is designed to be:
- Educational: Well-documented for learning
- Maintainable: Modular and organized
- Extensible: Ready for future enhancements

### Development Setup
1. Clone the repository
2. Open index.html in a browser
3. No build step required - pure static files
4. Use browser DevTools for debugging

### Code Standards
- JSDoc comments for all functions
- Clear, descriptive variable names
- Single responsibility per module
- Test after each feature addition

## License

[To be determined]

## Acknowledgments

Built with focus on:
- Simplicity over complexity
- Performance on tablets
- Ease of use matching paper prototyping
- Educational code quality

---

Project Status: Active Development  
Version: 1.0 MVP  
Last Updated: November 15, 2025
