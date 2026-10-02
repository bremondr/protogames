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
    }

    function handleColorSelect(button) {
        const color =
            button.dataset.color ||
            getComputedStyle(button).getPropertyValue('--swatch-color').trim();
        AppState.setCurrentColor(color);
        AppState.setEraserActive(false);
        AppState.setObjectToolActive(false);
        UI?.setPaletteSelection(button);
        UI?.setEraserActive(false);
        notifyToolChange();
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
        AppState.setObjectToolActive(false);
        notifyToolChange();
        AppState.markDirty();
        FileManager.autoSaveToLocalStorage(true);
    }

    /**
     * Activates the eraser tool and deselects any palette swatches.
     */
    function handleEraserSelect() {
        AppState.setEraserActive(true);
        AppState.setObjectToolActive(false);
        UI?.setEraserActive(true);
        notifyToolChange();
    }

    /** Activates the object tool, optionally switching the object to place. */
    function selectObjectTool(objectId) {
        if (objectId) AppState.setCurrentObject(objectId);
        AppState.setObjectToolActive(true);
        AppState.setEraserActive(false);
        UI?.setEraserActive(false);
        UI?.setPaletteSelection(null);
        notifyToolChange();
    }

    /** Lets the toolbar (and anything else) react to tool/color changes. */
    function notifyToolChange() {
        window.dispatchEvent(new CustomEvent('pg:toolchange'));
    }

    /**
     * Applies the active tool to a polygon. Returns true when something changed.
     * Eraser removes an object first; a second pass clears the terrain.
     */
    function applyToolToPolygon(polygon, isStrokeStart) {
        const state = AppState.getState();
        if (state.isObjectToolActive) {
            if (polygon.object === state.currentObject) {
                if (!isStrokeStart) return false;
                delete polygon.object;
            } else {
                polygon.object = state.currentObject;
            }
            return true;
        }
        if (state.isEraserActive) {
            if (polygon.object) { delete polygon.object; return true; }
            if (polygon.color === Config.DEFAULT_TILE_COLOR) return false;
            polygon.color = Config.DEFAULT_TILE_COLOR;
            return true;
        }
        if (polygon.color === state.currentColor) return false;
        polygon.color = state.currentColor;
        return true;
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
            delete polygon.object;
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
            applyToolToPolygon(polygon, true);
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
                applyToolToPolygon(polygon, false);
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
        const objectMap = colorMap ? new Map(state.polygons.filter((p) => p.object).map((p) => [p.id, p.object])) : null;
        const polygons = Geometry.generateGrid(config, state.canvas, colorMap);
        if (objectMap) polygons.forEach((p) => { if (objectMap.has(p.id)) p.object = objectMap.get(p.id); });
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
        generateBoard,
        selectObjectTool
    };
})();
