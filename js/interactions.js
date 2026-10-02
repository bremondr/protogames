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
        canvas.addEventListener('pointerleave', (event) => {
            // A captured line keeps tracking outside the canvas; everything else ends here.
            if (!AppState.getState().lineStartId) handlePointerCancel(event);
        });
        canvas.addEventListener('pointercancel', handlePointerCancel);
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') cancelLine();
        });
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
     * Applies the brush at a tile: the tile itself, or every tile in the brush
     * footprint when the brush size is larger than 1.
     */
    function paintAt(polygon, isStrokeStart) {
        const state = AppState.getState();
        if (state.brushSize <= 1) {
            applyToolToPolygon(polygon, isStrokeStart);
            return;
        }
        const { adjacency } = AppState.getTopology();
        for (const id of ToolOps.brushTiles(adjacency, polygon.id, state.brushSize)) {
            applyToolToPolygon(state.polygons[adjacency.index.get(id)], isStrokeStart);
        }
    }

    /** The tiles to outline for the pointer tile: the brush footprint in brush mode, otherwise the tile. */
    function hoverFootprint(polygon) {
        const state = AppState.getState();
        if (state.drawMode !== 'brush' || state.brushSize <= 1) return [polygon.id];
        return ToolOps.brushTiles(AppState.getTopology().adjacency, polygon.id, state.brushSize);
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

    /** Finds the tile under a point in world space using the cached spatial index. */
    function tileAt(point) {
        return AppState.getTopology().locate(point);
    }

    /** Pointer position in world (board) space, accounting for the current pan/zoom. */
    function getWorldPoint(event) {
        const screen = getCanvasCoordinates(event);
        return ViewMath.toWorld(AppState.getState().view, screen.x, screen.y);
    }

    /** Records one undo step for a finished fill/line and persists it. */
    function commitChange() {
        Renderer.renderBoard();
        AppState.recordHistory();
        AppState.markDirty();
        FileManager.autoSaveToLocalStorage(true);
    }

    function currentSource() {
        return ToolOps.sourceFromState(AppState.getState(), Config.DEFAULT_TILE_COLOR);
    }

    /**
     * Fill tool: repaints the connected region the tile belongs to as a single
     * undo step. Returns how many tiles changed.
     */
    function applyFill(polygon) {
        const state = AppState.getState();
        const { adjacency } = AppState.getTopology();
        const source = currentSource();
        const ids = ToolOps.planFill(state.polygons, adjacency, polygon.id, source);
        if (!ids.length) return 0;
        const changed = ToolOps.applyToTiles(state.polygons, adjacency, ids, source);
        if (changed) commitChange();
        return changed;
    }

    /** The tiles a line from the start tile to `polygon` passes through (for preview and commit). */
    function linePathTo(polygon) {
        const state = AppState.getState();
        const { adjacency, locate } = AppState.getTopology();
        return Geometry.linePath(state.polygons, adjacency, state.lineStartId, polygon.id, locate);
    }

    /** Line tool: paints the previewed path as a single undo step. Returns how many tiles changed. */
    function finishLine(polygon) {
        const state = AppState.getState();
        if (!state.lineStartId) return 0;
        const { adjacency } = AppState.getTopology();
        const source = currentSource();
        const path = polygon ? linePathTo(polygon) : state.linePreviewIds;
        AppState.clearLinePreview();
        const changed = ToolOps.applyToTiles(state.polygons, adjacency, path, source);
        if (changed) commitChange(); else Renderer.renderBoard();
        return changed;
    }

    /**
     * Abandons whatever stroke is in progress without keeping it: a brush stroke
     * is rolled back to the last undo snapshot and a line is dropped. Used when a
     * second finger lands and the touch becomes a pan/zoom gesture.
     */
    function cancelStroke() {
        const state = AppState.getState();
        if (state.lineStartId) {
            cancelLine();
            return;
        }
        if (!state.isDrawing) return;
        AppState.setDrawingActive(false);
        const snapshot = state.history[state.historyIndex];
        if (snapshot) AppState.restoreSnapshot(snapshot);
        Renderer.renderBoard();
    }

    /** Abandons an in-progress line without painting. */
    function cancelLine() {
        if (!AppState.getState().lineStartId) return;
        AppState.clearLinePreview();
        Renderer.renderBoard();
    }

    /** True while a stroke or line is in progress (undo and friends must wait). */
    function isStrokeActive() {
        const state = AppState.getState();
        return state.isDrawing || Boolean(state.lineStartId);
    }

    /** Re-selects the current colour as the paint source (keeps the draw mode). */
    function selectColorTool() {
        const buttons = UI.getElements().paletteButtons || [];
        const color = (AppState.getState().currentColor || '').toLowerCase();
        const match = buttons.find((b) => (b.dataset.color || '').toLowerCase() === color) || buttons[0];
        if (match) handleColorSelect(match);
    }

    /** Eraser on/off: switching it off returns to painting with the current colour. */
    function toggleEraser() {
        if (AppState.getState().isEraserActive) selectColorTool();
        else handleEraserSelect();
    }

    /** Picks the nth swatch (0-based) of the current palette. Returns its colour, or null if there is none. */
    function pickSwatch(index) {
        const button = (UI.getElements().paletteButtons || [])[index];
        if (!button) return null;
        handleColorSelect(button);
        return button.dataset.color;
    }

    /** Moves the swatch selection forward (+1) or back (-1), wrapping around. */
    function cycleSwatch(delta) {
        const buttons = UI.getElements().paletteButtons || [];
        if (!buttons.length) return null;
        const color = (AppState.getState().currentColor || '').toLowerCase();
        const current = buttons.findIndex((b) => (b.dataset.color || '').toLowerCase() === color);
        const next = (current + delta + buttons.length) % buttons.length;
        handleColorSelect(buttons[next]);
        return buttons[next].dataset.color;
    }

    /** Recomputes the outline under the pointer after the brush size or draw mode changed. */
    function refreshHover() {
        const state = AppState.getState();
        if (!state.hoverPolygonId) return;
        const polygon = state.polygons.find((p) => p.id === state.hoverPolygonId);
        if (polygon) AppState.setHoverPolygonId(polygon.id, hoverFootprint(polygon));
    }

    /** Sets the brush size (clamped) and refreshes the outline under the pointer. Returns the new size. */
    function setBrushSize(size) {
        const value = AppState.setBrushSize(size);
        refreshHover();
        window.dispatchEvent(new CustomEvent('pg:brushsize', { detail: { size: value } }));
        Renderer.renderBoard();
        return value;
    }

    function changeBrushSize(delta) {
        return setBrushSize(AppState.getState().brushSize + delta);
    }

    /** Switches between brush, fill and line (the paint source is unchanged). */
    function setDrawMode(mode) {
        AppState.setDrawMode(mode);
        refreshHover();
        const canvas = AppState.getState().canvas;
        if (canvas) canvas.style.cursor = mode === 'brush' ? '' : 'crosshair';
        notifyToolChange();
        Renderer.renderBoard();
    }

    /**
     * Handles pointer presses. Brush mode starts a stroke and paints the tile
     * under the pointer; fill repaints a region at once; line remembers where
     * the line starts.
     *
     * @param {PointerEvent} event - Pointer down event.
     */
    function handlePointerDown(event) {
        event.preventDefault();
        const point = getWorldPoint(event);
        const state = AppState.getState();
        const polygon = tileAt(point);

        if (state.drawMode === 'fill') {
            if (polygon) applyFill(polygon);
            return;
        }
        if (state.drawMode === 'line') {
            if (!polygon) return;
            AppState.setLineStart(polygon.id);
            // Keep receiving moves/up even if the pointer leaves the canvas mid-line.
            try { event.target.setPointerCapture(event.pointerId); } catch (error) { /* synthetic events */ }
            Renderer.renderBoard();
            return;
        }

        AppState.setDrawingActive(true, polygon?.id || null);
        if (polygon) {
            paintAt(polygon, true);
            Renderer.renderBoard();
        }
    }

    /**
     * Handles pointer movement for hover feedback, brush coloring and the line
     * preview. Movement events are throttled so dragging feels smooth on tablets.
     *
     * @param {PointerEvent} event - Pointer move event.
     */
    function handlePointerMove(event) {
        const state = AppState.getState();
        const point = getWorldPoint(event);

        if (state.lineStartId) {
            const polygon = tileAt(point);
            if (!polygon) return;
            const preview = state.linePreviewIds;
            if (preview.length && preview[preview.length - 1] === polygon.id) return;
            AppState.setLinePreview(linePathTo(polygon));
            Renderer.renderBoard();
            return;
        }

        if (state.isDrawing) {
            const now = performance.now();
            if (now - lastMoveTimestamp < MOVE_THROTTLE_MS) {
                return;
            }
            lastMoveTimestamp = now;
            const polygon = tileAt(point);
            if (polygon && polygon.id !== state.lastColoredPolygonId) {
                paintAt(polygon, false);
                AppState.setLastColoredPolygonId(polygon.id);
                Renderer.renderBoard();
            }
            return;
        }

        const polygon = tileAt(point);
        const polygonId = polygon?.id || null;
        if (polygonId !== state.hoverPolygonId) {
            AppState.setHoverPolygonId(polygonId, polygon ? hoverFootprint(polygon) : null);
            Renderer.renderBoard();
        }
    }

    /**
     * Finishes a line, or finalizes a brush stroke by recording history.
     *
     * @param {PointerEvent} event - Pointer up event.
     */
    function handlePointerUp(event) {
        const state = AppState.getState();
        if (state.lineStartId) {
            finishLine(tileAt(getWorldPoint(event)));
            return;
        }
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
        if (state.lineStartId) {
            cancelLine();
            return;
        }
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
        selectObjectTool,
        undo: handleUndo,
        redo: handleRedo,
        isStrokeActive,
        selectColorTool,
        toggleEraser,
        pickSwatch,
        cycleSwatch,
        setDrawMode,
        setBrushSize,
        changeBrushSize,
        applyFill,
        finishLine,
        cancelLine,
        cancelStroke
    };
})();
