'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, GEOMETRY_SCRIPTS, plain } = require('./support/load');

const app = loadApp([...GEOMETRY_SCRIPTS, 'app/js/projectFormat.js', 'app/js/labels.js', 'app/js/pieces.js']);
const { Geometry, GeometryChecks: Checks } = app.context;
const Labels = app.run('Labels');
const PF = app.run('ProjectFormat');

/** Throws unless a project with these label settings is one the project format accepts. */
const accepted = (labels) => {
    const project = PF.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'v6-space-arctic.protogames.json'), 'utf8'));
    project.appState.labels = labels;
    PF.validate(project);
    return true;
};
const CANVAS = { width: 1200, height: 800 };
const generate = (config) => Geometry.generateGrid(config, CANVAS, null);
const make = (shape, tile, orientation, sizes, tri = 'point-up') => Checks.makeConfig(shape, tile, orientation, tri, sizes);
const on = (patch = {}) => Labels.normalize({ enabled: true, ...patch });
const SQRT3 = Math.sqrt(3);

// ---- Symbols -------------------------------------------------------------------------------

const axis = (patch) => ({ ...Labels.defaults().columns, ...patch });
const texts = (patch, count) => Array.from({ length: count }, (_, n) => Labels.symbol(axis(patch), n));

test('letters run A to Z, then AA, AB, and can skip letters (Go has no I)', () => {
    assert.deepEqual(texts({ symbols: 'letters' }, 3), ['A', 'B', 'C']);
    assert.equal(Labels.symbol(axis({ symbols: 'letters' }), 25), 'Z');
    assert.deepEqual(texts({ symbols: 'letters' }, 28).slice(25), ['Z', 'AA', 'AB']);
    assert.deepEqual(texts({ symbols: 'letters', skip: 'I' }, 10), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K']);
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

test('the defaults are valid, everything off, a fresh copy every time, and the same as the migration writes', () => {
    const a = Labels.defaults();
    assert.equal(a.enabled, false);
    assert.equal(a.onTiles, false);
    assert.equal(a.scheme, 'auto');
    assert.equal(a.placement, 'auto', 'names hug the outline where the board is not a rectangle');
    assert.ok(accepted(a));
    a.columns.symbols = 'greek';
    assert.equal(Labels.defaults().columns.symbols, 'letters');
    const migrated = PF.MIGRATIONS[6](JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'v6-space-arctic.protogames.json'), 'utf8')));
    assert.deepEqual(plain(Labels.defaults()), plain(migrated.appState.labels), 'config default and migration default agree');
});

test('normalize() makes any input valid and keeps what was fine', () => {
    assert.deepEqual(plain(Labels.normalize(undefined)), plain(Labels.defaults()));
    const mixed = plain(Labels.normalize({ enabled: true, onTiles: 'yes', scheme: 'spiral', columns: { symbols: 'nope', skip: 'IO', start: 99999, bottom: false }, placement: 'x' }));
    assert.equal(mixed.enabled, true);
    assert.equal(mixed.onTiles, false);
    assert.equal(mixed.scheme, 'auto', 'an unknown indexing falls back to the board default');
    assert.equal(mixed.columns.symbols, 'letters');
    assert.equal(mixed.columns.skip, 'IO');
    assert.equal(mixed.columns.start, 1000);
    assert.equal(mixed.columns.bottom, false);
    assert.equal(mixed.placement, 'auto');
    assert.ok(accepted(mixed));
    for (const scheme of Labels.SCHEMES) assert.equal(Labels.normalize({ scheme }).scheme, scheme);
});

test('presets: each one is valid, applies to both axes, keeps the switches and the indexing, and is recognised again', () => {
    for (const id of Object.keys(Labels.PRESETS)) {
        const applied = Labels.applyPreset({ enabled: true, onTiles: true, scheme: 'doubled', placement: 'outline' }, id);
        assert.ok(accepted(applied), id);
        assert.equal(applied.enabled, true);
        assert.equal(applied.onTiles, true);
        assert.equal(applied.scheme, 'doubled', 'the indexing is kept');
        assert.equal(applied.placement, 'outline');
        assert.equal(Labels.matchPreset(applied), id, id);
    }
    const custom = Labels.applyPreset(Labels.defaults(), 'chess');
    custom.rows.start = 0;
    assert.equal(Labels.matchPreset(custom), 'custom');
    const withList = Labels.applyPreset(Labels.defaults(), 'chess');
    withList.columns.symbols = 'custom';
    assert.equal(Labels.matchPreset(withList), 'custom');
});

test('whatever the panel or a link hands over, normalize() produces settings the project format accepts', () => {
    const inputs = [
        undefined, null, 5, 'text', [], {},
        { enabled: 'yes', columns: 'x', rows: [], placement: 7, scheme: 3 },
        { enabled: true, columns: { symbols: 'greek', custom: 'a'.repeat(500), skip: 'Z'.repeat(60), start: -5000 }, rows: { start: 1.5, reverse: 'no', left: 0 } },
        { columns: { custom: Array.from({ length: 300 }, (_, i) => `e${i}`).join(',') } },
        { columns: { custom: 'abéd♠️\u{1F600}x' } }
    ];
    for (const input of inputs) assert.ok(accepted(Labels.normalize(input)), JSON.stringify(input));
});

// ---- Which indexings make sense for which board --------------------------------------------------

