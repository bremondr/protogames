'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, GEOMETRY_SCRIPTS, plain } = require('./support/load');

const app = loadApp([...GEOMETRY_SCRIPTS, 'js/viewMath.js']);
const VM = app.run('ViewMath');
const Geometry = app.context.Geometry;
const Checks = app.context.GeometryChecks;
const Config = app.run('Config');

const near = (actual, expected, message, tolerance = 1e-9) =>
    assert.ok(Math.abs(actual - expected) <= tolerance, `${message || ''} expected ${expected}, got ${actual}`);

function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const MIN = Config.ZOOM_MIN;
const MAX = Config.ZOOM_MAX;

// ---- Coordinate mapping ---------------------------------------------------------------

test('toWorld and toScreen are inverses for any view', () => {
    const random = rng(1);
    for (let i = 0; i < 200; i++) {
        const view = { scale: 0.25 + random() * 20, x: (random() - 0.5) * 2000, y: (random() - 0.5) * 2000 };
        const sx = random() * 1500;
        const sy = random() * 900;
        const world = VM.toWorld(view, sx, sy);
        const back = VM.toScreen(view, world.x, world.y);
        near(back.x, sx, 'x', 1e-6);
        near(back.y, sy, 'y', 1e-6);
    }
});

test('the identity view maps points to themselves', () => {
    assert.deepEqual(plain(VM.toWorld(VM.identity(), 12, 34)), { x: 12, y: 34 });
    assert.deepEqual(plain(VM.toScreen(VM.identity(), 12, 34)), { x: 12, y: 34 });
});

test('visibleWorldRect shrinks as you zoom in and follows the pan', () => {
    const fit = plain(VM.visibleWorldRect(VM.identity(), 1000, 600));
    assert.deepEqual(fit, { minX: 0, minY: 0, maxX: 1000, maxY: 600 });
    const zoomed = plain(VM.visibleWorldRect({ scale: 2, x: -400, y: -200 }, 1000, 600));
    assert.deepEqual(zoomed, { minX: 200, minY: 100, maxX: 700, maxY: 400 });
});

// ---- Zoom ---------------------------------------------------------------------------------

test('zooming keeps the world point under the pointer fixed', () => {
    const random = rng(2);
    for (let i = 0; i < 300; i++) {
        const view = { scale: 0.5 + random() * 8, x: (random() - 0.5) * 1000, y: (random() - 0.5) * 1000 };
        const sx = random() * 1200;
        const sy = random() * 800;
        const factor = 0.5 + random() * 1.5;
        const before = VM.toWorld(view, sx, sy);
        const after = VM.zoomAt(view, factor, sx, sy, MIN, MAX);
        const now = VM.toWorld(after, sx, sy);
        near(now.x, before.x, 'world x under pointer', 1e-6);
        near(now.y, before.y, 'world y under pointer', 1e-6);
    }
});

test('zoom is clamped to the configured limits and then stops moving the view', () => {
    let view = VM.identity();
    for (let i = 0; i < 80; i++) view = VM.zoomAt(view, 1.5, 300, 200, MIN, MAX);
    assert.equal(view.scale, MAX);
    const atMax = VM.zoomAt(view, 1.5, 300, 200, MIN, MAX);
    assert.deepEqual(plain(atMax), plain(view), 'zooming further in at the limit changes nothing');
    for (let i = 0; i < 160; i++) view = VM.zoomAt(view, 0.6, 300, 200, MIN, MAX);
    assert.equal(view.scale, MIN);
});

test('zooming in then out by the same factor returns to the same view', () => {
    const start = { scale: 1.7, x: -120, y: 45 };
    const there = VM.zoomAt(start, 1.25, 640, 360, MIN, MAX);
    const back = VM.zoomAt(there, 1 / 1.25, 640, 360, MIN, MAX);
    near(back.scale, start.scale);
    near(back.x, start.x, 'x', 1e-9);
    near(back.y, start.y, 'y', 1e-9);
});

test('setScaleAt reaches an absolute scale around a point', () => {
    const view = VM.setScaleAt({ scale: 1, x: 0, y: 0 }, 4, 500, 300, MIN, MAX);
    assert.equal(view.scale, 4);
    const world = VM.toWorld({ scale: 1, x: 0, y: 0 }, 500, 300);
    const now = VM.toWorld(view, 500, 300);
    near(now.x, world.x);
    near(now.y, world.y);
});

// ---- Pan ---------------------------------------------------------------------------------

test('panBy moves the view by screen pixels without changing the scale', () => {
    assert.deepEqual(plain(VM.panBy({ scale: 3, x: 10, y: 20 }, 5, -7)), { scale: 3, x: 15, y: 13 });
});

test('clampToBounds keeps the middle of the screen over the board', () => {
    const bounds = { minX: 100, minY: 100, maxX: 500, maxY: 400 };
    const fine = { scale: 2, x: -300, y: -100 };
    assert.equal(VM.clampToBounds(fine, 800, 600, bounds), fine, 'a valid view is returned untouched');

    const way = VM.clampToBounds({ scale: 2, x: 5000, y: 5000 }, 800, 600, bounds);
    const centre = VM.toWorld(way, 400, 300);
    assert.ok(centre.x >= bounds.minX && centre.x <= bounds.maxX, 'centre x inside the board');
    assert.ok(centre.y >= bounds.minY && centre.y <= bounds.maxY, 'centre y inside the board');
    assert.equal(way.scale, 2);
    assert.equal(VM.clampToBounds(fine, 800, 600, null), fine, 'no board: nothing to clamp to');
});

