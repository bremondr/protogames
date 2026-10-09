/**
 * PROTOGAMES APPLICATION STATE
 * --------------------------------------------------------------
 * Centralized store for canvas references, polygon data, history
 * stacks, and other user selections. Modules interact with the
 * state through this API to keep mutations predictable.
 */
const AppState = (() => {
    const state = {
        canvas: null,
        ctx: null,
        polygons: [],
        boardConfig: { ...Config.DEFAULT_BOARD_CONFIG },
        currentColor: Config.getDefaultPalette().colors[0].hex,
        currentPaletteId: Config.DEFAULT_PALETTE_ID,
        availablePalettes: [],
        /**
         * When true, painting uses the eraser and resets tiles to the default
         * blank color instead of applying a swatch color.
         */
        isEraserActive: false,
        /** When true, clicks place the current object instead of painting terrain. */
        isObjectToolActive: false,
        currentObject: 'castle',
        /**
         * How strokes are applied: 'brush' paints tiles under the pointer, 'fill'
         * floods the connected region, 'line' paints a tile path between two tiles.
         * The paint source (colour, eraser or object) is chosen separately.
         */
        drawMode: 'brush',
        /** Playtest mode: editing is locked (painting, tools and editing shortcuts are off); pan and zoom still work. */
        playtest: false,
        /** Pan/zoom: screen = world * scale + (x, y). Reset whenever a new board is set. */
        view: { scale: 1, x: 0, y: 0 },
        /** Line tool: tile the line started on, and the tiles currently previewed. */
        lineStartId: null,
        linePreviewIds: [],
        /**
         * Controls whether auto-save is enabled. When false, auto-save timers
         * and save attempts are skipped.
         */
        autoSaveEnabled: true,
        hoverPolygonId: null,
        /** Tiles outlined under the pointer (several when the brush is larger than 1). */
        hoverIds: [],
        /** Brush size: 1 = single tile, n = tiles within n - 1 steps of the pointer tile. */
        brushSize: 1,
        history: [],
        historyIndex: -1,
        currentProjectName: null,
        lastSaveTime: null,
        isDirty: false,
        /**
         * Indicates whether the user currently has a pointer pressed down
         * and is brushing across the board.
         */
        isDrawing: false,
        /**
         * Stores the last polygon id colored during a single drag action
         * to avoid repainting the same cell repeatedly.
         */
        lastColoredPolygonId: null
    };

    /**
     * Saves the canvas/context references after initialization.
     *
     * @param {HTMLCanvasElement} canvas - Canvas element.
     * @param {CanvasRenderingContext2D} ctx - 2D rendering context.
     */
    function setCanvas(canvas, ctx) {
        state.canvas = canvas;
        state.ctx = ctx;
    }

    /**
     * Returns the entire application state object (mutable).
     *
     * @returns {Object} Internal state reference.
     */
    function getState() {
        return state;
    }

    /**
     * Updates stored polygons and resets hover selection.
     *
     * @param {Array<Object>} polygons - Fresh polygon array.
     */
    function setPolygons(polygons) {
        state.polygons = polygons;
        state.hoverPolygonId = null;
        state.hoverIds = [];
        state.view = ViewMath.identity();
        clearLinePreview();
    }

    /**
     * Merges a new board configuration into the current state.
     *
     * @param {Object} config - Partial board configuration.
     */
    function updateBoardConfig(config) {
        state.boardConfig = { ...state.boardConfig, ...config };
    }

    /**
     * Updates the list of palettes made available to the UI.
     *
     * @param {Array<Object>} palettes - Palette definitions.
     */
    function setAvailablePalettes(palettes) {
        state.availablePalettes = Array.isArray(palettes) ? palettes.slice() : [];
    }

    /**
     * Updates the palette color used when painting.
     *
     * @param {string} color - Hex color string.
     */
    function setCurrentColor(color) {
        state.currentColor = color;
    }

    /**
     * Toggles the eraser mode flag.
     *
     * @param {boolean} active - Whether the eraser should be active.
     */
    function setEraserActive(active) {
        state.isEraserActive = Boolean(active);
    }

    function setObjectToolActive(active) {
        state.isObjectToolActive = Boolean(active);
    }

    function setCurrentObject(id) {
        state.currentObject = id;
    }

    /** Sets the brush size, clamped to the allowed range. Returns the size now in effect. */
    function setBrushSize(size) {
        const wanted = Math.round(Number(size));
        const value = Number.isFinite(wanted) ? wanted : state.brushSize;
        state.brushSize = Math.min(Config.BRUSH_SIZE_MAX, Math.max(Config.BRUSH_SIZE_MIN, value));
        return state.brushSize;
    }

    function setView(view) {
        state.view = { scale: view.scale, x: view.x, y: view.y };
    }

    function resetView() {
        state.view = ViewMath.identity();
    }

    function setPlaytest(on) {
        state.playtest = Boolean(on);
    }

    const DRAW_MODES = ['brush', 'fill', 'line'];

    function setDrawMode(mode) {
        if (!DRAW_MODES.includes(mode)) return;
        state.drawMode = mode;
        clearLinePreview();
    }

    /** Remembers where a line started (null to clear) and drops any previewed path. */
    function setLineStart(id) {
        state.lineStartId = id;
        state.linePreviewIds = id ? [id] : [];
    }

    function setLinePreview(ids) {
        state.linePreviewIds = ids;
    }

    function clearLinePreview() {
        state.lineStartId = null;
        state.linePreviewIds = [];
    }

    // Adjacency and the point locator only depend on tile geometry, which is fixed
    // for a given polygons array (colours/objects change in place), so cache per array.
    const topologyCache = new WeakMap();

    /**
     * Lazily built { adjacency, locate } for the current tiles. Tile order in
     * the adjacency matches state.polygons.
     */
    function getTopology() {
        const polygons = state.polygons;
        let topology = topologyCache.get(polygons);
        if (!topology) {
            topology = {
                adjacency: Geometry.buildAdjacency(polygons),
                locate: Geometry.buildLocator(polygons).locate
            };
            topologyCache.set(polygons, topology);
        }
        return topology;
    }

    /**
     * Updates the auto-save enabled flag.
     *
     * @param {boolean} enabled - True to enable auto-save, false to disable.
     */
    function setAutoSaveEnabled(enabled) {
        state.autoSaveEnabled = Boolean(enabled);
    }

    /**
     * Tracks the active palette id for palette switching and persistence.
     *
     * @param {string} paletteId - Palette identifier.
     */
    function setCurrentPaletteId(paletteId) {
        state.currentPaletteId = paletteId;
    }

    /**
     * Tracks which polygon is currently highlighted.
     *
     * @param {string|null} id - Polygon id or null when none.
     */
    function setHoverPolygonId(id, ids) {
        state.hoverPolygonId = id;
        state.hoverIds = id ? ids || [id] : [];
    }

    /**
     * Stores the current project name for save/export actions.
     *
     * @param {string} name - Project label.
     */
    function setProjectName(name) {
        state.currentProjectName = name;
    }

    /**
     * Toggles drawing mode when the user is actively brushing.
     *
     * @param {boolean} active - Whether drawing is active.
     * @param {string|null} [polygonId=null] - Polygon already colored when drawing starts.
     */
    function setDrawingActive(active, polygonId = null) {
        state.isDrawing = active;
        state.lastColoredPolygonId = active ? polygonId : null;
    }

    /**
     * Persists the last polygon colored while dragging so we do not repaint
     * the same shape multiple times during a single brush stroke.
     *
     * @param {string|null} id - Polygon identifier or null to clear.
     */
    function setLastColoredPolygonId(id) {
        state.lastColoredPolygonId = id;
    }

    function markDirty() {
        state.isDirty = true;
    }

    function clearDirty() {
        state.isDirty = false;
    }

    /**
     * Pushes the current polygon colors into the undo stack.
     */
    function recordHistory() {
        if (!state.polygons.length) return;
        const snapshot = state.polygons.map((polygon) => ({
            id: polygon.id,
            color: polygon.color,
            object: polygon.object || null
        }));

        if (state.historyIndex < state.history.length - 1) {
            state.history.splice(state.historyIndex + 1);
        }

        state.history.push(snapshot);
        if (state.history.length > Config.HISTORY_LIMIT) {
            state.history.shift();
        }
        state.historyIndex = state.history.length - 1;
    }

    /**
     * Applies colors from a snapshot back to the active polygons.
     *
     * @param {Array<{id:string,color:string}>} snapshot - Stored colors.
     */
    function restoreSnapshot(snapshot) {
        if (!snapshot) return;
        const entries = new Map(snapshot.map((entry) => [entry.id, entry]));
        state.polygons.forEach((polygon) => {
            const entry = entries.get(polygon.id);
            if (entry) {
                polygon.color = entry.color;
                if (entry.object) polygon.object = entry.object; else delete polygon.object;
            }
        });
    }

    /**
     * Resets the undo stack, typically after generating a new board.
     */
    function resetHistory() {
        state.history = [];
        state.historyIndex = -1;
    }

    /**
     * Rewrites tile colours everywhere they are remembered: the tiles and every undo step.
     * A theme edit changes colours that no longer exist in any palette, so a snapshot left
     * as it was would bring the old ones back on undo, resize or playtest.
     *
     * @param {Map<string,string>} remap - lower-case old colour -> new colour.
     * @returns {number} How many tiles of the board changed.
     */
    function remapColors(remap) {
        const apply = (entry) => {
            const next = remap.get(String(entry.color).toLowerCase());
            if (!next || next.toLowerCase() === String(entry.color).toLowerCase()) return false;
            entry.color = next;
            return true;
        };
        let changed = 0;
        state.polygons.forEach((polygon) => { if (apply(polygon)) changed += 1; });
        state.history.forEach((snapshot) => snapshot.forEach(apply));
        return changed;
    }

    /**
     * Steps back to the previous snapshot and forgets the step left behind, so it cannot be redone.
     * Used to take back a change that should never have counted (a fill when a pinch begins).
     */
    function discardLastStep() {
        if (state.historyIndex <= 0) return null;
        state.history.splice(state.historyIndex);
        state.historyIndex -= 1;
        return state.history[state.historyIndex];
    }

    function undo() {
        if (state.historyIndex <= 0) return null;
        state.historyIndex -= 1;
        return state.history[state.historyIndex];
    }

    function redo() {
        if (state.historyIndex >= state.history.length - 1) return null;
        state.historyIndex += 1;
        return state.history[state.historyIndex];
    }

    return {
        setCanvas,
        getState,
        setPolygons,
        updateBoardConfig,
        setAvailablePalettes,
        setCurrentColor,
        setEraserActive,
        setObjectToolActive,
        setCurrentObject,
        setDrawMode,
        setPlaytest,
        setBrushSize,
        setView,
        resetView,
        setLineStart,
        setLinePreview,
        clearLinePreview,
        getTopology,
        setAutoSaveEnabled,
        setCurrentPaletteId,
        setHoverPolygonId,
        setProjectName,
        setDrawingActive,
        setLastColoredPolygonId,
        markDirty,
        clearDirty,
        recordHistory,
        restoreSnapshot,
        resetHistory,
        remapColors,
        discardLastStep,
        undo,
        redo
    };
})();