test('square and triangle tiles have one indexing; hexagon tiles choose by the board shape; infinite has none', () => {
    const schemes = (tile, shape, orientation = 'pointy-top') => plain(Labels.schemesFor({ tile, orientation, shape }));
    for (const shape of ['rectangle', 'hexagon', 'triangle', 'circle', 'country']) {
        assert.deepEqual(schemes('square', shape), ['grid'], `square tiles on ${shape}`);
        assert.deepEqual(schemes('triangle', shape), ['triangles'], `triangle tiles on ${shape}`);
    }
    for (const orientation of ['pointy-top', 'flat-top']) {
        assert.deepEqual(schemes('hexagon', 'rectangle', orientation), ['offset', 'doubled']);
        assert.deepEqual(schemes('hexagon', 'country', orientation), ['offset', 'doubled']);
        for (const shape of ['hexagon', 'circle', 'triangle']) assert.deepEqual(schemes('hexagon', shape, orientation), ['axial', 'doubled'], shape);
    }
    for (const tile of ['square', 'hexagon', 'triangle']) assert.deepEqual(schemes(tile, 'infinite'), []);
});

test('the indexing in use is the chosen one when it fits the board, else the board default', () => {
    const rect = { tile: 'hexagon', orientation: 'pointy-top', shape: 'rectangle' };
    const hexBoard = { tile: 'hexagon', orientation: 'pointy-top', shape: 'hexagon' };
    assert.equal(Labels.schemeOf({ scheme: 'auto' }, rect), 'offset');
    assert.equal(Labels.schemeOf({ scheme: 'auto' }, hexBoard), 'axial');
    assert.equal(Labels.schemeOf({ scheme: 'doubled' }, rect), 'doubled');
    assert.equal(Labels.schemeOf({ scheme: 'doubled' }, hexBoard), 'doubled');
    assert.equal(Labels.schemeOf({ scheme: 'axial' }, rect), 'offset', 'a choice that makes no sense here is ignored, not lost');
    assert.equal(Labels.schemeOf({ scheme: 'offset' }, hexBoard), 'axial');
    assert.equal(Labels.schemeOf({ scheme: 'axial' }, { tile: 'square', orientation: 'pointy-top', shape: 'rectangle' }), 'grid');
});

test('a board config and its tiles describe the same context', () => {
    for (const combo of Checks.allCombinations()) {
        if (!combo.valid) continue;
        const polygons = generate(combo.config);
        const fromTiles = Labels.schemesFor({ tile: polygons[0].type === 'hexagon' || polygons[0].type === 'triangle' ? polygons[0].type : 'square', orientation: (polygons[0].bounds.maxX - polygons[0].bounds.minX) <= (polygons[0].bounds.maxY - polygons[0].bounds.minY) ? 'pointy-top' : 'flat-top', shape: combo.config.boardShape });
        assert.deepEqual(plain(Labels.schemesFor(Labels.contextOfConfig(combo.config))), plain(fromTiles), combo.key);
    }
    assert.deepEqual(plain(Labels.contextOfConfig({ gridType: 'hexagon', orientation: 'flat-top', boardShape: 'circle' })), { tile: 'hexagon', orientation: 'flat-top', shape: 'circle' });
    assert.equal(Labels.contextOfConfig(undefined).shape, 'rectangle');
});

test('every indexing has a name and a hint, and the panel names the axes the way the lines run', () => {
    for (const scheme of ['grid', 'triangles', 'offset', 'doubled', 'axial']) {
        for (const orientation of ['pointy-top', 'flat-top']) {
            const info = Labels.schemeInfo(scheme, orientation);
            assert.ok(info.name.length > 0 && info.hint.length > 10, `${scheme} ${orientation}`);
        }
    }
    const ctx = (orientation) => ({ tile: 'hexagon', orientation, shape: 'hexagon' });
    assert.deepEqual(plain(Labels.axisNames(ctx('pointy-top'), 'axial')), { columns: 'Columns (leaning lines)', rows: 'Rows' });
    assert.deepEqual(plain(Labels.axisNames(ctx('flat-top'), 'axial')), { columns: 'Columns', rows: 'Rows (leaning lines)' });
    assert.deepEqual(plain(Labels.axisNames(ctx('flat-top'), 'doubled')), { columns: 'Columns', rows: 'Rows (half steps)' });
    assert.deepEqual(plain(Labels.axisNames({ tile: 'square', orientation: 'pointy-top', shape: 'rectangle' }, 'grid')), { columns: 'Columns', rows: 'Rows' });
});

// ---- Coordinates on every board ----------------------------------------------------------------

const cellsOf = (polygons, scheme) => plain(Labels.coordinates(polygons, scheme).cells);

test('every tile of every board gets its own column and row in every indexing offered for that board', async (t) => {
    for (const combo of Checks.allCombinations()) {
        if (!combo.valid) continue;
        const polygons = generate(combo.config);
        for (const scheme of Labels.schemesFor(Labels.contextOfConfig(combo.config))) {
            await t.test(`${combo.key} / ${scheme}`, () => {
                const cells = cellsOf(polygons, scheme);
                assert.equal(cells.length, polygons.length);
                assert.equal(new Set(cells.map((c) => `${c.a},${c.b}`)).size, polygons.length, 'no two tiles share a coordinate');
                assert.ok(cells.every((c) => Number.isInteger(c.a) && Number.isInteger(c.b) && c.a >= 0 && c.b >= 0));
            });
        }
    }
});

test('square tiles: columns and rows are the plain grid', () => {
    const polygons = generate(make('rectangle', 'square', 'pointy-top', { width: 8, height: 6 }));
    const cells = cellsOf(polygons, 'grid');
    assert.equal(Math.max(...cells.map((c) => c.a)), 7);
    assert.equal(Math.max(...cells.map((c) => c.b)), 5);
    polygons.forEach((p, i) => {
        const [, row, col] = String(p.id).split('_').map(Number);
        assert.deepEqual([cells[i].b, cells[i].a], [row, col], p.id);
    });
});

