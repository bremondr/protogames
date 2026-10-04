'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, GEOMETRY_SCRIPTS, plain } = require('./support/load');

const app = loadApp([...GEOMETRY_SCRIPTS, 'js/viewMath.js', 'js/state.js', 'js/infinite.js']);
const Infinite = app.run('Infinite');
const Geometry = app.context.Geometry;
const AppState = app.run('AppState');
const Config = app.run('Config');
const H = app.context.GeometryHelpers;

const CANVAS = { width: 1200, height: 800 };
const FAMILIES = ['inf_hp', 'inf_hf', 'inf_s', 'inf_t'];
const config = (gridType, orientation = 'pointy-top') => ({ ...Config.DEFAULT_BOARD_CONFIG, boardShape: 'infinite', gridType, orientation });

test('every tile can be rebuilt from its id alone', () => {
    for (const family of FAMILIES) {
        const cells = Infinite.cellsIn(family, { minX: -300, minY: -200, maxX: 300, maxY: 200 });
        assert.ok(cells.length > 20, `${family} has tiles`);
        for (const cell of cells) {
            const again = Infinite.fromId(cell.id);
            assert.ok(again, `${cell.id} is rebuilt`);
            assert.equal(again.id, cell.id);
            assert.deepEqual(plain(again.center), plain(cell.center), `${cell.id} centre`);
            assert.deepEqual(plain(again.vertices), plain(cell.vertices), `${cell.id} vertices`);
        }
    }
});

test('a lattice has no duplicate tiles and covers the rectangle it was asked for', () => {
    const rect = { minX: -250, minY: -180, maxX: 250, maxY: 180 };
    for (const family of FAMILIES) {
        const cells = Infinite.cellsIn(family, rect);
        assert.equal(new Set(cells.map((c) => c.id)).size, cells.length, `${family} ids are unique`);
        // Every corner and the middle of the rectangle lies in some tile.
        for (const [x, y] of [[rect.minX, rect.minY], [rect.maxX, rect.minY], [rect.minX, rect.maxY], [rect.maxX, rect.maxY], [0, 0]]) {
            const hit = cells.some((c) => Geometry.isPointInPolygon({ x, y }, c.vertices));
            assert.ok(hit, `${family} covers (${x}, ${y})`);
        }
    }
});

test('ids that are not infinite-board tiles are refused', () => {
    for (const id of ['hex_0_0', 'inf_x_1_2', 'inf_hp_a_2', 'inf_hp_1', 'inf_t_1_2', 'inf_t_1_2_sideways', 'inf_s_1.5_2', '', 'inf']) {
        assert.equal(Infinite.fromId(id), null, JSON.stringify(id));
    }
    assert.ok(Infinite.fromId('inf_hp_-3_4'), 'negative coordinates are fine');
    assert.ok(Infinite.fromId('inf_t_-1_-2_up'));
});

test('neighbouring tiles of a lattice share edges (no gaps, no overlaps)', () => {
    for (const family of FAMILIES) {
        const cells = Infinite.cellsIn(family, { minX: -150, minY: -120, maxX: 150, maxY: 120 });
        const adjacency = Geometry.buildAdjacency(cells);
        const inner = cells.filter((c) => Math.abs(c.center.x) < 60 && Math.abs(c.center.y) < 50);
        const expected = family === 'inf_t' ? 3 : family === 'inf_s' ? 4 : 6;
        for (const cell of inner) {
            const count = adjacency.neighbors[adjacency.index.get(cell.id)].length;
            assert.equal(count, expected, `${cell.id} has ${expected} neighbours`);
        }
    }
});

test('the grid family follows the tile shape and orientation', () => {
    assert.equal(Infinite.familyFor(config('square')), 'inf_s');
    assert.equal(Infinite.familyFor(config('triangle')), 'inf_t');
    assert.equal(Infinite.familyFor(config('hexagon', 'pointy-top')), 'inf_hp');
    assert.equal(Infinite.familyFor(config('hexagon', 'flat-top')), 'inf_hf');
});

