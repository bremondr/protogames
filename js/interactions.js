/**
 * PROTOGAMES INTERACTIONS
 * --------------------------------------------------------------
 * Handles pointer input, palette selection, and board generation
 * wiring. This module does not know about DOM querying; it simply
 * receives references from the UI module during initialization.
 */
const Interactions = (() => {
    let ui = null;

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
        canvas.addEventListener('pointerleave', handlePointerLeave);
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

    function handlePointerDown(event) {
        event.preventDefault();
        const point = getCanvasCoordinates(event);
        const polygon = Geometry.findPolygonAtPoint(point, AppState.getState().polygons);
        if (polygon) {
            applyColorToPolygon(polygon, AppState.getState().currentColor);
        }
    }

    function handlePointerMove(event) {
        const point = getCanvasCoordinates(event);
        const polygon = Geometry.findPolygonAtPoint(point, AppState.getState().polygons);
        const polygonId = polygon?.id || null;
        if (polygonId !== AppState.getState().hoverPolygonId) {
            AppState.setHoverPolygonId(polygonId);
            Renderer.renderBoard();
        }
    }

    function handlePointerUp() {
        // Reserved for future drag interactions.
    }

    function handlePointerLeave() {
        if (AppState.getState().hoverPolygonId) {
            AppState.setHoverPolygonId(null);
            Renderer.renderBoard();
        }
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

    function applyColorToPolygon(polygon, color) {
        if (!polygon || polygon.color === color) return;
        polygon.color = color;
        Renderer.renderBoard();
        AppState.recordHistory();
        AppState.markDirty();
        FileManager.autoSaveToLocalStorage(true);
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
