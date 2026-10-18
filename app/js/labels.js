/**
 * PROTOGAMES COORDINATE LABELS
 * --------------------------------------------------------------
 * Names for the columns and rows of a board, drawn outside it like the A to H and 1 to 8 of a chess
 * diagram, and optionally on every tile. Pure logic (no DOM) plus the drawing functions, so everything
 * here is unit-tested in Node.
 *
 * Two things are chosen separately:
 *   - the INDEXING (settings.scheme): how tiles are given a column and a row. Which schemes make sense
 *     depends on the tile shape and the board shape (see schemesFor), because real games label
 *     rectangular and non-rectangular hexagon boards differently:
 *       grid       square tiles: every column and row is a straight line
 *       triangles  triangle tiles: rows are bands of triangles, every triangle is a column
 *       offset     hexagon tiles on a rectangle: every other row (or column) is shifted by half a tile and
 *                  counts like the others; the other axis zigzags
 *       doubled    hexagon tiles: one axis counts half steps (1, 3, 5 / 2, 4, 6), as on 18xx railway maps
 *       axial      hexagon tiles on a hexagon, circle or triangle board: two families of straight lines,
 *                  the rows and the leaning diagonals, like Abalone
 *   - the SYMBOLS of each axis (letters, numbers, Roman numerals, Greek letters or the user's own list).
 *
 * Coordinates come from the tile geometry, never from the board shape or tile ids. Infinite boards have no
 * outside, so they have no labels. The settings (Config.DEFAULT_LABELS) are part of the design and are saved
 * with it; ProjectFormat checks them when a file is opened.
 */
