/**
 * PROTOGAMES INTERACTIONS
 * --------------------------------------------------------------
 * Handles pointer input, palette selection, and board generation
 * wiring. This module does not know about DOM querying; it simply
 * receives references from the UI module during initialization.
 */
const Interactions = (() => {
    let ui = null;
    // Ensures move events are processed at most ~60fps for smooth brushing.
    const MOVE_THROTTLE_MS = 16;
    let lastMoveTimestamp = 0;

    function init(uiRefs) {
        ui = uiRefs;
        bindPointerEvents();
        bindPaletteEvents();
        bindBoardControls();
        bindActionButtons();
    }

    function bindPointerEvents() {
        const canvas = ui?.canvas;
        if (!canvas) return;
        canvas.addEventListener('pointerdown', handlePointerDown);
        canvas.addEventListener('pointermove', handlePointerMove);
        canvas.addEventListener('pointerup', handlePointerUp);
        canvas.addEventListener('pointerleave', handlePointerCancel);
        canvas.addEventListener('pointercancel', handlePointerCancel);
    }

    function bindPaletteEvents() {
        ui?.paletteButtons?.forEach((button) => {
            button.addEventListener('click', () => handleColorSelect(button));
        });
    }

    function bindBoardControls() {
        ui?.generateButton?.addEventListener('click', handleBoardGeneration);
    }

    function bindActionButtons() {
        ui?.undoButton?.addEventListener('click', handleUndo);
        ui?.redoButton?.addEventListener('click', handleRedo);
        ui?.clearButton?.addEventListener('click', handleClearBoard);
    }

    function handleColorSelect(button) {
        const color =
            button.dataset.color ||
            getComputedStyle(button).getPropertyValue('--swatch-color').trim();
        AppState.setCurrentColor(color);
        UI?.setPaletteSelection(button);
    }

    function handleBoardGeneration() {
        const config = UI?.getBoardConfig();
        if (!config) return;
        generateBoard(config);
        UI?.showNotification('Board generated');
    }

    function handleUndo() {
        const snapshot = AppState.undo();
        if (!snapshot) return;
        AppState.restoreSnapshot(snapshot);
        Renderer.renderBoard();
    }

    function handleRedo() {
        const snapshot = AppState.redo();
        if (!snapshot) return;
        AppState.restoreSnapshot(snapshot);
        Renderer.renderBoard();
    }

    function handleClearBoard() {
        const state = AppState.getState();
        if (!state.polygons.length) return;
        state.polygons.forEach((polygon) => {
            polygon.color = Config.DEFAULT_FILL;
        });
        Renderer.renderBoard();
        AppState.recordHistory();
        AppState.markDirty();
        FileManager.autoSaveToLocalStorage(true);
    }

    /**
     * Handles pointer presses by entering drawing mode and coloring
     * the polygon immediately under the cursor/touch.
     *
     * @param {PointerEvent} event - Pointer down event.
     */
    function handlePointerDown(event) {
        event.preventDefault();
        const point = getCanvasCoordinates(event);
        const state = AppState.getState();
        const polygon = Geometry.findPolygonAtPoint(point, state.polygons);
        AppState.setDrawingActive(true, polygon?.id || null);
        if (polygon) {
            applyColorToPolygon(polygon, state.currentColor, { recordHistory: false, markDirty: false });
            Renderer.renderBoard();
        }
    }

    /**
     * Handles pointer movement for both hover feedback and brush coloring.
     * Movement events are throttled so dragging feels smooth even on tablets.
     *
     * @param {PointerEvent} event - Pointer move event.
     */
    function handlePointerMove(event) {
        const state = AppState.getState();
        const point = getCanvasCoordinates(event);

        if (state.isDrawing) {
            const now = performance.now();
            if (now - lastMoveTimestamp < MOVE_THROTTLE_MS) {
                return;
            }
            lastMoveTimestamp = now;
            const polygon = Geometry.findPolygonAtPoint(point, state.polygons);
            if (polygon && polygon.id !== state.lastColoredPolygonId) {
                applyColorToPolygon(polygon, state.currentColor, { recordHistory: false, markDirty: false });
                AppState.setLastColoredPolygonId(polygon.id);
                Renderer.renderBoard();
            }
            return;
        }

        const polygon = Geometry.findPolygonAtPoint(point, state.polygons);
        const polygonId = polygon?.id || null;
        if (polygonId !== state.hoverPolygonId) {
            AppState.setHoverPolygonId(polygonId);
            Renderer.renderBoard();
        }
    }

    /**
     * Finalizes a brush stroke by recording history and resetting drawing flags.
     */
    function handlePointerUp() {
        const state = AppState.getState();
        if (!state.isDrawing) return;
        const didColor = Boolean(state.lastColoredPolygonId);
        AppState.setDrawingActive(false);
        if (didColor) {
            AppState.recordHistory();
            AppState.markDirty();
            FileManager.autoSaveToLocalStorage(true);
        }
        Renderer.renderBoard();
    }

    /**
     * Cancels drawing when the pointer leaves the canvas or touch is interrupted.
     */
    function handlePointerCancel() {
        const state = AppState.getState();
        if (state.isDrawing) {
            const didColor = Boolean(state.lastColoredPolygonId);
            AppState.setDrawingActive(false);
            if (didColor) {
                AppState.recordHistory();
                AppState.markDirty();
                FileManager.autoSaveToLocalStorage(true);
            }
        }
        if (state.hoverPolygonId) {
            AppState.setHoverPolygonId(null);
        }
        Renderer.renderBoard();
    }

    /**
     * Converts pointer event coordinates into canvas space accounting
     * for CSS scaling.
     *
     * @param {PointerEvent} event - Browser pointer event.
     * @returns {{x:number,y:number}} Coordinate inside the canvas.
     */
    function getCanvasCoordinates(event) {
        const canvas = AppState.getState().canvas;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY
        };
    }

    /**
     * Applies a color to a polygon with optional history/dirty tracking.
     *
     * @param {Object} polygon - Polygon to update.
     * @param {string} color - Hex color string.
     * @param {Object} [options] - Behavior flags.
     * @param {boolean} [options.recordHistory=true] - Whether to snapshot history.
     * @param {boolean} [options.markDirty=true] - Whether to mark state dirty/autosave.
     */
    function applyColorToPolygon(polygon, color, options = {}) {
        const { recordHistory = true, markDirty = true } = options;
        if (!polygon || polygon.color === color) return;
        polygon.color = color;
        if (recordHistory) {
            AppState.recordHistory();
        }
        if (markDirty) {
            AppState.markDirty();
            FileManager.autoSaveToLocalStorage(true);
        }
    }

    /**
     * Generates a new polygon set using the supplied configuration.
     *
     * @param {Object} config - Board settings (grid, size, orientation).
     * @param {Object} [options] - Additional flags for regeneration.
     */
    function generateBoard(config, options = {}) {
        const state = AppState.getState();
        const colorMap =
            options.preserveColors && state.polygons.length
                ? new Map(state.polygons.map((polygon) => [polygon.id, polygon.color]))
                : null;
        const polygons = Geometry.generateGrid(config, state.canvas, colorMap);
        AppState.setPolygons(polygons);
        AppState.updateBoardConfig(config);
        Renderer.renderBoard();
        UI?.updateCanvasMessage(polygons.length);

        if (!options.preserveHistory) {
            AppState.resetHistory();
            AppState.recordHistory();
        } else if (state.history.length) {
            const snapshot = state.history[state.historyIndex];
            AppState.restoreSnapshot(snapshot);
            Renderer.renderBoard();
        }

        if (!options.skipDirtyFlag) {
            AppState.markDirty();
            FileManager.autoSaveToLocalStorage(true);
        } else {
            AppState.clearDirty();
        }
    }

    return {
        init,
        generateBoard
    };
})();
