'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, GEOMETRY_SCRIPTS, plain } = require('./support/load');

const app = loadApp([...GEOMETRY_SCRIPTS, 'js/viewMath.js', 'js/state.js', 'js/print.js'], { TextEncoder, Blob });
const Print = app.run('Print');
const AppState = app.run('AppState');
const Geometry = app.context.Geometry;
const Config = app.run('Config');

const CANVAS = { width: 1200, height: 800 };

/** Puts a generated board into the shared AppState and returns it. */
function useBoard(overrides = {}, paint = () => {}) {
    const config = { ...Config.DEFAULT_BOARD_CONFIG, ...overrides };
    const state = AppState.getState();
    state.canvas = CANVAS;
    const polygons = Geometry.generateGrid(config, CANVAS, null);
    polygons.forEach(paint);
    AppState.setPolygons(polygons);
    AppState.updateBoardConfig(config);
    return state.polygons;
}

test('rows are named A..Z, then AA, AB...', () => {
    assert.equal(Print.rowName(0), 'A');
    assert.equal(Print.rowName(25), 'Z');
    assert.equal(Print.rowName(26), 'AA');
    assert.equal(Print.rowName(27), 'AB');
    assert.equal(Print.rowName(51), 'AZ');
    assert.equal(Print.rowName(52), 'BA');
});

test('settings are clamped to sensible ranges and fall back to defaults', () => {
    const s = plain(Print.normalize({ tileMm: 1000, marginMm: -5, overlapMm: 'abc', paper: 'A3' }));
    assert.equal(s.tileMm, 200);
    assert.equal(s.marginMm, 0);
    assert.equal(s.overlapMm, Print.DEFAULTS.overlapMm);
    assert.equal(s.paper, 'A3');
    assert.equal(plain(Print.normalize({ tileMm: 1 })).tileMm, 5);
    assert.deepEqual(plain(Print.normalize()), plain(Print.DEFAULTS));
});

test('without a board there is nothing to print', () => {
    AppState.getState().polygons = [];
    const p = plain(Print.plan({}));
    assert.equal(p.board, null);
    assert.equal(p.pageCount, 0);
    assert.deepEqual(p.warnings, ['Generate a board first.']);
});

test('the tile size in mm is what the board is scaled to, for every tile shape', () => {
    for (const [gridType, overrides] of [['hexagon', {}], ['square', { boardShape: 'square', size: 6 }], ['triangle', { boardShape: 'triangle', size: 4 }]]) {
        useBoard({ gridType, ...overrides });
        const p = Print.plan({ tileMm: 30 });
        const first = p.board.polygons[0];
        const w = first.bounds.maxX - first.bounds.minX;
        const h = first.bounds.maxY - first.bounds.minY;
        const measure = gridType === 'hexagon' ? Math.min(w, h) : gridType === 'triangle' ? Math.max(w, h) : w;
        assert.ok(Math.abs(measure * p.board.mmPerWorld - 30) < 1e-9, `${gridType}: tile measures 30 mm`);
        assert.ok(p.board.wMm > 30 && p.board.hMm > 30);
    }
});

test('a tiled print covers the whole board with the requested overlap and unique labels', () => {
    useBoard({ boardShape: 'hexagon', radius: 6, width: 13, height: 13 });
    const p = Print.plan({ mode: 'tiled', tileMm: 25, paper: 'A4', orientation: 'portrait', marginMm: 10, overlapMm: 5 });
    const L = p.layout;
    assert.equal(L.paperW, 210);
    assert.equal(L.printW, 190);
    assert.equal(L.pages.length, L.cols * L.rows);
    assert.equal(new Set(L.pages.map((pg) => pg.label)).size, L.pages.length);
    assert.equal(L.pages[0].label, 'A1');
    const xs = [...new Set(L.pages.map((pg) => pg.x0))].sort((a, b) => a - b);
    const ys = [...new Set(L.pages.map((pg) => pg.y0))].sort((a, b) => a - b);
    assert.ok(xs[0] <= 1e-9 && xs[xs.length - 1] + L.printW >= p.board.wMm - 1e-9, 'columns cover the width');
    assert.ok(ys[0] <= 1e-9 && ys[ys.length - 1] + L.printH >= p.board.hMm - 1e-9, 'rows cover the height');
    for (let i = 1; i < xs.length; i++) assert.ok(Math.abs(xs[i] - xs[i - 1] - (L.printW - 5)) < 1e-9, 'neighbouring pages overlap by exactly 5 mm');
    for (let i = 1; i < ys.length; i++) assert.ok(Math.abs(ys[i] - ys[i - 1] - (L.printH - 5)) < 1e-9);
    assert.equal(p.pageCount, L.pages.length);
});