test('offset: a shifted row (or column) starts at the same number as the others; the straight axis stays straight', () => {
    const pointy = generate(make('rectangle', 'hexagon', 'pointy-top', { width: 6, height: 5 }));
    const cells = cellsOf(pointy, 'offset');
    assert.equal(Math.max(...cells.map((c) => c.a)), 5, 'six columns in every row');
    assert.equal(Math.max(...cells.map((c) => c.b)), 4);
    const xsOfRow = (row) => pointy.filter((_, i) => cells[i].b === row).map((p) => p.center.x);
    assert.ok(Math.min(...xsOfRow(1)) > Math.min(...xsOfRow(0)), 'an odd row is shifted by half a tile yet counts from 0');
    for (let row = 0; row < 5; row++) {
        const ys = pointy.filter((_, i) => cells[i].b === row).map((p) => p.center.y);
        assert.ok(Math.max(...ys) - Math.min(...ys) < 1e-6, 'a row is a horizontal line');
    }
    const flat = generate(make('rectangle', 'hexagon', 'flat-top', { width: 6, height: 5 }));
    const flatCells = cellsOf(flat, 'offset');
    assert.equal(Math.max(...flatCells.map((c) => c.b)), 4, 'flat-top: the odd columns are the shifted ones');
    for (let col = 0; col < 6; col++) {
        const xs = flat.filter((_, i) => flatCells[i].a === col).map((p) => p.center.x);
        assert.ok(Math.max(...xs) - Math.min(...xs) < 1e-6, 'a column is a vertical line');
    }
});

test('doubled: the staggered axis counts half steps, so tiles at the same position share its number', () => {
    const pointy = generate(make('rectangle', 'hexagon', 'pointy-top', { width: 4, height: 3 }));
    const result = Labels.coordinates(pointy, 'doubled');
    assert.equal(result.half, 'columns');
    const cells = plain(result.cells);
    assert.equal(Math.max(...cells.map((c) => c.a)), 7, 'four tiles per row give eight half-columns');
    // tiles with the same x have the same half-column number; neighbours in a row are two apart
    pointy.forEach((p, i) => pointy.forEach((q, j) => {
        if (Math.abs(p.center.x - q.center.x) < 1e-6) assert.equal(cells[i].a, cells[j].a);
    }));
    const rowZero = cells.filter((c) => c.b === 0).map((c) => c.a).sort((x, y) => x - y);
    assert.deepEqual(rowZero, [0, 2, 4, 6]);
    const rowOne = cells.filter((c) => c.b === 1).map((c) => c.a).sort((x, y) => x - y);
    assert.deepEqual(rowOne, [1, 3, 5, 7], 'the shifted row takes the numbers in between');

    const flat = generate(make('rectangle', 'hexagon', 'flat-top', { width: 4, height: 3 }));
    const flatResult = Labels.coordinates(flat, 'doubled');
    assert.equal(flatResult.half, 'rows');
    const flatCells = plain(flatResult.cells);
    const colZero = flatCells.filter((c) => c.a === 0).map((c) => c.b).sort((x, y) => x - y);
    const colOne = flatCells.filter((c) => c.a === 1).map((c) => c.b).sort((x, y) => x - y);
    assert.deepEqual(colZero, [0, 2, 4]);
    assert.deepEqual(colOne, [1, 3, 5]);
});

test('axial: both axes are straight lines (rows and leaning diagonals), and a number is a line, not a position in a row', () => {
    const pointy = generate(make('hexagon', 'hexagon', 'pointy-top', { radius: 2 }));
    const result = Labels.coordinates(pointy, 'axial');
    assert.equal(result.columnsLean, true);
    assert.equal(result.rowsLean, false);
    const cells = plain(result.cells);
    // rows are horizontal
    for (let b = 0; b < 5; b++) {
        const ys = pointy.filter((_, i) => cells[i].b === b).map((p) => p.center.y);
        assert.ok(Math.max(...ys) - Math.min(...ys) < 1e-6, `row ${b} is level`);
    }
    // every diagonal is one straight line leaning down and to the right (60 degrees), however many tiles it has
    const d = { x: 0.5, y: SQRT3 / 2 };
    for (let a = 0; a < 5; a++) {
        const line = pointy.filter((_, i) => cells[i].a === a).map((p) => p.center);
        for (const point of line) {
            const cross = (point.x - line[0].x) * d.y - (point.y - line[0].y) * d.x;
            assert.ok(Math.abs(cross) < 1e-6, `diagonal ${a} is straight`);
        }
    }
    // the lines do not restart: the top row holds the highest diagonals, the bottom row the lowest
    const topRow = cells.filter((c) => c.b === 0).map((c) => c.a).sort((x, y) => x - y);
    const bottomRow = cells.filter((c) => c.b === 4).map((c) => c.a).sort((x, y) => x - y);
    assert.deepEqual(topRow, [2, 3, 4]);
    assert.deepEqual(bottomRow, [0, 1, 2]);

    const flat = generate(make('hexagon', 'hexagon', 'flat-top', { radius: 2 }));
    const flatResult = Labels.coordinates(flat, 'axial');
    assert.equal(flatResult.rowsLean, true);
    assert.equal(flatResult.columnsLean, false);
    const flatCells = plain(flatResult.cells);
    for (let a = 0; a < 5; a++) {
        const xs = flat.filter((_, i) => flatCells[i].a === a).map((p) => p.center.x);
        assert.ok(Math.max(...xs) - Math.min(...xs) < 1e-6, `column ${a} is vertical`);
    }
    const lean = { x: SQRT3 / 2, y: 0.5 };
    for (let b = 0; b < 5; b++) {
        const line = flat.filter((_, i) => flatCells[i].b === b).map((p) => p.center);
        for (const point of line) {
            const cross = (point.x - line[0].x) * lean.y - (point.y - line[0].y) * lean.x;
            assert.ok(Math.abs(cross) < 1e-6, `leaning row ${b} is straight`);
        }
    }
});

