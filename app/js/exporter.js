/**
 * PROTOGAMES EXPORTER
 * --------------------------------------------------------------
 * PNG and SVG pictures of the current board, made from the options chosen in the Export dialog
 * (exportDialog.js). PDF output (real-world scale, paged) lives in print.js.
 *
 * PNG options: scale (1 to 4, times the size of the board on screen), textures (off = flat colours),
 * objects (also the start markers), grid lines, background (transparent or white).
 * SVG options: objects (embedded as pictures), grid lines, background. An SVG is always flat colours.
 */
const Exporter = (() => {
    const PNG_DEFAULTS = Object.freeze({ scale: 1, textures: true, objects: true, grid: true, background: 'transparent' });
    const SVG_DEFAULTS = Object.freeze({ objects: false, grid: true, background: 'transparent' });
    const BACKGROUNDS = ['transparent', 'white'];
    const MAX_SCALE = 4;

    const flag = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
    const background = (value, fallback) => (BACKGROUNDS.includes(value) ? value : fallback);

    /** PNG options with anything missing or odd replaced by its default. */
    function normalizePng(options = {}) {
        const scale = Math.floor(Number(options.scale));
        return {
            scale: Number.isFinite(scale) ? Math.min(MAX_SCALE, Math.max(1, scale)) : PNG_DEFAULTS.scale,
            textures: flag(options.textures, PNG_DEFAULTS.textures),
            objects: flag(options.objects, PNG_DEFAULTS.objects),
            grid: flag(options.grid, PNG_DEFAULTS.grid),
            background: background(options.background, PNG_DEFAULTS.background)
        };
    }

    /** SVG options with anything missing or odd replaced by its default. */
    function normalizeSvg(options = {}) {
        return {
            objects: flag(options.objects, SVG_DEFAULTS.objects),
            grid: flag(options.grid, SVG_DEFAULTS.grid),
            background: background(options.background, SVG_DEFAULTS.background)
        };
    }

    let ui = null;

    function init(uiRefs) {
        ui = uiRefs;
    }

    const hasBoard = () => {
        const state = AppState.getState();
        return Boolean(state.canvas && state.polygons.length);
    };

    /** The board painted on a new canvas with the chosen options. Textures are switched for the one paint only. */
    function pngCanvas(options) {
        const chosen = normalizePng(options);
        const hadFlat = typeof Textures !== 'undefined' ? Textures.isFlat() : false;
        if (typeof Textures !== 'undefined') Textures.setFlat(!chosen.textures);
        try {
            return Renderer.createExportCanvas({
                scale: chosen.scale,
                objects: chosen.objects,
                grid: chosen.grid,
                background: chosen.background === 'white' ? '#ffffff' : null
            });
        } finally {
            if (typeof Textures !== 'undefined') Textures.setFlat(hadFlat);
        }
    }

    /** The size in pixels the PNG will have: the board's size on screen times the scale, cut back to what a canvas can be. */
    function pngSize(options) {
        const chosen = normalizePng(options);
        const { canvas } = AppState.getState();
        const limit = typeof Renderer.MAX_EXPORT_SIDE === 'number' ? Renderer.MAX_EXPORT_SIDE : Infinity;
        let scale = chosen.scale;
        while (scale > 1 && Math.max(canvas.width, canvas.height) * scale > limit) scale -= 1;
        return { width: canvas.width * scale, height: canvas.height * scale, scale };
    }

    function exportToPNG(options) {
        if (!hasBoard()) {
            UI?.showNotification('Generate a board before exporting.');
            return;
        }
        // Painted at the identity view on a separate canvas, so exports ignore the current zoom/pan.
        const dataUrl = pngCanvas(options).toDataURL('image/png');
        const base = AppState.getState().currentProjectName || Config.DEFAULT_PROJECT_NAME;
        Utils.triggerDataUrlDownload(dataUrl, `${Utils.sanitizeFileName(base)}.png`);
        UI?.showNotification('PNG exported', 3000);
    }

    /** The centre and the size of the picture of an object on a tile: the same place Objects.drawOnPolygon uses. */
    function objectBox(polygon) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, cx = 0, cy = 0;
        polygon.vertices.forEach((v) => { minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); cx += v.x; cy += v.y; });
        cx /= polygon.vertices.length;
        cy /= polygon.vertices.length;
        const size = Math.min(maxX - minX, maxY - minY) * 0.85;
        return { x: cx - size / 2, y: cy - size * 0.55, size, cy };
    }

    /**
     * The SVG of a set of tiles. Every value that goes into an attribute is escaped: a colour comes from a file or
     * link and must not be able to close the attribute and add its own. Options (all optional):
     * grid (default true), objects (default false: their pictures are embedded), background (a colour, default none).
     */
    function buildSvg(polygons, { width, height, viewBox, grid = true, objects = false, background: backgroundColor = null }) {
        const stroke = Utils.escapeAttribute(Config.GRID_STROKE);
        const paths = polygons
            .map((polygon) => {
                const commands = polygon.vertices
                    .map((vertex, index) => `${index === 0 ? 'M' : 'L'} ${vertex.x.toFixed(2)} ${vertex.y.toFixed(2)}`)
                    .join(' ');
                const fill = Utils.escapeAttribute(polygon.color || Config.DEFAULT_FILL);
                // Without grid lines a thin stroke in the tile's own colour still closes the hairline gaps between tiles.
                return `<path d="${commands} Z" fill="${fill}" stroke="${grid ? stroke : fill}" stroke-width="1" />`;
            })
            .join('');

        let defs = '';
        let pictures = '';
        if (objects && typeof Objects !== 'undefined') {
            const symbols = new Map();
            polygons
                .filter((polygon) => polygon.object && polygon.vertices.length)
                .sort((a, b) => objectBox(a).cy - objectBox(b).cy)
                .forEach((polygon) => {
                    const url = Objects.dataUrlFor(polygon.object);
                    if (!url) return;
                    if (!symbols.has(polygon.object)) {
                        const id = `o${symbols.size}`;
                        symbols.set(polygon.object, id);
                        defs += `<symbol id="${id}" viewBox="0 0 256 256"><image width="256" height="256" href="${Utils.escapeAttribute(url)}"/></symbol>`;
                    }
                    const box = objectBox(polygon);
                    pictures += `<use href="#${symbols.get(polygon.object)}" x="${box.x.toFixed(2)}" y="${box.y.toFixed(2)}" width="${box.size.toFixed(2)}" height="${box.size.toFixed(2)}"/>`;
                });
        }

        let backdrop = '';
        if (backgroundColor) {
            const [x, y, w, h] = String(viewBox).split(/\s+/).map(Number);
            backdrop = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${Utils.escapeAttribute(backgroundColor)}"/>`;
        }
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${Utils.escapeAttribute(viewBox)}" width="${Utils.escapeAttribute(width)}" height="${Utils.escapeAttribute(height)}">${defs ? `<defs>${defs}</defs>` : ''}${backdrop}${paths}${pictures}</svg>`;
    }

    /** The SVG text of the current board for the chosen options, with its size; null when there is no board. */
    function svgForBoard(options) {
        if (!hasBoard()) return null;
        const chosen = normalizeSvg(options);
        const state = AppState.getState();
        let { width, height } = state.canvas;
        let polygons = state.polygons;
        let viewBox = `0 0 ${width} ${height}`;
        if (Infinite.isActive()) {
            // Frame what was drawn on an infinite board.
            const scene = Infinite.exportScene(width, height);
            polygons = scene.polygons;
            width = Math.ceil(scene.bounds.maxX - scene.bounds.minX);
            height = Math.ceil(scene.bounds.maxY - scene.bounds.minY);
            viewBox = `${scene.bounds.minX.toFixed(2)} ${scene.bounds.minY.toFixed(2)} ${width} ${height}`;
        }
        const svg = buildSvg(polygons, { width, height, viewBox, grid: chosen.grid, objects: chosen.objects, background: chosen.background === 'white' ? '#ffffff' : null });
        return { svg, width, height };
    }

    function exportToSVG(options) {
        const made = svgForBoard(options);
        if (!made) {
            UI?.showNotification('Generate a board before exporting.');
            return;
        }
        const blob = new Blob([made.svg], { type: 'image/svg+xml' });
        const base = AppState.getState().currentProjectName || Config.DEFAULT_PROJECT_NAME;
        Utils.triggerBlobDownload(blob, `${Utils.sanitizeFileName(base)}.svg`);
        UI?.showNotification('SVG exported', 3000);
    }

    return {
        PNG_DEFAULTS,
        SVG_DEFAULTS,
        init,
        normalizePng,
        normalizeSvg,
        pngCanvas,
        pngSize,
        svgForBoard,
        exportToPNG,
        exportToSVG,
        buildSvg
    };
})();
