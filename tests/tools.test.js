'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, GEOMETRY_SCRIPTS, plain } = require('./support/load');

const app = loadApp([...GEOMETRY_SCRIPTS, 'js/toolOps.js']);
const Geometry = app.context.Geometry;
const Checks = app.context.GeometryChecks;
const Helpers = app.context.GeometryHelpers;
const ToolOps = app.run('ToolOps');
const Config = app.run('Config');

const CANVAS = { width: 1200, height: 800 };
const BLANK = Config.DEFAULT_TILE_COLOR;
const validCombos = () => Checks.allCombinations().filter((c) => c.valid);

/** Fresh tiles + topology (adjacency and locator) for a config, all blank. */
function board(config, canvas = CANVAS) {
    const polygons = Geometry.generateGrid(config, canvas, null);
    return {
        polygons,
        adjacency: Geometry.buildAdjacency(polygons),
        locate: Geometry.buildLocator(polygons).locate
    };
}
const byId = (b, id) => b.polygons[b.adjacency.index.get(id)];
const color = (c) => ({ kind: 'color', color: c });
const eraser = { kind: 'eraser', defaultColor: BLANK };
const object = (o) => ({ kind: 'object', object: o });

// Small deterministic random generator so failures are reproducible.
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

// ---- Locator ------------------------------------------------------------------

test('locator finds the tile at its centre for every combination', () => {
    for (const combo of validCombos()) {
        const b = board(combo.config);
        for (const p of b.polygons) {
            const hit = b.locate(p.center);
            assert.ok(hit && hit.id === p.id, `${combo.key}: ${p.id}`);
        }
    }
});

test('locator agrees with findPolygonAtPoint at random points, including outside the board', () => {
    const random = rng(7);
    for (const combo of validCombos()) {
        const b = board(combo.config);
        for (let i = 0; i < 400; i++) {
            const point = { x: random() * CANVAS.width, y: random() * CANVAS.height };
            const expected = Helpers.findPolygonAtPoint(point, b.polygons);
            const actual = b.locate(point);
            assert.equal(actual ? actual.id : null, expected ? expected.id : null, `${combo.key} @ ${point.x.toFixed(1)},${point.y.toFixed(1)}`);
        }
    }
});

test('locator on an empty board finds nothing', () => {
    assert.equal(Geometry.buildLocator([]).locate({ x: 1, y: 1 }), null);
});

// ---- Fill ---------------------------------------------------------------------------

test('fill on a blank board paints exactly the connected component, on every combination', () => {
    for (const combo of validCombos()) {
        const b = board(combo.config);
        const start = b.polygons[0];
        const component = Geometry.floodFill(b.adjacency, start.id, () => true);
        const ids = ToolOps.planFill(b.polygons, b.adjacency, start.id, color('#ff0000'));
        assert.equal(new Set(ids).size, ids.length, `${combo.key}: duplicate ids in plan`);
        assert.deepEqual(plain(ids.slice().sort()), plain(component.slice().sort()), combo.key);
        ToolOps.applyToTiles(b.polygons, b.adjacency, ids, color('#ff0000'));
        for (const id of component) assert.equal(byId(b, id).color, '#ff0000', `${combo.key}: ${id}`);
    }
});

test('fill never leaves the board and never touches tiles outside the region', () => {
    for (const combo of validCombos()) {
        const b = board(combo.config);
        const known = new Set(b.polygons.map((p) => p.id));
        const ids = ToolOps.planFill(b.polygons, b.adjacency, b.polygons[b.polygons.length - 1].id, color('#00ff00'));
        assert.ok(ids.every((id) => known.has(id)), combo.key);
    }
});

test('fill stops at tiles of a different colour (a wall) on every combination', () => {
    for (const combo of validCombos()) {
        const b = board(combo.config);
        if (b.polygons.length < 15) continue;
        // Paint a ring: tiles exactly two steps from a middle tile become the wall.
        const middle = b.polygons.reduce((best, p) => (Math.hypot(p.center.x - 600, p.center.y - 400) < Math.hypot(best.center.x - 600, best.center.y - 400) ? p : best));
        const inside = new Set(Geometry.neighborhood(b.adjacency, middle.id, 1));
        const within2 = new Set(Geometry.neighborhood(b.adjacency, middle.id, 2));
        const wall = [...within2].filter((id) => !inside.has(id));
        ToolOps.applyToTiles(b.polygons, b.adjacency, wall, color('#222222'));

        const planned = ToolOps.planFill(b.polygons, b.adjacency, middle.id, color('#abcdef'));
        assert.deepEqual(plain(planned.slice().sort()), plain([...inside].sort()), `${combo.key}: inside the wall`);

        const far = b.polygons.find((p) => !within2.has(p.id));
        if (!far) continue;
        const outside = ToolOps.planFill(b.polygons, b.adjacency, far.id, color('#abcdef'));
        assert.ok(outside.every((id) => !within2.has(id)), `${combo.key}: outside fill must not cross the wall`);
        assert.ok(outside.length > 0, combo.key);
    }
});

