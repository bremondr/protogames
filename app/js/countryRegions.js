/**
 * PROTOGAMES COUNTRY REGIONS (optional add-on)
 * --------------------------------------------------------------
 * Adds multi-country areas (Scandinavia, European Union, Balkans, …) to the
 * Country board shape, and an option to highlight the borders between the
 * countries on such a board.
 *
 * Self-contained: remove countryRegions.js from index.html to roll it back.
 * Boards made with a region then fall back to a plain rectangle.
 *
 * boardConfig.countryBorders  true = draw the borders between countries
 */
const CountryRegions = (() => {
    // Country names as in Natural Earth (world-atlas 1:50m).
    const REGIONS = {
        // Russia, Turkey and Kazakhstan are left out: the outlines cannot be split at the Urals or the Bosporus,
        // and including them whole would stretch the board to the Pacific and Iraq.
        'Europe': ['Albania', 'Andorra', 'Austria', 'Belarus', 'Belgium', 'Bosnia and Herz.', 'Bulgaria', 'Croatia', 'Cyprus', 'N. Cyprus', 'Czechia', 'Denmark', 'Estonia', 'Faeroe Is.', 'Finland', 'France', 'Germany', 'Greece', 'Guernsey', 'Hungary', 'Iceland', 'Ireland', 'Isle of Man', 'Italy', 'Jersey', 'Kosovo', 'Latvia', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Macedonia', 'Malta', 'Moldova', 'Monaco', 'Montenegro', 'Netherlands', 'Norway', 'Poland', 'Portugal', 'Romania', 'San Marino', 'Serbia', 'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland', 'Ukraine', 'United Kingdom', 'Vatican', 'Åland'],
        'Scandinavia': ['Norway', 'Sweden', 'Denmark'],
        'Nordic countries': ['Norway', 'Sweden', 'Denmark', 'Finland', 'Iceland', 'Faeroe Is.', 'Åland'],
        'Baltic states': ['Estonia', 'Latvia', 'Lithuania'],
        'Benelux': ['Belgium', 'Netherlands', 'Luxembourg'],
        'British Isles': ['United Kingdom', 'Ireland', 'Isle of Man', 'Jersey', 'Guernsey'],
        'Iberian Peninsula': ['Spain', 'Portugal', 'Andorra'],
        'DACH': ['Germany', 'Austria', 'Switzerland', 'Liechtenstein'],
        'Visegrád Group': ['Czechia', 'Slovakia', 'Poland', 'Hungary'],
        'Balkans': ['Slovenia', 'Croatia', 'Bosnia and Herz.', 'Serbia', 'Montenegro', 'Kosovo', 'Macedonia', 'Albania', 'Bulgaria', 'Greece', 'Romania'],
        'Western Balkans': ['Bosnia and Herz.', 'Serbia', 'Montenegro', 'Kosovo', 'Macedonia', 'Albania'],
        'European Union': ['Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czechia', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Poland', 'Portugal', 'Romania', 'Slovakia', 'Slovenia', 'Spain', 'Sweden'],
        'Caucasus': ['Georgia', 'Armenia', 'Azerbaijan'],
        'Central America': ['Guatemala', 'Belize', 'Honduras', 'El Salvador', 'Nicaragua', 'Costa Rica', 'Panama'],
        'Southeast Asia': ['Myanmar', 'Thailand', 'Laos', 'Cambodia', 'Vietnam', 'Malaysia', 'Singapore', 'Brunei', 'Indonesia', 'Philippines', 'Timor-Leste'],
        'Maghreb': ['Morocco', 'Algeria', 'Tunisia', 'Libya', 'Mauritania', 'W. Sahara']
    };
    const BORDER_COLOR = 'rgba(255, 255, 255, 0.95)';
    const BORDER_SHADOW = 'rgba(10, 14, 22, 0.75)';
    const BORDER_PX = 2.5;

    Object.entries(REGIONS).forEach(([name, members]) => CountryBoard.registerRegion(name, members));

    const $ = (id) => document.getElementById(id);
    let bordersOn = true;

    // ---- Borders ------------------------------------------------------------------------------

    /** Tile edges shared by two tiles of different countries, cached per tile array. */
    const edgeCache = new WeakMap();
    function borderEdges(polygons) {
        if (!CountryBoard.hasOwners()) return [];
        if (edgeCache.has(polygons)) return edgeCache.get(polygons);
        const size = ViewMath.typicalTileSize(polygons) || 1;
        const q = size / 50; // vertex snapping tolerance
        const key = (a) => `${Math.round(a.x / q)},${Math.round(a.y / q)}`;
        const seen = new Map();
        const edges = [];
        for (const p of polygons) {
            const owner = CountryBoard.ownerOf(p.id);
            if (!owner) continue;
            const v = p.vertices;
            for (let i = 0; i < v.length; i++) {
                const a = v[i], b = v[(i + 1) % v.length];
                const ka = key(a), kb = key(b);
                const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
                const other = seen.get(k);
                if (other === undefined) seen.set(k, owner);
                else if (other !== owner) edges.push([a, b]);
            }
        }
        edgeCache.set(polygons, edges);
        return edges;
    }

    function active() {
        const config = AppState.getState().boardConfig;
        return Boolean(config && config.boardShape === 'country' && config.countryBorders !== false && CountryBoard.isRegion(config.country));
    }

    function drawBorders(ctx, polygons, view, scaleForLines = view.scale) {
        const edges = borderEdges(polygons);
        if (!edges.length) return;
        ctx.save();
        ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (const [a, b] of edges) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
        ctx.strokeStyle = BORDER_SHADOW;
        ctx.lineWidth = (BORDER_PX + 2) / scaleForLines;
        ctx.stroke();
        ctx.strokeStyle = BORDER_COLOR;
        ctx.lineWidth = BORDER_PX / scaleForLines;
        ctx.stroke();
        ctx.restore();
    }

    // On screen: after every redraw.
    Renderer.onRender(() => {
        if (!active()) return;
        const { ctx, polygons, view } = AppState.getState();
        if (ctx) drawBorders(ctx, polygons, view);
    });

    // Print pages paint through Renderer.paint; borders keep a fixed width relative to the tiles there.
    const originalPaint = Renderer.paint;
    Renderer.paint = function (ctx, scene) {
        const stats = originalPaint.apply(this, arguments);
        if (active() && scene && scene.polygons) {
            const view = scene.view || ViewMath.identity();
            const tile = ViewMath.typicalTileSize(scene.polygons) * view.scale;
            drawBorders(ctx, scene.polygons, view, view.scale * Math.max(1, 40 / Math.max(1, tile)));
        }
        return stats;
    };

    // PNG export: the board at the identity view.
    const originalExport = Renderer.createExportCanvas;
    Renderer.createExportCanvas = function () {
        const out = originalExport.apply(this, arguments);
        if (out && active()) {
            const scale = out.exportScale || 1;
            drawBorders(out.getContext('2d'), AppState.getState().polygons, { ...ViewMath.identity(), scale }, scale);
        }
        return out;
    };

    // ---- Controls -----------------------------------------------------------------------------

    function syncVisibility() {
        const row = $('countryBordersRow');
        if (row) row.classList.toggle('hidden', !CountryBoard.isRegion(String($('countryInput')?.value || '').trim()));
    }

    function bindControl() {
        const toggle = $('countryBorders');
        if (!toggle) return;
        toggle.addEventListener('change', () => {
            bordersOn = toggle.checked;
            // Applies straight away to the current board, no regeneration needed.
            const config = AppState.getState().boardConfig;
            if (config && config.boardShape === 'country' && CountryBoard.isRegion(config.country)) {
                config.countryBorders = bordersOn;
                Renderer.renderBoard();
                AppState.markDirty?.();
            }
        });
        const input = $('countryInput');
        ['input', 'change'].forEach((type) => input?.addEventListener(type, syncVisibility));
        syncVisibility();
    }

    function wrapUI() {
        const originalGet = UI.getBoardConfig;
        UI.getBoardConfig = function () {
            const config = originalGet.apply(this, arguments);
            if (config && config.boardShape === 'country') config.countryBorders = bordersOn;
            return config;
        };
        const originalUpdate = UI.updateBoardControls;
        UI.updateBoardControls = function (config) {
            originalUpdate.apply(this, arguments);
            if (config && config.boardShape === 'country') {
                bordersOn = config.countryBorders !== false;
                if ($('countryBorders')) $('countryBorders').checked = bordersOn;
                syncVisibility();
            }
        };
    }

    document.addEventListener('DOMContentLoaded', () => { wrapUI(); bindControl(); });

    return { REGIONS, borderEdges };
})();
