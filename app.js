/**
 * PROTOGAMES - Main Application Logic
 * --------------------------------------------------------------
 * This module controls everything that happens inside the board
 * designer: canvas sizing, grid generation, polygon selection,
 * rendering, undo/redo history, and interactions with the UI.
 *
 * Major sections (in order):
 * 1. Configuration & global state
 * 2. UI setup and canvas initialization
 * 3. Geometry helpers & polygon utilities
 * 4. Grid builders for each supported pattern
 * 5. Canvas rendering routines
 * 6. Pointer interaction & hit-testing
 * 7. History management and project persistence
 *
 * Implementation is pure vanilla JavaScript so it runs easily on
 * GitHub Pages without extra tooling.
 */

// ============================================================================
// 1) CONFIGURATION & APP STATE
// ============================================================================
// These constants and objects define behavior shared by the entire tool.
const CANVAS_PADDING = 48;
const HISTORY_LIMIT = 50;
const DEFAULT_FILL = '#ffffff';
const GRID_STROKE = '#333741';
const HOVER_OUTLINE = '#2f6fed';
const AUTO_SAVE_KEY = 'protogames_autosave';
const AUTO_SAVE_INTERVAL = 30000;
const DEFAULT_PROJECT_NAME = 'protogames-board';

let notificationTimerId = null;
let autoSaveIntervalId = null;

/**
 * APPLICATION STATE
 * --------------------------------------------------------------
 * Tracks the current board, canvas, and UI selections. Updating
 * this object directly affects rendering and interaction logic.
 */
const appState = {
    canvas: null, // HTMLCanvasElement reference once initialized
    ctx: null, // 2D rendering context for drawing polygons
    polygons: [], // Array of polygon definitions currently on screen
    boardConfig: {
        gridType: 'hexagon',
        orientation: 'pointy-top',
        boardShape: 'rectangle',
        width: 12,
        height: 12
    },
    currentColor: '#0b3d1d', // Active palette color used when painting
    hoverPolygonId: null, // Polygon currently under the pointer (for highlighting)
    history: [], // Stack of previous color states to power undo/redo
    historyIndex: -1, // Cursor into the history array (-1 means no snapshots yet)
    currentProjectName: null, // User-defined project label used for exports
    lastSaveTime: null, // Timestamp of the last manual or auto-save
    isDirty: false // Indicates there are unsaved modifications
};

/**
 * Cached DOM references are stored here so the code does not keep
 * re-querying the document tree.
 */
const ui = {};

// Bootstraps the entire experience once the document is ready.
window.addEventListener('DOMContentLoaded', () => {
    cacheUIReferences();
    initializeCanvas();
    setupEventListeners();
    setupFileUpload();
    setupExportButtons();
    initializePaletteState();
    syncBoardConfigFromUI();
    setupAutoSave();

    const autoSaved = loadAutoSave();
    if (autoSaved) {
        const savedLabel = autoSaved.timestamp
            ? new Date(autoSaved.timestamp).toLocaleString()
            : 'a previous session';
        if (confirm(`An autosave from ${savedLabel} was found. Restore it?`)) {
            const restored = restoreState(autoSaved.appState, {
                projectName: autoSaved.projectName,
                skipAutoSave: true
            });
            if (restored) {
                showNotification('Autosave restored', 4000);
                return;
            }
        }
    }
    generateBoard(appState.boardConfig, { skipDirtyFlag: true });
});

// ============================================================================
// 2) UI INITIALIZATION & CANVAS SETUP
// ============================================================================

/**
 * Stores frequently used DOM elements so we can interact with the
 * interface without repeated document queries.
 */
function cacheUIReferences() {
    ui.canvas = document.getElementById('gameCanvas');
    ui.canvasPlaceholder = document.querySelector('.canvas-placeholder');
    ui.paletteButtons = Array.from(document.querySelectorAll('.palette-swatch'));
    ui.gridTypeSelect = document.querySelector('select[name="gridType"]');
    ui.orientationSelect = document.querySelector('select[name="gridOrientation"]');
    ui.boardShapeSelect = document.querySelector('select[name="boardOutline"]');
    ui.widthInput = document.querySelector('input[name="boardWidth"]');
    ui.heightInput = document.querySelector('input[name="boardHeight"]');
    ui.generateButton = document.querySelector('[data-action="generate-board"]');
    ui.undoButton = document.querySelector('[data-action="undo"]');
    ui.redoButton = document.querySelector('[data-action="redo"]');
    ui.clearButton = document.querySelector('[data-action="clear-board"]');
    ui.saveButton = document.getElementById('saveProjectBtn');
    ui.loadButton = document.getElementById('loadProjectBtn');
    ui.loadInput = document.getElementById('loadProject');
    ui.exportPNGBtn = document.getElementById('exportPNGBtn');
    ui.exportPDFBtn = document.getElementById('exportPDFBtn');
    ui.exportSVGBtn = document.getElementById('exportSVGBtn');
    ui.notificationBar = document.getElementById('notificationBar');
}

/**
 * Sizes the canvas to match its wrapper and configures the 2D rendering
 * context. This runs on load and whenever the window is resized.
 */
function initializeCanvas() {
    if (!ui.canvas) return;
    const parentRect = ui.canvas.parentElement.getBoundingClientRect();
    const width = Math.floor(parentRect.width);
    const height = Math.floor(parentRect.height);
    ui.canvas.width = width;
    ui.canvas.height = height;
    ui.canvas.style.touchAction = 'none';
    const ctx = ui.canvas.getContext('2d');
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.imageSmoothingEnabled = true;

    appState.canvas = ui.canvas;
    appState.ctx = ctx;
}

/**
 * Wires all DOM, window, and canvas events together so UI actions
 * feed state changes. This handles resize, palette clicks, generate
 * board, undo/redo, file IO, and pointer interactions.
 */