test('auto orientation picks the paper orientation that needs fewer pages', () => {
    useBoard({ boardShape: 'rectangle', gridType: 'square', width: 14, height: 4 });
    const auto = Print.plan({ tileMm: 30, orientation: 'auto' });
    const portrait = Print.plan({ tileMm: 30, orientation: 'portrait' });
    const landscape = Print.plan({ tileMm: 30, orientation: 'landscape' });
    assert.equal(auto.layout.pages.length, Math.min(portrait.layout.pages.length, landscape.layout.pages.length));
    assert.equal(auto.layout.orientation, 'landscape', 'a wide board prints best on wide paper');
});

test('a board that fits on one page is a single page, centred', () => {
    useBoard({ boardShape: 'hexagon', radius: 1, width: 3, height: 3 });
    const p = Print.plan({ tileMm: 20, paper: 'A4' });
    assert.equal(p.layout.pages.length, 1);
    assert.ok(p.layout.pages[0].x0 < 0 && p.layout.pages[0].y0 < 0, 'the board sits inside the printable area');
});

test('even the largest margin and overlap the dialog allows still leave room on every paper', () => {
    useBoard();
    for (const paper of ['A4', 'Letter', 'A3']) {
        const p = Print.plan({ marginMm: 30, overlapMm: 30, paper });
        assert.ok(p.layout, paper);
        assert.ok(p.layout.printW > 60 && p.layout.printH > 60);
    }
});

test('a single sheet: fit-to-board grows with the board, a fixed sheet warns when the board is too big', () => {
    useBoard({ boardShape: 'hexagon', radius: 8, width: 17, height: 17 });
    const fit = Print.plan({ mode: 'sheet', sheet: 'fit', tileMm: 25, marginMm: 10 });
    assert.equal(fit.layout.name, 'Custom');
    assert.ok(Math.abs(fit.layout.paperW - (fit.board.wMm + 20)) < 1e-9);
    assert.equal(fit.layout.fits, true);
    assert.deepEqual(plain(fit.warnings), []);

    const small = Print.plan({ mode: 'sheet', sheet: 'A3', tileMm: 50, marginMm: 10 });
    assert.equal(small.layout.fits, false);
    assert.match(small.warnings[0], /larger than A3/);

    const roomy = Print.plan({ mode: 'sheet', sheet: 'A0', tileMm: 25, marginMm: 10 });
    assert.equal(roomy.layout.fits, true);
});

test('the legend lists what is painted, most used first, with names from the palettes', () => {
    useBoard({}, (p) => { /* leave blank */ });
    const polygons = AppState.getState().polygons;
    const forest = Config.COLOR_PALETTES.find((x) => x.id === 'landscape').colors[0];
    polygons.slice(0, 5).forEach((p) => { p.color = forest.hex; });
    polygons.slice(5, 7).forEach((p) => { p.color = '#123456'; });
    polygons[10].object = 'castle';
    const p = Print.plan({ legend: true, mode: 'sheet', sheet: 'fit', tileMm: 25 });
    const entries = plain(p.legend.entries);
    assert.deepEqual(entries.map((e) => [e.kind, e.count]), [['terrain', 5], ['terrain', 2], ['object', 1]]);
    assert.equal(entries[0].name, forest.label);
    assert.equal(entries[1].name, '#123456', 'an unknown colour is named by its hex');
    assert.equal(p.legend.onSheet, true, 'below the board when it fits');
    assert.ok(p.layout.band > 0, 'the sheet grows to make room');
});

