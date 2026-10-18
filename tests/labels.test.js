'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, GEOMETRY_SCRIPTS, plain } = require('./support/load');

const app = loadApp([...GEOMETRY_SCRIPTS, 'app/js/projectFormat.js', 'app/js/labels.js', 'app/js/pieces.js']);
const { Geometry, GeometryChecks: Checks } = app.context;
const Labels = app.run('Labels');
const PF = app.run('ProjectFormat');
const fs = require('node:fs');
const path = require('node:path');

/** Throws unless a project with these label settings is one the project format accepts. */
const accepted = (labels) => {
    const project = PF.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'v6-space-arctic.protogames.json'), 'utf8'));
    project.appState.labels = labels;
    PF.validate(project);
    return true;
};
const CANVAS = { width: 1200, height: 800 };
const generate = (config) => Geometry.generateGrid(config, CANVAS, null);
const on = (patch = {}) => Labels.normalize({ enabled: true, ...patch });

// ---- Symbols -------------------------------------------------------------------------------

const axis = (patch) => ({ ...Labels.defaults().columns, ...patch });
const texts = (patch, count) => Array.from({ length: count }, (_, n) => Labels.symbol(axis(patch), n));

test('letters run A to Z, then AA, AB, and can skip letters (Go has no I)', () => {
    assert.deepEqual(texts({ symbols: 'letters' }, 3), ['A', 'B', 'C']);
    assert.equal(Labels.symbol(axis({ symbols: 'letters' }), 25), 'Z');
    assert.deepEqual(texts({ symbols: 'letters' }, 28).slice(25), ['Z', 'AA', 'AB']);
    const go = texts({ symbols: 'letters', skip: 'I' }, 10);
    assert.deepEqual(go, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K']);
    assert.deepEqual(texts({ symbols: 'letters', skip: 'i' }, 10).slice(7), ['H', 'J', 'K'], 'the skip list ignores case');
});

test('numbers count from the start value; other sets take it as the position of the first symbol', () => {
    assert.deepEqual(texts({ symbols: 'numbers', start: 1 }, 3), ['1', '2', '3']);
    assert.deepEqual(texts({ symbols: 'numbers', start: 0 }, 3), ['0', '1', '2']);
    assert.deepEqual(texts({ symbols: 'letters', start: 3 }, 2), ['C', 'D']);
});

test('roman numerals, greek letters and custom lists', () => {
    assert.deepEqual(texts({ symbols: 'roman' }, 6), ['I', 'II', 'III', 'IV', 'V', 'VI']);
    assert.equal(Labels.symbol(axis({ symbols: 'roman' }), 13), 'XIV');
    assert.equal(Labels.symbol(axis({ symbols: 'roman' }), 3998), 'MMMCMXCIX');
    assert.equal(Labels.symbol(axis({ symbols: 'roman' }), 3999), '4000', 'beyond 3999 it falls back to a number');
    assert.deepEqual(texts({ symbols: 'greek' }, 3), ['α', 'β', 'γ']);
    assert.deepEqual(texts({ symbols: 'custom', custom: '♠ ♥, ♦  ♣' }, 4), ['♠', '♥', '♦', '♣']);
});

test('a list that runs out starts again with a number behind each symbol', () => {
    assert.deepEqual(texts({ symbols: 'custom', custom: 'x y' }, 5), ['x', 'y', 'x2', 'y2', 'x3']);
    assert.equal(Labels.symbol(axis({ symbols: 'greek' }), 24), 'α2');
});

test('a set that cannot give a symbol falls back to numbers instead of leaving a hole', () => {
    assert.deepEqual(texts({ symbols: 'custom', custom: '' }, 3), ['1', '2', '3']);
    assert.deepEqual(texts({ symbols: 'letters', skip: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' }, 2), ['1', '2']);
});

test('custom entries are cut to four characters and at most a hundred entries', () => {
    assert.deepEqual(plain(Labels.parseList('abcdefg x')), ['abcd', 'x']);
    assert.equal(Labels.parseList(Array.from({ length: 150 }, (_, i) => `s${i}`).join(' ')).length, 100);
});

// ---- Settings ------------------------------------------------------------------------------

test('the defaults are valid, off, a fresh copy every time, and the same as the migration writes', () => {
    const a = Labels.defaults();
    assert.equal(a.enabled, false);
    assert.ok(accepted(a));
    a.columns.symbols = 'greek';
    assert.equal(Labels.defaults().columns.symbols, 'letters');
    const migrated = PF.MIGRATIONS[6](JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'v6-space-arctic.protogames.json'), 'utf8')));
    assert.deepEqual(plain(Labels.defaults()), plain(migrated.appState.labels), 'config default and migration default agree');
});

test('normalize() makes any input valid and keeps what was fine', () => {
    assert.deepEqual(plain(Labels.normalize(undefined)), plain(Labels.defaults()));
    const mixed = plain(Labels.normalize({ enabled: true, columns: { symbols: 'nope', skip: 'IO', start: 99999, bottom: false }, placement: 'x' }));
    assert.equal(mixed.enabled, true);
    assert.equal(mixed.columns.symbols, 'letters');
    assert.equal(mixed.columns.skip, 'IO');
    assert.equal(mixed.columns.start, 1000);
    assert.equal(mixed.columns.bottom, false);
    assert.equal(mixed.placement, 'straight');
    assert.ok(accepted(mixed));
});

test('presets: each one is valid, applies to both axes, and is recognised again', () => {
    for (const id of Object.keys(Labels.PRESETS)) {
        const applied = Labels.applyPreset({ enabled: true, placement: 'outline' }, id);
        assert.ok(accepted(applied), id);
        assert.equal(applied.enabled, true, 'the on/off switch is kept');
        assert.equal(applied.placement, 'outline', 'the placement is kept');
        assert.equal(Labels.matchPreset(applied), id, id);
    }
    const custom = Labels.applyPreset(Labels.defaults(), 'chess');
    custom.rows.start = 0;
    assert.equal(Labels.matchPreset(custom), 'custom');
    const withList = Labels.applyPreset(Labels.defaults(), 'chess');
    withList.columns.symbols = 'custom';
    assert.equal(Labels.matchPreset(withList), 'custom');
});

// ---- Coordinates on every board ----------------------------------------------------------------

test('every tile of every board gets its own column and row, whatever the grid, shape and orientation', async (t) => {
    for (const combo of Checks.allCombinations()) {
        if (!combo.valid) continue;
        await t.test(combo.key, () => {
            const polygons = generate(combo.config);
            const cells = plain(Labels.coordinates(polygons));
            assert.equal(cells.length, polygons.length);
            const seen = new Set(cells.map((c) => `${c.col},${c.row}`));
            assert.equal(seen.size, polygons.length, 'no two tiles share a coordinate');
            assert.ok(cells.every((c) => Number.isInteger(c.col) && Number.isInteger(c.row) && c.col >= 0 && c.row >= 0));
        });
    }
});

test('square tiles on a rectangle: columns and rows are the plain grid', () => {
    const config = Checks.makeConfig('rectangle', 'square', 'pointy-top', 'point-up', { width: 8, height: 8 });
    const polygons = generate(config);
    const cells = plain(Labels.coordinates(polygons));
    assert.equal(Math.max(...cells.map((c) => c.col)), 7);
    assert.equal(Math.max(...cells.map((c) => c.row)), 7);
    // the id says square_<row>_<col>
    polygons.forEach((p, i) => {
        const [, row, col] = String(p.id).split('_').map(Number);
        assert.deepEqual([cells[i].row, cells[i].col], [row, col], p.id);
    });
});

test('hexagon tiles use offset coordinates: a shifted row starts at the same column as the others', () => {
    const pointy = generate(Checks.makeConfig('rectangle', 'hexagon', 'pointy-top', 'point-up', { width: 6, height: 5 }));
    const cells = plain(Labels.coordinates(pointy));
    assert.equal(Math.max(...cells.map((c) => c.col)), 5, 'six columns in every row');
    assert.equal(Math.max(...cells.map((c) => c.row)), 4);
    const rowOf = (row) => pointy.filter((_, i) => cells[i].row === row).map((p) => p.center.x);
    // an odd row is shifted by half a tile, yet counts from column 0 too
    assert.ok(Math.min(...rowOf(1)) > Math.min(...rowOf(0)));
    const flat = generate(Checks.makeConfig('rectangle', 'hexagon', 'flat-top', 'point-up', { width: 6, height: 5 }));
    const flatCells = plain(Labels.coordinates(flat));
    assert.equal(Math.max(...flatCells.map((c) => c.col)), 5);
    assert.equal(Math.max(...flatCells.map((c) => c.row)), 4, 'flat-top: the odd columns are the shifted ones');
});

test('a hexagon-shaped board is numbered on one lattice, so a column stays a column', () => {
    const polygons = generate(Checks.makeConfig('hexagon', 'hexagon', 'pointy-top', 'point-up', { radius: 3 }));
    const cells = plain(Labels.coordinates(polygons));
    // 7 rows, the widest has 7 tiles
    assert.equal(Math.max(...cells.map((c) => c.row)), 6);
    const byColumn = new Map();
    polygons.forEach((p, i) => {
        const key = cells[i].col;
        const xs = byColumn.get(key) || [];
        xs.push(p.center.x);
        byColumn.set(key, xs);
    });
    for (const xs of byColumn.values()) {
        // tiles of one column are within one tile width of each other, never a whole column apart
        const width = polygons[0].bounds.maxX - polygons[0].bounds.minX;
        assert.ok(Math.max(...xs) - Math.min(...xs) < width, 'a column does not wander');
    }
});

// ---- Names and layout ---------------------------------------------------------------------------------

test('a tile is named like a chess square: column letter, then row number counted from the bottom', () => {
    const polygons = generate(Checks.makeConfig('rectangle', 'square', 'pointy-top', 'point-up', { width: 8, height: 8 }));
    const labels = Labels.applyPreset({ enabled: true }, 'chess');
    const at = (row, col) => polygons.find((p) => p.id === `square_${row}_${col}`);
    assert.equal(Labels.tileName(polygons, at(7, 0), labels), 'A1');
    assert.equal(Labels.tileName(polygons, at(0, 7), labels), 'H8');
    assert.equal(Labels.tileName(polygons, at(3, 4), labels), 'E5');
    assert.equal(Labels.tileName(polygons, at(0, 0), Labels.defaults()), null, 'off: no name');
});

test('numbers on both axes are written with a comma so they stay readable', () => {
    const polygons = generate(Checks.makeConfig('rectangle', 'square', 'pointy-top', 'point-up', { width: 4, height: 4 }));
    const labels = Labels.applyPreset({ enabled: true }, 'numbers');
    assert.equal(Labels.tileName(polygons, polygons.find((p) => p.id === 'square_0_2'), labels), '3, 4');
});

test('columns and rows take their symbols independently', () => {
    const polygons = generate(Checks.makeConfig('rectangle', 'square', 'pointy-top', 'point-up', { width: 4, height: 3 }));
    const labels = on({ columns: { symbols: 'greek', top: true, bottom: false }, rows: { symbols: 'roman', reverse: false, left: true, right: false } });
    const { items } = Labels.layout(polygons, labels);
    assert.deepEqual(plain(items.filter((i) => i.axis === 'columns').map((i) => i.text)), ['α', 'β', 'γ', 'δ']);
    assert.deepEqual(plain(items.filter((i) => i.axis === 'rows').map((i) => i.text)), ['I', 'II', 'III']);
});

test('labels sit outside the board, on the chosen sides only', () => {
    const polygons = generate(Checks.makeConfig('rectangle', 'square', 'pointy-top', 'point-up', { width: 8, height: 8 }));
    const bounds = {
        minX: Math.min(...polygons.map((p) => p.bounds.minX)), maxX: Math.max(...polygons.map((p) => p.bounds.maxX)),
        minY: Math.min(...polygons.map((p) => p.bounds.minY)), maxY: Math.max(...polygons.map((p) => p.bounds.maxY))
    };
    const { items } = Labels.layout(polygons, Labels.applyPreset({ enabled: true }, 'go'));
    assert.equal(items.length, 32, 'four sides of eight labels');
    for (const item of items) {
        if (item.side === 'top') assert.ok(item.y < bounds.minY);
        if (item.side === 'bottom') assert.ok(item.y > bounds.maxY);
        if (item.side === 'left') assert.ok(item.x < bounds.minX);
        if (item.side === 'right') assert.ok(item.x > bounds.maxX);
    }
    const chess = Labels.layout(polygons, Labels.applyPreset({ enabled: true }, 'chess')).items;
    assert.deepEqual([...new Set(chess.map((i) => i.side))].sort(), ['bottom', 'left']);
    assert.equal(Labels.layout(polygons, Labels.defaults()).items.length, 0, 'off: nothing');
});

test('placement: straight labels share one line, outline labels follow the shape of the board', () => {
    const polygons = generate(Checks.makeConfig('hexagon', 'hexagon', 'pointy-top', 'point-up', { radius: 3 }));
    const bottoms = (placement) => Labels.layout(polygons, on({ placement, columns: { bottom: true } })).items.filter((i) => i.side === 'bottom').map((i) => Math.round(i.y));
    assert.equal(new Set(bottoms('straight')).size, 1, 'one straight line');
    assert.ok(new Set(bottoms('outline')).size > 1, 'the outline curves with the hexagon');
});

test('labels on a triangle grid and a circle board are still outside and unique per line', () => {
    for (const config of [
        Checks.makeConfig('circle', 'triangle', 'pointy-top', 'point-up', { radius: 3 }),
        Checks.makeConfig('rectangle', 'triangle', 'pointy-top', 'point-up', { width: 5, height: 4 }),
        Checks.makeConfig('triangle', 'hexagon', 'flat-top', 'point-down', { size: 5 })
    ]) {
        const polygons = generate(config);
        const { items } = Labels.layout(polygons, on());
        assert.ok(items.length > 0);
        const bottom = items.filter((i) => i.side === 'bottom');
        assert.equal(new Set(bottom.map((i) => i.text)).size, bottom.length, 'no repeated column text');
    }
});

test('dense lines are thinned so labels never overlap', () => {
    const polygons = generate(Checks.makeConfig('rectangle', 'square', 'pointy-top', 'point-up', { width: 100, height: 100 }));
    const { items, font } = Labels.layout(polygons, on());
    const bottom = items.filter((i) => i.side === 'bottom').sort((a, b) => a.x - b.x);
    assert.ok(bottom.length < 100 && bottom.length > 5, 'some labels left out');
    for (let i = 1; i < bottom.length; i++) assert.ok(bottom[i].x - bottom[i - 1].x >= font, 'a label is at least a font size from the next');
});

test('the layout is cached for the same tiles and settings, and refreshed when the settings change', () => {
    const polygons = generate(Checks.makeConfig('rectangle', 'square', 'pointy-top', 'point-up', { width: 4, height: 4 }));
    const a = Labels.layout(polygons, on());
    assert.equal(Labels.layout(polygons, on()), a);
    assert.notEqual(Labels.layout(polygons, on({ placement: 'outline' })), a);
});

test('infinite boards have no labels (they have no outside)', () => {
    const fake = [{ id: 'inf_s_0_0', type: 'square', center: { x: 0, y: 0 }, vertices: [], bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 } }];
    assert.equal(Labels.layout(fake, on()).items.length, 0);
    assert.equal(Labels.tileName(fake, fake[0], on()), null);
});