function setupEventListeners() {
    window.addEventListener('resize', () => {
        const previousConfig = { ...appState.boardConfig };
        initializeCanvas();
        if (appState.polygons.length) {
            generateBoard(previousConfig, {
                preserveColors: true,
                preserveHistory: true,
                skipDirtyFlag: true
            });
        } else {
            renderBoard();
        }
    });

    ui.paletteButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const color = button.dataset.color || getComputedStyle(button).getPropertyValue('--swatch-color');
            setCurrentColor(color.trim(), button);
        });
    });

    if (ui.generateButton) {
        ui.generateButton.addEventListener('click', () => {
            syncBoardConfigFromUI();
            generateBoard(appState.boardConfig);
        });
    }

    if (ui.undoButton) {
        ui.undoButton.addEventListener('click', undo);
    }

    if (ui.redoButton) {
        ui.redoButton.addEventListener('click', redo);
    }

    if (ui.clearButton) {
        ui.clearButton.addEventListener('click', clearBoardColors);
    }

    if (ui.canvas) {
        ui.canvas.addEventListener('pointerdown', handlePointerDown);
        ui.canvas.addEventListener('pointermove', handlePointerMove);
        ui.canvas.addEventListener('pointerup', handlePointerUp);
        ui.canvas.addEventListener('pointerleave', handlePointerLeave);
    }
}

/**
 * Sets the default painting color based on whichever palette swatch
 * is preselected in the markup.
 */
function initializePaletteState() {
    const defaultButton = ui.paletteButtons.find((btn) => btn.classList.contains('selected')) || ui.paletteButtons[0];
    if (defaultButton) {
        const color = defaultButton.dataset.color || getComputedStyle(defaultButton).getPropertyValue('--swatch-color');
        setCurrentColor(color.trim(), defaultButton, { skipRender: true });
    }
}

/**
 * Reads the sidebar form fields and stores a normalized version of the
 * board configuration inside appState.
 */
function syncBoardConfigFromUI() {
    const gridValue = (ui.gridTypeSelect?.value || 'Hexagon').toLowerCase();
    const orientationValue = (ui.orientationSelect?.value || 'Pointy-top').toLowerCase();
    const boardShapeValue = (ui.boardShapeSelect?.value || 'Rectangle').toLowerCase();
    const widthValue = parseInt(ui.widthInput?.value, 10);
    const heightValue = parseInt(ui.heightInput?.value, 10);

    appState.boardConfig = {
        gridType: normalizeGridType(gridValue),
        orientation: normalizeOrientation(orientationValue),
        boardShape: boardShapeValue,
        width: Number.isFinite(widthValue) && widthValue > 0 ? widthValue : 12,
        height: Number.isFinite(heightValue) && heightValue > 0 ? heightValue : 12
    };
}

/**
 * Normalizes any user-facing grid label into an internal keyword.
 *
 * @param {string} value - Raw dropdown value (case insensitive).
 * @returns {string} Canonical grid identifier.
 */
function normalizeGridType(value) {
    if (value.includes('hex')) return 'hexagon';
    if (value.includes('orthogonal')) return 'orthogonal-square';
    if (value.includes('triangle')) return 'triangle';
    return 'square';
}

/**
 * Normalizes orientation dropdown strings so the rest of the code can
 * rely on predictable terms.
 *
 * @param {string} value - Raw dropdown value.
 * @returns {string} Canonical orientation label.
 */
function normalizeOrientation(value) {
    if (value.includes('pointy')) return 'pointy-top';
    if (value.includes('flat')) return 'flat-top';
    if (value.includes('diag')) return 'diagonal';
    return 'orthogonal';
}

// ============================================================================
// 3) POLYGON + GEOMETRY UTILITIES
// ============================================================================

/**
 * Builds a normalized polygon object with helpful metadata such as
 * bounding box and default color.
 *
 * @param {Object} options - Polygon definition.
 * @param {string} options.id - Unique identifier (row/col based).
 * @param {string} options.type - Shape keyword (hexagon, square, etc.).
 * @param {{x:number,y:number}} options.center - Center point in canvas space.
 * @param {Array<{x:number,y:number}>} options.vertices - Ordered vertices.
 * @param {string} [options.color] - Initial fill color.
 * @param {Object} [options.metadata] - Supplemental data (e.g., orientation).
 * @returns {Object} Polygon with bounds, fill color, and metadata applied.
 */
function createPolygon({ id, type, center, vertices, color, metadata = {} }) {
    const bounds = vertices.reduce(
        (acc, point) => ({
            minX: Math.min(acc.minX, point.x),
            maxX: Math.max(acc.maxX, point.x),
            minY: Math.min(acc.minY, point.y),
            maxY: Math.max(acc.maxY, point.y)
        }),
        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    );

    return {
        id,
        type,
        center,
        vertices,
        color: color || DEFAULT_FILL,
        bounds,
        ...metadata
    };
}

/**
 * Uses the ray casting algorithm to determine whether the provided
 * point lies inside the polygon described by the vertex array.
 *
 * The algorithm shoots an imaginary horizontal ray from the point to
 * infinity and counts how many times that ray crosses polygon edges.
 * Odd crossings mean the point is inside; even mean outside.
 *
 * @param {{x:number,y:number}} point - Coordinate in canvas space.
 * @param {Array<{x:number,y:number}>} vertices - Polygon vertices.
 * @returns {boolean} True when the point lies inside the polygon.
 */
