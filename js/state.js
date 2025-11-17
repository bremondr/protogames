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
        hoverPolygonId: null,
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
    function setHoverPolygonId(id) {
        state.hoverPolygonId = id;
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
            color: polygon.color
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
        const colorMap = new Map(snapshot.map((entry) => [entry.id, entry.color]));
        state.polygons.forEach((polygon) => {
            if (colorMap.has(polygon.id)) {
                polygon.color = colorMap.get(polygon.id);
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
        undo,
        redo
    };
})();