test('axial works on circle and triangle boards of hexagon tiles too', () => {
    for (const config of [make('circle', 'hexagon', 'pointy-top', { radius: 4 }), make('triangle', 'hexagon', 'flat-top', { size: 5 }, 'point-down')]) {
        const polygons = generate(config);
        const cells = cellsOf(polygons, 'axial');
        assert.equal(new Set(cells.map((c) => `${c.a},${c.b}`)).size, polygons.length, config.boardShape);
    }
});

// ---- Names -----------------------------------------------------------------------------------------------

test('a tile is named like a chess square: column letter, then row number counted from the bottom', () => {
    const polygons = generate(make('rectangle', 'square', 'pointy-top', { width: 8, height: 8 }));
    const labels = Labels.applyPreset({ enabled: true }, 'chess');
    const at = (row, col) => polygons.find((p) => p.id === `square_${row}_${col}`);
    assert.equal(Labels.tileName(polygons, at(7, 0), labels, 'rectangle'), 'A1');
    assert.equal(Labels.tileName(polygons, at(0, 7), labels, 'rectangle'), 'H8');
    assert.equal(Labels.tileName(polygons, at(3, 4), labels, 'rectangle'), 'E5');
    assert.equal(Labels.tileName(polygons, at(0, 0), Labels.defaults(), 'rectangle'), null, 'everything off: no name');
});

test('names are also available when only the on-tile switch is on', () => {
    const polygons = generate(make('rectangle', 'square', 'pointy-top', { width: 4, height: 4 }));
    const labels = Labels.applyPreset({ onTiles: true }, 'chess');
    assert.equal(Labels.isActive(labels), true);
    assert.equal(Labels.tileName(polygons, polygons.find((p) => p.id === 'square_3_0'), labels, 'rectangle'), 'A1');
    assert.equal(Labels.layout(polygons, labels, 'rectangle').items.length, 0, 'nothing around the board');
    const names = plain(Labels.tileNames(polygons, labels, 'rectangle'));
    assert.equal(names.length, 16);
    assert.equal(names[polygons.findIndex((p) => p.id === 'square_0_3')], 'D4');
    assert.deepEqual(plain(Labels.tileNames(polygons, { ...labels, onTiles: false }, 'rectangle')), [], 'no names unless shown on the tiles');
});

test('numbers on both axes are written with a comma so they stay readable', () => {
    const polygons = generate(make('rectangle', 'square', 'pointy-top', { width: 4, height: 4 }));
    const labels = Labels.applyPreset({ enabled: true }, 'numbers');
    assert.equal(Labels.tileName(polygons, polygons.find((p) => p.id === 'square_0_2'), labels, 'rectangle'), '3, 4');
});

test('half-step indexings name tiles like 18xx maps: A1, B2, A3 (flat-top) and the other way round when the rows are straight', () => {
    const flat = generate(make('rectangle', 'hexagon', 'flat-top', { width: 3, height: 3 }));
    const labels = Labels.applyPreset({ enabled: true, scheme: 'doubled' }, 'battleship');
    const names = plain(Labels.tileNames(flat, { ...labels, onTiles: true }, 'rectangle'));
    // columns A to C straight, rows counted in half steps: column A holds 1, 3, 5, column B holds 2, 4, 6
    const nameOf = (pick) => names[flat.indexOf(pick)];
    const sortedNames = [...names].sort();
    assert.ok(sortedNames.includes('A1') && sortedNames.includes('A3') && sortedNames.includes('A5'));
    assert.ok(sortedNames.includes('B2') && sortedNames.includes('B4') && sortedNames.includes('B6'));
    assert.ok(!sortedNames.includes('B1') && !sortedNames.includes('A2'));
    assert.equal(nameOf(flat.reduce((best, p) => (p.center.x < best.center.x || (p.center.x === best.center.x && p.center.y < best.center.y) ? p : best))), 'A1');
});

test('axial names follow the lines: neighbours along a row differ in one part, along a diagonal in the other', () => {
    const polygons = generate(make('hexagon', 'hexagon', 'pointy-top', { radius: 2 }));
    const labels = Labels.applyPreset({ enabled: true, scheme: 'axial' }, 'chess');
    const cells = cellsOf(polygons, 'axial');
    const byCell = new Map(polygons.map((p, i) => [`${cells[i].a},${cells[i].b}`, p]));
    const name = (a, b) => Labels.tileName(polygons, byCell.get(`${a},${b}`), labels, 'hexagon');
    assert.equal(name(1, 2).slice(1), name(2, 2).slice(1), 'same row, different diagonal: same row number');
    assert.notEqual(name(1, 2)[0], name(2, 2)[0]);
    assert.equal(name(2, 1)[0], name(2, 2)[0], 'same diagonal, different row: same letter');
    assert.notEqual(name(2, 1).slice(1), name(2, 2).slice(1));
});

