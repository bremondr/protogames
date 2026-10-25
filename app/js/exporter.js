/**
 * PROTOGAMES EXPORTER
 * --------------------------------------------------------------
 * PNG and SVG pictures of the current board, made from the options chosen in the Export dialog
 * (exportDialog.js). PDF output (real-world scale, paged) lives in print.js.
 *
 * PNG options: scale (1 to 4, times the size of the board on screen), textures (off = flat colours),
 * objects (also the start markers), grid lines, background (transparent or white).
 * SVG options: textures (embedded as pictures), objects and start markers, grid lines, background. Without textures
 * the tiles are flat colours. The borders between countries of a region board are always drawn, as on screen.
 */
const Exporter = (() => {
    const PNG_DEFAULTS = Object.freeze({ scale: 1, textures: true, objects: true, grid: true, background: 'transparent' });
    const SVG_DEFAULTS = Object.freeze({ textures: false, objects: false, grid: true, background: 'transparent' });
    const BACKGROUNDS = ['transparent', 'white'];
    const MAX_SCALE = 4;

    const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
    const flag = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
    const background = (value, fallback) => (BACKGROUNDS.includes(value) ? value : fallback);

    /** PNG options with anything missing or odd replaced by its default. */
    function normalizePng(saved) {
        const options = isObject(saved) ? saved : {};
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
    function normalizeSvg(saved) {
        const options = isObject(saved) ? saved : {};
        return {
            textures: flag(options.textures, SVG_DEFAULTS.textures),
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
     *   grid (default true), objects (default false: object pictures are embedded, and start markers drawn),
     *   background (a colour, default none),
     *   textures ({ images(hex) -> { tile, feature, size } | null, scale }: tiles are filled with their texture),
     *   borders ({ edges: [[a, b]], color, shadow, width }: the lines between countries).
     */
    function buildSvg(polygons, { width, height, viewBox, grid = true, objects = false, background: backgroundColor = null, textures = null, borders = null }) {
        const stroke = Utils.escapeAttribute(Config.GRID_STROKE);
        const outline = (polygon) => polygon.vertices.map((vertex, index) => `${index === 0 ? 'M' : 'L'} ${vertex.x.toFixed(2)} ${vertex.y.toFixed(2)}`).join(' ') + ' Z';

        let defs = '';
        // A texture is a repeating picture anchored at the origin, the way the canvas pattern is; one per colour.
        const patterns = new Map();
        const fillOf = (colour) => {
            const flat = Utils.escapeAttribute(colour);
            if (!textures) return flat;
            const key = String(colour).toLowerCase();
            if (!patterns.has(key)) {
                const images = textures.images(colour);
                if (images && images.tile) {
                    const id = `t${patterns.size}`;
                    const side = (images.size * (textures.scale || 1)).toFixed(2);
                    defs += `<pattern id="${id}" width="${side}" height="${side}" patternUnits="userSpaceOnUse"><image width="${side}" height="${side}" href="${Utils.escapeAttribute(images.tile)}"/></pattern>`;
                    patterns.set(key, { id, images });
                } else {
                    patterns.set(key, null);
                }
            }
            return patterns.get(key) ? `url(#${patterns.get(key).id})` : flat;
        };
        const paths = polygons
            .map((polygon) => {
                const colour = polygon.color || Config.DEFAULT_FILL;
                const flat = Utils.escapeAttribute(colour);
                // Without grid lines a thin stroke in the tile's own colour still closes the hairline gaps between tiles.
                return `<path d="${outline(polygon)}" fill="${fillOf(colour)}" stroke="${grid ? stroke : flat}" stroke-width="1" />`;
            })
            .join('');

        // Single-tile pictures (a village, a volcano) lie over their tile, clipped to it, as on screen.
        let features = '';
        if (textures) {
            const symbols = new Map();
            polygons.forEach((polygon, index) => {
                const entry = patterns.get(String(polygon.color || Config.DEFAULT_FILL).toLowerCase());
                if (!entry || !entry.images.feature || !polygon.vertices.length) return;
                const key = String(polygon.color).toLowerCase();
                if (!symbols.has(key)) {
                    const id = `f${symbols.size}`;
                    symbols.set(key, id);
                    defs += `<symbol id="${id}" viewBox="0 0 256 256"><image width="256" height="256" href="${Utils.escapeAttribute(entry.images.feature)}"/></symbol>`;
                }
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, cx = 0, cy = 0;
                polygon.vertices.forEach((v) => { minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); cx += v.x; cy += v.y; });
                cx /= polygon.vertices.length;
                cy /= polygon.vertices.length;
                const size = Math.min(maxX - minX, maxY - minY) * 0.95;
                defs += `<clipPath id="c${index}"><path d="${outline(polygon)}"/></clipPath>`;
                // The clip sits on a group around the picture: on the use itself it would move with the picture's x and y.
                features += `<g clip-path="url(#c${index})"><use href="#${symbols.get(key)}" x="${(cx - size / 2).toFixed(2)}" y="${(cy - size / 2).toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}"/></g>`;
            });
        }

        let markers = '';
        let pictures = '';
        if (objects) {
            // A start marker: the tile outline pulled in to 86%, in a thick white line with the player's colour over it.
            polygons.filter((polygon) => polygon.start && polygon.vertices.length).forEach((polygon) => {
                const box = objectBox(polygon);
                const cx = polygon.center ? polygon.center.x : box.x + box.size / 2;
                const cy = polygon.center ? polygon.center.y : box.cy;
                const inner = polygon.vertices.map((v, i) => `${i ? 'L' : 'M'} ${(cx + (v.x - cx) * 0.86).toFixed(2)} ${(cy + (v.y - cy) * 0.86).toFixed(2)}`).join(' ') + ' Z';
                markers += `<path d="${inner}" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="6" stroke-linejoin="round"/>`
                    + `<path d="${inner}" fill="none" stroke="${Utils.escapeAttribute(polygon.start)}" stroke-width="3.5" stroke-linejoin="round"/>`;
            });
        }
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
        // The lines between countries: a dark line under a light one, so they show on any terrain.
        let borderLines = '';
        if (borders && borders.edges && borders.edges.length) {
            const d = borders.edges.map(([a, b]) => `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`).join(' ');
            borderLines = `<path d="${d}" fill="none" stroke="${Utils.escapeAttribute(borders.shadow)}" stroke-width="${borders.width + 2}" stroke-linecap="round"/>`
                + `<path d="${d}" fill="none" stroke="${Utils.escapeAttribute(borders.color)}" stroke-width="${borders.width}" stroke-linecap="round"/>`;
        }
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${Utils.escapeAttribute(viewBox)}" width="${Utils.escapeAttribute(width)}" height="${Utils.escapeAttribute(height)}">${defs ? `<defs>${defs}</defs>` : ''}${backdrop}${paths}${features}${markers}${pictures}${borderLines}</svg>`;
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
            const scene = Renderer.exportScene(width, height);
            polygons = scene.polygons;
            width = Math.ceil(scene.bounds.maxX - scene.bounds.minX);
            height = Math.ceil(scene.bounds.maxY - scene.bounds.minY);
            viewBox = `${scene.bounds.minX.toFixed(2)} ${scene.bounds.minY.toFixed(2)} ${width} ${height}`;
        }
        const svg = buildSvg(polygons, {
            width,
            height,
            viewBox,
            grid: chosen.grid,
            objects: chosen.objects,
            background: chosen.background === 'white' ? '#ffffff' : null,
            textures: chosen.textures && typeof Textures !== 'undefined' ? { images: (hex) => Textures.svgImages(hex), scale: Textures.patternScale() } : null,
            borders: typeof CountryRegions !== 'undefined' ? CountryRegions.activeBorders(polygons) : null
        });
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