const Labels = (() => {
    const SYMBOL_SETS = ['letters', 'numbers', 'roman', 'greek', 'custom'];
    const SCHEMES = ['auto', 'grid', 'triangles', 'offset', 'doubled', 'axial'];
    const PLACEMENTS = ['straight', 'outline'];
    // The same limits are enforced by ProjectFormat when a project is opened.
    const MAX_CUSTOM_TEXT = 200;
    const MAX_CUSTOM_ENTRIES = 100;
    const MAX_SYMBOL_LENGTH = 4; // characters per entry of a custom list
    const MAX_SKIP = 26;
    const MIN_START = -100;
    const MAX_START = 1000;
    const GREEK = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ', 'ν', 'ξ', 'ο', 'π', 'ρ', 'σ', 'τ', 'υ', 'φ', 'χ', 'ψ', 'ω'];
    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    const SQRT3 = Math.sqrt(3);

    /** A fresh copy of the default settings (Config.DEFAULT_LABELS): everything off, chess style when switched on. */
    function defaults() {
        return JSON.parse(JSON.stringify(Config.DEFAULT_LABELS));
    }

    /** One-click starting points for the lists and sides; the panel applies one and shows "Custom" once something is changed. */
    const PRESETS = {
        chess: {
            name: 'Chess (A to H, 1 to 8 from the bottom)',
            columns: { symbols: 'letters', skip: '', start: 1, reverse: false, top: false, bottom: true },
            rows: { symbols: 'numbers', skip: '', start: 1, reverse: true, left: true, right: false }
        },
        battleship: {
            name: 'Battleship (A to J across, 1 to 10 down)',
            columns: { symbols: 'letters', skip: '', start: 1, reverse: false, top: true, bottom: false },
            rows: { symbols: 'numbers', skip: '', start: 1, reverse: false, left: true, right: false }
        },
        go: {
            name: 'Go (letters without I, all four sides)',
            columns: { symbols: 'letters', skip: 'I', start: 1, reverse: false, top: true, bottom: true },
            rows: { symbols: 'numbers', skip: '', start: 1, reverse: true, left: true, right: true }
        },
        numbers: {
            name: 'Numbers (1, 2, 3 on both axes)',
            columns: { symbols: 'numbers', skip: '', start: 1, reverse: false, top: false, bottom: true },
            rows: { symbols: 'numbers', skip: '', start: 1, reverse: true, left: true, right: false }
        }
    };

    // ---- Settings: clean-up --------------------------------------------------------------------

    const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
    const symbolsOf = (text) => Array.from(String(text));

    /** Entries of a custom list: split on spaces and commas, empty ones dropped, each cut to its length limit. */
    function parseList(text) {
        return String(text || '')
            .split(/[\s,]+/)
            .filter(Boolean)
            .slice(0, MAX_CUSTOM_ENTRIES)
            .map((entry) => symbolsOf(entry).slice(0, MAX_SYMBOL_LENGTH).join(''));
    }

    /** Any input made into valid settings (unknown or broken parts fall back to the defaults). For the panel and for links. */
    function normalize(raw) {
        const base = defaults();
        const source = isObject(raw) ? raw : {};
        const axis = (name, sides) => {
            const from = isObject(source[name]) ? source[name] : {};
            const out = { ...base[name] };
            if (SYMBOL_SETS.includes(from.symbols)) out.symbols = from.symbols;
            if (typeof from.custom === 'string') out.custom = parseList(from.custom).join(' ').slice(0, MAX_CUSTOM_TEXT);
            if (typeof from.skip === 'string') out.skip = symbolsOf(from.skip).slice(0, MAX_SKIP).join('');
            if (Number.isInteger(from.start)) out.start = Math.min(MAX_START, Math.max(MIN_START, from.start));
            if (typeof from.reverse === 'boolean') out.reverse = from.reverse;
            for (const side of sides) if (typeof from[side] === 'boolean') out[side] = from[side];
            return out;
        };
        return {
            enabled: source.enabled === true,
            onTiles: source.onTiles === true,
            scheme: SCHEMES.includes(source.scheme) ? source.scheme : base.scheme,
            columns: axis('columns', ['top', 'bottom']),
            rows: axis('rows', ['left', 'right']),
            placement: PLACEMENTS.includes(source.placement) ? source.placement : base.placement
        };
    }

    /** The settings of a preset (the switches, the indexing and the placement are kept from `current`). */
    function applyPreset(current, id) {
        const preset = PRESETS[id];
        const base = normalize(current);
        if (!preset) return base;
        return normalize({ ...base, columns: { ...base.columns, ...preset.columns }, rows: { ...base.rows, ...preset.rows } });
    }

    /** The id of the preset these settings match (symbols, direction, sides, start, skip), or 'custom'. */
    function matchPreset(labels) {
        const l = normalize(labels);
        const same = (a, b) => Object.keys(b).every((key) => a[key] === b[key]);
        for (const [id, preset] of Object.entries(PRESETS)) {
            if (same(l.columns, preset.columns) && same(l.rows, preset.rows)) return id;
        }
        return 'custom';
    }

    // ---- Which indexings make sense -------------------------------------------------------------

    /**
     * The part of a board that decides how it can be labelled: { tile, orientation, shape }, where tile is
     * 'square', 'hexagon' or 'triangle', orientation is 'pointy-top' or 'flat-top' (hexagon tiles) and shape is
     * the board shape ('rectangle', 'hexagon', 'triangle', 'circle', 'country' or 'infinite').
     */
    function contextOfConfig(config) {
        const c = config || {};
        return {
            tile: c.gridType === 'square' || c.gridType === 'triangle' ? c.gridType : 'hexagon',
            orientation: c.orientation === 'flat-top' ? 'flat-top' : 'pointy-top',
            shape: c.boardShape || 'rectangle'
        };
    }

    /** The same, read from the tiles themselves (a board has one tile type) and the board shape. */
    function contextOf(polygons, shape) {
        const first = polygons[0];
        const w = first.bounds.maxX - first.bounds.minX;
        const h = first.bounds.maxY - first.bounds.minY;
        return {
            tile: first.type === 'hexagon' || first.type === 'triangle' ? first.type : 'square',
            orientation: w <= h ? 'pointy-top' : 'flat-top',
            shape: shape || 'rectangle'
        };
    }

    /**
     * The indexings that are meaningful for a board, the first being the default. Square and triangle tiles have
     * one; hexagon tiles on a rectangular board (rectangle, country) choose between offset and half steps, and on a
     * hexagon, circle or triangle board between two families of straight lines and half steps. Infinite: none.
     */
    function schemesFor(context) {
        const { tile, shape } = context;
        if (shape === 'infinite') return [];
        if (tile === 'square') return ['grid'];
        if (tile === 'triangle') return ['triangles'];
        return shape === 'rectangle' || shape === 'country' ? ['offset', 'doubled'] : ['axial', 'doubled'];
    }

    /** The indexing in use: the chosen one when it makes sense for this board, otherwise the board's default. */
    function schemeOf(labels, context) {
        const allowed = schemesFor(context);
        const chosen = labels && labels.scheme;
        return allowed.includes(chosen) ? chosen : allowed[0] || 'grid';
    }

    /** Names and one-line explanations for the panel, per indexing and hexagon orientation. */
    function schemeInfo(scheme, orientation) {
        const pointy = orientation !== 'flat-top';
        switch (scheme) {
            case 'grid': return { name: 'Rows and columns', hint: 'Every column and every row is a straight line.' };
            case 'triangles': return { name: 'Rows and columns', hint: 'Rows are bands of triangles; every triangle is a column.' };
            case 'offset': return {
                name: 'Offset',
                hint: pointy ? 'Rows are straight. A column zigzags, because every other row is shifted by half a tile.'
                    : 'Columns are straight. A row zigzags, because every other column is shifted by half a tile.'
            };
            case 'doubled': return {
                name: pointy ? 'Half-columns' : 'Half-rows',
                hint: pointy ? 'Rows are straight; the other axis counts half steps, so its numbers skip by two (as on 18xx maps).'
                    : 'Columns are straight; the other axis counts half steps, so its numbers skip by two (as on 18xx maps).'
            };
            case 'axial': return {
                name: 'Straight lines',
                hint: pointy ? 'Rows plus leaning diagonals, both straight lines, like Abalone.' : 'Columns plus leaning diagonals, both straight lines.'
            };
            default: return { name: scheme, hint: '' };
        }
    }

    /** What each axis is called in the panel for the indexing in use. */
    function axisNames(context, scheme) {
        const pointy = context.orientation !== 'flat-top';
        const names = { columns: 'Columns', rows: 'Rows' };
        if (context.tile === 'hexagon') {
            const odd = pointy ? 'columns' : 'rows';
            if (scheme === 'axial') names[odd] += ' (leaning lines)';
            if (scheme === 'doubled') names[odd] += ' (half steps)';
            if (scheme === 'offset') names[odd] += ' (zigzag)';
        }
        return names;
    }

    // ---- Symbols -------------------------------------------------------------------------------

    function letters(position, skip) {
        const skipped = new Set(symbolsOf(skip.toUpperCase()));
        const alphabet = symbolsOf(ALPHABET).filter((letter) => !skipped.has(letter));
        if (!alphabet.length) return null;
        let n = position + 1;
        let out = '';
        while (n > 0) {
            n -= 1;
            out = alphabet[n % alphabet.length] + out;
            n = Math.floor(n / alphabet.length);
        }
        return out;
    }

    function roman(value) {
        if (value < 1 || value > 3999) return String(value);
        let n = value;
        let out = '';
        for (const [amount, text] of ROMAN) {
            while (n >= amount) { out += text; n -= amount; }
        }
        return out;
    }

    /** A list that never runs out: after the last entry it starts again with a number behind each symbol (α2, β2 ...). */
    function fromList(list, position) {
        const round = Math.floor(position / list.length);
        return list[position % list.length] + (round ? String(round + 1) : '');
    }

    /**
     * The text for the n-th line of an axis (n counts from 0 along the axis, after the direction is applied).
     * Numbers count from `start`; every other set takes `start` as the 1-based position of its first symbol.
     * A set that cannot produce a symbol (an empty custom list, every letter skipped) falls back to numbers.
     */
    function symbol(axis, n) {
        if (axis.symbols === 'numbers') return String(axis.start + n);
        const position = n + axis.start - 1;
        if (position < 0) {
            const mirrored = symbol({ ...axis, start: 1 }, -position - 1);
            return `-${mirrored}`;
        }
        let text = null;
        if (axis.symbols === 'letters') text = letters(position, axis.skip);
        else if (axis.symbols === 'roman') text = roman(position + 1);
        else if (axis.symbols === 'greek') text = fromList(GREEK, position);
        else if (axis.symbols === 'custom') {
            const list = parseList(axis.custom);
            if (list.length) text = fromList(list, position);
        }
        return text === null ? String(axis.start + n) : text;
    }

    // ---- Coordinates: where each tile sits on its lattice ---------------------------------------

    /** Pitches of the lattice from the first tile (a board has one tile type). */
    function latticeOf(polygon) {
        const w = polygon.bounds.maxX - polygon.bounds.minX;
        const h = polygon.bounds.maxY - polygon.bounds.minY;
        if (polygon.type === 'hexagon') {
            return w <= h ? { kind: 'pointy', px: w, py: 0.75 * h } : { kind: 'flat', px: 0.75 * w, py: h };
        }
        if (polygon.type === 'triangle') return { kind: 'triangle', px: w / 2, py: h };
        return { kind: 'square', px: w, py: h };
    }

    const isInfinite = (polygons) => polygons.length > 0 && String(polygons[0].id).startsWith('inf_');

    /**
     * Integer { a, b } for every tile (same order as `polygons`): a is the index along the columns axis, b along the
     * rows axis, both counted from 0 at the top left. What the indexes mean depends on the scheme:
     *   grid, triangles  plain lattice (a triangle is a column step: two per triangle side)
     *   offset           the shifted rows (columns on flat-top tiles) count like the others
     *   doubled          the staggered axis counts half steps, so it has twice as many indexes
     *   axial            a and b are the two line families through the tile (rows and leaning diagonals)
     * Also says which axis, if any, counts half steps (half: 'columns' | 'rows' | null) and which axis is a family
     * of leaning lines (columnsLean, rowsLean).
     */
    function coordinates(polygons, scheme) {
        const plain = (cells, extra = {}) => ({ cells, half: null, columnsLean: false, rowsLean: false, ...extra });
        if (!polygons.length) return plain([]);
        const { px, py, kind } = latticeOf(polygons[0]);
        if (!(px > 0) || !(py > 0)) return plain(polygons.map(() => ({ a: 0, b: 0 })));
        let x0 = Infinity;
        let y0 = Infinity;
        let leftmost = 0;
        let topmost = 0;
        polygons.forEach((p, i) => {
            if (p.center.x < x0) { x0 = p.center.x; leftmost = i; }
            const top = kind === 'triangle' ? p.bounds.minY : p.center.y;
            if (top < y0) { y0 = top; topmost = i; }
        });
        const norm = (cells) => {
            const minA = Math.min(...cells.map((c) => c.a));
            const minB = Math.min(...cells.map((c) => c.b));
            return cells.map((c) => ({ a: c.a - minA, b: c.b - minB }));
        };

        if (kind === 'square') {
            return plain(polygons.map((p) => ({ a: Math.round((p.center.x - x0) / px), b: Math.round((p.center.y - y0) / py) })));
        }
        if (kind === 'triangle') {
            return plain(polygons.map((p) => ({ a: Math.round((p.center.x - x0) / px), b: Math.round((p.bounds.minY - y0) / py) })));
        }

        const pointy = kind === 'pointy';
        if (scheme === 'doubled') {
            return pointy
                ? plain(polygons.map((p) => ({ a: Math.round((p.center.x - x0) / (px / 2)), b: Math.round((p.center.y - y0) / py) })), { half: 'columns' })
                : plain(polygons.map((p) => ({ a: Math.round((p.center.x - x0) / px), b: Math.round((p.center.y - y0) / (py / 2)) })), { half: 'rows' });
        }
        if (scheme === 'axial') {
            if (pointy) {
                const rows = polygons.map((p) => Math.round((p.center.y - y0) / py));
                const rowOfLeftmost = rows[leftmost];
                return plain(norm(polygons.map((p, i) => ({ a: Math.round((p.center.x - x0) / px - (rows[i] - rowOfLeftmost) / 2), b: rows[i] }))), { columnsLean: true });
            }
            const cols = polygons.map((p) => Math.round((p.center.x - x0) / px));
            const colOfTopmost = cols[topmost];
            return plain(norm(polygons.map((p, i) => ({ a: cols[i], b: Math.round((p.center.y - y0) / py - (cols[i] - colOfTopmost) / 2) }))), { rowsLean: true });
        }
        // offset: the odd rows (pointy) or columns (flat) are shifted by half a tile and count like the others
        if (pointy) {
            const rows = polygons.map((p) => Math.round((p.center.y - y0) / py));
            const xs = polygons.map((p, i) => p.center.x - ((rows[i] & 1) ? px / 2 : 0));
            const base = Math.min(...xs);
            return plain(polygons.map((p, i) => ({ a: Math.round((xs[i] - base) / px), b: rows[i] })));
        }
        const cols = polygons.map((p) => Math.round((p.center.x - x0) / px));
        const ys = polygons.map((p, i) => p.center.y - ((cols[i] & 1) ? py / 2 : 0));
        const base = Math.min(...ys);
        return plain(polygons.map((p, i) => ({ a: cols[i], b: Math.round((ys[i] - base) / py) })));
    }

    const analysisCache = new WeakMap();

    /** Coordinates plus the tiles of every column and row, cached for as long as the tile array lives. */
    function analyse(polygons, scheme) {
        let bySchemes = analysisCache.get(polygons);
        if (!bySchemes) {
            bySchemes = new Map();
            analysisCache.set(polygons, bySchemes);
        }
        if (bySchemes.has(scheme)) return bySchemes.get(scheme);
        const coords = coordinates(polygons, scheme);
        const columns = new Map();
        const rows = new Map();
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        polygons.forEach((polygon, index) => {
            const { a, b } = coords.cells[index];
            if (!columns.has(a)) columns.set(a, []);
            if (!rows.has(b)) rows.set(b, []);
            columns.get(a).push(polygon);
            rows.get(b).push(polygon);
            minX = Math.min(minX, polygon.bounds.minX);
            maxX = Math.max(maxX, polygon.bounds.maxX);
            minY = Math.min(minY, polygon.bounds.minY);
            maxY = Math.max(maxY, polygon.bounds.maxY);
        });
        const info = { ...coords, columns, rows, bounds: { minX, maxX, minY, maxY } };
        bySchemes.set(scheme, info);
        return info;
    }

    /** The labels of the lines that exist on this board: Map of index -> text, for one axis. */
    function textsFor(axis, indices) {
        const sorted = [...indices].sort((a, b) => a - b);
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const texts = new Map();
        for (const index of sorted) {
            const n = axis.reverse ? last - index : index - first;
            texts.set(index, symbol(axis, n));
        }
        return texts;
    }

    /** True when coordinates should be shown anywhere (around the board or on the tiles). */
    const isActive = (labels) => Boolean(labels && (labels.enabled || labels.onTiles));

    const joinParts = (column, row) => (/^-?\d+$/.test(column) && /^-?\d/.test(row) ? `${column}, ${row}` : `${column}${row}`);

    /** The name of one tile, such as "B7" (or "3, 7" when both parts are numbers); null when labels are off or not possible. */
    function tileName(polygons, polygon, labels, boardShape) {
        const settings = normalize(labels);
        if (!isActive(settings) || !polygons.length || isInfinite(polygons)) return null;
        const scheme = schemeOf(settings, contextOf(polygons, boardShape));
        const info = analyse(polygons, scheme);
        const at = polygons.indexOf(polygon);
        if (at < 0) return null;
        const { a, b } = info.cells[at];
        const column = textsFor(settings.columns, info.columns.keys()).get(a);
        const row = textsFor(settings.rows, info.rows.keys()).get(b);
        if (column === undefined || row === undefined) return null;
        return joinParts(column, row);
    }

    const namesCache = new WeakMap();

    /** The name of every tile (same order as `polygons`), cached while the tiles and settings stay the same. Empty unless shown on tiles. */
    function tileNames(polygons, labels, boardShape) {
        const settings = normalize(labels);
        if (!settings.onTiles || !polygons.length || isInfinite(polygons)) return [];
        const key = JSON.stringify([settings, boardShape]);
        const cached = namesCache.get(polygons);
        if (cached && cached.key === key) return cached.names;
        const scheme = schemeOf(settings, contextOf(polygons, boardShape));
        const info = analyse(polygons, scheme);
        const columnTexts = textsFor(settings.columns, info.columns.keys());
        const rowTexts = textsFor(settings.rows, info.rows.keys());
        const names = polygons.map((polygon, i) => joinParts(columnTexts.get(info.cells[i].a), rowTexts.get(info.cells[i].b)));
        namesCache.set(polygons, { key, names });
        return names;
    }

    // ---- Layout and drawing ------------------------------------------------------------------------

    /** Font size in world units: a share of the tile, kept within a range that stays readable at the first view. */
    function fontSize(polygons) {
        if (!polygons.length) return 12;
        const p = polygons[0];
        const tile = Math.min(p.bounds.maxX - p.bounds.minX, p.bounds.maxY - p.bounds.minY);
        return Math.min(20, Math.max(9, tile * 0.42));
    }

    const median = (values) => {
        const sorted = [...values].sort((a, b) => a - b);
        return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    };

    /** Keeps every n-th label when lines are closer together than a label is tall. */
    function thinned(items, axisKey, font) {
        if (items.length < 2) return items;
        const sorted = [...items].sort((a, b) => a[axisKey] - b[axisKey]);
        const gaps = [];
        for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i][axisKey] - sorted[i - 1][axisKey]);
        const spacing = median(gaps.filter((g) => g > 1e-6));
        if (!(spacing > 0)) return items;
        const stride = Math.max(1, Math.ceil((font * 1.15) / spacing));
        return stride === 1 ? items : sorted.filter((item, i) => i % stride === 0);
    }

    // Unit vectors of the leaning lines of a hexagon grid, pointing down and to the right.
    const LEAN_POINTY = { x: 0.5, y: SQRT3 / 2 }; // 60 degrees: the lines through tiles of neighbouring rows
    const LEAN_FLAT = { x: SQRT3 / 2, y: 0.5 }; // 30 degrees: the lines through tiles of neighbouring columns

    const layoutCache = new WeakMap();

    /**
     * Where every label goes: [{ axis, side, text, x, y }] in world coordinates, outside the board.
     * 'straight' puts the labels of a side on one straight line along the board's bounding box (a leaning line is
     * carried on along its own direction to get there); 'outline' puts each label next to the outermost tile of its line
     * (an axis that counts half steps always uses the straight line).
     * Where an axis counts half steps and both its sides are on, the lines that reach the first row (column) get the
     * first side and the others the second, as on 18xx maps; with one side alone it shows them all.
     */
    function layout(polygons, labels, boardShape) {
        const settings = normalize(labels);
        if (!settings.enabled || !polygons.length || isInfinite(polygons)) return { items: [], font: fontSize(polygons) };
        const key = JSON.stringify([settings, boardShape]);
        const cached = layoutCache.get(polygons);
        if (cached && cached.key === key) return cached.value;

        const scheme = schemeOf(settings, contextOf(polygons, boardShape));
        const info = analyse(polygons, scheme);
        const font = fontSize(polygons);
        const gap = font * 0.95;
        const outline = settings.placement === 'outline';
        const b = info.bounds;
        const first = polygons[0];
        const half = Math.min(first.bounds.maxX - first.bounds.minX, first.bounds.maxY - first.bounds.minY) / 2;
        const items = [];

        // ---- columns axis: labels above and below the board
        const columnTexts = textsFor(settings.columns, info.columns.keys());
        const columnLines = [];
        for (const [index, tiles] of info.columns) {
            const meanX = tiles.reduce((sum, t) => sum + t.center.x, 0) / tiles.length;
            let top = tiles[0];
            let bottom = tiles[0];
            for (const t of tiles) {
                if (t.center.y < top.center.y - 1e-6 || (Math.abs(t.center.y - top.center.y) < 1e-6 && t.bounds.minY < top.bounds.minY)) top = t;
                if (t.center.y > bottom.center.y + 1e-6) bottom = t;
            }
            columnLines.push({ index, meanX, top, bottom, text: columnTexts.get(index) });
        }
        const topRowY = Math.min(...polygons.map((p) => p.center.y));
        // Half steps are alignments of tiles that are not neighbours, so a label hugging the outline would land on the
        // tile of the next half step: those axes always sit on the straight line along the board.
        const hugColumns = outline && info.half !== 'columns';
        const placeColumn = (line, side) => {
            const tile = side === 'top' ? line.top : line.bottom;
            const sign = side === 'top' ? -1 : 1;
            if (info.columnsLean) {
                const d = LEAN_POINTY;
                if (hugColumns) return { x: tile.center.x + sign * d.x * (half + gap), y: tile.center.y + sign * d.y * (half + gap) };
                const y = side === 'top' ? b.minY - gap : b.maxY + gap;
                const t = (y - tile.center.y) / (sign * d.y);
                return { x: tile.center.x + sign * d.x * t, y };
            }
            const x = hugColumns ? tile.center.x : line.meanX;
            const y = side === 'top' ? (hugColumns ? tile.bounds.minY : b.minY) - gap : (hugColumns ? tile.bounds.maxY : b.maxY) + gap;
            return { x, y };
        };
        const splitColumns = info.half === 'columns' && settings.columns.top && settings.columns.bottom;
        for (const side of ['top', 'bottom']) {
            if (!settings.columns[side]) continue;
            const pool = splitColumns ? columnLines.filter((line) => (Math.abs(line.top.center.y - topRowY) < 1e-6) === (side === 'top')) : columnLines;
            items.push(...thinned(pool.map((line) => ({ axis: 'columns', side, text: line.text, ...placeColumn(line, side) })), 'x', font));
        }

        // ---- rows axis: labels left and right of the board
        const rowTexts = textsFor(settings.rows, info.rows.keys());
        const rowLines = [];
        for (const [index, tiles] of info.rows) {
            const meanY = tiles.reduce((sum, t) => sum + t.center.y, 0) / tiles.length;
            let left = tiles[0];
            let right = tiles[0];
            for (const t of tiles) {
                if (t.center.x < left.center.x - 1e-6 || (Math.abs(t.center.x - left.center.x) < 1e-6 && t.bounds.minX < left.bounds.minX)) left = t;
                if (t.center.x > right.center.x + 1e-6) right = t;
            }
            rowLines.push({ index, meanY, left, right, text: rowTexts.get(index) });
        }
        const leftColumnX = Math.min(...polygons.map((p) => p.center.x));
        const hugRows = outline && info.half !== 'rows';
        const placeRow = (line, side) => {
            const tile = side === 'left' ? line.left : line.right;
            const sign = side === 'left' ? -1 : 1;
            if (info.rowsLean) {
                const d = LEAN_FLAT;
                if (hugRows) return { x: tile.center.x + sign * d.x * (half + gap), y: tile.center.y + sign * d.y * (half + gap) };
                const x = side === 'left' ? b.minX - gap : b.maxX + gap;
                const t = (x - tile.center.x) / (sign * d.x);
                return { x, y: tile.center.y + sign * d.y * t };
            }
            const y = hugRows ? tile.center.y : line.meanY;
            const x = side === 'left' ? (hugRows ? tile.bounds.minX : b.minX) - gap : (hugRows ? tile.bounds.maxX : b.maxX) + gap;
            return { x, y };
        };
        const splitRows = info.half === 'rows' && settings.rows.left && settings.rows.right;
        for (const side of ['left', 'right']) {
            if (!settings.rows[side]) continue;
            const pool = splitRows ? rowLines.filter((line) => (Math.abs(line.left.center.x - leftColumnX) < 1e-6) === (side === 'left')) : rowLines;
            items.push(...thinned(pool.map((line) => ({ axis: 'rows', side, text: line.text, ...placeRow(line, side) })), 'y', font));
        }

        const value = { items, font };
        layoutCache.set(polygons, { key, value });
        return value;
    }

    /**
     * Draws the labels around the board into a context that already has the board's world transform. `scale` is the
     * current zoom; labels are skipped when they would be too small to read or far outside the visible rectangle.
     */
    function draw(ctx, polygons, labels, scale, visible, boardShape) {
        const { items, font } = layout(polygons, labels, boardShape);
        if (!items.length || font * scale < 4) return 0;
        ctx.save();
        ctx.font = `600 ${font}px system-ui, "Segoe UI", sans-serif`;
        ctx.fillStyle = '#3a4658';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let drawn = 0;
        for (const item of items) {
            if (visible && (item.x < visible.minX - font * 3 || item.x > visible.maxX + font * 3 || item.y < visible.minY - font * 3 || item.y > visible.maxY + font * 3)) continue;
            ctx.fillText(item.text, item.x, item.y);
            drawn += 1;
        }
        ctx.restore();
        return drawn;
    }

    /** Readable text colour for a tile colour (#rgb or #rrggbb): white on dark tiles, dark on light ones. */
    function textColorOn(color) {
        const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color || ''));
        if (!match) return '#1f2933';
        const hex = match[1].length === 3 ? match[1].split('').map((c) => c + c).join('') : match[1];
        const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b < 140 ? '#ffffff' : '#1f2933';
    }

    /** Draws the name of every visible tile in the tile. Skipped when the names would be too small to read. */
    function drawTiles(ctx, polygons, labels, scale, visible, boardShape) {
        const names = tileNames(polygons, labels, boardShape);
        if (!names.length) return 0;
        const first = polygons[0];
        const size = Math.min(first.bounds.maxX - first.bounds.minX, first.bounds.maxY - first.bounds.minY) * 0.3;
        if (size * scale < 5) return 0;
        ctx.save();
        ctx.font = `600 ${size}px system-ui, "Segoe UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.85;
        let drawn = 0;
        polygons.forEach((polygon, i) => {
            if (visible && (polygon.bounds.maxX < visible.minX || polygon.bounds.minX > visible.maxX || polygon.bounds.maxY < visible.minY || polygon.bounds.minY > visible.maxY)) return;
            ctx.fillStyle = textColorOn(polygon.color);
            // A triangle's bounding box is not its middle: write the name at the centroid
            const at = polygon.type === 'triangle' && polygon.vertices.length === 3
                ? { x: (polygon.vertices[0].x + polygon.vertices[1].x + polygon.vertices[2].x) / 3, y: (polygon.vertices[0].y + polygon.vertices[1].y + polygon.vertices[2].y) / 3 }
                : polygon.center;
            ctx.fillText(names[i], at.x, at.y);
            drawn += 1;
        });
        ctx.restore();
        return drawn;
    }

    return {
        SYMBOL_SETS,
        SCHEMES,
        PLACEMENTS,
        PRESETS,
        defaults,
        normalize,
        applyPreset,
        matchPreset,
        parseList,
        symbol,
        contextOfConfig,
        schemesFor,
        schemeOf,
        schemeInfo,
        axisNames,
        coordinates,
        isActive,
        tileName,
        tileNames,
        fontSize,
        layout,
        draw,
        drawTiles
    };
})();