test('drawing writes every label and skips them when they would be unreadably small', () => {
    const polygons = generate(Checks.makeConfig('rectangle', 'square', 'pointy-top', 'point-up', { width: 3, height: 2 }));
    const calls = [];
    const ctx = { save() {}, restore() {}, fillText: (...args) => calls.push(args), set font(v) {}, set fillStyle(v) {}, set textAlign(v) {}, set textBaseline(v) {} };
    assert.equal(Labels.draw(ctx, polygons, Labels.applyPreset({ enabled: true }, 'chess'), 1, null), 5);
    assert.deepEqual(calls.map((c) => c[0]).sort(), ['1', '2', 'A', 'B', 'C']);
    assert.equal(Labels.draw(ctx, polygons, Labels.applyPreset({ enabled: true }, 'chess'), 0.05, null), 0, 'too small to read');
});

test('whatever the panel or a link hands over, normalize() produces settings the project format accepts', () => {
    const inputs = [
        undefined, null, 5, 'text', [], {},
        { enabled: 'yes', columns: 'x', rows: [], placement: 7 },
        { enabled: true, columns: { symbols: 'greek', custom: 'a'.repeat(500), skip: 'Z'.repeat(60), start: -5000 }, rows: { start: 1.5, reverse: 'no', left: 0 } },
        { columns: { custom: Array.from({ length: 300 }, (_, i) => `e${i}`).join(',') } },
        { columns: { custom: 'ab\u00e9d\u2660\ufe0f\u{1F600}x' } }
    ];
    for (const input of inputs) assert.ok(accepted(Labels.normalize(input)), JSON.stringify(input));
});

