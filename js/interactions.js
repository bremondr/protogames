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
        const paletteGrid = ui?.paletteGrid;
        paletteGrid?.addEventListener('click', (event) => {
            const button = event.target.closest('.palette-swatch');
            if (!button || !paletteGrid.contains(button)) return;
            handleColorSelect(button);
        });

        const paletteSelect = ui?.paletteSelect;
        paletteSelect?.addEventListener('change', () => handlePaletteChange(paletteSelect.value));

        const eraserButton = ui?.eraserButton;
        eraserButton?.addEventListener('click', handleEraserSelect);
    }

    function bindBoardControls() {
        ui?.generateButton?.addEventListener('click', handleBoardGeneration);
    }

    function bindActionButtons() {
        ui?.undoButton?.addEventListener('click', handleUndo);
        ui?.redoButton?.addEventListener('click', handleRedo);
        ui?.clearButton?.addEventListener('click', handleClearBoard);
        ui?.randomFillButton?.addEventListener('click', handleRandomFill);
    }

    function handleColorSelect(button) {
        const color =
            button.dataset.color ||
            getComputedStyle(button).getPropertyValue('--swatch-color').trim();
        AppState.setCurrentColor(color);
        AppState.setEraserActive(false);
        UI?.setPaletteSelection(button);
        UI?.setEraserActive(false);
    }

    /**
     * Switches to a different palette, preserving the current color when
     * available inside the new palette; otherwise selects the first swatch.
     *
     * @param {string} paletteId - Requested palette id.
     */
    function handlePaletteChange(paletteId) {
        const palette = Config.getPaletteById(paletteId) || Config.getDefaultPalette();
        const state = AppState.getState();
        const currentColor = state.currentColor;
        const resolved = UI.renderColorPalette(palette.id, currentColor);

        AppState.setEraserActive(false);
        AppState.setCurrentPaletteId(palette.id);
        AppState.setCurrentColor(resolved.color);
        UI.setPaletteByColor(resolved.color);
        UI.setEraserActive(false);
        AppState.markDirty();
        FileManager.autoSaveToLocalStorage(true);
    }

    /**
     * Activates the eraser tool and deselects any palette swatches.
     */
    function handleEraserSelect() {
        AppState.setEraserActive(true);
        UI?.setEraserActive(true);
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
            polygon.color = Config.DEFAULT_TILE_COLOR;
        });
        Renderer.renderBoard();
        AppState.recordHistory();
        AppState.markDirty();
        FileManager.autoSaveToLocalStorage(true);
    }

    /**
     * Fills the current board with a random mix of colors from the selected palette.
     */
    function handleRandomFill() {
        const state = AppState.getState();
        if (!state.polygons.length) {
            UI?.showNotification('Generate a board before filling it');
            return;
        }
        const palette = Config.getPaletteById(state.currentPaletteId) || Config.getDefaultPalette();
        const swatches = palette?.colors || [];
        if (!swatches.length) {
            UI?.showNotification('Select a color palette to randomize with');
            return;
        }
        state.polygons.forEach((polygon) => {
            const randomSwatch = swatches[Math.floor(Math.random() * swatches.length)];
            const fillValue = randomSwatch.textureId ? `texture:${randomSwatch.textureId}` : randomSwatch.hex;
            polygon.color = fillValue;
        });
        Renderer.renderBoard();
        AppState.recordHistory();
        AppState.markDirty();
        FileManager.autoSaveToLocalStorage(true);
        UI?.showNotification('Board filled with random palette');
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
            const paintColor = state.isEraserActive ? Config.DEFAULT_TILE_COLOR : state.currentColor;
            applyColorToPolygon(polygon, paintColor, { recordHistory: false, markDirty: false });
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
                const paintColor = state.isEraserActive ? Config.DEFAULT_TILE_COLOR : state.currentColor;
                applyColorToPolygon(polygon, paintColor, { recordHistory: false, markDirty: false });
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