function isPointInPolygon(point, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const xi = vertices[i].x;
        const yi = vertices[i].y;
        const xj = vertices[j].x;
        const yj = vertices[j].y;

        // Determine whether this edge crosses our imaginary horizontal ray.
        // The logic checks that the edge straddles the ray vertically and the
        // intersection lies to the right of the point.
        const intersect =
            yi > point.y !== yj > point.y &&
            point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

        if (intersect) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Determines whether a polygon centered at the provided point should
 * be part of the current board outline.
 *
 * @param {{x:number,y:number}} center - Polygon center.
 * @param {{bounds:Object, outline:Array}|null} boardMetrics - Outline info.
 * @param {Object} config - Current board configuration.
 * @returns {boolean} True when the polygon lies inside the outline.
 */
function shouldIncludePolygon(center, boardMetrics, config) {
    if (!boardMetrics) return true;
    if (config.boardShape === 'hexagon' && boardMetrics.outline) {
        return isPointInPolygon(center, boardMetrics.outline);
    }
    return true;
}

/**
 * Creates helper measurements (bounds + optional outline polygon)
 * describing the board so grid builders can clip shapes cleanly.
 *
 * @param {number} offsetX - Left coordinate where the board starts.
 * @param {number} offsetY - Top coordinate where the board starts.
 * @param {number} width - Board width in pixels.
 * @param {number} height - Board height in pixels.
 * @param {Object} config - Board configuration.
 * @param {string} [orientationHint] - Helps align hex outlines.
 * @returns {{bounds:Object, outline:Array|null}} Outline descriptor.
 */
function createBoardMetrics(offsetX, offsetY, width, height, config, orientationHint) {
    const bounds = { x: offsetX, y: offsetY, width, height };
    let outline = null;
    if (config.boardShape === 'hexagon') {
        const orientation =
            orientationHint && orientationHint.includes('pointy') ? 'pointy-top' : 'flat-top';
        outline = createBoardHexOutline(bounds, orientation);
    }
    return { bounds, outline };
}

/**
 * Generates a lightweight hexagon outline used to clip the overall
 * board shape when the user selects a "hexagon" outline.
 *
 * @param {{x:number,y:number,width:number,height:number}} bounds - Canvas rect.
 * @param {string} orientation - 'pointy-top' or 'flat-top'.
 * @returns {Array<{x:number,y:number}>} Outline vertices.
 */
function createBoardHexOutline(bounds, orientation) {
    const { x, y, width, height } = bounds;
    if (orientation === 'pointy-top') {
        return [
            { x: x + width / 2, y },
            { x: x + width, y: y + height * 0.25 },
            { x: x + width, y: y + height * 0.75 },
            { x: x + width / 2, y: y + height },
            { x: x, y: y + height * 0.75 },
            { x: x, y: y + height * 0.25 }
        ];
    }
    // flat-top default
    return [
        { x: x + width * 0.25, y },
        { x: x + width * 0.75, y },
        { x: x + width, y: y + height / 2 },
        { x: x + width * 0.75, y: y + height },
        { x: x + width * 0.25, y: y + height },
        { x: x, y: y + height / 2 }
    ];
}

/**
 * Ensures the requested width/height are whole numbers and adjusts
 * them when a square outline is requested (same rows/cols).
 *
 * @param {Object} config - Board configuration from the UI.
 * @returns {{cols:number, rows:number}} Sanitized dimension counts.
 */
function normalizeBoardDimensions(config) {
    const width = Math.max(1, Math.round(config.width));
    const height = Math.max(1, Math.round(config.height));
    if (config.boardShape === 'square') {
        const size = Math.min(width, height);
        return { cols: size, rows: size };
    }
    return { cols: width, rows: height };
}

/**
 * Builds the six vertices for a hexagon of a given size and orientation.
 *
 * @param {{x:number,y:number}} center - Hex center point.
 * @param {number} size - Radius from center to any vertex.
 * @param {string} orientation - 'pointy-top' or 'flat-top'.
 * @returns {Array<{x:number,y:number}>} Ordered vertices.
 */
function createHexVertices(center, size, orientation) {
    const vertices = [];
    const rotation = orientation === 'pointy-top' ? Math.PI / 6 : 0;
    for (let i = 0; i < 6; i++) {
        const angle = rotation + (Math.PI / 3) * i;
        vertices.push({
            x: center.x + size * Math.cos(angle),
            y: center.y + size * Math.sin(angle)
        });
    }
    return vertices;
}

/**
 * Creates simple axis-aligned square vertices based on a center point.
 *
 * @param {{x:number,y:number}} center - Square center.
 * @param {number} size - Width/height of the square in pixels.
 * @returns {Array<{x:number,y:number}>} Four vertices in clockwise order.
 */
function createSquareVertices(center, size) {
    const half = size / 2;
    return [
        { x: center.x - half, y: center.y - half },
        { x: center.x + half, y: center.y - half },
        { x: center.x + half, y: center.y + half },
        { x: center.x - half, y: center.y + half }
    ];
}

/**
 * Generates vertices for a rotated square (diamond) by offsetting
 * north/east/south/west from the center.
 *
 * @param {{x:number,y:number}} center - Diamond center.
 * @param {number} size - Distance corner-to-corner along axes.
 * @returns {Array<{x:number,y:number}>} Vertex list.
 */
function createDiamondVertices(center, size) {
    const half = size / 2;
    return [
        { x: center.x, y: center.y - half },
        { x: center.x + half, y: center.y },
        { x: center.x, y: center.y + half },
        { x: center.x - half, y: center.y }
    ];
}

/**
 * Creates either an upright or upside-down equilateral triangle.
 *
 * @param {{x:number,y:number}} origin - Top-left reference point.
 * @param {number} size - Length of the triangle base.
 * @param {boolean} pointingUp - Whether the triangle points upward.
 * @returns {Array<{x:number,y:number}>} Three vertices.
 */
function createTriangleVertices(origin, size, pointingUp) {
    const height = (Math.sqrt(3) / 2) * size;
    if (pointingUp) {
        return [
            { x: origin.x + size / 2, y: origin.y },
            { x: origin.x, y: origin.y + height },
            { x: origin.x + size, y: origin.y + height }
        ];
    }
    return [
        { x: origin.x + size / 2, y: origin.y + height },
        { x: origin.x, y: origin.y },
        { x: origin.x + size, y: origin.y }
    ];
}

// ============================================================================
// 4) GRID BUILDERS
// ============================================================================

/**
 * Generates polygons for the requested grid type and refreshes the
 * canvas rendering/state. Can optionally preserve existing colors.
 *
 * @param {Object} config - Normalized board configuration.
 * @param {Object} [options]
 * @param {boolean} [options.preserveColors=false] - Keep previous fills.
 * @param {boolean} [options.preserveHistory=false] - Avoid clearing undo.
 */
function generateBoard(config, options = {}) {
    const {
        preserveColors = false,
        preserveHistory = false,
        skipDirtyFlag = false
    } = options;
    const builder = {
        hexagon: buildHexGrid,
        square: buildSquareGrid,
        triangle: buildTriangleGrid,
        'orthogonal-square': buildDiamondGrid
    }[config.gridType] || buildSquareGrid;

    const colorMap =
        preserveColors && appState.polygons.length
            ? new Map(appState.polygons.map((p) => [p.id, p.color]))
            : null;

    const polygons = builder(config, colorMap);
    appState.polygons = polygons;
    appState.boardConfig = { ...config };
    appState.hoverPolygonId = null;

    renderBoard();
    if (!preserveHistory) {
        appState.history = [];
        appState.historyIndex = -1;
        recordHistory();
    } else if (appState.history.length) {
        const snapshot = appState.history[appState.historyIndex];
        restoreSnapshot(snapshot);
    }
    if (!skipDirtyFlag) {
        markStateDirty();
    }
}

/**
 * Creates a hexagonal grid in either pointy-top or flat-top orientation.
 *
 * @param {Object} config - Board configuration (rows, cols, orientation).
 * @param {Map} [colorMap] - Previous colors keyed by polygon id.
 * @returns {Array<Object>} Hexagon polygons ready for rendering.
 */
function buildHexGrid(config, colorMap) {
    const { canvas } = appState;
    if (!canvas) return [];
    const dims = normalizeBoardDimensions(config);
    const cols = dims.cols;
    const rows = dims.rows;
    const orientation = config.orientation === 'flat-top' ? 'flat-top' : 'pointy-top';

    const availableWidth = canvas.width - CANVAS_PADDING * 2;
    const availableHeight = canvas.height - CANVAS_PADDING * 2;

    // Calculate the largest hex radius that will still fit within the
    // padded canvas for both width and height constraints.
    const sizeFromWidth =
        orientation === 'pointy-top'
            ? availableWidth / (Math.sqrt(3) * Math.max(cols, 1))
            : availableWidth / (2 + 1.5 * Math.max(cols - 1, 0));
    const sizeFromHeight =
        orientation === 'pointy-top'
            ? availableHeight / (2 + 1.5 * Math.max(rows - 1, 0))
            : availableHeight / (Math.sqrt(3) * Math.max(rows, 1));

    const size = Math.max(8, Math.floor(Math.min(sizeFromWidth, sizeFromHeight)));

    const hexWidth = orientation === 'pointy-top' ? Math.sqrt(3) * size : 2 * size;
    const hexHeight = orientation === 'pointy-top' ? 2 * size : Math.sqrt(3) * size;
    const horizSpacing = orientation === 'pointy-top' ? hexWidth : 1.5 * size;
    const vertSpacing = orientation === 'pointy-top' ? 1.5 * size : hexHeight;

    // Determine the actual pixel footprint so we can center the board.
    const boardWidth = orientation === 'pointy-top'
        ? Math.sqrt(3) * size * cols
        : 2 * size + (cols - 1) * 1.5 * size;
    const boardHeight = orientation === 'pointy-top'
        ? 2 * size + (rows - 1) * 1.5 * size
        : Math.sqrt(3) * size * rows;

    const offsetX = (canvas.width - boardWidth) / 2;
    const offsetY = (canvas.height - boardHeight) / 2;
    const boardMetrics = createBoardMetrics(offsetX, offsetY, boardWidth, boardHeight, config, orientation);

    const polygons = [];

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            let centerX;
            let centerY;

            if (orientation === 'flat-top') {
                centerX = offsetX + size + col * horizSpacing;
                centerY = offsetY + hexHeight / 2 + row * vertSpacing;
                if (col % 2 !== 0) {
                    centerY += vertSpacing / 2;
                }
            } else {
                centerX = offsetX + hexWidth / 2 + col * horizSpacing;
                if (row % 2 !== 0) {
                    centerX += horizSpacing / 2;
                }
                centerY = offsetY + size + row * vertSpacing;
            }

            const center = { x: centerX, y: centerY };
            if (!shouldIncludePolygon(center, boardMetrics, config)) continue;

            const id = `hex_${row}_${col}`;
            const vertices = createHexVertices(center, size, orientation);
            const polygon = createPolygon({
                id,
                type: 'hexagon',
                center,
                vertices,
                color: colorMap?.get(id)
            });

            polygons.push(polygon);
        }
    }
    return polygons;
}

