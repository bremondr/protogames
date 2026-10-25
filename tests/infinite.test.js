'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, GEOMETRY_SCRIPTS, plain } = require('./support/load');

const app = loadApp([...GEOMETRY_SCRIPTS, 'app/js/viewMath.js', 'app/js/state.js', 'app/js/infinite.js']);
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
    assert.ok(Infinite.fromId('inf_s_0_0'));
});

test('ids that are not in canonical form are refused instead of being renamed', () => {
    for (const id of ['inf_s_01_2', 'inf_s_1_02', 'inf_s_1e1_2', 'inf_s_0x10_2', 'inf_s_-0_2', 'inf_s_+1_2', 'inf_s__2', 'inf_s_ 1_2', 'inf_s_1_2_extra_', 'inf_hp_1e400_2']) {
        assert.equal(Infinite.fromId(id), null, JSON.stringify(id));
    }
    for (const id of ['inf_s_0_0', 'inf_s_-12_340', 'inf_hf_5_-6', 'inf_t_7_8_down']) assert.equal(Infinite.fromId(id)?.id, id);
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

test('an export of tiles drawn very far apart falls back to the drawn tiles without building the area between them', () => {
    const state = AppState.getState();
    state.canvas = { width: CANVAS.width, height: CANVAS.height };
    for (const gridType of ['hexagon', 'square', 'triangle']) {
        AppState.setPolygons(Geometry.generateGrid(config(gridType), state.canvas, null));
        const a = Infinite.fromId(gridType === 'hexagon' ? 'inf_hp_0_0' : gridType === 'square' ? 'inf_s_0_0' : 'inf_t_0_0_up');
        const b = Infinite.fromId(gridType === 'hexagon' ? 'inf_hp_900000_900000' : gridType === 'square' ? 'inf_s_900000_900000' : 'inf_t_900000_900000_up');
        a.color = '#7CB342';
        b.color = '#E53935';
        state.polygons = state.polygons.concat([a, b]);
        // The area between them holds around 10^11 tiles; building it would never finish (or run out of memory).
        const started = Date.now();
        const scene = Infinite.exportScene(CANVAS.width, CANVAS.height);
        assert.ok(Date.now() - started < 2000, `${gridType} export is quick`);
        assert.deepEqual(plain(scene.polygons.map((p) => p.id).sort()), [a.id, b.id].sort());
    }
});

test('a tile with a start marker counts as drawn, so it is saved and kept when the view moves', () => {
    const tiles = Infinite.cellsIn('inf_s', { minX: 0, minY: 0, maxX: 200, maxY: 200 });
    const marked = tiles[3];
    assert.equal(Infinite.isPainted(marked), false);
    marked.start = '#c62828';
    assert.equal(Infinite.isPainted(marked), true);
    assert.deepEqual(plain(Infinite.paintedTiles(tiles).map((t) => t.id)), [marked.id]);
});

// ---- Hostile input (audit H1): none of these may loop or allocate without end -------------------------

test('tile ids beyond the lattice bound are refused', () => {
    for (const id of ['inf_s_9007199254740991_0', 'inf_s_0_-9007199254740991', 'inf_hp_1000000001_0', 'inf_t_0_1000000001_up', 'inf_hf_-1000000001_5']) {
        assert.equal(Infinite.fromId(id), null, id);
    }
    assert.ok(Infinite.fromId('inf_s_1000000000_-1000000000'), 'the bound itself is allowed');
    assert.ok(Infinite.fromId('inf_s_10000000_10000000'), 'far-away tiles of a legitimate board load');
});

test('lattice scans of non-finite or huge rectangles build nothing and return at once', () => {
    const huge = 1e18;
    const rects = [
        { minX: -huge, minY: -huge, maxX: huge, maxY: huge },
        { minX: 0, minY: 0, maxX: Infinity, maxY: 10 },
        { minX: NaN, minY: 0, maxX: 10, maxY: 10 },
        { minX: 1e17, minY: 1e17, maxX: 1e17 + 100, maxY: 1e17 + 100 },
        { minX: 0, minY: 0, maxX: 1e8, maxY: 1e8 }
    ];
    for (const family of FAMILIES) {
        for (const rect of rects) assert.equal(Infinite.cellsIn(family, rect).length, 0, `${family} ${JSON.stringify(rect)}`);
    }
});

test('a tile at the edge of the double lattice or a view at 1e300 does not hang the board', () => {
    const state = AppState.getState();
    state.canvas = { width: CANVAS.width, height: CANVAS.height };
    AppState.setPolygons(Geometry.generateGrid(config('square'), state.canvas, null));
    const far = Infinite.fromId('inf_s_1000000000_0');
    far.color = '#ff0000';
    AppState.setPolygons([far]);
    AppState.resetView();
    assert.ok(state.polygons.some((p) => p.id === far.id));
    for (const view of [{ scale: 1, x: 1e300, y: 0 }, { scale: 1, x: NaN, y: 0 }, { scale: 0.4, x: -1e18, y: -1e18 }]) {
        AppState.setView(view);
        assert.ok(state.polygons.length < 100000);
    }
});

test('a painted tile stored at 1e18 gives a finite view instead of looping', () => {
    const state = AppState.getState();
    state.canvas = { width: CANVAS.width, height: CANVAS.height };
    AppState.setPolygons(Geometry.generateGrid(config('square'), state.canvas, null));
    const tile = Infinite.fromId('inf_s_0_0');
    const R = 1e18;
    tile.color = '#ff0000';
    tile.center = { x: R, y: R };
    tile.vertices = [{ x: R, y: R }, { x: R + 56, y: R }, { x: R + 56, y: R + 56 }, { x: R, y: R + 56 }];
    tile.bounds = { minX: R, maxX: R + 56, minY: R, maxY: R + 56 };
    AppState.setPolygons([tile]);
    AppState.resetView();
    assert.ok(state.polygons.length < 100000);
});

// ---- Empty board export (audit L1) -----------------------------------------------------------------

test('empty infinite board, large canvas: the export still has tiles and a view', () => {
    const state = AppState.getState();
    const cases = [['triangle', 3840, 2160], ['square', 5120, 2880], ['hexagon', 5120, 2880]];
    for (const [gridType, w, h] of cases) {
        state.canvas = { width: w, height: h };
        AppState.setPolygons(Geometry.generateGrid(config(gridType), state.canvas, null));
        AppState.setView({ scale: 0.4, x: 0, y: 0 });
        const scene = Infinite.exportScene(1000, 800);
        assert.ok(scene.polygons.length > 0, `${gridType} exports tiles`);
        assert.ok(scene.bounds && Number.isFinite(scene.view.scale) && scene.view.scale > 0, `${gridType} has a view`);
    }
});

// ---- Undo across loaded tiles (audit M1) ------------------------------------------------------------

test('undo un-paints tiles that were loaded after the snapshot, with their objects and start markers', () => {
    const state = AppState.getState();
    state.canvas = { width: CANVAS.width, height: CANVAS.height };
    AppState.setPolygons(Geometry.generateGrid(config('square'), state.canvas, null));
    AppState.resetHistory();
    AppState.recordHistory(); // the blank board
    AppState.setView({ scale: 1, x: -30000, y: -30000 }); // loads tiles the snapshot has never seen
    const fresh = state.polygons.filter((p) => p.center.x > 29000 && p.center.y > 29000);
    assert.ok(fresh.length > 10);
    fresh[0].color = '#7CB342';
    fresh[1].object = 'tree';
    fresh[2].start = '#c62828';
    fresh[3].color = '#E53935';
    AppState.recordHistory();
    const painted = fresh.slice(0, 4).map((p) => p.id);

    AppState.restoreSnapshot(AppState.undo());
    const after = new Map(state.polygons.map((p) => [p.id, p]));
    for (const id of painted) {
        const p = after.get(id);
        assert.ok(p, `${id} is still loaded`);
        assert.equal(Infinite.isPainted(p), false, `${id} is blank again`);
        assert.equal(String(p.color).toLowerCase(), String(Config.DEFAULT_FILL).toLowerCase());
        assert.equal(p.object, undefined);
        assert.equal(p.start, undefined);
    }
    AppState.restoreSnapshot(AppState.redo());
    const redone = new Map(state.polygons.map((p) => [p.id, p]));
    assert.equal(redone.get(painted[0]).color, '#7CB342');
    assert.equal(redone.get(painted[1]).object, 'tree');
    assert.equal(redone.get(painted[2]).start, '#c62828');
});