test('every data-lb control in the editor page names a real setting', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
    const paths = [...html.matchAll(/data-lb="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(paths.length, 17, 'the panel has its controls: 3 general and 7 per axis');
    const defaults = plain(Labels.defaults());
    for (const key of paths) {
        if (key === 'preset') continue; // not a stored setting: it applies a preset
        const [first, second] = key.split('.');
        const found = second === undefined ? first in defaults : second in (defaults[first] || {});
        assert.ok(found, `${key} is a setting`);
    }
    // every setting has a control, so nothing can only be changed by editing a file
    for (const [first, value] of Object.entries(defaults)) {
        if (typeof value === 'object') for (const second of Object.keys(value)) assert.ok(paths.includes(`${first}.${second}`), `${first}.${second} has a control`);
        else assert.ok(paths.includes(first), `${first} has a control`);
    }
    const shown = [...html.matchAll(/data-lb-show="([^"]+)"/g)].map((m) => m[1]);
    for (const key of shown) assert.ok(paths.includes(key), `${key} is shown by a control that exists`);
});

test('playtest announces a tile by the board labels when they are on, and by column and row when not', () => {
    const Pieces = app.run('Pieces');
    const polygons = generate(Checks.makeConfig('rectangle', 'square', 'pointy-top', 'point-up', { width: 8, height: 8 }));
    const tile = polygons.find((p) => p.id === 'square_3_4');
    assert.equal(Pieces.tileLabel(polygons, tile), 'column 5, row 4');
    assert.equal(Pieces.tileLabel(polygons, tile, Labels.defaults()), 'column 5, row 4', 'labels off');
    assert.equal(Pieces.tileLabel(polygons, tile, Labels.applyPreset({ enabled: true }, 'chess')), 'E5');
});