/**
 * Generates a basic row/column square grid.
 *
 * @param {Object} config - Board configuration.
 * @param {Map} [colorMap] - Previous colors keyed by polygon id.
 * @returns {Array<Object>} Square polygons.
 */
function buildSquareGrid(config, colorMap) {
    const { canvas } = appState;
    if (!canvas) return [];
    const dims = normalizeBoardDimensions(config);
    const cols = dims.cols;
    const rows = dims.rows;
    const availableWidth = canvas.width - CANVAS_PADDING * 2;
    const availableHeight = canvas.height - CANVAS_PADDING * 2;
    const size = Math.max(12, Math.floor(Math.min(availableWidth / cols, availableHeight / rows)));

    const boardWidth = size * cols;
    const boardHeight = size * rows;
    const offsetX = (canvas.width - boardWidth) / 2;
    const offsetY = (canvas.height - boardHeight) / 2;
    const boardMetrics = createBoardMetrics(offsetX, offsetY, boardWidth, boardHeight, config);

    const polygons = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const center = {
                x: offsetX + size / 2 + col * size,
                y: offsetY + size / 2 + row * size
            };
            if (!shouldIncludePolygon(center, boardMetrics, config)) continue;
            const id = `square_${row}_${col}`;
            const vertices = createSquareVertices(center, size);
            polygons.push(
                createPolygon({
                    id,
                    type: 'square',
                    center,
                    vertices,
                    color: colorMap?.get(id)
                })
            );
        }
    }
    return polygons;
}

