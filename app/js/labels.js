/**
 * PROTOGAMES COORDINATE LABELS
 * --------------------------------------------------------------
 * Names for the columns and rows of a board, drawn outside it like the A to H and 1 to 8 of a chess
 * diagram. Pure logic (no DOM) plus one drawing function, so everything here is unit-tested in Node.
 *
 * Coordinates come from the geometry, not from the board shape or the tile ids: every tile gets an
 * integer (column, row) from where its centre sits on the lattice of its tile type. On hexagon tiles
 * that is the offset coordinate system (the odd rows, or odd columns for flat-top tiles, are the ones
 * shifted by half a tile), on triangles every triangle is a column step. Rectangles, hexagons, triangles,
 * circles and country boards all work the same way; infinite boards have no outside, so they have no labels.
 *
 * The settings (Config.DEFAULT_LABELS) are part of the design and are saved with it; ProjectFormat checks them when a file is opened. Each axis has its own symbols,
 * so a board can use letters for the columns and numbers for the rows, or any list the user types.
 */
const Labels = (() => {
    const SYMBOL_SETS = ['letters', 'numbers', 'roman', 'greek', 'custom'];
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

    /** A fresh copy of the default settings (Config.DEFAULT_LABELS): labels off, chess style when switched on. */
    function defaults() {
        return JSON.parse(JSON.stringify(Config.DEFAULT_LABELS));
    }

    /** One-click starting points; the panel applies one and shows "Custom" once something is changed. */
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

    // ---- Settings: validation and clean-up --------------------------------------------------

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
            columns: axis('columns', ['top', 'bottom']),
            rows: axis('rows', ['left', 'right']),
            placement: PLACEMENTS.includes(source.placement) ? source.placement : base.placement
        };
    }

    /** The settings of a preset (the on/off switch and placement are kept from `current`). */
    function applyPreset(current, id) {
        const preset = PRESETS[id];
        const base = normalize(current);
        if (!preset) return base;
        return normalize({ ...base, columns: { ...base.columns, ...preset.columns }, rows: { ...base.rows, ...preset.rows } });
    }

    /** The id of the preset these settings match (symbols, direction, sides, start, skip), or 'custom'. */
    function matchPreset(labels) {
        const l = normalize(labels);
        const same = (a, b) => Object.keys(b).every((key) => a[key] === b[key]) && (a.symbols !== 'custom');
        for (const [id, preset] of Object.entries(PRESETS)) {
            if (same(l.columns, preset.columns) && same(l.rows, preset.rows)) return id;
        }
        return 'custom';
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

    /** True for square tiles turned 45 degrees (a vertex at the top centre). */
    function isDiamond(polygon) {
        if (polygon.type !== 'square' || !Array.isArray(polygon.vertices) || polygon.vertices.length !== 4) return false;
        const top = Math.min(...polygon.vertices.map((v) => v.y));
        const atTop = polygon.vertices.filter((v) => Math.abs(v.y - top) < 1e-6);
        return atTop.length === 1 && Math.abs(atTop[0].x - polygon.center.x) < 1e-6;
    }

    /** Pitches of the lattice and how the rows or columns are staggered, from the first tile (a board has one tile type). */
    function latticeOf(polygon) {
        const w = polygon.bounds.maxX - polygon.bounds.minX;
        const h = polygon.bounds.maxY - polygon.bounds.minY;
        if (polygon.type === 'hexagon') {
            return w <= h ? { kind: 'rowshift', px: w, py: 0.75 * h } : { kind: 'colshift', px: 0.75 * w, py: h };
        }
        if (polygon.type === 'triangle') return { kind: 'plain', px: w / 2, py: h };
        if (isDiamond(polygon)) return { kind: 'rowshift', px: w, py: w / 2 };
        return { kind: 'plain', px: w, py: h };
    }

    const isInfinite = (polygons) => polygons.length > 0 && String(polygons[0].id).startsWith('inf_');

    /**
     * Integer { col, row } for every tile (same order as `polygons`), counted from 0 at the top left.
     * Offset coordinates: on staggered tiles the column counts along the row, so a shifted row starts
     * at the same column number as the rows around it.
     */
    function coordinates(polygons) {
        if (!polygons.length) return [];
        const lattice = latticeOf(polygons[0]);
        const { px, py } = lattice;
        if (!(px > 0) || !(py > 0)) return polygons.map(() => ({ col: 0, row: 0 }));
        const triangles = polygons[0].type === 'triangle';
        let x0 = Infinity;
        let y0 = Infinity;
        for (const p of polygons) {
            x0 = Math.min(x0, p.center.x);
            // Triangles are told apart by the top edge of their row: up and down triangles of one row have different centres.
            y0 = Math.min(y0, triangles ? p.bounds.minY : p.center.y);
        }
        const raw = polygons.map((p) => {
            if (lattice.kind === 'rowshift') {
                const row = Math.round((p.center.y - y0) / py);
                return { row, x: p.center.x - ((row & 1) ? px / 2 : 0), y: 0 };
            }
            if (lattice.kind === 'colshift') {
                const col = Math.round((p.center.x - x0) / px);
                return { col, y: p.center.y - ((col & 1) ? py / 2 : 0), x: 0 };
            }
            if (triangles) return { row: Math.round((p.bounds.minY - y0) / py), x: p.center.x, y: 0 };
            return { row: Math.round((p.center.y - y0) / py), x: p.center.x, y: 0 };
        });
        if (lattice.kind === 'colshift') {
            const base = Math.min(...raw.map((r) => r.y));
            return raw.map((r) => ({ col: r.col, row: Math.round((r.y - base) / py) }));
        }
        const base = Math.min(...raw.map((r) => r.x));
        return raw.map((r) => ({ col: Math.round((r.x - base) / px), row: r.row }));
    }

    const analysisCache = new WeakMap();

    /** Coordinates plus the tiles of every column and row, cached for as long as the tile array lives. */
    function analyse(polygons) {
        let result = analysisCache.get(polygons);
        if (result) return result;
        const cells = coordinates(polygons);
        const columns = new Map();
        const rows = new Map();
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        polygons.forEach((polygon, index) => {
            const { col, row } = cells[index];
            if (!columns.has(col)) columns.set(col, []);
            if (!rows.has(row)) rows.set(row, []);
            columns.get(col).push(polygon);
            rows.get(row).push(polygon);
            minX = Math.min(minX, polygon.bounds.minX);
            maxX = Math.max(maxX, polygon.bounds.maxX);
            minY = Math.min(minY, polygon.bounds.minY);
            maxY = Math.max(maxY, polygon.bounds.maxY);
        });
        result = { cells, columns, rows, bounds: { minX, maxX, minY, maxY } };
        analysisCache.set(polygons, result);
        return result;
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

    /** The name of one tile, such as "B7" (or "3, 7" when both parts are numbers); null when labels are off or not possible. */
    function tileName(polygons, polygon, labels) {
        const settings = normalize(labels);
        if (!settings.enabled || !polygons.length || isInfinite(polygons)) return null;
        const info = analyse(polygons);
        const at = polygons.indexOf(polygon);
        if (at < 0) return null;
        const { col, row } = info.cells[at];
        const column = textsFor(settings.columns, info.columns.keys()).get(col);
        const rowText = textsFor(settings.rows, info.rows.keys()).get(row);
        if (column === undefined || rowText === undefined) return null;
        return /^-?\d+$/.test(column) && /^-?\d/.test(rowText) ? `${column}, ${rowText}` : `${column}${rowText}`;
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

    const layoutCache = new WeakMap();

    /**
     * Where every label goes: [{ axis, side, text, x, y }] in world coordinates, outside the board.
     * 'straight' puts the labels of a side on one straight line along the board's bounding box;
     * 'outline' puts each next to the outermost tile of its line, so it follows a hexagon, circle or triangle.
     */
    function layout(polygons, labels) {
        const settings = normalize(labels);
        if (!settings.enabled || !polygons.length || isInfinite(polygons)) return { items: [], font: fontSize(polygons) };
        const key = JSON.stringify(settings);
        let byKey = layoutCache.get(polygons);
        if (byKey && byKey.key === key) return byKey.value;

        const info = analyse(polygons);
        const font = fontSize(polygons);
        const gap = font * 0.95;
        const outline = settings.placement === 'outline';
        const b = info.bounds;
        const items = [];

        const columnTexts = textsFor(settings.columns, info.columns.keys());
        const columnItems = { top: [], bottom: [] };
        for (const [col, tiles] of info.columns) {
            const meanX = tiles.reduce((sum, t) => sum + t.center.x, 0) / tiles.length;
            let top = tiles[0];
            let bottom = tiles[0];
            for (const t of tiles) {
                if (t.bounds.minY < top.bounds.minY) top = t;
                if (t.bounds.maxY > bottom.bounds.maxY) bottom = t;
            }
            const text = columnTexts.get(col);
            columnItems.top.push({ axis: 'columns', side: 'top', text, x: outline ? top.center.x : meanX, y: (outline ? top.bounds.minY : b.minY) - gap });
            columnItems.bottom.push({ axis: 'columns', side: 'bottom', text, x: outline ? bottom.center.x : meanX, y: (outline ? bottom.bounds.maxY : b.maxY) + gap });
        }
        const rowTexts = textsFor(settings.rows, info.rows.keys());
        const rowItems = { left: [], right: [] };
        for (const [row, tiles] of info.rows) {
            const meanY = tiles.reduce((sum, t) => sum + t.center.y, 0) / tiles.length;
            let left = tiles[0];
            let right = tiles[0];
            for (const t of tiles) {
                if (t.bounds.minX < left.bounds.minX) left = t;
                if (t.bounds.maxX > right.bounds.maxX) right = t;
            }
            const text = rowTexts.get(row);
            rowItems.left.push({ axis: 'rows', side: 'left', text, x: (outline ? left.bounds.minX : b.minX) - gap, y: outline ? left.center.y : meanY });
            rowItems.right.push({ axis: 'rows', side: 'right', text, x: (outline ? right.bounds.maxX : b.maxX) + gap, y: outline ? right.center.y : meanY });
        }
        for (const side of ['top', 'bottom']) if (settings.columns[side]) items.push(...thinned(columnItems[side], 'x', font));
        for (const side of ['left', 'right']) if (settings.rows[side]) items.push(...thinned(rowItems[side], 'y', font));

        const value = { items, font };
        layoutCache.set(polygons, { key, value });
        return value;
    }

    /**
     * Draws labels into a context that already has the board's world transform. `scale` is the current zoom;
     * labels are skipped when they would be too small to read or when none are in the visible rectangle.
     */
    function draw(ctx, polygons, labels, scale, visible) {
        const { items, font } = layout(polygons, labels);
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

    return {
        SYMBOL_SETS,
        PLACEMENTS,
        PRESETS,
        defaults,
        normalize,
        applyPreset,
        matchPreset,
        parseList,
        symbol,
        coordinates,
        tileName,
        fontSize,
        layout,
        draw
    };
})();