test('you can never pan the board completely out of sight', () => {
    const random = rng(4);
    const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 700 };
    for (let i = 0; i < 300; i++) {
        const view = VM.clampToBounds({ scale: 0.25 + random() * 20, x: (random() - 0.5) * 1e5, y: (random() - 0.5) * 1e5 }, 1200, 800, bounds);
        const visible = VM.visibleWorldRect(view, 1200, 800);
        assert.ok(VM.rectsIntersect(visible, bounds));
    }
});

test('centerOn puts a world point in the middle of the canvas', () => {
    const view = VM.centerOn({ scale: 3, x: 0, y: 0 }, 800, 600, 250, 125);
    const screen = VM.toScreen(view, 250, 125);
    near(screen.x, 400);
    near(screen.y, 300);
    assert.equal(view.scale, 3);
});

// ---- Two-finger gestures ----------------------------------------------------------------------

const pts = (a, b, c, d) => [{ x: a, y: b }, { x: c, y: d }];

test('two fingers moving together pan without zooming', () => {
    const start = { scale: 2, x: 10, y: 20 };
    const view = VM.gestureView(start, pts(100, 100, 200, 100), pts(130, 160, 230, 160), MIN, MAX);
    near(view.scale, 2);
    near(view.x, 40);
    near(view.y, 80);
});

test('a pinch zooms around the point between the fingers', () => {
    const start = { scale: 1, x: 0, y: 0 };
    const startPoints = pts(300, 300, 500, 300);
    const nowPoints = pts(200, 300, 600, 300); // distance doubled, same midpoint
    const view = VM.gestureView(start, startPoints, nowPoints, MIN, MAX);
    near(view.scale, 2);
    // The world point that was under the midpoint stays under the midpoint.
    const before = VM.toWorld(start, 400, 300);
    const after = VM.toWorld(view, 400, 300);
    near(after.x, before.x);
    near(after.y, before.y);
});

test('a gesture combining pinch and drag keeps each finger on its world point', () => {
    const random = rng(8);
    for (let i = 0; i < 100; i++) {
        const start = { scale: 0.5 + random() * 4, x: (random() - 0.5) * 500, y: (random() - 0.5) * 500 };
        const a = { x: 100 + random() * 300, y: 100 + random() * 300 };
        const b = { x: 500 + random() * 300, y: 100 + random() * 300 };
        // Move both fingers by the same rigid scaling about their midpoint, then translate.
        const k = 0.6 + random() * 1.2;
        const dx = (random() - 0.5) * 200;
        const dy = (random() - 0.5) * 200;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const move = (p) => ({ x: mid.x + (p.x - mid.x) * k + dx, y: mid.y + (p.y - mid.y) * k + dy });
        const a2 = move(a);
        const b2 = move(b);
        const view = VM.gestureView(start, [a, b], [a2, b2], 0.01, 1000);
        const wa = VM.toWorld(start, a.x, a.y);
        const wb = VM.toWorld(start, b.x, b.y);
        const na = VM.toScreen(view, wa.x, wa.y);
        const nb = VM.toScreen(view, wb.x, wb.y);
        near(na.x, a2.x, 'finger A x', 1e-6);
        near(na.y, a2.y, 'finger A y', 1e-6);
        near(nb.x, b2.x, 'finger B x', 1e-6);
        near(nb.y, b2.y, 'finger B y', 1e-6);
    }
});

test('gesture zoom respects the limits', () => {
    const view = VM.gestureView({ scale: 1, x: 0, y: 0 }, pts(100, 100, 110, 100), pts(0, 100, 1000, 100), MIN, MAX);
    assert.equal(view.scale, MAX);
    const small = VM.gestureView({ scale: 1, x: 0, y: 0 }, pts(0, 100, 1000, 100), pts(500, 100, 501, 100), MIN, MAX);
    assert.equal(small.scale, MIN);
});

test('fingers that start on the same spot do not produce NaN', () => {
    const view = VM.gestureView({ scale: 1, x: 0, y: 0 }, pts(50, 50, 50, 50), pts(60, 60, 80, 80), MIN, MAX);
    assert.ok(Number.isFinite(view.scale) && Number.isFinite(view.x) && Number.isFinite(view.y));
});

// ---- Board helpers ----------------------------------------------------------------------------

test('boundsOf, typicalTileSize and scaleForTileSize describe a generated board', () => {
    const config = Checks.makeConfig('rectangle', 'square', 'pointy-top', 'point-up', { width: 10, height: 6 });
    const polygons = Geometry.generateGrid(config, { width: 1200, height: 800 }, null);
    const bounds = VM.boundsOf(polygons);
    const size = VM.typicalTileSize(polygons);
    near(bounds.maxX - bounds.minX, size * 10, 'board width = 10 tiles', 1e-6);
    near(bounds.maxY - bounds.minY, size * 6, 'board height = 6 tiles', 1e-6);
    near(VM.scaleForTileSize(size, 64) * size, 64, 'target tile size', 1e-9);
    assert.equal(VM.boundsOf([]), null);
    assert.equal(VM.typicalTileSize([]), 0);
    assert.equal(VM.scaleForTileSize(0, 64), 1);
});

test('rectsIntersect treats touching rectangles as intersecting and separate ones as not', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    assert.equal(VM.rectsIntersect(a, { minX: 10, minY: 0, maxX: 20, maxY: 10 }), true);
    assert.equal(VM.rectsIntersect(a, { minX: 11, minY: 0, maxX: 20, maxY: 10 }), false);
    assert.equal(VM.rectsIntersect(a, { minX: 2, minY: 2, maxX: 3, maxY: 3 }), true);
});