/**
 * Generates a tessellated triangle grid alternating upright/flat
 * triangles so they interlock seamlessly.
 *
 * @param {Object} config - Board configuration.
 * @param {Map} [colorMap] - Previous colors keyed by polygon id.
 * @returns {Array<Object>} Triangle polygons.
 */
function buildTriangleGrid(config, colorMap) {
    const { canvas } = appState;
    if (!canvas) return [];
    const dims = normalizeBoardDimensions(config);
    const cols = Math.max(2, dims.cols);
    const rows = Math.max(1, dims.rows);
    const availableWidth = canvas.width - CANVAS_PADDING * 2;
    const availableHeight = canvas.height - CANVAS_PADDING * 2;
    const sizeFromWidth = (availableWidth * 2) / (cols + 1);
    const sizeFromHeight = (availableHeight * 2) / (rows * Math.sqrt(3));
    const size = Math.max(12, Math.floor(Math.min(sizeFromWidth, sizeFromHeight)));

    const triangleHeight = (Math.sqrt(3) / 2) * size;
    const boardWidth = (cols * size) / 2 + size / 2;
    const boardHeight = rows * triangleHeight;
    const offsetX = (canvas.width - boardWidth) / 2;
    const offsetY = (canvas.height - boardHeight) / 2;
    const boardMetrics = createBoardMetrics(offsetX, offsetY, boardWidth, boardHeight, config);

    const polygons = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const origin = {
                x: offsetX + (col * size) / 2,
                y: offsetY + row * triangleHeight
            };
            const pointingUp = (row + col) % 2 === 0;
            const vertices = createTriangleVertices(origin, size, pointingUp);
            const center = {
                x: (vertices[0].x + vertices[1].x + vertices[2].x) / 3,
                y: (vertices[0].y + vertices[1].y + vertices[2].y) / 3
            };
            if (!shouldIncludePolygon(center, boardMetrics, config)) continue;
            const id = `triangle_${row}_${col}`;
            polygons.push(
                createPolygon({
                    id,
                    type: 'triangle',
                    center,
                    vertices,
                    color: colorMap?.get(id),
                    metadata: { pointingUp }
                })
            );
        }
    }
    return polygons;
}

/**
 * Builds a rotated-square (diamond) grid used for orthogonal layouts.
 *
 * @param {Object} config - Board configuration.
 * @param {Map} [colorMap] - Previous colors keyed by polygon id.
 * @returns {Array<Object>} Diamond polygons.
 */
function buildDiamondGrid(config, colorMap) {
    const { canvas } = appState;
    if (!canvas) return [];
    const dims = normalizeBoardDimensions(config);
    const cols = dims.cols;
    const rows = dims.rows;
    const availableWidth = canvas.width - CANVAS_PADDING * 2;
    const availableHeight = canvas.height - CANVAS_PADDING * 2;
    const size = Math.max(12, Math.floor(Math.min(availableWidth / cols, availableHeight / rows)));
    const boardWidth = size * cols;
    const boardHeight = size * rows;
    const offsetX = (canvas.width - boardWidth) / 2;
    const offsetY = (canvas.height - boardHeight) / 2;
    const boardMetrics = createBoardMetrics(offsetX, offsetY, boardWidth, boardHeight, config);

    const polygons = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const center = {
                x: offsetX + size / 2 + col * size,
                y: offsetY + size / 2 + row * size
            };
            if (!shouldIncludePolygon(center, boardMetrics, config)) continue;
            const id = `diamond_${row}_${col}`;
            polygons.push(
                createPolygon({
                    id,
                    type: 'orthogonal-square',
                    center,
                    vertices: createDiamondVertices(center, size),
                    color: colorMap?.get(id)
                })
            );
        }
    }
    return polygons;
}

// ============================================================================
// 5) CANVAS RENDERING
// ============================================================================

/**
 * Clears the canvas and draws every polygon in its current color
 * followed by optional hover overlays.
 */
function renderBoard() {
    const { ctx, canvas, polygons, hoverPolygonId } = appState;
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    polygons.forEach((polygon) => {
        drawPolygon(polygon);
    });

    if (hoverPolygonId) {
        const hovered = polygons.find((poly) => poly.id === hoverPolygonId);
        if (hovered) {
            drawPolygon(hovered, {
                fill: hovered.color,
                stroke: HOVER_OUTLINE,
                lineWidth: 2,
                overlay: 'rgba(47, 111, 237, 0.15)'
            });
        }
    }

    if (ui.canvasPlaceholder) {
        ui.canvasPlaceholder.textContent = polygons.length
            ? 'Tap or click a tile to paint it. Use the palette to change colors.'
            : 'Configure a board and click Generate Board to begin.';
    }
}

/**
 * Draws a single polygon by filling and stroking the supplied vertices.
 *
 * @param {Object} polygon - Polygon definition from appState.
 * @param {Object} [options]
 * @param {string} [options.fill] - Override fill color.
 * @param {string} [options.stroke] - Override stroke color.
 * @param {number} [options.lineWidth] - Custom stroke width.
 * @param {string} [options.overlay] - Optional translucent overlay fill.
 */
function drawPolygon(polygon, options = {}) {
    const { ctx } = appState;
    if (!ctx) return;
    const fill = options.fill || polygon.color || DEFAULT_FILL;
    const stroke = options.stroke || GRID_STROKE;
    const lineWidth = options.lineWidth || 1;

    ctx.beginPath();
    polygon.vertices.forEach((vertex, index) => {
        if (index === 0) {
            ctx.moveTo(vertex.x, vertex.y);
        } else {
            ctx.lineTo(vertex.x, vertex.y);
        }
    });
    ctx.closePath();

    ctx.fillStyle = fill;
    ctx.fill();

    if (options.overlay) {
        ctx.save();
        ctx.fillStyle = options.overlay;
        ctx.fill();
        ctx.restore();
    }

    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
}

// ============================================================================
// 6) POINTER INTERACTION & HIT TESTING
// ============================================================================

