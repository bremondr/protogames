// Protogames Canvas + Grid implementation
// Sections: setup/config, geometry utilities, grid builders, rendering, interaction, state persistence.

const CANVAS_PADDING = 48;
const HISTORY_LIMIT = 50;
const DEFAULT_FILL = '#ffffff';
const GRID_STROKE = '#333741';
const HOVER_OUTLINE = '#2f6fed';

const appState = {
    canvas: null,
    ctx: null,
    polygons: [],
    boardConfig: {
        gridType: 'hexagon',
        orientation: 'pointy-top',
        boardShape: 'rectangle',
        width: 12,
        height: 12
    },
    currentColor: '#0b3d1d',
    hoverPolygonId: null,
    history: [],
    historyIndex: -1
};

const ui = {};

window.addEventListener('DOMContentLoaded', () => {
    cacheUIReferences();
    initializeCanvas();
    setupEventListeners();
    initializePaletteState();
    syncBoardConfigFromUI();
    generateBoard(appState.boardConfig);
});

// -----------------------------
// UI + State Setup
// -----------------------------

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
    ui.saveButton = document.querySelector('[data-action="save-project"]');
    ui.loadInput = document.getElementById('loadProject');
    ui.exportSelect = document.querySelector('select[name="exportType"]');
}

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

