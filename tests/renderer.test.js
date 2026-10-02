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
    for (const name of ['beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'save', 'restore', 'clearRect', 'setTransform', 'clip', 'drawImage']) {
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
    const scripts = [...GEOMETRY_SCRIPTS, 'js/viewMath.js', 'js/renderer.js'];
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