/**
 * Handles pointer down events (mouse, touch, stylus) on the canvas.
 * Converts the click to canvas coordinates, finds the polygon, and
 * applies the current color.
 *
 * @param {PointerEvent} event - Browser pointer event.
 */
function handlePointerDown(event) {
    if (!appState.canvas) return;
    event.preventDefault();
    const point = getCanvasCoordinates(event);
    const polygon = findPolygonAtPoint(point);
    if (polygon) {
        applyColorToPolygon(polygon, appState.currentColor);
    }
}

/**
 * Tracks pointer movement for hover highlighting. This paves the way
 * for future drag tools while immediately providing feedback.
 *
 * @param {PointerEvent} event - Browser pointer event.
 */
function handlePointerMove(event) {
    if (!appState.canvas) return;
    const point = getCanvasCoordinates(event);
    const polygon = findPolygonAtPoint(point);
    const polygonId = polygon?.id || null;
    if (polygonId !== appState.hoverPolygonId) {
        appState.hoverPolygonId = polygonId;
        renderBoard();
    }
}

/**
 * Placeholder for future drag interactions. Currently a no-op so the
 * API surface is ready.
 */
function handlePointerUp() {
    // Reserved for future drag interactions
}

/**
 * Removes hover state once the pointer leaves the canvas to avoid
 * leaving stale highlights behind.
 */
function handlePointerLeave() {
    if (appState.hoverPolygonId) {
        appState.hoverPolygonId = null;
        renderBoard();
    }
}

/**
 * Converts a pointer event's client coordinates into precise canvas
 * coordinates taking into account CSS scaling and the device pixel ratio.
 *
 * @param {PointerEvent} event - Pointer event with clientX/Y.
 * @returns {{x:number,y:number}} Canvas-space coordinates.
 */
function getCanvasCoordinates(event) {
    const rect = appState.canvas.getBoundingClientRect();
    const scaleX = appState.canvas.width / rect.width;
    const scaleY = appState.canvas.height / rect.height;

    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
    };
}

/**
 * Finds the polygon that contains the provided point using bounding-box
 * rejection and the ray-casting helper for precision.
 *
 * @param {{x:number,y:number}} point - Canvas coordinates.
 * @returns {Object|null} Matching polygon or null when none.
 */
function findPolygonAtPoint(point) {
    let candidate = null;
    let smallestDistance = Infinity;

    for (const polygon of appState.polygons) {
        // Quick bounding-box rejection before running the heavier algorithm.
        const { bounds } = polygon;
        if (
            point.x < bounds.minX ||
            point.x > bounds.maxX ||
            point.y < bounds.minY ||
            point.y > bounds.maxY
        ) {
            continue;
        }
        if (isPointInPolygon(point, polygon.vertices)) {
            const distance = Math.hypot(point.x - polygon.center.x, point.y - polygon.center.y);
            if (distance < smallestDistance) {
                smallestDistance = distance;
                candidate = polygon;
            }
        }
    }
    return candidate;
}

/**
 * Updates a polygon's fill color, re-renders the canvas, and records
 * the change in the undo history.
 *
 * @param {Object} polygon - Polygon reference within appState.
 * @param {string} color - Hex color string.
 */
function applyColorToPolygon(polygon, color) {
    if (!polygon || polygon.color === color) return;
    polygon.color = color;
    renderBoard();
    recordHistory();
    markStateDirty();
}

/**
 * Resets every polygon to the default fill color while preserving the
 * existing board layout.
 */
function clearBoardColors() {
    if (!appState.polygons.length) return;
    appState.polygons.forEach((polygon) => {
        polygon.color = DEFAULT_FILL;
    });
    renderBoard();
    recordHistory();
    markStateDirty();
}

/**
 * Updates the globally selected color and toggles palette button states.
 *
 * @param {string} color - Hex color string from the palette.
 * @param {HTMLElement} button - Palette button that triggered the change.
 * @param {Object} [options]
 * @param {boolean} [options.skipRender=false] - Avoid re-rendering.
 */
function setCurrentColor(color, button, options = {}) {
    appState.currentColor = color;
    ui.paletteButtons.forEach((btn) => {
        const isSelected = btn === button;
        btn.classList.toggle('selected', isSelected);
        btn.setAttribute('aria-pressed', String(isSelected));
    });
    if (!options.skipRender) {
        renderBoard();
    }
}

// ============================================================================
// 7) HISTORY + PROJECT PERSISTENCE
// ============================================================================

/**
 * Marks the global state as needing persistence and performs an immediate
 * auto-save so the user's latest changes are captured.
 *
 * @param {boolean} [skipImmediate=false] - When true, waits for interval save.
 */
function markStateDirty(skipImmediate = false) {
    appState.isDirty = true;
    if (!skipImmediate) {
        autoSaveToLocalStorage(true);
    }
}

/**
 * Takes a lightweight snapshot of polygon colors so the user can undo.
 */
function recordHistory() {
    if (!appState.polygons.length) return;
    const snapshot = appState.polygons.map((polygon) => ({
        id: polygon.id,
        color: polygon.color
    }));

    if (appState.historyIndex < appState.history.length - 1) {
        appState.history.splice(appState.historyIndex + 1);
    }

    appState.history.push(snapshot);
    if (appState.history.length > HISTORY_LIMIT) {
        appState.history.shift();
    }
    appState.historyIndex = appState.history.length - 1;
}

/**
 * Restores polygon colors from a snapshot produced by recordHistory.
 *
 * @param {Array<{id:string,color:string}>} snapshot - Saved colors.
 */
function restoreSnapshot(snapshot) {
    if (!snapshot) return;
    const colorMap = new Map(snapshot.map((entry) => [entry.id, entry.color]));
    appState.polygons.forEach((polygon) => {
        if (colorMap.has(polygon.id)) {
            polygon.color = colorMap.get(polygon.id);
        }
    });
    renderBoard();
}

/**
 * Steps backward through the history stack if possible.
 */
function undo() {
    if (appState.historyIndex <= 0) return;
    appState.historyIndex -= 1;
    const snapshot = appState.history[appState.historyIndex];
    restoreSnapshot(snapshot);
    markStateDirty();
}

