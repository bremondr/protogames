# Protogames - Development Specification Document

**Version:** 1.0 - MVP  
**Date:** November 15, 2025  
**Project Type:** Experimental tool for game design workshops  
**Status:** Specification phase

## 1. Introduction & Overview

### 1.1 Project Vision
Protogames is a browser-based digital drawing tool designed to replace paper prototyping for tabletop game board design. The app enables game designers to quickly sketch, edit, and iterate on game boards during the prototyping and design phase with the ease of paper but the flexibility of digital tools.

### 1.2 Target Audience
- **Primary Users:** Game designers actively prototyping tabletop games
- **Secondary Users:** Board game enthusiasts and hobbyists building their own games
- **Technical Proficiency:** Comfortable with digital tools, working on tablets or larger screens
- **Use Context:** Game design workshops, prototyping sessions, iterative design work

### 1.3 Project Goals
- Enable rapid board creation and iteration during game design workshops
- Provide intuitive tools for creating grid-based game boards with various polygon types
- Support touch, pen, and mouse input equally well on tablets and desktop devices
- Maintain simplicity and ease of use comparable to paper sketching
- Allow easy saving and exporting of designs without server dependencies

## 2. Scope & Core Features

### 2.1 In Scope for MVP

**Board Creation:**
- Grid-based board generation with hexagons, squares, triangles, and orthogonal squares
- Multiple grid orientations for supported shapes
- Predefined board outline shapes (square, rectangle, hexagon in both orientations)
- User-defined board dimensions

**Drawing & Editing:**
- Shape placement with color fills representing different environments
- Move and reposition colored elements within the grid
- Snap-to-grid functionality for precise placement
- Undo/redo capabilities

**File Management:**
- Auto-save to browser local storage during work sessions
- Manual save/download of project files
- Project file upload for continued editing
- User-defined project naming on download

**Export Options:**
- PNG export for presentations and sharing
- PDF export for printing
- SVG export for further editing in other tools

### 2.2 Out of Scope for MVP

- Real-time collaboration features
- Cloud storage or server-side functionality
- Freehand drawing capabilities
- Custom polygon shapes beyond predefined types
- AI-generated texture replacement
- User accounts or authentication
- Public galleries or sharing features
- Advanced accessibility features (screen readers)
- Template libraries

### 2.3 Future Considerations

**Priority 1 (Post-MVP):**
- Additional polygon shapes and custom shape creation
- AI integration for texture generation replacing color placeholders
- Freehand drawing tools

**Priority 2 (Future Versions):**
- Layering and grouping elements
- Copy/paste functionality
- Measurement and ruler tools
- Template library with starting boards

## 3. User Requirements

### 3.1 User Personas

**Primary Persona: Workshop Game Designer**
- Uses the app during intensive game design workshops
- Needs to quickly iterate on board layouts
- Works on iPad or Surface tablet with pen input
- Creates multiple board variations in a single session
- Example use case: Designing a map for an Amazon rainforest-themed board game

**Secondary Persona: Solo Prototyper**
- Individual game designer working on personal projects
- Needs to save and return to designs over multiple sessions
- Primarily works on desktop with mouse
- Exports boards to share with playtesters

### 3.2 Key User Stories

**US-001:** As a game designer, I want to select a grid type and board shape so that I can start designing immediately.

**US-002:** As a user, I want to fill grid spaces with colored shapes representing environments so that I can visualize different terrain types.

**US-003:** As a user, I want to move elements around the board so that I can experiment with different layouts.

**US-004:** As a user, I want to undo and redo my actions so that I can experiment without fear of losing work.

**US-005:** As a user, I want my work to be automatically saved so that I don't lose progress if my browser closes unexpectedly.

**US-006:** As a user, I want to download my project file so that I can continue working on it later.

**US-007:** As a user, I want to export my board as an image or PDF so that I can share it with my team or print it for playtesting.

**US-008:** As a tablet user, I want to use touch, pen, and mouse input interchangeably so that I can work with my preferred input method.

## 4. Functional Requirements

### 4.1 Board Initialization

**FR-001: Initial Canvas**
- System shall display a blank canvas on app load
- Canvas shall present options for board configuration before drawing begins

**FR-002: Grid Type Selection**
- System shall offer grid types: hexagon, square, triangle, orthogonal square
- System shall allow users to change grid type after initial selection
- System shall support multiple orientations for applicable grid types (e.g., pointy-top and flat-top hexagons)

**FR-003: Board Shape Definition**
- System shall provide predefined board outline shapes: square, rectangle, hexagon (both orientations)
- System shall allow users to specify dimensions for the selected board shape
- System shall generate the selected grid pattern within the defined board outline

**FR-004: Grid Rendering**
- System shall render the grid based on selected polygon type and board dimensions
- Grid shall remain fixed as the base structure
- Grid lines shall be visible to guide element placement

### 4.2 Drawing & Interaction

**FR-005: Color Palette**
- System shall provide a predefined color palette representing different environments
- Each color shall have a label (e.g., "forest," "water," "mountain," "desert")
- Colors shall be optimized to represent game environment placeholders