test('columns and rows take their symbols independently', () => {
    const polygons = generate(make('rectangle', 'square', 'pointy-top', { width: 4, height: 3 }));
    const labels = on({ columns: { symbols: 'greek', top: true, bottom: false }, rows: { symbols: 'roman', reverse: false, left: true, right: false } });
    const { items } = Labels.layout(polygons, labels, 'rectangle');
    assert.deepEqual(plain(items.filter((i) => i.axis === 'columns').map((i) => i.text)), ['α', 'β', 'γ', 'δ']);
    assert.deepEqual(plain(items.filter((i) => i.axis === 'rows').map((i) => i.text)), ['I', 'II', 'III']);
});

// ---- Layout --------------------------------------------------------------------------------------------------

const boundsOf = (polygons) => ({
    minX: Math.min(...polygons.map((p) => p.bounds.minX)), maxX: Math.max(...polygons.map((p) => p.bounds.maxX)),
    minY: Math.min(...polygons.map((p) => p.bounds.minY)), maxY: Math.max(...polygons.map((p) => p.bounds.maxY))
});

test('labels sit outside the board, on the chosen sides only', () => {
    const polygons = generate(make('rectangle', 'square', 'pointy-top', { width: 8, height: 8 }));
    const bounds = boundsOf(polygons);
    const { items } = Labels.layout(polygons, Labels.applyPreset({ enabled: true }, 'go'), 'rectangle');
    assert.equal(items.length, 32, 'four sides of eight labels');
    for (const item of items) {
        if (item.side === 'top') assert.ok(item.y < bounds.minY);
        if (item.side === 'bottom') assert.ok(item.y > bounds.maxY);
        if (item.side === 'left') assert.ok(item.x < bounds.minX);
        if (item.side === 'right') assert.ok(item.x > bounds.maxX);
    }
    const chess = Labels.layout(polygons, Labels.applyPreset({ enabled: true }, 'chess'), 'rectangle').items;
    assert.deepEqual([...new Set(chess.map((i) => i.side))].sort(), ['bottom', 'left']);
    assert.equal(Labels.layout(polygons, Labels.defaults(), 'rectangle').items.length, 0, 'off: nothing');
});

/** True when the point is inside the polygon (ray casting). */
const insidePolygon = (point, vertices) => {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const a = vertices[i];
        const b = vertices[j];
        if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
};

test('every indexing offered for a board gives labels outside the board on every chosen side', async (t) => {
    for (const combo of Checks.allCombinations()) {
        if (!combo.valid) continue;
        const polygons = generate(combo.config);
        const bounds = boundsOf(polygons);
        for (const scheme of Labels.schemesFor(Labels.contextOfConfig(combo.config))) {
            for (const placement of ['straight', 'outline']) {
                await t.test(`${combo.key} / ${scheme} / ${placement}`, () => {
                    const labels = Labels.applyPreset({ enabled: true, scheme, placement }, 'go');
                    const { items } = Labels.layout(polygons, labels, combo.config.boardShape);
                    assert.ok(items.length > 0);
                    const eps = 1e-6;
                    for (const item of items) {
                        assert.ok(Number.isFinite(item.x) && Number.isFinite(item.y), 'a position');
                        if (placement === 'straight') {
                            // on a line along the bounding box
                            if (item.side === 'top') assert.ok(item.y < bounds.minY + eps);
                            if (item.side === 'bottom') assert.ok(item.y > bounds.maxY - eps);
                            if (item.side === 'left') assert.ok(item.x < bounds.minX + eps);
                            if (item.side === 'right') assert.ok(item.x > bounds.maxX - eps);
                        } else {
                            // hugging the outline: never on top of a tile
                            const onTile = polygons.some((p) => insidePolygon(item, p.vertices));
                            assert.ok(!onTile, `label ${item.text} sits on a tile`);
                        }
                    }
                });
            }
        }
    }
});

test('placement: straight labels share one line, outline labels follow the shape of the board', () => {
    const polygons = generate(make('hexagon', 'hexagon', 'pointy-top', { radius: 3 }));
    const bottoms = (placement) => Labels.layout(polygons, on({ placement, scheme: 'axial', columns: { bottom: true } }), 'hexagon').items.filter((i) => i.side === 'bottom').map((i) => Math.round(i.y));
    assert.equal(new Set(bottoms('straight')).size, 1, 'one straight line');
    assert.ok(new Set(bottoms('outline')).size > 1, 'the outline curves with the hexagon');
});

test('leaning lines carry their label on along their own direction, so it stays in line with the tiles', () => {
    const polygons = generate(make('hexagon', 'hexagon', 'pointy-top', { radius: 2 }));
    const cells = cellsOf(polygons, 'axial');
    const labels = Labels.applyPreset({ enabled: true, scheme: 'axial', placement: 'straight' }, 'chess');
    const { items } = Labels.layout(polygons, labels, 'hexagon');
    const bottom = items.filter((i) => i.side === 'bottom').sort((p, q) => p.x - q.x);
    assert.equal(bottom.length, 5, 'one label for each of the five diagonals');
    const d = { x: 0.5, y: SQRT3 / 2 };
    // the label of each diagonal lies on the straight line through the tiles of that diagonal
    for (let a = 0; a < 5; a++) {
        const line = polygons.filter((_, i) => cells[i].a === a).map((p) => p.center);
        const label = bottom[a];
        const cross = (label.x - line[0].x) * d.y - (label.y - line[0].y) * d.x;
        assert.ok(Math.abs(cross) < 1e-6, `label ${a} is on its line`);
    }
});

