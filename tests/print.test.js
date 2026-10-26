'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, GEOMETRY_SCRIPTS, plain } = require('./support/load');

const app = loadApp([...GEOMETRY_SCRIPTS, 'app/js/viewMath.js', 'app/js/state.js', 'app/js/renderer.js', 'app/js/print.js'], { TextEncoder, Blob });
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
    assert.deepEqual(plain(p.warnings), [{ text: 'Generate a board first.', blocking: true }]);
    assert.equal(p.blocked, true);
});

test('the tile size in mm is what the board is scaled to, for every tile shape', () => {
    for (const [gridType, overrides] of [['hexagon', {}], ['square', { boardShape: 'rectangle', width: 6, height: 6 }], ['triangle', { boardShape: 'triangle', size: 4 }]]) {
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
    assert.match(small.warnings[0].text, /larger than A3/);

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
    assert.match(empty.warnings.map((w) => w.text).join(' '), /legend would be empty/);
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
    assert.match(huge.warnings.map((w) => w.text).join(' '), /do not fit/);
});

test('printing is capped at 300 pages', () => {
    useBoard({ boardShape: 'hexagon', radius: 10, width: 21, height: 21 });
    const p = Print.plan({ tileMm: 200, paper: 'A4' });
    assert.ok(p.pageCount > 300);
    assert.match(p.warnings.map((w) => w.text).join(' '), /limit is 300/);
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

test('warnings say themselves whether they block the PDF', () => {
    useBoard({ boardShape: 'hexagon', radius: 10, width: 21, height: 21 });
    const tooMany = Print.plan({ tileMm: 200, paper: 'A4' });
    assert.equal(tooMany.blocked, true);
    assert.ok(tooMany.warnings.some((w) => w.blocking && /limit is 300/.test(w.text)));
    const cut = Print.plan({ mode: 'sheet', sheet: 'A3', tileMm: 50, marginMm: 10 });
    assert.ok(cut.warnings.length > 0 && cut.warnings.every((w) => !w.blocking), 'a board larger than the sheet is only a warning');
    assert.equal(cut.blocked, false);
    useBoard();
    assert.equal(Print.plan({ legend: true }).blocked, false, 'an empty legend is only a note');
});

test('a cleared or invalid setting falls back to its default instead of becoming 0 or a bad option', () => {
    const d = Print.DEFAULTS;
    const s = Print.normalize({ tileMm: '', marginMm: null, overlapMm: 'abc', paper: 'A9', mode: 'poster', objects: 'x', orientation: 7, legend: 1 });
    assert.equal(s.tileMm, d.tileMm);
    assert.equal(s.marginMm, d.marginMm);
    assert.equal(s.overlapMm, d.overlapMm);
    assert.equal(s.paper, d.paper);
    assert.equal(s.mode, d.mode);
    assert.equal(s.objects, d.objects);
    assert.equal(s.orientation, d.orientation);
    assert.equal(s.legend, true);
    assert.equal(Print.normalize({ tileMm: '0' }).tileMm, 5, 'a typed 0 is still clamped to the minimum');
});

test('a sheet too large for one canvas is made at a lower resolution, and says so', () => {
    useBoard({ boardShape: 'hexagon', radius: 8, width: 17, height: 17 });
    const big = Print.plan({ mode: 'sheet', sheet: 'A0', tileMm: 25, marginMm: 10 });
    assert.ok(big.warnings.some((w) => !w.blocking && /full resolution/.test(w.text)));
    assert.equal(big.blocked, false);
    const small = Print.plan({ mode: 'sheet', sheet: 'A4', tileMm: 10, marginMm: 10 });
    assert.ok(!small.warnings.some((w) => /full resolution/.test(w.text)));
});

test('a legend asked for on a sheet the board does not fit goes on its own page, never over the board', () => {
    useBoard();
    AppState.getState().polygons[0].color = '#7CB342';
    const p = Print.plan({ mode: 'sheet', sheet: 'A3', tileMm: 40, legend: true, marginMm: 10 });
    assert.equal(p.layout.fits, false, 'the board is larger than A3');
    assert.equal(p.legend.onSheet, false);
    assert.equal(p.layout.band, 0, 'no band is reserved on the sheet');
    assert.equal(p.pageCount, 2);
    assert.ok(p.warnings.some((w) => /larger than A3/.test(w.text)), 'the cut-off warning stays');
});

test("the legend names a colour shared by two palettes after the board's own palette", () => {
    useBoard();
    AppState.getState().polygons[0].color = '#C62828';
    const nameOn = (id) => { AppState.setCurrentPaletteId(id); return Print.plan({ legend: true, mode: 'sheet', sheet: 'fit' }).legend.entries[0].name; };
    try {
        assert.equal(nameOn('dungeon'), 'Trap');
        assert.equal(nameOn('spaceship'), 'Danger Zone');
        assert.equal(nameOn('nonexistent'), 'Trap', 'with no match the first palette wins, as before');
    } finally {
        AppState.setCurrentPaletteId(Config.DEFAULT_PALETTE_ID);
    }
});

test('a board exactly one page wide is one page, whatever float noise the scaling leaves', () => {
    useBoard({ boardShape: 'rectangle', gridType: 'square', width: 2, height: 2 });
    const p = Print.plan({ tileMm: 95, paper: 'A4', marginMm: 10, overlapMm: 5, orientation: 'portrait' });
    assert.ok(Math.abs(p.board.wMm - 190) < 1e-6);
    assert.equal(p.layout.cols, 1);
    assert.equal(p.layout.rows, 1, 'a 190 mm square on a 190 x 277 printable area');
    const wide = Print.plan({ tileMm: 95.5, paper: 'A4', marginMm: 10, overlapMm: 5, orientation: 'portrait' });
    assert.equal(wide.layout.cols, 2, 'a real overflow still needs a second page');
});

test('a page never has more than 16 million pixels, also after rounding, for any sheet size', () => {
    const MAX = 16 * 1024 * 1024;
    let checked = 0;
    for (let w = 100; w <= 5200; w += 137.3) {
        for (let h = 100; h <= 5200; h += 211.7) {
            const dpi = Math.min(Print.pageDpi(w, h), 200);
            const { pxW, pxH } = Print.pageSurfaceSize(w, h, dpi);
            assert.ok(pxW * pxH <= MAX, `${w} x ${h} mm gives ${pxW} x ${pxH}`);
            assert.ok(pxW <= 9000 && pxH <= 9000);
            checked += 1;
        }
    }
    assert.ok(checked > 500);
    for (const [w, h] of [[2139.6, 444.3], [841, 1189], [594, 841]]) {
        const { pxW, pxH } = Print.pageSurfaceSize(w, h, Math.min(200, Print.pageDpi(w, h)));
        assert.ok(pxW * pxH <= MAX);
    }
});

test('crop marks are as long as their own axis allows and never reach the page edge', () => {
    const inside = (lines, paperW, paperH) => lines.every(([x1, y1, x2, y2]) => [x1, x2].every((x) => x > 0.4 && x < paperW - 0.4) && [y1, y2].every((y) => y > 0.4 && y < paperH - 0.4));
    for (const margin of [3, 4, 5, 6, 8, 10, 20]) {
        const w = 100, h = 80;
        const lines = Print.cropMarkLines(margin, margin, w, h, { x0: 0, y0: 0, x1: w + margin * 2, y1: h + margin * 2 });
        assert.ok(inside(lines, w + margin * 2, h + margin * 2), `margin ${margin}`);
        assert.equal(lines.length, 8, `margin ${margin}`);
        assert.ok(lines.every(([x1, y1, x2, y2]) => Math.hypot(x2 - x1, y2 - y1) <= 6 + 1e-9));
    }
    assert.equal(Print.cropMarkLines(2, 2, 100, 80, { x0: 0, y0: 0, x1: 104, y1: 84 }).length, 0, 'no room for a visible mark');
    // A board tight vertically on a wide sheet: the vertical marks use the small vertical room, not the wide side margin.
    const lines = Print.cropMarkLines(40, 5, 100, 80, { x0: 0, y0: 0, x1: 180, y1: 90 });
    const vertical = lines.filter(([x1, , x2]) => x1 === x2);
    const horizontal = lines.filter(([, y1, , y2]) => y1 === y2);
    assert.equal(vertical.length, 4);
    assert.ok(vertical.every(([, y1, , y2]) => Math.abs(y2 - y1) <= 3 + 1e-9 && Math.min(y1, y2) > 0.4 && Math.max(y1, y2) < 89.6));
    assert.ok(horizontal.every(([x1, , x2]) => Math.abs(Math.abs(x2 - x1) - 6) < 1e-9));
    // A legend below the board is a limit like the page edge.
    const withLegend = Print.cropMarkLines(10, 10, 100, 80, { x0: 0, y0: 0, x1: 120, y1: 94 });
    assert.ok(withLegend.every(([, y1, , y2]) => Math.max(y1, y2) < 94 - 0.4));
});

test('a fit sheet longer than 5080 mm warns that some PDF viewers cannot open it, without blocking', () => {
    useBoard({ boardShape: 'rectangle', gridType: 'square', width: 30, height: 30 });
    const big = Print.plan({ mode: 'sheet', sheet: 'fit', tileMm: 200, marginMm: 10 });
    assert.ok(big.layout.paperW > 5080);
    assert.ok(big.warnings.some((w) => !w.blocking && /some PDF viewers cannot open pages this large/.test(w.text)));
    assert.equal(big.blocked, false);
    const ok = Print.plan({ mode: 'sheet', sheet: 'fit', tileMm: 100, marginMm: 10 });
    assert.ok(ok.layout.paperW < 5080 && !ok.warnings.some((w) => /PDF viewers/.test(w.text)));
});

test('start outlines are a print setting: on by default, kept when saved, and settings from before still load', () => {
    assert.equal(Print.DEFAULTS.startOutlines, true);
    assert.equal(Print.normalize().startOutlines, true);
    assert.equal(Print.normalize({ startOutlines: false }).startOutlines, false);
    assert.equal(Print.normalize({ tileMm: 30, paper: 'A3' }).startOutlines, true, 'an old saved setting has no such field');
    assert.equal(Print.normalize({ startOutlines: 'no' }).startOutlines, true, 'a value that is not true or false is ignored');
    useBoard();
    assert.equal(Print.plan({ startOutlines: false, objects: 'tokens' }).settings.startOutlines, false, 'the plan carries it in every mode');
});

test('start outlines follow the switch in every object mode, objects only the object mode', () => {
    useBoard();
    const polygons = AppState.getState().polygons;
    polygons[0].start = '#d32f2f';
    polygons[1].object = 'castle';
    const seen = [];
    const Renderer = app.run("Renderer");
    const realPaint = Renderer.paint;
    const ctxStub = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
    Renderer.paint = (ctx, scene) => { seen.push({ showObjects: scene.showObjects, showStartMarkers: scene.showStartMarkers }); return { drawn: 0, total: 0 }; };
    const doc = app.context.document;
    app.context.window = { devicePixelRatio: 1 };
    app.context.document = { createElement: () => ({ width: 0, height: 0, getContext: ctxStub }) };
    try {
        for (const [objects, startOutlines, expected] of [['board', true, [true, true]], ['both', false, [true, false]], ['tokens', true, [false, true]], ['tokens', false, [false, false]]]) {
            seen.length = 0;
            Print.drawPreview({ clientWidth: 400, clientHeight: 300, getContext: ctxStub }, { mode: 'sheet', objects, startOutlines });
            assert.deepEqual([seen[0].showObjects, seen[0].showStartMarkers], expected, `${objects}, outlines ${startOutlines}`);
        }
    } finally {
        Renderer.paint = realPaint;
        app.context.document = doc;
        delete app.context.window;
    }
});

test('on an infinite board the export scene is not rebuilt for a second plan of the same tiles', () => {
    useBoard();
    const state = AppState.getState();
    let builds = 0;
    app.context.Infinite = {
        isActive: () => true,
        isPainted: (p) => Boolean(p.color && p.color !== Config.DEFAULT_FILL),
        exportScene: () => { builds += 1; return { polygons: state.polygons, bounds: {}, view: {} }; }
    };
    try {
        state.polygons[0].color = '#7CB342';
        Print.plan({ tileMm: 25 });
        Print.plan({ tileMm: 30, paper: 'A3' });
        assert.equal(builds, 1, 'a changed control reuses the scene');
        state.polygons[1].color = '#7CB342';
        Print.plan({ tileMm: 30 });
        assert.equal(builds, 2, 'painting another tile builds it again');
    } finally {
        delete app.context.Infinite;
    }
});