**FR-006: Element Placement**
- Users shall be able to select a color from the palette
- Users shall be able to click/tap grid spaces to fill them with the selected color
- System shall provide visual feedback when hovering over or selecting grid spaces

**FR-007: Element Movement**
- Users shall be able to select and move colored elements within the grid
- System shall snap moved elements to the nearest valid grid position
- System shall provide visual feedback during drag operations

**FR-008: Input Method Support**
- System shall support mouse click and drag operations
- System shall support touch input (tap and drag) on touch-enabled devices
- System shall support pen/stylus input on compatible devices
- All three input methods shall provide equivalent functionality

### 4.3 Editing Capabilities

**FR-009: Undo/Redo**
- System shall maintain a history of user actions
- Users shall be able to undo previous actions via button or keyboard shortcut (Ctrl/Cmd+Z)
- Users shall be able to redo undone actions via button or keyboard shortcut (Ctrl/Cmd+Shift+Z)
- System shall maintain reasonable history depth based on browser capabilities

**FR-010: Snap-to-Grid**
- System shall automatically snap elements to grid positions during placement and movement
- Snap behavior shall be consistent across all input methods

### 4.4 File Management

**FR-011: Auto-Save**
- System shall automatically save the current project state to browser local storage at regular intervals
- System shall restore the last saved state when the user returns to the app
- System shall handle local storage limitations gracefully

**FR-012: Manual Save/Download**
- Users shall be able to manually save project files to their device
- System shall prompt users to name their project during download
- Project files shall contain all necessary data to fully restore the board state

**FR-013: Project Loading**
- Users shall be able to upload previously saved project files
- System shall validate uploaded files before loading
- System shall restore the complete board state from valid project files

**FR-014: Export Functionality**
- Users shall be able to export boards as PNG images
- Users shall be able to export boards as PDF documents
- Users shall be able to export boards as SVG files
- Export filename shall match the project name when available

### 4.5 User Interface

**FR-015: Toolbar Layout**
- System shall display primary tools in a sidebar
- Toolbar shall remain accessible at all times
- Toolbar shall not obscure the canvas workspace

**FR-016: Canvas Workspace**
- Canvas shall occupy the majority of the screen space
- Canvas shall be responsive to different screen sizes (tablets to desktop)
- Canvas shall provide adequate visual contrast between UI elements and workspace

## 5. Technical Requirements

### 5.1 Platform & Deployment

**TR-001: Hosting**
- Application shall be deployable as static files on GitHub Pages
- No server-side processing or backend required
- All functionality shall run client-side in the browser

**TR-002: Browser Compatibility**
- Application shall support modern browsers: Chrome, Firefox, Safari, Edge (last 2 versions)
- Application shall be tested and optimized for iPad tablets
- Application shall be tested and optimized for Microsoft Surface tablets

### 5.2 Technology Stack

**TR-003: Frontend Framework**
- Application shall use a lightweight framework compatible with static hosting
- Framework shall support component-based architecture for maintainability

**TR-004: Rendering Engine**
- Application shall use HTML5 Canvas for board rendering
- Canvas implementation shall support smooth interactions at 60fps where possible
- Rendering shall efficiently handle large boards with many elements

**TR-005: File Format**
- Project save files shall use JSON format for human readability and future extensibility
- Export formats shall conform to standard PNG, PDF, and SVG specifications

### 5.3 Data Storage

**TR-006: Local Storage**
- Application shall use browser localStorage API for auto-save functionality
- Application shall check for storage availability before attempting saves
- Application shall provide user feedback if storage limits are reached

**TR-007: Data Privacy**
- No user data shall be transmitted to external servers
- All data shall remain on the user's device
- Application shall not include external analytics or tracking

## 6. Non-Functional Requirements

### 6.1 Performance

**NFR-001: Load Time**
- Application shall load and be interactive within 3 seconds on standard broadband connections
- Initial render shall occur within 1 second of page load

**NFR-002: Interaction Responsiveness**
- Canvas interactions (clicks, drags) shall respond within 100ms
- Undo/redo operations shall execute within 200ms
- Grid generation shall complete within 2 seconds for boards up to 50×50 tiles

**NFR-003: Scalability**
- Application shall smoothly handle boards with up to 2500 individual grid spaces (e.g., 50×50)
- Application shall maintain 30fps minimum during drag operations on supported devices

### 6.2 Usability

**NFR-004: Learning Curve**
- New users shall be able to create a basic board within 5 minutes without instructions
- Interface shall use intuitive icons and labels for all tools
- Workflow shall mirror paper prototyping mental models

**NFR-005: Accessibility**
- UI elements shall maintain a minimum contrast ratio of 4.5:1 for readability
- Interactive elements shall have minimum touch target size of 44×44 pixels
- Keyboard shortcuts shall be available for primary actions

### 6.3 Reliability

**NFR-006: Error Handling**
- Application shall gracefully handle browser storage failures
- Application shall validate file formats before attempting to load
- Application shall provide clear error messages for user-facing issues