test('half steps share the two sides: the lines that reach the first column go on the first side, the others on the second', () => {
    const polygons = generate(make('rectangle', 'hexagon', 'flat-top', { width: 4, height: 3 }));
    const labels = Labels.applyPreset({ enabled: true, scheme: 'doubled' }, 'battleship');
    const both = Labels.layout(polygons, { ...labels, rows: { ...labels.rows, left: true, right: true } }, 'rectangle').items.filter((i) => i.axis === 'rows');
    const left = both.filter((i) => i.side === 'left').map((i) => i.text);
    const right = both.filter((i) => i.side === 'right').map((i) => i.text);
    assert.equal(left.length + right.length, 6, 'six half-rows, each once');
    assert.deepEqual(plain(left), ['1', '3', '5'], 'odd numbers at the left edge');
    assert.deepEqual(plain(right), ['2', '4', '6'], 'even numbers at the right edge');
    const one = Labels.layout(polygons, { ...labels, rows: { ...labels.rows, left: true, right: false } }, 'rectangle').items.filter((i) => i.axis === 'rows');
    assert.ok(one.length >= 3, 'with one side alone every half-row is a candidate (thinned if crowded)');
});

test('dense lines are thinned so labels never overlap', () => {
    const polygons = generate(make('rectangle', 'square', 'pointy-top', { width: 100, height: 100 }));
    const { items, font } = Labels.layout(polygons, on(), 'rectangle');
    const bottom = items.filter((i) => i.side === 'bottom').sort((a, b) => a.x - b.x);
    assert.ok(bottom.length < 100 && bottom.length > 5, 'some labels left out');
    for (let i = 1; i < bottom.length; i++) assert.ok(bottom[i].x - bottom[i - 1].x >= font, 'a label is at least a font size from the next');
});

test('the layout is cached for the same tiles, settings and board shape, and refreshed when any changes', () => {
    const polygons = generate(make('rectangle', 'square', 'pointy-top', { width: 4, height: 4 }));
    const a = Labels.layout(polygons, on(), 'rectangle');
    assert.equal(Labels.layout(polygons, on(), 'rectangle'), a);
    assert.notEqual(Labels.layout(polygons, on({ placement: 'outline' }), 'rectangle'), a);
});

test('infinite boards have no labels (they have no outside)', () => {
    const fake = [{ id: 'inf_s_0_0', type: 'square', center: { x: 0, y: 0 }, vertices: [], bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 } }];
    assert.equal(Labels.layout(fake, on({ onTiles: true }), 'infinite').items.length, 0);
    assert.equal(Labels.tileName(fake, fake[0], on({ onTiles: true }), 'infinite'), null);
    assert.deepEqual(plain(Labels.tileNames(fake, on({ onTiles: true }), 'infinite')), []);
});

// ---- Drawing -----------------------------------------------------------------------------------------------------

const fakeContext = () => {
    const calls = [];
    const fills = [];
    const shapes = { paths: 0, rects: [], fills: 0, strokes: 0 };
    return {
        calls,
        fills,
        shapes,
        save() {}, restore() {},
        fillText: (...args) => calls.push(args),
        fillRect: (...args) => shapes.rects.push(args),
        beginPath() { shapes.paths += 1; }, moveTo() {}, lineTo() {}, closePath() {},
        fill() { shapes.fills += 1; }, stroke() { shapes.strokes += 1; },
        set font(v) {}, set textAlign(v) {}, set textBaseline(v) {}, set globalAlpha(v) {}, set lineWidth(v) {}, set strokeStyle(v) {},
        set fillStyle(v) { fills.push(v); }
    };
};

test('drawing writes every label around the board and skips them when they would be unreadably small', () => {
    const polygons = generate(make('rectangle', 'square', 'pointy-top', { width: 3, height: 2 }));
    const ctx = fakeContext();
    assert.equal(Labels.draw(ctx, polygons, Labels.applyPreset({ enabled: true }, 'chess'), 1, null, 'rectangle'), 5);
    assert.deepEqual(ctx.calls.map((c) => c[0]).sort(), ['1', '2', 'A', 'B', 'C']);
    assert.equal(Labels.draw(fakeContext(), polygons, Labels.applyPreset({ enabled: true }, 'chess'), 0.05, null, 'rectangle'), 0, 'too small to read');
});

test('on-tile names are drawn in the centre of every visible tile, dark on light tiles and white on dark ones', () => {
    const polygons = generate(make('rectangle', 'square', 'pointy-top', { width: 3, height: 2 }));
    polygons[0].color = '#1f2933';
    polygons[1].color = '#ffffff';
    const labels = Labels.applyPreset({ onTiles: true }, 'chess');
    const ctx = fakeContext();
    assert.equal(Labels.drawTiles(ctx, polygons, labels, 1, null, 'rectangle'), 6);
    assert.equal(ctx.calls.length, 6);
    const [text, x, y] = ctx.calls[0];
    assert.equal(typeof text, 'string');
    assert.deepEqual([x, y], [polygons[0].center.x, polygons[0].center.y]);
    assert.equal(ctx.fills[0], '#ffffff', 'white text on the dark tile');
    assert.equal(ctx.fills[1], '#1f2933', 'dark text on the white tile');
    assert.equal(Labels.drawTiles(fakeContext(), polygons, labels, 0.02, null, 'rectangle'), 0, 'too small to read');
    assert.equal(Labels.drawTiles(fakeContext(), polygons, Labels.applyPreset({ enabled: true }, 'chess'), 1, null, 'rectangle'), 0, 'nothing when the tile switch is off');
    const only = { minX: polygons[0].bounds.minX, maxX: polygons[0].bounds.minX + 1, minY: polygons[0].bounds.minY, maxY: polygons[0].bounds.minY + 1 };
    assert.equal(Labels.drawTiles(fakeContext(), polygons, labels, 1, only, 'rectangle'), 1, 'tiles outside the view are skipped');
});