/**
 * Reapplies the next snapshot in history if available.
 */
function redo() {
    if (appState.historyIndex >= appState.history.length - 1) return;
    appState.historyIndex += 1;
    const snapshot = appState.history[appState.historyIndex];
    restoreSnapshot(snapshot);
    markStateDirty();
}

/**
 * Persists the current app state into localStorage so the browser can
 * restore it later. Automatically throttled when there are no changes.
 *
 * @param {boolean} [force=false] - When true, saves even if not marked dirty.
 */
function autoSaveToLocalStorage(force = false) {
    if (!appState.polygons.length) return;
    if (!force && !appState.isDirty) return;
    if (!window.localStorage) return;

    try {
        const payload = {
            version: '1.0',
            timestamp: Date.now(),
            projectName: appState.currentProjectName || DEFAULT_PROJECT_NAME,
            appState: serializeAppState()
        };
        localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(payload));
        appState.lastSaveTime = payload.timestamp;
        appState.isDirty = false;
    } catch (error) {
        if (error.name === 'QuotaExceededError') {
            alert('Auto-save failed: browser storage quota exceeded.');
        }
        console.error('Auto-save error:', error);
    }
}

/**
 * Retrieves any previously saved autosave payload from localStorage.
 *
 * @returns {{timestamp:number,projectName:string,appState:Object}|null}
 */
