/**
 * PROTOGAMES RENDERER
 * --------------------------------------------------------------
 * Handles all drawing operations for the HTML5 canvas. Rendering is
 * kept separate from business logic to keep the rest of the app
 * agnostic of how graphics are produced.
 */
const Renderer = (() => {
    const textureCache = new Map();
    const TEXTURE_PREFIX = 'texture:';
    const TEXTURE_FALLBACK = '#d1d5db';

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
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.imageSmoothingEnabled = true;
        AppState.setCanvas(canvas, ctx);
        resizeCanvas();
    }

    /**
     * Resizes the canvas to match its container.
     *
     * @returns {{width:number,height:number, changed:boolean}|null}
     */
    function resizeCanvas() {
        const { canvas } = AppState.getState();
        if (!canvas || !canvas.parentElement) return null;
        const parentRect = canvas.parentElement.getBoundingClientRect();
        const newWidth = Math.floor(parentRect.width);
        const newHeight = Math.floor(parentRect.height);
        const changed = canvas.width !== newWidth || canvas.height !== newHeight;
        canvas.width = newWidth;
        canvas.height = newHeight;
        return { width: newWidth, height: newHeight, changed };
    }

    /**
     * Clears the drawing area.
     */
    function clearCanvas() {
        const { ctx, canvas } = AppState.getState();
        if (!ctx || !canvas) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    /**
     * Draws all polygons and optional hover overlays.
     */
    function renderBoard() {
        const { ctx, canvas, polygons, hoverPolygonId } = AppState.getState();
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
                    stroke: Config.HOVER_OUTLINE,
                    lineWidth: 2,
                    overlay: 'rgba(47, 111, 237, 0.15)'
                });
            }
        }
    }

    /**
     * Draws a single polygon using current canvas context.
     *
     * @param {Object} polygon - Polygon definition from the grid.
     * @param {Object} [options] - Override styles.
     */
    function drawPolygon(polygon, options = {}) {
        const { ctx } = AppState.getState();
        if (!ctx) return;
        const fill = resolveFillStyle(options.fill || polygon.color || Config.DEFAULT_FILL);
        const stroke = options.stroke || Config.GRID_STROKE;
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

    /**
     * Resolves a fill into a canvas-compatible style, supporting texture patterns.
     *
     * @param {string|CanvasPattern} fill
     * @returns {string|CanvasPattern}
     */
    function resolveFillStyle(fill) {
        if (typeof fill === 'string' && fill.startsWith(TEXTURE_PREFIX)) {
            const textureId = fill.slice(TEXTURE_PREFIX.length);
            const pattern = getTexturePattern(textureId);
            return pattern || TEXTURE_FALLBACK;
        }
        return fill || Config.DEFAULT_FILL;
    }

    /**
     * Returns (and caches) a CanvasPattern for a texture id, triggering a re-render when ready.
     *
     * @param {string} textureId
     * @returns {CanvasPattern|null}
     */
    function getTexturePattern(textureId) {
        if (!textureId) return null;
        const cached = textureCache.get(textureId);
        if (cached?.pattern) return cached.pattern;
        if (cached?.status === 'loading') return cached.pattern || null;

        const texture = Config.getTextureById(textureId);
        if (!texture?.src) return null;

        const entry = { status: 'loading', pattern: null };
        textureCache.set(textureId, entry);
        const img = new Image();
        img.onload = () => {
            const { ctx } = AppState.getState();
            if (!ctx) return;
            const pattern = ctx.createPattern(img, 'repeat');
            if (pattern) {
                entry.pattern = pattern;
                entry.status = 'ready';
                renderBoard();
            } else {
                entry.status = 'error';
            }
        };
        img.onerror = () => {
            entry.status = 'error';
        };
        img.src = texture.src;
        return null;
    }

    return {
        initializeCanvas,
        resizeCanvas,
        clearCanvas,
        renderBoard,
        drawPolygon
    };
})();