test('an empty legend is explained, and the legend can go on its own page', () => {
    useBoard();
    const empty = Print.plan({ legend: true });
    assert.match(empty.warnings.join(' '), /legend would be empty/);
    const polygons = AppState.getState().polygons;
    polygons[0].color = '#7CB342';
    const page = Print.plan({ legend: true, mode: 'sheet', legendPlace: 'page', sheet: 'fit' });
    assert.equal(page.legend.onSheet, false);
    assert.equal(page.legend.pages, 1);
    assert.equal(page.pageCount, 2, 'the sheet plus the legend page');
});

test('objects can be printed as tokens, which adds pages and is checked against the paper', () => {
    useBoard();
    const polygons = AppState.getState().polygons;
    polygons.slice(0, 30).forEach((p) => { p.object = 'castle'; });
    const onBoard = Print.plan({ objects: 'board', tileMm: 25 });
    assert.equal(onBoard.tokens, null);
    const tokens = Print.plan({ objects: 'tokens', tileMm: 25, paper: 'A4' });
    assert.equal(tokens.tokens.count, 30);
    assert.ok(tokens.tokens.perPage > 0 && tokens.tokens.pages === Math.ceil(30 / tokens.tokens.perPage));
    assert.equal(tokens.pageCount, tokens.boardPages + tokens.tokens.pages);
    const both = Print.plan({ objects: 'both', tileMm: 25 });
    assert.equal(both.pageCount, tokens.pageCount);
    const huge = Print.plan({ objects: 'tokens', tileMm: 200, paper: 'A4' });
    assert.match(huge.warnings.join(' '), /do not fit/);
});

test('printing is capped at 300 pages', () => {
    useBoard({ boardShape: 'hexagon', radius: 10, width: 21, height: 21 });
    const p = Print.plan({ tileMm: 200, paper: 'A4' });
    assert.ok(p.pageCount > 300);
    assert.match(p.warnings.join(' '), /limit is 300/);
});

test('the PDF writer produces a well-formed file with correct cross-reference offsets', async () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const blob = Print.buildPdf([
        { wPt: 595.28, hPt: 841.89, pxW: 10, pxH: 14, jpeg },
        { wPt: 842, hPt: 595, pxW: 14, pxH: 10, jpeg }
    ]);
    assert.equal(blob.type, 'application/pdf');
    const bytes = Buffer.from(await blob.arrayBuffer());
    const text = bytes.toString('latin1');
    assert.ok(text.startsWith('%PDF-1.4'));
    assert.ok(text.trimEnd().endsWith('%%EOF'));
    assert.match(text, /\/Count 2/);
    assert.match(text, /\/MediaBox \[0 0 595\.28 841\.89\]/);
    assert.match(text, /\/MediaBox \[0 0 842\.00 595\.00\]/);

    const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)[1]);
    assert.ok(text.slice(startxref).startsWith('xref'), 'startxref points at the table');
    const total = Number(/xref\n0 (\d+)\n/.exec(text)[1]);
    assert.equal(total, 3 + 2 * 3);
    const lines = text.slice(startxref).split('\n').slice(2, 2 + total);
    assert.match(lines[0], /^0000000000 65535 f/);
    for (let n = 1; n < total; n++) {
        const offset = Number(lines[n].slice(0, 10));
        assert.ok(text.slice(offset).startsWith(`${n} 0 obj`), `object ${n} is at its offset`);
    }
    // The JPEG bytes survive untouched inside the stream.
    assert.ok(bytes.includes(Buffer.from(jpeg)));
});