function loadAutoSave() {
    if (!window.localStorage) return null;
    try {
        const raw = localStorage.getItem(AUTO_SAVE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (error) {
        console.error('Failed to parse autosave payload.', error);
        return null;
    }
}

/**
 * Starts an interval to periodically persist the board even if the user
 * forgets to interact for a while.
 */
function setupAutoSave() {
    if (autoSaveIntervalId) {
        clearInterval(autoSaveIntervalId);
    }
    autoSaveIntervalId = window.setInterval(() => {
        autoSaveToLocalStorage();
    }, AUTO_SAVE_INTERVAL);
}

/**
 * Produces a JSON-safe snapshot of the current state.
 *
 * @returns {Object} Serializable state payload.
 */
function serializeAppState() {
    return {
        boardConfig: { ...appState.boardConfig },
        currentColor: appState.currentColor,
        polygons: clonePolygons(appState.polygons)
    };
}

/**
 * Deep clones the polygon collection so it can be stored or restored
 * without keeping references to mutable objects.
 *
 * @param {Array<Object>} polygons - Polygon list.
 * @returns {Array<Object>} Cloned polygons.
 */
function clonePolygons(polygons = []) {
    return polygons.map((polygon) => JSON.parse(JSON.stringify(polygon)));
}

/**
 * Applies a serialized state back into the application, updating the
 * board, UI controls, and palette selection.
 *
 * @param {Object} savedState - Serializable app state.
 * @param {Object} [options]
 * @param {string} [options.projectName] - Name to associate with state.
 * @param {boolean} [options.skipAutoSave=false] - Prevent immediate autosave.
 * @returns {boolean} True if restoration succeeded.
 */
function restoreState(savedState, options = {}) {
    const { projectName, skipAutoSave = false } = options;
    if (!savedState || !savedState.boardConfig) {
        return false;
    }

    appState.boardConfig = { ...savedState.boardConfig };
    appState.currentColor = savedState.currentColor || appState.currentColor;
    appState.polygons = clonePolygons(savedState.polygons || []);
    appState.hoverPolygonId = null;
    appState.history = [];
    appState.historyIndex = -1;
    updateUIFromState();
    renderBoard();
    recordHistory();
    appState.isDirty = false;
    if (projectName) {
        appState.currentProjectName = projectName;
    }
    if (!skipAutoSave) {
        autoSaveToLocalStorage(true);
    }
    return true;
}

/**
 * Syncs dropdowns, number fields, and palette selection with the
 * current in-memory state.
 */
function updateUIFromState() {
    if (ui.gridTypeSelect) ui.gridTypeSelect.value = appState.boardConfig.gridType;
    if (ui.orientationSelect) ui.orientationSelect.value = appState.boardConfig.orientation;
    if (ui.boardShapeSelect) ui.boardShapeSelect.value = appState.boardConfig.boardShape;
    if (ui.widthInput) ui.widthInput.value = appState.boardConfig.width;
    if (ui.heightInput) ui.heightInput.value = appState.boardConfig.height;

    if (ui.paletteButtons?.length) {
        const normalized = appState.currentColor?.toLowerCase();
        const match =
            ui.paletteButtons.find((btn) => {
                const btnColor = (btn.dataset.color || getComputedStyle(btn).getPropertyValue('--swatch-color')).trim().toLowerCase();
                return btnColor === normalized;
            }) || ui.paletteButtons[0];
        if (match) {
            setCurrentColor(appState.currentColor, match, { skipRender: true });
        }
    }
}

/**
 * Displays a temporary status message near the bottom of the screen.
 *
 * @param {string} message - Copy to show.
 * @param {number} [duration=3000] - Fade-out delay in milliseconds.
 */
function showNotification(message, duration = 3000) {
    if (!ui.notificationBar) return;
    ui.notificationBar.textContent = message;
    ui.notificationBar.classList.add('show');
    if (notificationTimerId) {
        clearTimeout(notificationTimerId);
    }
    notificationTimerId = window.setTimeout(() => {
        ui.notificationBar.classList.remove('show');
    }, duration);
}

/**
 * Prompts the user for a project name and downloads a JSON file
 * containing the entire board definition.
 */
function saveProjectFile() {
    if (!appState.polygons.length) {
        alert('Generate a board before saving a project.');
        return;
    }
    const defaultName = appState.currentProjectName || DEFAULT_PROJECT_NAME;
    const input = prompt('Enter a project name', defaultName);
    if (!input) return;
    const trimmedName = input.trim();
    appState.currentProjectName = trimmedName || DEFAULT_PROJECT_NAME;
    const payload = {
        version: '1.0',
        projectName: appState.currentProjectName,
        created: new Date().toISOString(),
        appState: serializeAppState()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const filename = `${sanitizeFileName(appState.currentProjectName)}.protogames.json`;
    triggerBlobDownload(blob, filename);
    appState.lastSaveTime = Date.now();
    appState.isDirty = false;
    showNotification('Project saved', 3500);
    autoSaveToLocalStorage(true);
}

/**
 * Reads a user-selected project file, validates it, and restores the
 * contained board state after prompting to confirm.
 *
 * @param {Event} event - Change event fired by the hidden file input.
 */
function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
        try {
            const payload = JSON.parse(loadEvent.target.result);
            if (!validateProjectFile(payload)) {
                throw new Error('This file does not look like a Protogames project.');
            }
            if (
                appState.polygons.length &&
                !confirm('Loading a project will replace your current board. Continue?')
            ) {
                return;
            }
            restoreState(payload.appState, { projectName: payload.projectName });
            showNotification('Project loaded', 3500);
        } catch (error) {
            console.error('Load error:', error);
            alert(error.message || 'Unable to load project file.');
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

/**
 * Ensures the project file adheres to the expected schema before loading.
 *
 * @param {Object} data - Parsed JSON file.
 * @returns {boolean} True when the structure matches expectations.
 */
function validateProjectFile(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.version !== '1.0') return false;
    if (!data.appState || typeof data.appState !== 'object') return false;
    if (!Array.isArray(data.appState.polygons)) return false;
    if (!data.appState.boardConfig) return false;
    return true;
}

/**
 * Hooks the visible save/load buttons to their underlying behaviors.
 */
function setupFileUpload() {
    if (ui.saveButton) {
        ui.saveButton.addEventListener('click', saveProjectFile);
    }
    if (ui.loadButton && ui.loadInput) {
        ui.loadButton.addEventListener('click', () => ui.loadInput.click());
    }
    if (ui.loadInput) {
        ui.loadInput.addEventListener('change', handleFileUpload);
    }
}

/**
 * Exports the board as a PNG image by using the canvas bitmap.
 *
 * @param {string} [filenameBase] - Optional base filename sans extension.
 */
function exportToPNG(filenameBase) {
    if (!appState.canvas || !appState.polygons.length) {
        alert('Generate a board before exporting.');
        return;
    }
    renderBoard();
    const dataUrl = appState.canvas.toDataURL('image/png');
    const base = filenameBase || appState.currentProjectName || DEFAULT_PROJECT_NAME;
    triggerDataUrlDownload(dataUrl, `${sanitizeFileName(base)}.png`);
    showNotification('PNG exported', 3000);
}

/**
 * Converts every polygon into an SVG path string and downloads the result.
 *
 * @param {string} [filenameBase] - Base file name.
 */
function exportToSVG(filenameBase) {
    if (!appState.canvas || !appState.polygons.length) {
        alert('Generate a board before exporting.');
        return;
    }
    const { width, height } = appState.canvas;
    const paths = appState.polygons
        .map((polygon) => {
            const vertexCommands = (polygon.vertices || [])
                .map((vertex, index) => `${index === 0 ? 'M' : 'L'} ${vertex.x.toFixed(2)} ${vertex.y.toFixed(2)}`)
                .join(' ');
            const fill = polygon.color || DEFAULT_FILL;
            return `<path d="${vertexCommands} Z" fill="${fill}" stroke="${GRID_STROKE}" stroke-width="1" />`;
        })
        .join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${paths}</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const base = filenameBase || appState.currentProjectName || DEFAULT_PROJECT_NAME;
    triggerBlobDownload(blob, `${sanitizeFileName(base)}.svg`);
    showNotification('SVG exported', 3000);
}

/**
 * Opens the canvas bitmap in a separate tab so the user can print or
 * use the browser's "Save as PDF" feature.
 *
 * @param {string} [filenameBase] - Optional name for the print window.
 */
function exportToPDF(filenameBase) {
    if (!appState.canvas || !appState.polygons.length) {
        alert('Generate a board before exporting.');
        return;
    }
    renderBoard();
    const dataUrl = appState.canvas.toDataURL('image/png');
    const base = filenameBase || appState.currentProjectName || DEFAULT_PROJECT_NAME;
    const win = window.open('', '_blank');
    if (!win) {
        alert('Please allow pop-ups to export to PDF.');
        return;
    }
    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head><title>${base}</title></head>
        <body style="margin:0;display:flex;align-items:center;justify-content:center;background:#f5f5f5;">
            <img src="${dataUrl}" style="max-width:100%;height:auto;" alt="Protogames board snapshot">
        </body>
        </html>
    `);
    win.document.close();
    win.focus();
    win.onload = () => win.print();
    showNotification('PDF export ready (use browser print dialog)', 4000);
}

/**
 * Wires export buttons to the appropriate handlers.
 */
function setupExportButtons() {
    if (ui.exportPNGBtn) {
        ui.exportPNGBtn.addEventListener('click', () => exportToPNG());
    }
    if (ui.exportSVGBtn) {
        ui.exportSVGBtn.addEventListener('click', () => exportToSVG());
    }
    if (ui.exportPDFBtn) {
        ui.exportPDFBtn.addEventListener('click', () => exportToPDF());
    }
}

/**
 * Normalizes user-provided file names to avoid invalid characters.
 *
 * @param {string} name - Raw user input.
 * @returns {string} Safe filename.
 */
function sanitizeFileName(name = DEFAULT_PROJECT_NAME) {
    return name.replace(/[<>:"/\\|?*]+/g, '').trim() || DEFAULT_PROJECT_NAME;
}

/**
 * Downloads a Blob as a file via a temporary anchor tag.
 *
 * @param {Blob} blob - File contents.
 * @param {string} filename - Desired file name.
 */
function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

/**
 * Downloads a data URL by simulating an anchor click.
 *
 * @param {string} dataUrl - Encoded file data.
 * @param {string} filename - File name.
 */
function triggerDataUrlDownload(dataUrl, filename) {
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
}