test('generateGrid for an infinite board returns lattice tiles; other boards are untouched', () => {
    const tiles = Geometry.generateGrid(config('hexagon'), CANVAS, null);
    assert.ok(tiles.length > 100);
    assert.ok(tiles.every((t) => t.id.startsWith('inf_hp_')));
    const fixed = Geometry.generateGrid({ ...Config.DEFAULT_BOARD_CONFIG }, CANVAS, null);
    assert.ok(fixed.every((t) => !t.id.startsWith('inf_')));
});

test('paintedTiles keeps what was drawn, and at least one tile so the board type survives', () => {
    const tiles = Geometry.generateGrid(config('square'), CANVAS, null);
    assert.equal(Infinite.paintedTiles(tiles).length, 1);
    tiles[3].color = '#7CB342';
    tiles[7].object = 'castle';
    tiles[9].color = Config.DEFAULT_FILL;
    assert.deepEqual(plain(Infinite.paintedTiles(tiles).map((t) => t.id).sort()), [tiles[3].id, tiles[7].id].sort());
    assert.equal(Infinite.isPainted(tiles[9]), false);
    assert.equal(Infinite.isPainted({ color: Config.DEFAULT_FILL.toUpperCase() }), false, 'colour comparison ignores case');
});

test('infinite mode switches on with the board and keeps painted tiles when the view moves away', () => {
    const state = AppState.getState();
    state.canvas = { width: CANVAS.width, height: CANVAS.height };
    AppState.setPolygons(Geometry.generateGrid(config('hexagon'), state.canvas, null));
    assert.equal(Infinite.isActive(), true);
    state.polygons[0].color = '#7CB342';
    const paintedId = state.polygons[0].id;
    // Pan far away: the loaded tiles change but the painted one is still there.
    AppState.setView({ scale: 1, x: -20000, y: -20000 });
    assert.ok(state.polygons.some((p) => p.id === paintedId && p.color === '#7CB342'), 'painted tile is kept');
    assert.ok(state.polygons.length < 20000, 'only the area around the view is loaded');
    const nearView = state.polygons.filter((p) => p.center.x > 19000);
    assert.ok(nearView.length > 100, 'tiles around the new view are loaded');
});

test('helpers used by the lattice exist', () => {
    assert.equal(typeof H.createPolygon, 'function');
    assert.equal(typeof H.createHexVertices, 'function');
    assert.equal(typeof H.createSquareVertices, 'function');
});

test('an export frames what was drawn, with blank tiles around it, however far it is from the origin', () => {
    const state = AppState.getState();
    state.canvas = { width: CANVAS.width, height: CANVAS.height };
    AppState.setPolygons(Geometry.generateGrid(config('hexagon'), state.canvas, null));
    // Draw two tiles far apart and far from the origin; the loaded tiles move away from them.
    const near = Infinite.fromId('inf_hp_300_-200');
    const far = Infinite.fromId('inf_hp_340_-160');
    near.color = '#7CB342';
    far.object = 'castle';
    state.polygons = state.polygons.concat([near, far]);
    AppState.setView({ scale: 1, x: 0, y: 0 });

    const scene = Infinite.exportScene(CANVAS.width, CANVAS.height);
    const ids = new Set(scene.polygons.map((p) => p.id));
    assert.equal(ids.size, scene.polygons.length, 'no tile twice');
    assert.ok(ids.has(near.id) && ids.has(far.id), 'drawn tiles are included');
    assert.ok(scene.polygons.length > 50, 'blank tiles around the drawing are included');
    assert.ok(scene.polygons.includes(near), 'drawn tiles are the board\'s own tiles, with their colour');
    for (const polygon of [near, far]) {
        const x = polygon.center.x * scene.view.scale + scene.view.x;
        const y = polygon.center.y * scene.view.scale + scene.view.y;
        assert.ok(x > 0 && x < CANVAS.width && y > 0 && y < CANVAS.height, `${polygon.id} lands on the canvas`);
    }
    assert.ok(scene.view.scale <= 2);
});