// ---- Panel and playtest ------------------------------------------------------------------------------------------

test('every data-lb control in the editor page names a real setting, and every setting has a control or its own picker', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
    const paths = [...html.matchAll(/data-lb="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(paths.length, 18, 'the panel has its controls: 4 general and 7 per axis');
    const defaults = plain(Labels.defaults());
    for (const key of paths) {
        if (key === 'preset') continue; // not a stored setting: it applies a preset
        const [first, second] = key.split('.');
        const found = second === undefined ? first in defaults : second in (defaults[first] || {});
        assert.ok(found, `${key} is a setting`);
    }
    // every setting can be changed in the panel: the indexing has the visual picker instead of a data-lb control
    for (const [first, value] of Object.entries(defaults)) {
        if (first === 'scheme') { assert.match(html, /id="labelsSchemes"/, 'the indexing has its picker'); continue; }
        if (typeof value === 'object') for (const second of Object.keys(value)) assert.ok(paths.includes(`${first}.${second}`), `${first}.${second} has a control`);
        else assert.ok(paths.includes(first), `${first} has a control`);
    }
    const shown = [...html.matchAll(/data-lb-show="([^"]+)"/g)].map((m) => m[1]);
    for (const key of shown) assert.ok(paths.includes(key), `${key} is shown by a control that exists`);
});

test('playtest announces a tile by the board labels when they are on (outside or on the tiles), and by column and row when not', () => {
    const Pieces = app.run('Pieces');
    const polygons = generate(make('rectangle', 'square', 'pointy-top', { width: 8, height: 8 }));
    const tile = polygons.find((p) => p.id === 'square_3_4');
    assert.equal(Pieces.tileLabel(polygons, tile), 'column 5, row 4');
    assert.equal(Pieces.tileLabel(polygons, tile, Labels.defaults(), 'rectangle'), 'column 5, row 4', 'labels off');
    assert.equal(Pieces.tileLabel(polygons, tile, Labels.applyPreset({ enabled: true }, 'chess'), 'rectangle'), 'E5');
    assert.equal(Pieces.tileLabel(polygons, tile, Labels.applyPreset({ onTiles: true }, 'chess'), 'rectangle'), 'E5', 'only on the tiles');
});

// ---- Placement: hugging the outline where the board is not a rectangle --------------------------------------------------

test('automatic placement hugs the outline on hexagon, circle and triangle boards and is a straight line elsewhere', () => {
    assert.equal(Labels.placementOf('auto', 'hexagon'), 'outline');
    assert.equal(Labels.placementOf('auto', 'circle'), 'outline');
    assert.equal(Labels.placementOf('auto', 'triangle'), 'outline');
    assert.equal(Labels.placementOf('auto', 'rectangle'), 'straight');
    assert.equal(Labels.placementOf('auto', 'country'), 'straight');
    assert.equal(Labels.placementOf('straight', 'hexagon'), 'straight', 'an explicit choice is kept');
    assert.equal(Labels.placementOf('outline', 'rectangle'), 'outline');

    const same = (a, b) => assert.deepEqual(plain(a.items), plain(b.items));
    const hexBoard = generate(make('hexagon', 'hexagon', 'pointy-top', { radius: 3 }));
    same(Labels.layout(hexBoard, on({ placement: 'auto' }), 'hexagon'), Labels.layout(hexBoard, on({ placement: 'outline' }), 'hexagon'));
    const rectangle = generate(make('rectangle', 'hexagon', 'pointy-top', { width: 5, height: 4 }));
    same(Labels.layout(rectangle, on({ placement: 'auto' }), 'rectangle'), Labels.layout(rectangle, on({ placement: 'straight' }), 'rectangle'));
    const circle = generate(make('circle', 'square', 'pointy-top', { radius: 4 }));
    same(Labels.layout(circle, on({ placement: 'auto' }), 'circle'), Labels.layout(circle, on({ placement: 'outline' }), 'circle'));
});

test('the default (automatic) labels of a hexagon board are never on top of a tile', () => {
    for (const config of [make('hexagon', 'hexagon', 'pointy-top', { radius: 4 }), make('hexagon', 'hexagon', 'flat-top', { radius: 4 }), make('circle', 'hexagon', 'pointy-top', { radius: 5 }), make('triangle', 'hexagon', 'pointy-top', { size: 6 })]) {
        const polygons = generate(config);
        for (const preset of ['chess', 'battleship', 'go']) {
            const { items } = Labels.layout(polygons, Labels.applyPreset({ enabled: true }, preset), config.boardShape);
            for (const item of items) assert.ok(!polygons.some((p) => insidePolygon(item, p.vertices)), `${config.boardShape} ${preset}: ${item.text}`);
        }
    }
});

// ---- Hovering a name lights up its line -----------------------------------------------------------------------------------

test('every name knows which line it belongs to, and the line is the row or column of tiles it names', () => {
    const polygons = generate(make('rectangle', 'square', 'pointy-top', { width: 5, height: 4 }));
    const labels = Labels.applyPreset({ enabled: true }, 'go');
    const { items } = Labels.layout(polygons, labels, 'rectangle');
    assert.ok(items.every((i) => Number.isInteger(i.index)));
    const bottom = items.filter((i) => i.side === 'bottom').sort((a, b) => a.x - b.x);
    assert.deepEqual(plain(bottom.map((i) => i.index)), [0, 1, 2, 3, 4]);
    // column 2 is the five-high... four tiles of one column, a row is the five tiles of one row
    const column = Labels.lineTiles(polygons, labels, 'rectangle', 'columns', 2);
    assert.equal(column.length, 4);
    assert.ok(column.every((p) => Math.abs(p.center.x - column[0].center.x) < 1e-6));
    const row = Labels.lineTiles(polygons, labels, 'rectangle', 'rows', 1);
    assert.equal(row.length, 5);
    assert.ok(row.every((p) => Math.abs(p.center.y - row[0].center.y) < 1e-6));
    assert.deepEqual(plain(Labels.lineTiles(polygons, labels, 'rectangle', 'columns', 99)), [], 'no such line');
});

test('on a hexagon board the line of a diagonal name is the straight diagonal, and a half step names the aligned tiles', () => {
    const polygons = generate(make('hexagon', 'hexagon', 'pointy-top', { radius: 2 }));
    const labels = Labels.applyPreset({ enabled: true, scheme: 'axial' }, 'chess');
    const middle = Labels.lineTiles(polygons, labels, 'hexagon', 'columns', 2);
    assert.equal(middle.length, 5, 'the long diagonal of a radius-2 hexagon');
    const d = { x: 0.5, y: SQRT3 / 2 };
    for (const tile of middle) assert.ok(Math.abs((tile.center.x - middle[0].center.x) * d.y - (tile.center.y - middle[0].center.y) * d.x) < 1e-6);
    const flat = generate(make('rectangle', 'hexagon', 'flat-top', { width: 4, height: 3 }));
    const half = Labels.lineTiles(flat, Labels.applyPreset({ enabled: true, scheme: 'doubled' }, 'chess'), 'rectangle', 'rows', 1);
    assert.deepEqual(plain(half.map((p) => p.id)).length, 2, 'half-row 1 holds the tiles of the odd columns at that height');
});

test('hit() finds the name under a point, the closest when boxes overlap, and nothing elsewhere', () => {
    const polygons = generate(make('rectangle', 'square', 'pointy-top', { width: 5, height: 4 }));
    const labels = Labels.applyPreset({ enabled: true }, 'chess');
    const { items } = Labels.layout(polygons, labels, 'rectangle');
    for (const item of items) {
        assert.deepEqual(plain(Labels.hit(polygons, labels, 'rectangle', { x: item.x, y: item.y })), { axis: item.axis, index: item.index }, item.text);
        assert.deepEqual(plain(Labels.hit(polygons, labels, 'rectangle', { x: item.x + 2, y: item.y - 2 })), { axis: item.axis, index: item.index }, 'close enough');
    }
    const centre = polygons[0].center;
    assert.equal(Labels.hit(polygons, labels, 'rectangle', centre), null, 'a tile is not a name');
    assert.equal(Labels.hit(polygons, Labels.defaults(), 'rectangle', { x: items[0].x, y: items[0].y }), null, 'labels off');
    assert.equal(Labels.hit([], labels, 'rectangle', { x: 0, y: 0 }), null);
});

test('names that are thinned out are not there to be hit', () => {
    const polygons = generate(make('rectangle', 'square', 'pointy-top', { width: 100, height: 100 }));
    const labels = on();
    const { items } = Labels.layout(polygons, labels, 'rectangle');
    const shown = new Set(items.filter((i) => i.axis === 'columns').map((i) => i.index));
    assert.ok(shown.size < 100);
    const hidden = [...Array(100).keys()].find((i) => !shown.has(i));
    const tile = Labels.lineTiles(polygons, labels, 'rectangle', 'columns', hidden)[0];
    const found = Labels.hit(polygons, labels, 'rectangle', { x: tile.center.x, y: items.find((i) => i.side === 'bottom').y });
    assert.ok(found === null || found.index !== hidden, 'a name that is not drawn is never the one hit');
    assert.ok(found === null || shown.has(found.index));
});

test('the hovered line is lit tile by tile, and its name is drawn white on an accent label', () => {
    const polygons = generate(make('rectangle', 'square', 'pointy-top', { width: 3, height: 2 }));
    const labels = Labels.applyPreset({ enabled: true }, 'chess');
    const ctx = fakeContext();
    assert.equal(Labels.drawHover(ctx, polygons, labels, { axis: 'columns', index: 1 }, 1, 'rectangle'), 2);
    assert.equal(ctx.shapes.paths, 2);
    assert.equal(ctx.shapes.fills, 2);
    assert.equal(ctx.shapes.strokes, 2);
    assert.equal(Labels.drawHover(fakeContext(), polygons, labels, null, 1, 'rectangle'), 0, 'nothing hovered');
    assert.equal(Labels.drawHover(fakeContext(), polygons, Labels.defaults(), { axis: 'columns', index: 1 }, 1, 'rectangle'), 0, 'labels off');
    assert.equal(Labels.drawHover(fakeContext(), polygons, labels, { axis: 'rows', index: 9 }, 1, 'rectangle'), 0, 'no such line');

    const drawn = fakeContext();
    Labels.draw(drawn, polygons, labels, 1, null, 'rectangle', { axis: 'columns', index: 1 });
    assert.equal(drawn.shapes.rects.length, 1, 'one name has the accent label');
    assert.ok(drawn.fills.includes('#ffffff') && drawn.fills.includes('#2f6fed'));
    const plainDraw = fakeContext();
    Labels.draw(plainDraw, polygons, labels, 1, null, 'rectangle');
    assert.equal(plainDraw.shapes.rects.length, 0, 'no hover, no accent label');
});
