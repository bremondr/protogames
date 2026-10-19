'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, GEOMETRY_SCRIPTS, plain } = require('./support/load');

const CANVAS = { width: 1200, height: 800 };

/** A 2D context stand-in that records every call, so paint() can be inspected without a browser. */
function recordingContext() {
    const calls = [];
    const record = (name) => (...args) => calls.push([name, ...args]);
    const ctx = { calls, fillStyle: '', strokeStyle: '', lineWidth: 1 };
    for (const name of ['beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'save', 'restore', 'clearRect', 'setTransform', 'clip', 'drawImage', 'fillRect']) {
        ctx[name] = record(name);
    }
    // lineWidth/transform at the moment each stroke happens
    ctx.strokes = [];
    let transform = [1, 0, 0, 1, 0, 0];
    ctx.setTransform = (...args) => { transform = args; calls.push(['setTransform', ...args]); };
    ctx.stroke = () => { ctx.strokes.push({ lineWidth: ctx.lineWidth, scale: transform[0] }); calls.push(['stroke']); };
    return ctx;
}

function setup(appStateOverride) {
    const scripts = [...GEOMETRY_SCRIPTS, 'app/js/viewMath.js', 'app/js/renderer.js'];
    const created = [];
    const globals = {
        // Renderer.createExportCanvas needs a document to make a canvas and AppState for the tiles.
        document: {
            createElement: () => {
                const ctx = recordingContext();
                const canvas = { width: 0, height: 0, getContext: () => ctx, ctx };
                created.push(canvas);
                return canvas;
            }
        }
    };
    const app = loadApp(scripts, globals);
    // `AppState` is a script-scope const in the real app; define it the same way here.
    app.run(`var AppState = { getState: () => globalThis.__state }; void 0;`);
    app.context.__state = appStateOverride || {};
    return {
        app,
        created,
        Renderer: app.run('Renderer'),
        Geometry: app.context.Geometry,
        Checks: app.context.GeometryChecks,
        setState(state) { app.context.__state = state; }
    };
}

function board(env, gridType = 'square', sizes = { width: 20, height: 14 }) {
    const config = env.Checks.makeConfig('rectangle', gridType, 'pointy-top', 'point-up', sizes);
    return env.Geometry.generateGrid(config, CANVAS, null);
}

test('paint draws every tile at the identity view', () => {
    const env = setup();
    const polygons = board(env);
    const ctx = recordingContext();
    const stats = env.Renderer.paint(ctx, { polygons, ...CANVAS });
    assert.equal(stats.drawn, polygons.length);
    assert.equal(stats.total, polygons.length);
    assert.equal(ctx.strokes.length, polygons.length);
});

test('paint applies the view transform and restores the identity afterwards', () => {
    const env = setup();
    const polygons = board(env);
    const ctx = recordingContext();
    const view = { scale: 3, x: -500, y: -200 };
    env.Renderer.paint(ctx, { polygons, ...CANVAS, view });
    const transforms = plain(ctx.calls.filter((c) => c[0] === 'setTransform'));
    assert.deepEqual(transforms[0], ['setTransform', 1, 0, 0, 1, 0, 0], 'cleared in screen space first');
    assert.deepEqual(transforms[1], ['setTransform', 3, 0, 0, 3, -500, -200], 'tiles drawn in world space');
    assert.deepEqual(transforms[transforms.length - 1], ['setTransform', 1, 0, 0, 1, 0, 0], 'left in screen space');
});

test('tiles outside the visible area are not drawn, and every visible tile is', () => {
    const env = setup();
    const polygons = board(env);
    const ctx = recordingContext();
    const view = { scale: 4, x: -300, y: -150 };
    const stats = env.Renderer.paint(ctx, { polygons, ...CANVAS, view });
    assert.ok(stats.drawn < polygons.length / 4, `drew ${stats.drawn} of ${polygons.length}`);
    const visible = env.app.run('ViewMath').visibleWorldRect(view, CANVAS.width, CANVAS.height);
    const expected = polygons.filter(
        (p) => p.bounds.maxX >= visible.minX - 1 && p.bounds.minX <= visible.maxX + 1 && p.bounds.maxY >= visible.minY - 1 && p.bounds.minY <= visible.maxY + 1
    ).length;
    assert.ok(stats.drawn >= expected, `must draw all ${expected} visible tiles, drew ${stats.drawn}`);
    assert.ok(stats.drawn <= expected + 60, 'only a thin margin beyond the screen');
});

test('grid lines keep the same width on screen at every zoom level', () => {
    const env = setup();
    const polygons = board(env, 'hexagon', { width: 8, height: 6 });
    for (const scale of [0.25, 1, 2.5, 8, 24]) {
        const ctx = recordingContext();
        env.Renderer.paint(ctx, { polygons, ...CANVAS, view: { scale, x: 0, y: 0 } });
        for (const stroke of ctx.strokes) {
            assert.ok(Math.abs(stroke.lineWidth * stroke.scale - 1) < 1e-9, `scale ${scale}: ${stroke.lineWidth * stroke.scale}px`);
        }
    }
});

test('hover and line preview overlays are drawn on screen but never when exporting', () => {
    const env = setup();
    const polygons = board(env, 'square', { width: 5, height: 4 });
    const withOverlays = recordingContext();
    env.Renderer.paint(withOverlays, { polygons, ...CANVAS, hoverPolygonId: polygons[0].id });
    const plainCtx = recordingContext();
    env.Renderer.paint(plainCtx, { polygons, ...CANVAS });
    assert.equal(withOverlays.strokes.length, plainCtx.strokes.length + 1, 'one extra outline for the hovered tile');

    const preview = recordingContext();
    env.Renderer.paint(preview, { polygons, ...CANVAS, linePreviewIds: [polygons[0].id, polygons[1].id] });
    assert.equal(preview.strokes.length, polygons.length + 2);
});

test('exports ignore the current pan and zoom (exports are independent of zoom)', () => {
    const env = setup();
    const polygons = board(env);
    const reference = recordingContext();
    env.Renderer.paint(reference, { polygons, ...CANVAS });

    for (const view of [{ scale: 1, x: 0, y: 0 }, { scale: 6, x: -2000, y: -900 }, { scale: 0.25, x: 300, y: 200 }]) {
        env.setState({ canvas: { ...CANVAS }, polygons, view, hoverPolygonId: polygons[3].id, linePreviewIds: [polygons[2].id] });
        env.created.length = 0;
        const out = env.Renderer.createExportCanvas();
        assert.equal(out.width, CANVAS.width);
        assert.equal(out.height, CANVAS.height);
        assert.deepEqual(plain(out.ctx.calls), plain(reference.calls), `export must not depend on view ${JSON.stringify(view)}`);
    }
});

test('painting an empty board draws nothing and does not throw', () => {
    const env = setup();
    const ctx = recordingContext();
    const stats = env.Renderer.paint(ctx, { polygons: [], ...CANVAS, view: { scale: 2, x: 0, y: 0 } });
    assert.deepEqual(plain(stats), { drawn: 0, total: 0 });
});

test('a 100 x 100 board redraws fast when zoomed in (culling)', () => {
    const env = setup();
    const config = env.Checks.makeConfig('rectangle', 'hexagon', 'pointy-top', 'point-up', { width: 100, height: 100 });
    const polygons = env.Geometry.generateGrid(config, { width: 3000, height: 2000 }, null);
    const zoomed = recordingContext();
    const t0 = process.hrtime.bigint();
    const stats = env.Renderer.paint(zoomed, { polygons, width: 1200, height: 800, view: { scale: 12, x: -6000, y: -4000 } });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(stats.drawn < 400, `drew ${stats.drawn} tiles`);
    assert.ok(ms < 100, `zoomed redraw took ${ms.toFixed(1)} ms`);
});

test('a start marker is outlined twice on its tile (light under colour), at a constant width on screen', () => {
    const env = setup();
    const polygons = board(env);
    const view = { scale: 2, x: 0, y: 0 };
    const plainCtx = recordingContext();
    env.Renderer.paint(plainCtx, { polygons, ...CANVAS, view });
    polygons[3].start = '#c62828';
    const ctx = recordingContext();
    env.Renderer.paint(ctx, { polygons, ...CANVAS, view });
    assert.equal(ctx.strokes.length, plainCtx.strokes.length + 2, 'one marker is two strokes');
    const [light, colour] = ctx.strokes.slice(-2);
    assert.ok(light.lineWidth * light.scale > colour.lineWidth * colour.scale, 'the light line is the wider one, so it frames the colour');
    assert.equal(Math.round(colour.lineWidth * colour.scale * 10) / 10, 3.5, 'a constant 3.5 px whatever the zoom');
});

test('start markers outside the visible area are not drawn', () => {
    const env = setup();
    const polygons = board(env);
    polygons.forEach((p) => { p.start = '#c62828'; });
    const ctx = recordingContext();
    env.Renderer.paint(ctx, { polygons, ...CANVAS, view: { scale: 12, x: -6000, y: -4000 } });
    const reference = recordingContext();
    const withoutMarkers = polygons.map((p) => ({ ...p, start: undefined }));
    env.Renderer.paint(reference, { polygons: withoutMarkers, ...CANVAS, view: { scale: 12, x: -6000, y: -4000 } });
    const visibleTiles = reference.strokes.length;
    assert.equal(ctx.strokes.length, visibleTiles * 3, 'each visible tile has its grid line and a two-stroke marker');
    assert.ok(visibleTiles < polygons.length);
});

test('exports and the screen both show start markers, but pieces only appear when the scene has them', () => {
    const env = setup();
    env.app.run('var Pieces = { drawAll: (ctx, polygons, pieces, scale, visible, hidden, selected) => { globalThis.__drawn = { count: pieces.length, hidden, selected }; } }; void 0;');
    const polygons = board(env);
    env.Renderer.paint(recordingContext(), { polygons, ...CANVAS });
    assert.equal(env.app.context.__drawn, undefined, 'no pieces in an export');
    env.Renderer.paint(recordingContext(), { polygons, ...CANVAS, pieces: [] });
    assert.equal(env.app.context.__drawn, undefined, 'an empty list draws nothing');
    env.Renderer.paint(recordingContext(), { polygons, ...CANVAS, pieces: [{ id: 'a' }], hiddenPieceIds: ['a'], selectedPieceId: 'a' });
    assert.deepEqual(plain(env.app.context.__drawn), { count: 1, hidden: ['a'], selected: 'a' });
});

test('the board on screen passes the running game, the carried pieces and the selection on only during playtest', () => {
    const env = setup();
    env.app.run('var Pieces = { drawAll: (ctx, polygons, pieces, scale, visible, hidden, selected) => { globalThis.__drawn = { ids: pieces.map((p) => p.id), hidden, selected }; } }; void 0;');
    const polygons = board(env);
    const ctx = recordingContext();
    const canvas = { width: CANVAS.width, height: CANVAS.height };
    const base = { ctx, canvas, polygons, view: { scale: 1, x: 0, y: 0 }, hoverIds: [], linePreviewIds: [], play: { pieces: [{ id: 'a' }, { id: 'b' }] }, drag: ['b'], selectedPieceId: 'a' };
    env.setState({ ...base, playtest: false });
    env.Renderer.renderBoard();
    assert.equal(env.app.context.__drawn, undefined, 'not while editing');
    env.setState({ ...base, playtest: true });
    env.Renderer.renderBoard();
    assert.deepEqual(plain(env.app.context.__drawn), { ids: ['a', 'b'], hidden: ['b'], selected: 'a' });
});

test('an export can be larger, without grid lines, and on a background; the default is unchanged', () => {
    const env = setup();
    const polygons = board(env);
    env.setState({ canvas: { ...CANVAS }, polygons, view: { scale: 5, x: -100, y: -100 } });

    const plain1 = env.Renderer.createExportCanvas();
    const calls1 = plain(plain1.ctx.calls);
    assert.equal(plain1.width, CANVAS.width);
    assert.equal(plain1.exportScale, 1);

    const big = env.Renderer.createExportCanvas({ scale: 2 });
    assert.equal(big.width, CANVAS.width * 2);
    assert.equal(big.height, CANVAS.height * 2);
    assert.equal(big.exportScale, 2);
    assert.deepEqual(plain(big.ctx.calls.find((c) => c[0] === 'setTransform' && c[1] !== 1)), ['setTransform', 2, 0, 0, 2, 0, 0], 'the tiles are drawn at twice the size');
    assert.deepEqual(plain(env.Renderer.createExportCanvas({}).ctx.calls), calls1, 'no options: exactly the export of before');

    // without grid lines every tile is stroked in its own colour, so no seams show
    polygons.forEach((p, i) => { p.color = i % 2 ? '#112233' : '#445566'; });
    const stroked = [];
    const out = env.Renderer.createExportCanvas({ grid: false });
    out.ctx.calls.filter((c) => c[0] === 'stroke').forEach(() => stroked.push(1));
    assert.equal(stroked.length, polygons.length);
    assert.equal(env.Renderer.createExportCanvas({ grid: true }).ctx.strokes.length, polygons.length);
});

test('a background is painted first and the board is laid over it, on a second canvas', () => {
    const env = setup();
    const polygons = board(env);
    env.setState({ canvas: { ...CANVAS }, polygons, view: { scale: 1, x: 0, y: 0 } });
    env.created.length = 0;
    const out = env.Renderer.createExportCanvas({ background: '#ffffff' });
    assert.equal(env.created.length, 2, 'the result and the canvas of the board, nothing else');
    const names = out.ctx.calls.map((c) => c[0]);
    assert.ok(names.includes('drawImage'), 'the board is drawn over the background');
    assert.equal(out.ctx.fillStyle, '#ffffff', 'the background colour');
    assert.equal(out.ctx.strokes.length, 0, 'tiles are not stroked on the result itself, only on the board canvas');
});

test('a very large export is cut back to the largest scale a canvas can have', () => {
    const env = setup();
    const polygons = board(env);
    env.setState({ canvas: { width: 6000, height: 4000 }, polygons, view: { scale: 1, x: 0, y: 0 } });
    const out = env.Renderer.createExportCanvas({ scale: 4 });
    assert.equal(out.exportScale, 2, '6000 x 4 is over the limit, 6000 x 2 is not');
    assert.equal(out.width, 12000);
    assert.equal(env.Renderer.MAX_EXPORT_SIDE, 16000);
});

test('objects and start markers can be left out of an export', () => {
    const env = setup();
    const polygons = board(env);
    polygons[0].object = 'castle';
    polygons[1].start = '#c62828';
    env.setState({ canvas: { ...CANVAS }, polygons, view: { scale: 1, x: 0, y: 0 } });
    const drawn = [];
    env.app.context.Objects = { drawOnPolygon: (ctx, p) => drawn.push(p.id) };
    env.Renderer.createExportCanvas({ objects: true });
    assert.equal(drawn.length, 1, 'with objects: the castle');
    drawn.length = 0;
    env.Renderer.createExportCanvas({ objects: false });
    assert.equal(drawn.length, 0, 'without: none');
});
