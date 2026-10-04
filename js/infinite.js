/**
 * PROTOGAMES INFINITE BOARD (prototype)
 * --------------------------------------------------------------
 * Board shape "infinite": an endless lattice of hex / square / triangle tiles
 * in fixed world coordinates. Only the tiles around the visible area are kept
 * in AppState.polygons, plus every painted tile or tile with an object, so the
 * existing renderer, tools, history, save and share keep working unchanged.
 *
 * Tile ids encode their lattice position (inf_hp_q_r, inf_hf_q_r, inf_s_x_y,
 * inf_t_i_j_up|down), so any tile can be rebuilt from its id alone. That is also why
 * saved files and share links only need the painted tiles: the rest is regenerated.
 *
 * Loaded after the core modules and before main.js; hooks in by wrapping a
 * few public functions (Geometry.generateGrid, AppState.setPolygons/setView/
 * resetView/restoreSnapshot, ViewMath.clampToBounds). Fixed boards are untouched.
 */
const Infinite = (() => {
    const HEX = 32; // hex radius in world px
    const SQ = 56; // square side
    const TRI = 64; // triangle side
    const R3 = Math.sqrt(3);
    const TRI_H = (R3 / 2) * TRI;
    const CHUNK = 512; // loaded area snaps to this grid so small pans do not rebuild
    const ZOOM_MIN = 0.4; // keeps the number of loaded tiles reasonable
    const H = GeometryHelpers;
    const fixedZoomMin = Config.ZOOM_MIN;

    // ---- Tiles from lattice coordinates ---------------------------------------------

    function hex(q, r, flat) {
        const center = flat
            ? { x: 1.5 * HEX * q, y: R3 * HEX * (r + q / 2) }
            : { x: R3 * HEX * (q + r / 2), y: 1.5 * HEX * r };
        return H.createPolygon({
            id: `inf_${flat ? 'hf' : 'hp'}_${q}_${r}`,
            type: 'hexagon',
            center,
            vertices: H.createHexVertices(center, HEX, flat ? 'flat-top' : 'pointy-top')
        });
    }

    function square(x, y) {
        const center = { x: (x + 0.5) * SQ, y: (y + 0.5) * SQ };
        return H.createPolygon({ id: `inf_s_${x}_${y}`, type: 'square', center, vertices: H.createSquareVertices(center, SQ) });
    }

    const point = (i, j) => ({ x: (i + j / 2) * TRI, y: j * TRI_H });
    function triangle(i, j, kind) {
        const corners = kind === 'down'
            ? [point(i, j), point(i + 1, j), point(i, j + 1)]
            : [point(i + 1, j), point(i + 1, j + 1), point(i, j + 1)];
        const center = { x: (corners[0].x + corners[1].x + corners[2].x) / 3, y: (corners[0].y + corners[1].y + corners[2].y) / 3 };
        return H.createPolygon({ id: `inf_t_${i}_${j}_${kind}`, type: 'triangle', center, vertices: corners, metadata: { pointingUp: kind === 'up' } });
    }

    /** Rebuilds a tile from its id, or null for ids that are not infinite-board tiles. */
    function fromId(id) {
        const p = String(id).split('_');
        if (p[0] !== 'inf') return null;
        const a = Number(p[2]);
        const b = Number(p[3]);
        if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
        switch (p[1]) {
            case 'hp': return hex(a, b, false);
            case 'hf': return hex(a, b, true);
            case 's': return square(a, b);
            case 't': return p[4] === 'up' || p[4] === 'down' ? triangle(a, b, p[4]) : null;
            default: return null;
        }
    }

    const familyOf = (id) => String(id).split('_').slice(0, 2).join('_');
    function familyFor(config) {
        if (config.gridType === 'square') return 'inf_s';
        if (config.gridType === 'triangle') return 'inf_t';
        return config.orientation === 'flat-top' ? 'inf_hf' : 'inf_hp';
    }

    /** Every tile of a lattice family that touches a world rectangle. */
    function cellsIn(family, rect) {
        const out = [];
        const { minX, minY, maxX, maxY } = rect;
        if (family === 'inf_hp') {
            const dy = 1.5 * HEX, dx = R3 * HEX;
            for (let r = Math.floor(minY / dy) - 1; r <= Math.ceil(maxY / dy) + 1; r++) {
                for (let q = Math.floor(minX / dx - r / 2) - 1; q <= Math.ceil(maxX / dx - r / 2) + 1; q++) out.push(hex(q, r, false));
            }
        } else if (family === 'inf_hf') {
            const dx = 1.5 * HEX, dy = R3 * HEX;
            for (let q = Math.floor(minX / dx) - 1; q <= Math.ceil(maxX / dx) + 1; q++) {
                for (let r = Math.floor(minY / dy - q / 2) - 1; r <= Math.ceil(maxY / dy - q / 2) + 1; r++) out.push(hex(q, r, true));
            }
        } else if (family === 'inf_s') {
            for (let y = Math.floor(minY / SQ); y <= Math.floor(maxY / SQ); y++) {
                for (let x = Math.floor(minX / SQ); x <= Math.floor(maxX / SQ); x++) out.push(square(x, y));
            }
        } else if (family === 'inf_t') {
            for (let j = Math.floor(minY / TRI_H) - 1; j <= Math.ceil(maxY / TRI_H); j++) {
                for (let i = Math.floor(minX / TRI - j / 2) - 1; i <= Math.ceil(maxX / TRI - j / 2) + 1; i++) {
                    out.push(triangle(i, j, 'down'), triangle(i, j, 'up'));
                }
            }
        }
        return out;
    }

    // ---- Loaded area ------------------------------------------------------------------

    const st = () => AppState.getState();
    const blank = () => String(Config.DEFAULT_FILL).toLowerCase();
    const isPainted = (p) => Boolean(p.object) || (p.color && String(p.color).toLowerCase() !== blank());

    function isActive() {
        const polygons = st().polygons;
        return polygons.length > 0 && String(polygons[0].id).startsWith('inf_');
    }

    function applyZoomLimit() {
        Config.ZOOM_MIN = isActive() ? ZOOM_MIN : fixedZoomMin;
    }

    function loadRect() {
        const s = st();
        const v = ViewMath.visibleWorldRect(s.view, s.canvas.width, s.canvas.height);
        return {
            minX: (Math.floor(v.minX / CHUNK) - 1) * CHUNK,
            minY: (Math.floor(v.minY / CHUNK) - 1) * CHUNK,
            maxX: (Math.ceil(v.maxX / CHUNK) + 1) * CHUNK,
            maxY: (Math.ceil(v.maxY / CHUNK) + 1) * CHUNK
        };
    }

    let loadedKey = '';

    /**
     * Swaps in the tiles around the current view (keeping painted ones anywhere).
     * Replaces the polygons array so cached adjacency/bounds are rebuilt. Returns
     * true when the tile set changed.
     */
    function sync(force = false) {
        const s = st();
        if (!s.canvas || !isActive()) return false;
        const family = familyOf(s.polygons[0].id);
        const rect = loadRect();
        const key = `${family}:${rect.minX},${rect.minY},${rect.maxX},${rect.maxY}`;
        if (!force && key === loadedKey) return false;
        loadedKey = key;
        const existing = new Map(s.polygons.map((p) => [p.id, p]));
        const seen = new Set();
        const next = [];
        for (const cell of cellsIn(family, rect)) {
            next.push(existing.get(cell.id) || cell);
            seen.add(cell.id);
        }
        for (const p of s.polygons) if (!seen.has(p.id) && isPainted(p)) next.push(p);
        s.polygons = next;
        return true;
    }

    /** View that frames the painted tiles (or the origin when there are none). */
    function contentView() {
        const s = st();
        const painted = s.polygons.filter(isPainted);
        if (!painted.length) return ViewMath.identity();
        const b = ViewMath.boundsOf(painted);
        const pad = 48;
        const w = s.canvas.width - pad * 2;
        const h = s.canvas.height - pad * 2 - Config.TOOLBAR_CLEARANCE;
        const scale = Math.min(1.5, Math.max(ZOOM_MIN, Math.min(w / Math.max(1, b.maxX - b.minX), h / Math.max(1, b.maxY - b.minY))));
        return {
            scale,
            x: s.canvas.width / 2 - ((b.minX + b.maxX) / 2) * scale,
            y: pad + h / 2 - ((b.minY + b.maxY) / 2) * scale
        };
    }

    /** Tiles that need saving or sharing: painted ones (at least one so the board type survives). */
    function paintedTiles(polygons) {
        const painted = polygons.filter(isPainted);
        return painted.length ? painted : polygons.slice(0, 1);
    }

    // ---- Export ------------------------------------------------------------------------------

    const EXPORT_MARGIN = HEX * 2; // one ring of blank tiles around what was drawn
    const EXPORT_MAX_TILES = 30000;

    /**
     * What to export: tiles covering the drawn area (painted ones taken from the board) and a view
     * that fits them into a canvas of the given size. Without any drawing the loaded area is used.
     * Returns { polygons, bounds, view }.
     */
    function exportScene(width, height) {
        const s = st();
        const painted = s.polygons.filter(isPainted);
        const base = ViewMath.boundsOf(painted.length ? painted : s.polygons);
        const rect = { minX: base.minX - EXPORT_MARGIN, minY: base.minY - EXPORT_MARGIN, maxX: base.maxX + EXPORT_MARGIN, maxY: base.maxY + EXPORT_MARGIN };
        const byId = new Map(s.polygons.map((p) => [p.id, p]));
        let polygons = cellsIn(familyOf(s.polygons[0].id), rect).map((cell) => byId.get(cell.id) || cell);
        // Drawings spread over a huge area: export the drawn tiles only rather than millions of blanks.
        if (polygons.length > EXPORT_MAX_TILES) polygons = painted;
        const bounds = ViewMath.boundsOf(polygons);
        const pad = 24;
        const scale = Math.min(2, (width - pad * 2) / Math.max(1, bounds.maxX - bounds.minX), (height - pad * 2) / Math.max(1, bounds.maxY - bounds.minY));
        const view = {
            scale,
            x: width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale,
            y: height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale
        };
        return { polygons, bounds, view };
    }

    // ---- Hooks ----------------------------------------------------------------------------

    let keepView = false;

    const originalGenerate = Geometry.generateGrid;
    Geometry.generateGrid = function (config, canvas, colorMap) {
        if (!config || config.boardShape !== 'infinite') return originalGenerate(config, canvas, colorMap);
        const family = familyFor(config);
        const w = canvas ? canvas.width : 1200;
        const h = canvas ? canvas.height : 800;
        const cells = cellsIn(family, { minX: -CHUNK, minY: -CHUNK, maxX: w + CHUNK, maxY: h + CHUNK });
        if (colorMap) {
            // Regenerating the same board (window resize): carry over painted tiles that are off-screen too.
            const ids = new Set(cells.map((c) => c.id));
            const extra = new Set();
            colorMap.forEach((color, id) => { if (familyOf(id) === family && !ids.has(id) && String(color).toLowerCase() !== blank()) extra.add(id); });
            st().polygons.forEach((p) => { if (p.object && familyOf(p.id) === family && !ids.has(p.id)) extra.add(p.id); });
            extra.forEach((id) => { const p = fromId(id); if (p) cells.push(p); });
            cells.forEach((c) => { if (colorMap.has(c.id)) c.color = colorMap.get(c.id); });
            keepView = familyOf(st().polygons[0]?.id || '') === family;
        }
        return cells;
    };

    const originalSetPolygons = AppState.setPolygons;
    AppState.setPolygons = function (polygons) {
        const previous = { ...st().view };
        originalSetPolygons(polygons);
        if (keepView && isActive()) st().view = previous;
        keepView = false;
        loadedKey = '';
        applyZoomLimit();
        sync(true);
    };

    const originalSetView = AppState.setView;
    AppState.setView = function (view) {
        originalSetView(view);
        sync();
    };

    const originalResetView = AppState.resetView;
    AppState.resetView = function () {
        if (!isActive()) return originalResetView();
        AppState.setView(contentView());
    };

    const originalRestore = AppState.restoreSnapshot;
    AppState.restoreSnapshot = function (snapshot) {
        if (snapshot && isActive()) {
            const s = st();
            const have = new Set(s.polygons.map((p) => p.id));
            const missing = snapshot
                .filter((e) => !have.has(e.id) && (e.object || String(e.color).toLowerCase() !== blank()))
                .map((e) => fromId(e.id))
                .filter(Boolean);
            if (missing.length) s.polygons = s.polygons.concat(missing);
        }
        originalRestore(snapshot);
    };

    const originalClamp = ViewMath.clampToBounds;
    ViewMath.clampToBounds = function (view, width, height, bounds) {
        return isActive() ? view : originalClamp(view, width, height, bounds);
    };

    return { isActive, fromId, cellsIn, familyFor, sync, paintedTiles, isPainted, exportScene };
})();