test('fill with the colour a region already has does nothing', () => {
    const b = board(Checks.makeConfig('rectangle', 'square', 'pointy-top', 'point-up', { width: 5, height: 5 }));
    const start = b.polygons[0];
    assert.deepEqual(plain(ToolOps.planFill(b.polygons, b.adjacency, start.id, color(BLANK))), []);
    assert.deepEqual(plain(ToolOps.planFill(b.polygons, b.adjacency, start.id, color(BLANK.toUpperCase()))), [], 'compares colours case-insensitively');
});

test('fill ignores unknown tiles', () => {
    const b = board(Checks.makeConfig('square', 'square', 'pointy-top', 'point-up', { size: 3 }));
    assert.deepEqual(plain(ToolOps.planFill(b.polygons, b.adjacency, 'nope', color('#fff000'))), []);
});

test('the eraser fill resets a coloured region to blank and removes its objects', () => {
    const b = board(Checks.makeConfig('rectangle', 'hexagon', 'pointy-top', 'point-up', { width: 6, height: 5 }));
    const left = b.polygons.filter((p) => p.center.x < 600).map((p) => p.id);
    ToolOps.applyToTiles(b.polygons, b.adjacency, left, color('#336699'));
    ToolOps.applyToTiles(b.polygons, b.adjacency, left.slice(0, 3), object('castle'));

    const ids = ToolOps.planFill(b.polygons, b.adjacency, left[0], eraser);
    assert.equal(ids.length, left.length);
    ToolOps.applyToTiles(b.polygons, b.adjacency, ids, eraser);
    for (const id of left) {
        assert.equal(byId(b, id).color, BLANK);
        assert.equal(byId(b, id).object, undefined);
    }
    // Erasing again has nothing left to do.
    assert.deepEqual(plain(ToolOps.planFill(b.polygons, b.adjacency, left[0], eraser)), []);
});

test('the object fill covers the connected tiles that share the start tile\'s object', () => {
    const b = board(Checks.makeConfig('square', 'square', 'pointy-top', 'point-up', { size: 4 }));
    const first = b.polygons[0].id;
    ToolOps.applyToTiles(b.polygons, b.adjacency, [first], object('tower'));
    // Filling from a tile without an object spreads over every tile without one, skipping the tower.
    const ids = ToolOps.planFill(b.polygons, b.adjacency, b.polygons[5].id, object('camp'));
    assert.equal(ids.length, b.polygons.length - 1);
    assert.ok(!ids.includes(first));
    ToolOps.applyToTiles(b.polygons, b.adjacency, ids, object('camp'));
    assert.equal(byId(b, first).object, 'tower');
    assert.equal(b.polygons.filter((p) => p.object === 'camp').length, b.polygons.length - 1);
});

test('fill is fast on a 100 x 100 board', () => {
    for (const gridType of ['square', 'hexagon']) {
        const config = Checks.makeConfig('rectangle', gridType, 'pointy-top', 'point-up', { width: 100, height: 100 });
        const t0 = process.hrtime.bigint();
        const b = board(config, { width: 3000, height: 3000 });
        const t1 = process.hrtime.bigint();
        assert.equal(b.polygons.length, 10000);
        const ids = ToolOps.planFill(b.polygons, b.adjacency, b.polygons[0].id, color('#123456'));
        const changed = ToolOps.applyToTiles(b.polygons, b.adjacency, ids, color('#123456'));
        const t2 = process.hrtime.bigint();
        assert.equal(changed, 10000);
        const setupMs = Number(t1 - t0) / 1e6;
        const fillMs = Number(t2 - t1) / 1e6;
        // Generous limits so CI noise cannot fail the build, yet far below "frozen UI" territory.
        assert.ok(fillMs < 500, `${gridType}: fill took ${fillMs.toFixed(0)} ms`);
        assert.ok(setupMs < 5000, `${gridType}: setup took ${setupMs.toFixed(0)} ms`);
    }
});

