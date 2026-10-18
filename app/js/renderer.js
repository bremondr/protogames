/**
 * PROTOGAMES RENDERER
 * --------------------------------------------------------------
 * Handles all drawing operations for the HTML5 canvas. Rendering is
 * kept separate from business logic to keep the rest of the app
 * agnostic of how graphics are produced.
 *
 * Drawing goes through paint(), which takes everything it needs (context,
 * tiles, size, view) as arguments. The on-screen canvas paints with the current
 * pan/zoom view; exports paint a fresh canvas with the identity view, so they
 * never depend on the zoom level.
 */
const Renderer = (() => {
    const renderListeners = [];
    let frameRequested = false;

    /** Setting canvas.width/height resets the context state, so this runs again after every resize. */
    function applyContextDefaults(ctx) {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.imageSmoothingEnabled = true;
    }

    /**
     * Resizes the canvas to fit its parent container and stores the
     * updated context inside AppState.
     *
     * @param {HTMLCanvasElement} canvas - Canvas element from the DOM.
     */
    function initializeCanvas(canvas) {
        if (!canvas) return;
        canvas.style.touchAction = 'none';
        const ctx = canvas.getContext('2d');
        applyContextDefaults(ctx);
        AppState.setCanvas(canvas, ctx);
        resizeCanvas();
    }

    /**
     * Resizes the canvas to match its container.
     *
     * @returns {{width:number,height:number, changed:boolean}|null}
     */
    function resizeCanvas() {
        const { canvas, ctx } = AppState.getState();
        if (!canvas || !canvas.parentElement) return null;
        const parentRect = canvas.parentElement.getBoundingClientRect();
        const newWidth = Math.floor(parentRect.width);
        const newHeight = Math.floor(parentRect.height);
        const changed = canvas.width !== newWidth || canvas.height !== newHeight;
        canvas.width = newWidth;
        canvas.height = newHeight;
        if (ctx) applyContextDefaults(ctx);
        return { width: newWidth, height: newHeight, changed };
    }

    /**
     * Paints a scene onto any 2D context.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} scene
     * @param {Array}  scene.polygons         tiles
     * @param {number} scene.width            canvas width in pixels
     * @param {number} scene.height           canvas height in pixels
     * @param {Object} [scene.view]           { scale, x, y }; identity when omitted
     * @param {string|null} [scene.hoverPolygonId]  tile to outline (omit for exports)
     * @param {string[]} [scene.hoverIds]           tiles to outline when the brush covers several
     * @param {string[]} [scene.linePreviewIds]     line-tool preview tiles (omit for exports)
     * @param {Array}  [scene.pieces]               playtest pieces: [{ id, kind, color, tileId }] (omit for exports)
     * @param {string[]|null} [scene.hiddenPieceIds] pieces being carried (left out; a ghost follows each pointer)
     * @param {string|null} [scene.selectedPieceId] piece that gets a selection ring
     * @param {Object} [scene.labels]               coordinate label settings (see labels.js); omit for none
     * @returns {{drawn:number,total:number}} how many tiles were actually drawn (the rest were off-screen)
     */
    function paint(ctx, scene) {
        const { polygons, width, height } = scene;
        const view = scene.view || ViewMath.identity();
        const hoverIds = scene.hoverIds && scene.hoverIds.length ? scene.hoverIds : scene.hoverPolygonId ? [scene.hoverPolygonId] : [];
        const linePreviewIds = scene.linePreviewIds || [];

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

        // Only tiles that intersect the visible world rectangle are drawn; strokes add a little slack.
        const slack = 4 / view.scale;
        const visible = ViewMath.visibleWorldRect(view, width, height);
        visible.minX -= slack;
        visible.minY -= slack;
        visible.maxX += slack;
        visible.maxY += slack;
        const inView = (polygon) => ViewMath.rectsIntersect(polygon.bounds, visible);

        let drawn = 0;
        for (const polygon of polygons) {
            if (!inView(polygon)) continue;
            drawPolygon(ctx, polygon, {}, view.scale);
            drawn++;
        }

        // Coordinate labels sit outside the board, so they are drawn right after the tiles.
        if (scene.labels && scene.labels.enabled && typeof Labels !== 'undefined') Labels.draw(ctx, polygons, scene.labels, view.scale, visible);

        // Start markers: a coloured outline inside the tile, above the terrain and below objects and pieces.
        for (const polygon of polygons) {
            if (polygon.start && inView(polygon)) drawStartMarker(ctx, polygon, view.scale);
        }

        // Object layer sits above all terrain; sorted top-to-bottom so lower objects overlap higher ones.
        // Objects reach up to about one tile beyond their tile, so cull with extra room.
        if (typeof Objects !== 'undefined') {
            const reach = polygons.length ? polygons[0].bounds.maxY - polygons[0].bounds.minY : 0;
            const objectView = {
                minX: visible.minX - reach,
                minY: visible.minY - reach,
                maxX: visible.maxX + reach,
                maxY: visible.maxY + reach
            };
            polygons
                .filter((p) => p.object && ViewMath.rectsIntersect(p.bounds, objectView))
                .sort((a, b) => a.center?.y - b.center?.y)
                .forEach((p) => Objects.drawOnPolygon(ctx, p));
        }

        // Playtest pieces stand on top of the objects.
        if (scene.pieces && scene.pieces.length && typeof Pieces !== 'undefined') {
            Pieces.drawAll(ctx, polygons, scene.pieces, view.scale, visible, scene.hiddenPieceIds || null, scene.selectedPieceId || null);
        }

        // Line tool preview: highlight the tiles the line would paint.
        if (linePreviewIds.length) {
            const preview = new Set(linePreviewIds);
            polygons.forEach((poly) => {
                if (!preview.has(poly.id) || !inView(poly)) return;
                drawPolygon(ctx, poly, {
                    fill: poly.color,
                    stroke: Config.HOVER_OUTLINE,
                    lineWidth: 2,
                    overlay: 'rgba(47, 111, 237, 0.35)'
                }, view.scale);
                if (typeof Objects !== 'undefined') Objects.drawOnPolygon(ctx, poly);
            });
        }

        if (hoverIds.length && !linePreviewIds.length) {
            const hovered = new Set(hoverIds);
            polygons.forEach((poly) => {
                if (!hovered.has(poly.id) || !inView(poly)) return;
                drawPolygon(ctx, poly, {
                    fill: poly.color,
                    stroke: Config.HOVER_OUTLINE,
                    lineWidth: 2,
                    overlay: 'rgba(47, 111, 237, 0.15)'
                }, view.scale);
                if (typeof Objects !== 'undefined') Objects.drawOnPolygon(ctx, poly);
            });
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        return { drawn, total: polygons.length };
    }

    /**
     * Draws the board on the visible canvas with the current pan/zoom view.
     */
    function renderBoard() {
        const { ctx, canvas, polygons, hoverPolygonId, hoverIds, linePreviewIds, view, playtest, play, drag, selectedPieceId, labels } = AppState.getState();
        if (!ctx || !canvas) return;
        const stats = paint(ctx, {
            polygons,
            width: canvas.width,
            height: canvas.height,
            view,
            hoverPolygonId,
            hoverIds,
            linePreviewIds,
            pieces: playtest && play ? play.pieces : null,
            hiddenPieceIds: drag || null,
            selectedPieceId,
            labels
        });
        renderListeners.forEach((listener) => listener(stats));
    }

    /**
     * Schedules a redraw for the next animation frame. Pan and zoom call this on
     * every input event; any number of calls within a frame cost one redraw.
     */
    function requestRender() {
        if (frameRequested) return;
        frameRequested = true;
        const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
        schedule(() => {
            frameRequested = false;
            renderBoard();
        });
    }

    /** Registers a function called after every on-screen redraw (used by the minimap). */
    function onRender(listener) {
        renderListeners.push(listener);
    }

    /**
     * A new canvas with the board painted at the identity view (the board as
     * generated, regardless of the current pan/zoom) and without hover or
     * preview overlays. This is what PNG/PDF exports use.
     */
    function createExportCanvas() {
        const { canvas, polygons, labels } = AppState.getState();
        const out = document.createElement('canvas');
        out.width = canvas.width;
        out.height = canvas.height;
        // An infinite board has no outline to fit: frame what was drawn.
        const scene = typeof Infinite !== 'undefined' && Infinite.isActive() ? Infinite.exportScene(out.width, out.height) : null;
        paint(out.getContext('2d'), scene
            ? { polygons: scene.polygons, width: out.width, height: out.height, view: scene.view }
            : { polygons, width: out.width, height: out.height, labels });
        return out;
    }

    /**
     * Outlines a tile in its start colour: a thick coloured line a little inside the tile edge with a
     * thin light line inside it, so the marker shows on dark terrain and on terrain of its own colour.
     */
    function drawStartMarker(ctx, polygon, scale) {
        const centre = polygon.center;
        const trace = (factor) => {
            ctx.beginPath();
            polygon.vertices.forEach((vertex, index) => {
                const x = centre.x + (vertex.x - centre.x) * factor;
                const y = centre.y + (vertex.y - centre.y) * factor;
                if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.closePath();
        };
        ctx.save();
        ctx.lineJoin = 'round';
        trace(0.86);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 6 / scale;
        ctx.stroke();
        ctx.strokeStyle = polygon.start;
        ctx.lineWidth = 3.5 / scale;
        ctx.stroke();
        ctx.restore();
    }

    /**
     * Draws a single polygon.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} polygon - Polygon definition from the grid.
     * @param {Object} [options] - Override styles.
     * @param {number} [scale=1] - Current zoom, so line widths stay constant on screen.
     */
    function drawPolygon(ctx, polygon, options = {}, scale = 1) {
        const fill = options.fill || polygon.color || Config.DEFAULT_FILL;
        const stroke = options.stroke || Config.GRID_STROKE;
        const lineWidth = (options.lineWidth || 1) / scale;

        ctx.beginPath();
        polygon.vertices.forEach((vertex, index) => {
            if (index === 0) {
                ctx.moveTo(vertex.x, vertex.y);
            } else {
                ctx.lineTo(vertex.x, vertex.y);
            }
        });
        ctx.closePath();

        ctx.fillStyle = (typeof Textures !== 'undefined' && Textures.patternFor(ctx, fill)) || fill;
        ctx.fill();
        if (typeof Textures !== 'undefined') Textures.drawFeature(ctx, fill, polygon);

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

    return {
        initializeCanvas,
        resizeCanvas,
        paint,
        renderBoard,
        requestRender,
        onRender,
        createExportCanvas,
        drawPolygon
    };
})();