function setupEventListeners() {
    window.addEventListener('resize', () => {
        const previousConfig = { ...appState.boardConfig };
        initializeCanvas();
        if (appState.polygons.length) {
            generateBoard(previousConfig, { preserveColors: true, preserveHistory: true });
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

    if (ui.saveButton) {
        ui.saveButton.addEventListener('click', exportProjectFile);
    }

    if (ui.loadInput) {
        ui.loadInput.addEventListener('change', handleProjectLoad);
    }

    if (ui.exportSelect) {
        ui.exportSelect.addEventListener('change', handleExportSelection);
    }

    if (ui.canvas) {
        ui.canvas.addEventListener('pointerdown', handlePointerDown);
        ui.canvas.addEventListener('pointermove', handlePointerMove);
        ui.canvas.addEventListener('pointerup', handlePointerUp);
        ui.canvas.addEventListener('pointerleave', handlePointerLeave);
    }
}

function initializePaletteState() {
    const defaultButton = ui.paletteButtons.find((btn) => btn.classList.contains('selected')) || ui.paletteButtons[0];
    if (defaultButton) {
        const color = defaultButton.dataset.color || getComputedStyle(defaultButton).getPropertyValue('--swatch-color');
        setCurrentColor(color.trim(), defaultButton, { skipRender: true });
    }
}

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

function normalizeGridType(value) {
    if (value.includes('hex')) return 'hexagon';
    if (value.includes('orthogonal')) return 'orthogonal-square';
    if (value.includes('triangle')) return 'triangle';
    return 'square';
}

function normalizeOrientation(value) {
    if (value.includes('pointy')) return 'pointy-top';
    if (value.includes('flat')) return 'flat-top';
    if (value.includes('diag')) return 'diagonal';
    return 'orthogonal';
}

// -----------------------------
// Polygon + Geometry Utilities
// -----------------------------

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

function isPointInPolygon(point, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const xi = vertices[i].x;
        const yi = vertices[i].y;
        const xj = vertices[j].x;
        const yj = vertices[j].y;

        const intersect =
            yi > point.y !== yj > point.y &&
            point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

        if (intersect) {
            inside = !inside;
        }
    }
    return inside;
}

function shouldIncludePolygon(center, boardMetrics, config) {
    if (!boardMetrics) return true;
    if (config.boardShape === 'hexagon' && boardMetrics.outline) {
        return isPointInPolygon(center, boardMetrics.outline);
    }
    return true;
}

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

function normalizeBoardDimensions(config) {
    const width = Math.max(1, Math.round(config.width));
    const height = Math.max(1, Math.round(config.height));
    if (config.boardShape === 'square') {
        const size = Math.min(width, height);
        return { cols: size, rows: size };
    }
    return { cols: width, rows: height };
}

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

function createSquareVertices(center, size) {
    const half = size / 2;
    return [
        { x: center.x - half, y: center.y - half },
        { x: center.x + half, y: center.y - half },
        { x: center.x + half, y: center.y + half },
        { x: center.x - half, y: center.y + half }
    ];
}

function createDiamondVertices(center, size) {
    const half = size / 2;
    return [
        { x: center.x, y: center.y - half },
        { x: center.x + half, y: center.y },
        { x: center.x, y: center.y + half },
        { x: center.x - half, y: center.y }
    ];
}

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

// -----------------------------
// Grid Builders
// -----------------------------

function generateBoard(config, options = {}) {
    const { preserveColors = false, preserveHistory = false } = options;
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
}

function buildHexGrid(config, colorMap) {
    const { canvas } = appState;
    if (!canvas) return [];
    const dims = normalizeBoardDimensions(config);
    const cols = dims.cols;
    const rows = dims.rows;
    const orientation = config.orientation === 'flat-top' ? 'flat-top' : 'pointy-top';

    const availableWidth = canvas.width - CANVAS_PADDING * 2;
    const availableHeight = canvas.height - CANVAS_PADDING * 2;

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

// -----------------------------
// Rendering
// -----------------------------

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

// -----------------------------
// Interaction & Hit Testing
// -----------------------------

function handlePointerDown(event) {
    if (!appState.canvas) return;
    event.preventDefault();
    const point = getCanvasCoordinates(event);
    const polygon = findPolygonAtPoint(point);
    if (polygon) {
        applyColorToPolygon(polygon, appState.currentColor);
    }
}

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

function handlePointerUp() {
    // Reserved for future drag interactions
}

function handlePointerLeave() {
    if (appState.hoverPolygonId) {
        appState.hoverPolygonId = null;
        renderBoard();
    }
}

function getCanvasCoordinates(event) {
    const rect = appState.canvas.getBoundingClientRect();
    const scaleX = appState.canvas.width / rect.width;
    const scaleY = appState.canvas.height / rect.height;

    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
    };
}

function findPolygonAtPoint(point) {
    let candidate = null;
    let smallestDistance = Infinity;

    for (const polygon of appState.polygons) {
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

function applyColorToPolygon(polygon, color) {
    if (!polygon || polygon.color === color) return;
    polygon.color = color;
    renderBoard();
    recordHistory();
}

function clearBoardColors() {
    if (!appState.polygons.length) return;
    appState.polygons.forEach((polygon) => {
        polygon.color = DEFAULT_FILL;
    });
    renderBoard();
    recordHistory();
}

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

// -----------------------------
// History + Persistence
// -----------------------------

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

function undo() {
    if (appState.historyIndex <= 0) return;
    appState.historyIndex -= 1;
    const snapshot = appState.history[appState.historyIndex];
    restoreSnapshot(snapshot);
}

function redo() {
    if (appState.historyIndex >= appState.history.length - 1) return;
    appState.historyIndex += 1;
    const snapshot = appState.history[appState.historyIndex];
    restoreSnapshot(snapshot);
}

function exportProjectFile() {
    if (!appState.polygons.length) {
        alert('Generate a board before saving a project.');
        return;
    }
    const payload = {
        version: '1.0',
        boardConfig: appState.boardConfig,
        colors: appState.polygons.map((polygon) => ({
            id: polygon.id,
            color: polygon.color
        }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'protogames-project.json';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

function handleProjectLoad(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
        try {
            const payload = JSON.parse(loadEvent.target.result);
            if (!payload.boardConfig || !Array.isArray(payload.colors)) {
                throw new Error('Invalid project file.');
            }
            applyLoadedProject(payload);
        } catch (error) {
            console.error(error);
            alert('Unable to load project file.');
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

function applyLoadedProject(payload) {
    const config = {
        ...payload.boardConfig,
        gridType: payload.boardConfig.gridType || 'hexagon',
        orientation: payload.boardConfig.orientation || 'pointy-top',
        boardShape: payload.boardConfig.boardShape || 'rectangle'
    };

    // Reflect config in UI
    if (ui.gridTypeSelect) ui.gridTypeSelect.value = config.gridType;
    if (ui.orientationSelect) ui.orientationSelect.value = config.orientation;
    if (ui.boardShapeSelect) ui.boardShapeSelect.value = config.boardShape;
    if (ui.widthInput) ui.widthInput.value = config.width;
    if (ui.heightInput) ui.heightInput.value = config.height;

    generateBoard(config);
    const snapshot = payload.colors.map((entry) => ({
        id: entry.id,
        color: entry.color
    }));
    restoreSnapshot(snapshot);
    recordHistory();
}

function handleExportSelection(event) {
    const format = event.target.value;
    alert(`Export to ${format} will be available in the next phase.`);
    event.target.selectedIndex = 0;
}