// ---- Line ---------------------------------------------------------------------------

function pathFor(b, fromId, toId) {
    return Geometry.linePath(b.polygons, b.adjacency, fromId, toId, b.locate);
}

function distanceToSegment(p, a, c) {
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const length2 = dx * dx + dy * dy;
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

test('line paths are gap-free, start and end on the right tiles and visit each tile once', () => {
    const random = rng(42);
    for (const combo of validCombos()) {
        const b = board(combo.config);
        const n = b.polygons.length;
        for (let i = 0; i < 40; i++) {
            const from = b.polygons[Math.floor(random() * n)];
            const to = b.polygons[Math.floor(random() * n)];
            const path = pathFor(b, from.id, to.id);
            const label = `${combo.key}: ${from.id} -> ${to.id}`;
            assert.equal(path[0], from.id, label);
            assert.equal(path[path.length - 1], to.id, label);
            assert.equal(new Set(path).size, path.length, `${label}: repeated tile`);
            for (let k = 1; k < path.length; k++) {
                const a = b.adjacency.index.get(path[k - 1]);
                const c = b.adjacency.index.get(path[k]);
                assert.ok(b.adjacency.neighbors[a].includes(c), `${label}: gap between ${path[k - 1]} and ${path[k]}`);
            }
        }
    }
});

test('line paths follow the straight line between tile centres', () => {
    const random = rng(99);
    for (const combo of validCombos()) {
        const b = board(combo.config);
        const n = b.polygons.length;
        for (let i = 0; i < 30; i++) {
            const from = b.polygons[Math.floor(random() * n)];
            const to = b.polygons[Math.floor(random() * n)];
            const size = Math.max(from.bounds.maxX - from.bounds.minX, from.bounds.maxY - from.bounds.minY);
            for (const id of pathFor(b, from.id, to.id)) {
                const tile = byId(b, id);
                assert.ok(
                    distanceToSegment(tile.center, from.center, to.center) <= size * 1.6,
                    `${combo.key}: ${id} strays from ${from.id} -> ${to.id}`
                );
            }
        }
    }
});

test('a line to the same tile is just that tile, and an unknown tile yields nothing', () => {
    const b = board(Checks.makeConfig('square', 'hexagon', 'pointy-top', 'point-up', { size: 5 }));
    const id = b.polygons[3].id;
    assert.deepEqual(plain(pathFor(b, id, id)), [id]);
    assert.deepEqual(plain(pathFor(b, id, 'nope')), []);
});

test('hexagon tile lines are as short as the shortest path (no wasted tiles)', () => {
    for (const orientation of ['pointy-top', 'flat-top']) {
        const b = board(Checks.makeConfig('hexagon', 'hexagon', orientation, 'point-up', { radius: 6 }));
        const random = rng(5);
        for (let i = 0; i < 40; i++) {
            const from = b.polygons[Math.floor(random() * b.polygons.length)];
            const to = b.polygons[Math.floor(random() * b.polygons.length)];
            const path = pathFor(b, from.id, to.id);
            const shortest = Geometry.shortestPath(b.adjacency, from.id, to.id);
            assert.equal(path.length, shortest.length, `${orientation}: ${from.id} -> ${to.id}`);
        }
    }
});

test('a straight square-grid line is an exact straight run', () => {
    const b = board(Checks.makeConfig('rectangle', 'square', 'pointy-top', 'point-up', { width: 9, height: 4 }));
    const path = pathFor(b, 'square_1_0', 'square_1_8');
    assert.deepEqual(plain(path), Array.from({ length: 9 }, (_, c) => `square_1_${c}`));
});

test('planLine skips tiles that already look right and apply paints the rest once', () => {
    const b = board(Checks.makeConfig('rectangle', 'square', 'pointy-top', 'point-up', { width: 6, height: 3 }));
    ToolOps.applyToTiles(b.polygons, b.adjacency, ['square_0_2'], color('#ff0000'));
    const ids = ToolOps.planLine(b.polygons, b.adjacency, b.locate, 'square_0_0', 'square_0_5', color('#ff0000'));
    assert.deepEqual(plain(ids), ['square_0_0', 'square_0_1', 'square_0_3', 'square_0_4', 'square_0_5']);
    assert.equal(ToolOps.applyToTiles(b.polygons, b.adjacency, ids, color('#ff0000')), 5);
    assert.equal(ToolOps.applyToTiles(b.polygons, b.adjacency, ids, color('#ff0000')), 0, 'second application changes nothing');
});

test('the eraser line clears colour and objects along the path', () => {
    const b = board(Checks.makeConfig('rectangle', 'square', 'pointy-top', 'point-up', { width: 5, height: 2 }));
    const all = b.polygons.map((p) => p.id);
    ToolOps.applyToTiles(b.polygons, b.adjacency, all, color('#778899'));
    ToolOps.applyToTiles(b.polygons, b.adjacency, ['square_0_1'], object('castle'));
    const ids = ToolOps.planLine(b.polygons, b.adjacency, b.locate, 'square_0_0', 'square_0_4', eraser);
    ToolOps.applyToTiles(b.polygons, b.adjacency, ids, eraser);
    for (let c = 0; c < 5; c++) {
        assert.equal(byId(b, `square_0_${c}`).color, BLANK);
        assert.equal(byId(b, `square_0_${c}`).object, undefined);
        assert.equal(byId(b, `square_1_${c}`).color, '#778899', 'the other row is untouched');
    }
});

test('lines on a 100 x 100 board compute quickly', () => {
    for (const gridType of ['square', 'hexagon', 'triangle']) {
        const config = Checks.makeConfig('rectangle', gridType, 'pointy-top', 'point-up', { width: 100, height: 100 });
        const b = board(config, { width: 3000, height: 3000 });
        const first = b.polygons[0];
        const last = b.polygons[b.polygons.length - 1];
        const t0 = process.hrtime.bigint();
        const path = pathFor(b, first.id, last.id);
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        assert.ok(path.length > 90, `${gridType}: suspiciously short path (${path.length})`);
        assert.ok(ms < 500, `${gridType}: line took ${ms.toFixed(0)} ms`);
    }
});

// ---- Paint source ---------------------------------------------------------------------

test('sourceFromState picks object over eraser over colour', () => {
    const state = { isObjectToolActive: false, isEraserActive: false, currentColor: '#111111', currentObject: 'castle' };
    assert.deepEqual(plain(ToolOps.sourceFromState(state, BLANK)), { kind: 'color', color: '#111111' });
    assert.deepEqual(plain(ToolOps.sourceFromState({ ...state, isEraserActive: true }, BLANK)), { kind: 'eraser', defaultColor: BLANK });
    assert.deepEqual(plain(ToolOps.sourceFromState({ ...state, isEraserActive: true, isObjectToolActive: true }, BLANK)), { kind: 'object', object: 'castle' });
});

// ---- Brush size -------------------------------------------------------------------------

test('brush footprints grow ring by ring: hexagon 1, 7, 19, 37 and square 1, 5, 13, 25', () => {
    const hex = board(Checks.makeConfig('hexagon', 'hexagon', 'pointy-top', 'point-up', { radius: 6 }));
    const centerHex = hex.polygons.reduce((best, p) => (Math.hypot(p.center.x - 600, p.center.y - 400) < Math.hypot(best.center.x - 600, best.center.y - 400) ? p : best));
    assert.deepEqual([1, 2, 3, 4].map((size) => ToolOps.brushTiles(hex.adjacency, centerHex.id, size).length), [1, 7, 19, 37]);

    const square = board(Checks.makeConfig('rectangle', 'square', 'pointy-top', 'point-up', { width: 11, height: 11 }));
    const centerSquare = 'square_5_5';
    assert.deepEqual([1, 2, 3, 4].map((size) => ToolOps.brushTiles(square.adjacency, centerSquare, size).length), [1, 5, 13, 25]);
});

test('a brush near the board edge is clipped to the board, and size 1 or an unknown tile is handled', () => {
    const square = board(Checks.makeConfig('rectangle', 'square', 'pointy-top', 'point-up', { width: 6, height: 6 }));
    const corner = ToolOps.brushTiles(square.adjacency, 'square_0_0', 3);
    assert.equal(corner.length, 6, 'a corner tile reaches 1 + 2 + 3 tiles');
    assert.ok(corner.every((id) => square.adjacency.index.has(id)));
    assert.deepEqual(plain(ToolOps.brushTiles(square.adjacency, 'square_2_2', 1)), ['square_2_2']);
    assert.deepEqual(plain(ToolOps.brushTiles(square.adjacency, 'square_2_2', 0)), ['square_2_2']);
    assert.deepEqual(plain(ToolOps.brushTiles(square.adjacency, 'nope', 3)), []);
    assert.deepEqual(plain(ToolOps.brushTiles(square.adjacency, 'nope', 1)), []);
});

test('brush footprints contain the centre, stay on the board and are connected on every combination', () => {
    for (const combo of validCombos()) {
        const b = board(combo.config);
        const centre = b.polygons[Math.floor(b.polygons.length / 2)];
        for (const size of [2, 3, 5]) {
            const tiles = ToolOps.brushTiles(b.adjacency, centre.id, size);
            assert.ok(tiles.includes(centre.id), `${combo.key} size ${size}`);
            assert.equal(new Set(tiles).size, tiles.length);
            const reached = Geometry.floodFill(b.adjacency, centre.id, (i) => tiles.includes(b.adjacency.ids[i]));
            assert.equal(reached.length, tiles.length, `${combo.key} size ${size}: footprint must be connected`);
        }
    }
});

test('painting a footprint changes exactly those tiles', () => {
    const b = board(Checks.makeConfig('rectangle', 'hexagon', 'pointy-top', 'point-up', { width: 9, height: 9 }));
    const centre = b.polygons[40].id;
    const tiles = ToolOps.brushTiles(b.adjacency, centre, 3);
    assert.equal(ToolOps.applyToTiles(b.polygons, b.adjacency, tiles, color('#c0ffee')), tiles.length);
    assert.equal(b.polygons.filter((p) => p.color === '#c0ffee').length, tiles.length);
});

// ---- Which tool, mode and size apply ----------------------------------------------------

test('the eraser and the object tool ignore the fill and line draw modes', () => {
    const base = { drawMode: 'fill', brushSize: 3, isEraserActive: false, isObjectToolActive: false };
    assert.equal(ToolOps.effectiveMode(base), 'fill');
    assert.equal(ToolOps.effectiveMode({ ...base, drawMode: 'line' }), 'line');
    assert.equal(ToolOps.effectiveMode({ ...base, isEraserActive: true }), 'brush');
    assert.equal(ToolOps.effectiveMode({ ...base, isObjectToolActive: true }), 'brush');
    assert.equal(ToolOps.effectiveMode({ ...base, isObjectToolActive: true, isEraserActive: true }), 'brush');
});

test('the eraser uses its own size, an object is always one tile, the brush keeps its size', () => {
    const base = { drawMode: 'brush', brushSize: 3, isEraserActive: false, isObjectToolActive: false };
    assert.equal(ToolOps.activeTool(base), 'brush');
    assert.equal(ToolOps.effectiveSize(base, 5), 3);
    assert.equal(ToolOps.activeTool({ ...base, isEraserActive: true }), 'eraser');
    assert.equal(ToolOps.effectiveSize({ ...base, isEraserActive: true }, 5), 5);
    assert.equal(ToolOps.activeTool({ ...base, isObjectToolActive: true }), 'object');
    assert.equal(ToolOps.effectiveSize({ ...base, isObjectToolActive: true }, 5), 1);
});

test('strokePoints fills in the path between two far apart pointer positions', () => {
    const points = plain(ToolOps.strokePoints({ x: 0, y: 0 }, [{ x: 100, y: 0 }], 25));
    assert.deepEqual(points, [{ x: 25, y: 0 }, { x: 50, y: 0 }, { x: 75, y: 0 }, { x: 100, y: 0 }]);
    for (let i = 1; i < points.length; i++) assert.ok(points[i].x - points[i - 1].x <= 25 + 1e-9);
});

test('strokePoints follows every coalesced position and keeps short moves as they are', () => {
    const targets = [{ x: 10, y: 0 }, { x: 10, y: 40 }];
    assert.deepEqual(plain(ToolOps.strokePoints({ x: 0, y: 0 }, targets, 50)), targets);
    assert.deepEqual(plain(ToolOps.strokePoints({ x: 0, y: 0 }, targets, 20)).slice(-1), [{ x: 10, y: 40 }]);
    assert.equal(ToolOps.strokePoints({ x: 0, y: 0 }, targets, 20).length, 1 + 2);
});

test('strokePoints copes with no start, a zero step and a huge jump', () => {
    assert.deepEqual(plain(ToolOps.strokePoints(null, [{ x: 5, y: 5 }], 10)), [{ x: 5, y: 5 }]);
    assert.deepEqual(plain(ToolOps.strokePoints({ x: 0, y: 0 }, [{ x: 5, y: 5 }], 0)), [{ x: 5, y: 5 }]);
    assert.ok(ToolOps.strokePoints({ x: 0, y: 0 }, [{ x: 1e9, y: 0 }], 1).length <= 200);
});