**NFR-007: Data Integrity**
- Auto-save shall not corrupt existing saved data
- Export operations shall produce valid, standard-compliant files

## 7. Interface Requirements

### 7.1 User Interface Components

**Layout Structure:**
- Side toolbar containing: grid type selector, board shape controls, color palette, undo/redo buttons, file operations, export options
- Main canvas area displaying the active board
- Minimal top bar for app branding and global actions

**Interaction Patterns:**
- Click/tap to select tools and colors
- Click/tap on canvas to place or select elements
- Drag to move elements
- Toolbar buttons for discrete actions

### 7.2 Hardware Interface

**Input Devices:**
- Mouse: Standard point-and-click operations
- Touchscreen: Single-finger tap and drag gestures
- Stylus/Pen: Pressure-independent drawing (pressure sensitivity not required for MVP)

**Display Requirements:**
- Minimum screen size: 10-inch tablet (1024×768 resolution)
- Optimal screen size: 12+ inch tablets or desktop displays
- Responsive layout adapting to available screen space

## 8. Success Metrics

### 8.1 MVP Success Criteria

**Primary Success Metric:**
- The tool can be successfully used during game design workshops to create usable board game prototypes

**Functional Success Criteria:**
- Users can create a complete board (e.g., Amazon rainforest game map) from start to export in under 15 minutes
- All core workflows (create, edit, save, load, export) function without errors
- Application works smoothly on test devices (iPad, Surface)

**Quality Criteria:**
- No critical bugs blocking core functionality
- Performance targets met on reference devices
- Positive feedback from initial workshop testing

### 8.2 Acceptance Criteria

**AC-001:** User can select grid type and create a board outline  
**AC-002:** User can fill grid spaces with labeled colors  
**AC-003:** User can move elements and see them snap to grid  
**AC-004:** Undo/redo functions correctly for all actions  
**AC-005:** Project auto-saves to local storage and can be restored  
**AC-006:** User can download and re-upload project files  
**AC-007:** Export produces valid PNG, PDF, and SVG files  
**AC-008:** All input methods (mouse, touch, pen) work equivalently

## 9. Dependencies & Constraints

### 9.1 Timeline

**Project Duration:** 2 months from specification approval  

**Proposed Milestones:**
- Week 2: Core canvas and grid generation
- Week 4: Drawing tools and color palette
- Week 6: File management (save/load/export)
- Week 8: Testing, bug fixes, polish

### 9.2 Team & Resources

**Development Team:**
- UX/Product Designer: UI/UX design, product decisions, testing
- AI Coding Agent: Implementation support, code generation

**External Dependencies:**
- GitHub Pages hosting availability
- Browser APIs (Canvas, localStorage, File API)

### 9.3 Technical Constraints

- Must function entirely client-side (no backend)
- Limited by browser localStorage capacity (typically 5-10MB)
- Canvas rendering performance varies by device
- Must work within browser security constraints for file operations

### 9.4 Known Limitations

- No synchronization across devices (files must be manually transferred)
- Storage limited to single-device browser localStorage
- Large boards may strain older/slower devices
- Export quality limited by browser Canvas implementation

## 10. Future Roadmap

### 10.1 High Priority (Post-MVP)

**Additional Shapes:**
- More polygon types for grids
- Custom shape creation tools
- Irregular grid patterns

**AI Integration:**
- Replace color placeholders with AI-generated textures
- Environment-aware texture generation
- Export boards with applied textures

**Enhanced Drawing:**
- Freehand drawing and annotation tools
- Line and connector tools for paths/routes

### 10.2 Medium Priority

**Advanced Editing:**
- Layer management
- Element grouping
- Copy/paste functionality
- Element rotation

**Workflow Enhancements:**
- Board templates library
- Measurement and spacing tools
- Grid guidelines and rulers

### 10.3 Architecture Considerations

The MVP architecture should support:
- Modular tool system for easy addition of new drawing tools
- Plugin architecture for future AI integration
- Extensible export system for additional formats
- Abstracted rendering layer for potential WebGL upgrade

---

## Appendix A: Terminology

- **Grid:** The fixed polygon pattern forming the base board structure
- **Element:** A colored shape placed within a grid space
- **Board Outline:** The overall shape boundary containing the grid
- **Environment:** A terrain or area type represented by a color label
- **Project File:** JSON file containing complete board state

## Appendix B: Reference Examples

**Example Use Case - Amazon Rainforest Board:**
- Hexagonal grid, pointy-top orientation
- Irregular board outline approximating a region shape
- Colors representing: dense jungle (dark green), clearings (light green), rivers (blue), villages (brown), mountains (gray)
- 20×25 approximate size with 300-400 filled hexagons

---

**Document prepared for:** Protogames MVP Development  
**Next Steps:** Review specification, begin technical implementation planning, set up development environment



Poznámky a zdroje k projektu

https://www.redblobgames.com/grids/hexagons/

https://www.redblobgames.com/grids/hexagons/implementation.html

