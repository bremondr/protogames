/**
 * PROTOGAMES COUNTRY BOARD
 * --------------------------------------------------------------
 * Board shape "country": a rectangle of tiles cut to the outline of a real country.
 * Outlines come from Natural Earth (public domain) via the world-atlas TopoJSON
 * (1:50m, which keeps small islands and archipelagos such as Fiji). The file ships with the app
 * (data/countries-50m.json, see data/README.md) and is fetched on first use; after that boards
 * and window resizes build synchronously. Until it has arrived a plain rectangle is shown and
 * cut to shape as soon as it does.
 *
 * Tiles keep the ids of the underlying rectangle grid, so colours and objects
 * survive regeneration like on any fixed board. Settings live in boardConfig:
 *   country       country name as in Natural Earth
 *   width         tiles across (height follows from the country's proportions)
 *   countryParts  'main' (large islands only), 'nearby' (plus island chains, no far territories) or 'all'
 *                 (older boards: countryMain true = 'nearby', false = 'all')
 *
 * Hooks in by wrapping Geometry.generateGrid, UI.getBoardConfig and
 * UI.updateBoardControls. Loaded after ui.js and before main.js.
 */
const CountryBoard = (() => {
    // Relative to the page, so it also resolves under /preview/pr-<n>/. Same origin: the Content-Security-Policy allows nothing else.
    const DATA_URL = 'data/countries-50m.json';
    const DEFAULT_COUNTRY = 'Czechia';
    const DEFAULT_ACROSS = 24;
    const MAX_ACROSS = 120;
    const MAX_SPAN = 201; // project files allow at most 201 rows or columns
    const DEG = Math.PI / 180;

    let countries = null; // name -> array of parts, each part = array of rings of [lon, lat]
    let names = [];
    let loading = null;
    const shapeCache = new Map();
    const regions = new Map(); // region name -> member country names (see countryRegions.js)
    let owners = new Map(); // tile id -> country name, for boards cut from several countries
    const pending = new Set(); // callbacks waiting for data

    // ---- Data -----------------------------------------------------------------------------

    /** Minimal TopoJSON decoder for the world-atlas file (quantized arcs, Polygon/MultiPolygon). */
    function decode(topology) {
        const { scale, translate } = topology.transform;
        const arcs = topology.arcs.map((arc) => {
            let x = 0, y = 0;
            return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; });
        });
        const ring = (indexes) => {
            const out = [];
            indexes.forEach((i, n) => {
                const pts = i >= 0 ? arcs[i] : arcs[~i].slice().reverse();
                pts.forEach((p, k) => { if (k > 0 || n === 0) out.push(p); });
            });
            return out;
        };
        const map = new Map();
        for (const g of topology.objects.countries.geometries) {
            const name = g.properties && g.properties.name;
            if (!name || !g.arcs) continue;
            const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
            const parts = polys.map((rings) => rings.map(ring));
            if (parts.length) map.set(name, parts);
        }
        return map;
    }

    function accept(topology) {
        countries = decode(topology);
        refreshNames();
        fillList();
        pending.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
        pending.clear();
    }

    function refreshNames() {
        if (!countries) return;
        const regionNames = [...regions.keys()].filter((r) => regionMembers(r).length).sort((a, b) => a.localeCompare(b));
        const countryNames = [...countries.keys()].filter((n) => n !== 'Antarctica').sort((a, b) => a.localeCompare(b));
        names = regionNames.concat(countryNames);
    }

    const regionMembers = (name) => (regions.get(name) || []).filter((m) => countries && countries.has(m));
    const isKnown = (name) => Boolean(countries && (countries.has(name) || regionMembers(name).length));

    /** Adds a multi-country area (e.g. "Scandinavia") that can be picked like a country. */
    function registerRegion(name, members) {
        regions.set(name, members.slice());
        shapeCache.clear();
        if (countries) { refreshNames(); const list = $('countryList'); if (list) { list.textContent = ''; fillList(); } }
    }

    /** Resolves when outlines are available (immediately once downloaded). */
    function ready() {
        if (countries) return Promise.resolve(true);
        if (!loading) {
            loading = fetch(DATA_URL)
                .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
                .then((topology) => {
                    accept(topology);
                    return true;
                })
                .catch((err) => {
                    loading = null;
                    console.error('Country outlines failed to load:', err);
                    status('Could not download country outlines. Check the connection and try again.', true);
                    return false;
                });
        }
        return loading;
    }

    // ---- Shape ------------------------------------------------------------------------------

    function ringArea(r) {
        let a = 0;
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
        return Math.abs(a / 2);
    }

    function bboxOf(points) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [x, y] of points) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
        return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
    }

    /**
     * The country projected to a flat plane (Lambert azimuthal equal-area around its centre),
     * y pointing down. Parts are polygons (outer ring + holes).
     */
    function shapeOf(name, mode = 'nearby') {
        if (mode === true) mode = 'nearby'; else if (mode === false) mode = 'all';
        const key = `${name}|${mode}`;
        if (shapeCache.has(key)) return shapeCache.get(key);
        const members = regions.has(name) ? regionMembers(name) : [name];
        let parts = [];
        for (const member of members) {
            let own = countries && countries.get(member);
            if (!own) continue;
            // Countries crossing the antimeridian (Russia, Fiji, USA): keep longitudes continuous.
            const lons = own.flatMap((p) => p[0].map((pt) => pt[0]));
            if (members.length === 1 && Math.max(...lons) - Math.min(...lons) > 180) {
                own = own.map((p) => p.map((r) => r.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat])));
            }
            // Island rules apply per country, so a region keeps each member's own islands.
            if (mode !== 'all' && own.length > 1) own = nearbyParts(own, mode === 'main');
            own.forEach((p) => { const tagged = p.slice(); tagged.owner = member; parts.push(tagged); });
        }
        if (!parts.length) return null;
        const all = parts.flatMap((p) => p[0]);
        const b = bboxOf(all);
        const lon0 = ((b.minX + b.maxX) / 2) * DEG, lat0 = ((b.minY + b.maxY) / 2) * DEG;
        const project = ([lon, lat]) => {
            const l = lon * DEG - lon0, f = lat * DEG;
            const k = Math.sqrt(2 / (1 + Math.sin(lat0) * Math.sin(f) + Math.cos(lat0) * Math.cos(f) * Math.cos(l)));
            return [k * Math.cos(f) * Math.sin(l), -k * (Math.cos(lat0) * Math.sin(f) - Math.sin(lat0) * Math.cos(f) * Math.cos(l))];
        };
        const projected = parts.map((p) => { const q = p.map((r) => r.map(project)); q.owner = p.owner; return q; });
        const shape = { parts: projected, bbox: bboxOf(projected.flatMap((p) => p[0])), multi: members.length > 1 };
        shapeCache.set(key, shape);
        return shape;
    }

    /**
     * The largest part plus every part within reach of one already kept, so island chains stay
     * together. Reach is mostly an absolute distance (about 350 km): archipelagos like Fiji,
     * Indonesia or the Philippines keep their islands, while far territories (Hawaii, Alaska,
     * French Guiana, Svalbard) are dropped.
     */
    function nearbyParts(parts, largeOnly = false) {
        const KM_PER_DEG = 111.2;
        const info = parts.map((p) => ({ p, b: bboxOf(p[0]), a: ringArea(p[0]) }));
        info.sort((x, y) => y.a - x.a);
        const main = info[0].b;
        const cosLat = Math.cos(((main.minY + main.maxY) / 2) * DEG);
        const mainKm = Math.max(main.w * cosLat, main.h) * KM_PER_DEG;
        const reachKm = Math.max(350, mainKm * 0.1);
        const gapKm = (c, k) => {
            const gx = Math.max(0, c.minX - k.maxX, k.minX - c.maxX) * KM_PER_DEG * cosLat;
            const gy = Math.max(0, c.minY - k.maxY, k.minY - c.maxY) * KM_PER_DEG;
            return Math.hypot(gx, gy);
        };
        const kept = [info[0]];
        // 'Main islands': only islands of at least 3 % of the largest one (Japan: the four home islands).
        const rest = info.slice(1).filter((x) => !largeOnly || x.a >= info[0].a * 0.03);
        let grew = true;
        while (grew) {
            grew = false;
            for (let i = rest.length - 1; i >= 0; i--) {
                if (kept.some((k) => gapKm(rest[i].b, k.b) <= reachKm)) { kept.push(rest[i]); rest.splice(i, 1); grew = true; }
            }
        }
        return kept.map((k) => k.p);
    }

    /** Drops ring points closer than tol to the previous kept point; keeps tiny islands as at least a triangle. */
    function simplifyParts(parts, tol) {
        const t2 = tol * tol;
        return parts.map((part) => {
            const out = part.map((r) => {
                if (r.length <= 4) return r;
                const kept = [r[0]];
                for (let i = 1; i < r.length; i++) {
                    const a = kept[kept.length - 1], b = r[i];
                    if ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 >= t2) kept.push(b);
                }
                return kept.length >= 3 ? kept : r.slice(0, Math.min(r.length, 4));
            });
            out.box = bboxOf(part[0]);
            out.owner = part.owner;
            return out;
        });
    }

    function inside(x, y, parts) {
        let inPoly = false;
        for (const part of parts) {
            const pb = part.box;
            if (pb && (x < pb.minX || x > pb.maxX || y < pb.minY || y > pb.maxY)) continue;
            for (const r of part) {
                for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
                    const [xi, yi] = r[i], [xj, yj] = r[j];
                    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inPoly = !inPoly;
                }
            }
        }
        return inPoly;
    }

    /** The country whose outline contains the point (null at sea). */
    function ownerAt(x, y, parts) {
        for (const part of parts) {
            const pb = part.box;
            if (pb && (x < pb.minX || x > pb.maxX || y < pb.minY || y > pb.maxY)) continue;
            if (inside(x, y, [part])) return part.owner;
        }
        return null;
    }

    // ---- Grid ---------------------------------------------------------------------------------

    const PART_MODES = ['main', 'nearby', 'all'];
    function partsMode(config) {
        if (PART_MODES.includes(config.countryParts)) return config.countryParts;
        return config.countryMain === false ? 'all' : 'nearby';
    }

    const originalGenerate = Geometry.generateGrid;
    const rectConfig = (config, w, h) => ({ ...config, boardShape: 'rectangle', width: w, height: h });

    /** Rows needed so the rectangle has the country's proportions. */
    function rowsFor(config, canvas, across, shape) {
        const probe = originalGenerate(rectConfig(config, across, across), canvas, null);
        const b = probe.length ? ViewMath.boundsOf(probe) : null;
        if (!b) return across;
        const perCol = (b.maxX - b.minX) / across, perRow = (b.maxY - b.minY) / across;
        const aspect = shape.bbox.h / Math.max(1e-9, shape.bbox.w);
        return Math.max(1, Math.min(MAX_SPAN, Math.ceil((across * perCol * aspect) / perRow) + 1));
    }

    function buildCountry(config, canvas, colorMap) {
        const shape = shapeOf(config.country, partsMode(config));
        const across = Math.max(2, Math.min(MAX_ACROSS, Math.round(config.width) || DEFAULT_ACROSS));
        const rows = rowsFor(config, canvas, across, shape);
        config.height = rows; // stored so file validation and share-link size checks see the real span
        const grid = originalGenerate(rectConfig(config, across, rows), canvas, colorMap);
        if (!grid.length) return grid;
        const g = ViewMath.boundsOf(grid);
        // Fit the country into the grid (centred), then keep tiles whose centre falls on land.
        const s = Math.min((g.maxX - g.minX) / shape.bbox.w, (g.maxY - g.minY) / shape.bbox.h) * 0.98;
        const ox = (g.minX + g.maxX) / 2 - ((shape.bbox.minX + shape.bbox.maxX) / 2) * s;
        const oy = (g.minY + g.maxY) / 2 - ((shape.bbox.minY + shape.bbox.maxY) / 2) * s;
        const toShape = (p) => [(p.x - ox) / s, (p.y - oy) / s];
        // Outline detail matched to the tile size: points closer than a fraction of a tile are merged.
        const tile = grid[0];
        const tileSize = Math.max(tile.bounds.maxX - tile.bounds.minX, tile.bounds.maxY - tile.bounds.minY) / s;
        const parts = simplifyParts(shape.parts, tileSize / 6);
        const kept = new Set();
        grid.forEach((p, i) => {
            const [cx, cy] = toShape(p.center);
            if (inside(cx, cy, parts)) { kept.add(i); return; }
            // Coast tiles: keep when a good share of the tile is land, not only when the centre is.
            const samples = p.vertices.map((v) => { const [vx, vy] = toShape(v); return [(vx + cx) / 2, (vy + cy) / 2]; });
            const hits = samples.filter(([x, y]) => inside(x, y, parts)).length;
            if (hits / samples.length >= 0.5) kept.add(i);
        });
        // Islands smaller than a tile still get one: the tile nearest their middle.
        const islandTiles = [];
        for (const part of parts) {
            const pb = part.box;
            const has = grid.some((p, i) => {
                if (!kept.has(i)) return false;
                const b = p.bounds, [x0, y0] = toShape({ x: b.minX, y: b.minY }), [x1, y1] = toShape({ x: b.maxX, y: b.maxY });
                return x1 >= pb.minX && x0 <= pb.maxX && y1 >= pb.minY && y0 <= pb.maxY;
            });
            if (has) continue;
            const cx = (pb.minX + pb.maxX) / 2 * s + ox, cy = (pb.minY + pb.maxY) / 2 * s + oy;
            let best = -1, bd = Infinity;
            grid.forEach((p, i) => { const d = (p.center.x - cx) ** 2 + (p.center.y - cy) ** 2; if (d < bd) { bd = d; best = i; } });
            if (best >= 0) { kept.add(best); islandTiles.push([grid[best].id, part.owner]); }
        }
        const tiles = grid.filter((_, i) => kept.has(i));
        owners = new Map();
        if (shape.multi) {
            // Each tile belongs to the country under its centre, or to the one covering most of it.
            const islandOwner = new Map(islandTiles);
            tiles.forEach((p) => {
                const [cx, cy] = toShape(p.center);
                let owner = ownerAt(cx, cy, parts);
                if (!owner) {
                    const votes = new Map();
                    p.vertices.forEach((v) => { const [vx, vy] = toShape(v); const o = ownerAt((vx + cx) / 2, (vy + cy) / 2, parts); if (o) votes.set(o, (votes.get(o) || 0) + 1); });
                    owner = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] || islandOwner.get(p.id) || null;
                }
                if (owner) owners.set(p.id, owner);
            });
        }
        return GeometryHelpers.fitPolygonsToCanvas(tiles.length ? tiles : grid, canvas);
    }

    Geometry.generateGrid = function (config, canvas, colorMap) {
        if (!config || config.boardShape !== 'country') return originalGenerate(config, canvas, colorMap);
        if (!config.country) config.country = DEFAULT_COUNTRY;
        if (isKnown(config.country) && canvas) return buildCountry(config, canvas, colorMap);
        // Outlines not here yet (first use, or a link opened in a new browser): show the plain
        // rectangle and cut it to shape as soon as they arrive. Tile ids are the same, so paint survives.
        if (!countries) {
            pending.add(() => {
                const st = AppState.getState();
                if (st.boardConfig && st.boardConfig.boardShape === 'country') {
                    Interactions.generateBoard(st.boardConfig, { preserveColors: true, preserveHistory: true, skipDirtyFlag: true });
                }
            });
            ready();
        } else status(`Unknown country "${config.country}".`, true);
        return originalGenerate(rectConfig(config, config.width || DEFAULT_ACROSS, config.height || DEFAULT_ACROSS), canvas, colorMap);
    };

    // ---- Controls -------------------------------------------------------------------------------

    const $ = (id) => document.getElementById(id);

    function status(text, isError = false) {
        const el = $('countryStatus');
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('error', Boolean(isError));
    }

    function fillList() {
        const list = $('countryList');
        if (!list || list.childElementCount) return;
        const frag = document.createDocumentFragment();
        names.forEach((n) => { const o = document.createElement('option'); o.value = n; if (regions.has(n)) o.label = `Region · ${regionMembers(n).length} countries`; frag.appendChild(o); });
        list.appendChild(frag);
    }

    function matchName(value) {
        const v = String(value || '').trim().toLowerCase();
        if (!v) return null;
        return names.find((n) => n.toLowerCase() === v) || names.find((n) => n.toLowerCase().startsWith(v)) || null;
    }

    function applyVisibility() {
        const shape = document.querySelector('select[name="boardOutline"]')?.value;
        const isCountry = shape === 'country';
        $('countryFields')?.classList.toggle('hidden', !isCountry);
        if (isCountry) {
            $('rectangularFields')?.classList.add('hidden');
            ready().then((ok) => { if (ok) { fillList(); status(''); } });
        }
    }

    let currentParts = 'nearby';
    const PART_HINTS = {
        main: 'Only the large islands, e.g. Japan’s four home islands.',
        nearby: 'Adds island chains close to the coast; far territories are left out.',
        all: 'Every island and overseas territory. The board covers all of them.'
    };
    function setParts(mode) {
        currentParts = PART_MODES.includes(mode) ? mode : 'nearby';
        document.querySelectorAll('#countryParts button[data-value]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === currentParts)));
        const hint = $('countryPartsHint');
        if (hint) hint.textContent = PART_HINTS[currentParts];
    }

    function readSettings() {
        const input = $('countryInput');
        const name = matchName(input?.value) || (input?.value || '').trim() || DEFAULT_COUNTRY;
        const across = Math.max(2, Math.min(MAX_ACROSS, parseInt($('countryAcross')?.value, 10) || DEFAULT_ACROSS));
        return { country: name, width: across, countryParts: currentParts };
    }

    function wrapUI() {
        const originalGet = UI.getBoardConfig;
        UI.getBoardConfig = function () {
            const config = originalGet.apply(this, arguments);
            if (!config || config.boardShape !== 'country') return config;
            const s = readSettings();
            if (countries && !isKnown(s.country)) {
                status(`No country called "${s.country}". Pick one from the list.`, true);
                return null;
            }
            const input = $('countryInput');
            if (input) input.value = s.country;
            return { ...config, ...s, height: config.height };
        };
        const originalUpdate = UI.updateBoardControls;
        UI.updateBoardControls = function (config) {
            originalUpdate.apply(this, arguments);
            if (config && config.boardShape === 'country') {
                if ($('countryInput')) $('countryInput').value = config.country || DEFAULT_COUNTRY;
                if ($('countryAcross')) $('countryAcross').value = String(config.width || DEFAULT_ACROSS);
                setParts(partsMode(config));
            }
            applyVisibility();
        };
    }

    function init() {
        wrapUI();
        setParts(currentParts);
        $('countryParts')?.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-value]');
            if (button) setParts(button.dataset.value);
        });
        const select = document.querySelector('select[name="boardOutline"]');
        // After UI's own handler, which would otherwise show the width/height fields.
        select?.addEventListener('change', () => setTimeout(applyVisibility, 0));
        $('countryInput')?.addEventListener('change', () => {
            const m = matchName($('countryInput').value);
            if (m) { $('countryInput').value = m; status(''); }
        });
        applyVisibility();
    }

    document.addEventListener('DOMContentLoaded', init);

    return {
        MAX_ACROSS,
        MAX_SPAN,
        ready,
        names: () => names.slice(),
        shapeOf,
        registerRegion,
        isRegion: (name) => regions.has(name),
        /** Country of a tile on a board cut from several countries (undefined otherwise). */
        ownerOf: (id) => owners.get(id),
        hasOwners: () => owners.size > 0
    };
})();
