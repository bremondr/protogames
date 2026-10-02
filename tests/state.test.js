'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, GEOMETRY_SCRIPTS, plain } = require('./support/load');

function fresh() {
    const app = loadApp([...GEOMETRY_SCRIPTS, 'js/viewMath.js', 'js/state.js']);
    return { AppState: app.run('AppState'), Config: app.run('Config'), Geometry: app.context.Geometry, Checks: app.context.GeometryChecks };
}

const tiles = (env, sizes) =>
    env.Geometry.generateGrid(env.Checks.makeConfig('rectangle', 'square', 'pointy-top', 'point-up', sizes || { width: 4, height: 3 }), { width: 800, height: 600 }, null);

test('brush size is rounded and clamped to the allowed range', () => {
    const { AppState, Config } = fresh();
    assert.equal(AppState.getState().brushSize, 1);
    assert.equal(AppState.setBrushSize(3), 3);
    assert.equal(AppState.setBrushSize(2.6), 3);
    assert.equal(AppState.setBrushSize(0), Config.BRUSH_SIZE_MIN);
    assert.equal(AppState.setBrushSize(-5), Config.BRUSH_SIZE_MIN);
    assert.equal(AppState.setBrushSize(99), Config.BRUSH_SIZE_MAX);
    assert.equal(AppState.setBrushSize('4'), 4);
    assert.equal(AppState.setBrushSize(NaN), 4, 'garbage keeps the current size');
    assert.equal(AppState.setBrushSize(undefined), 4);
});

test('draw mode accepts brush, fill and line only, and leaving a line drops its preview', () => {
    const { AppState } = fresh();
    assert.equal(AppState.getState().drawMode, 'brush');
    AppState.setDrawMode('fill');
    assert.equal(AppState.getState().drawMode, 'fill');
    AppState.setDrawMode('nonsense');
    assert.equal(AppState.getState().drawMode, 'fill', 'invalid modes are ignored');
    AppState.setDrawMode('line');
    AppState.setLineStart('a');
    AppState.setLinePreview(['a', 'b']);
    assert.deepEqual(plain(AppState.getState().linePreviewIds), ['a', 'b']);
    AppState.setDrawMode('brush');
    assert.equal(AppState.getState().lineStartId, null);
    assert.deepEqual(plain(AppState.getState().linePreviewIds), []);
});

test('hover tracks the pointer tile and its brush footprint', () => {
    const { AppState } = fresh();
    AppState.setHoverPolygonId('a');
    assert.deepEqual(plain(AppState.getState().hoverIds), ['a']);
    AppState.setHoverPolygonId('a', ['a', 'b', 'c']);
    assert.deepEqual(plain(AppState.getState().hoverIds), ['a', 'b', 'c']);
    AppState.setHoverPolygonId(null);
    assert.deepEqual(plain(AppState.getState().hoverIds), []);
});

test('setting a new board resets the hover, the line preview and the view', () => {
    const env = fresh();
    const { AppState } = env;
    AppState.setView({ scale: 5, x: -300, y: -200 });
    AppState.setHoverPolygonId('x', ['x', 'y']);
    AppState.setLineStart('x');
    AppState.setPolygons(tiles(env));
    const state = AppState.getState();
    assert.deepEqual(plain(state.view), { scale: 1, x: 0, y: 0 });
    assert.equal(state.hoverPolygonId, null);
    assert.deepEqual(plain(state.hoverIds), []);
    assert.equal(state.lineStartId, null);
});

test('setView stores a copy so later edits to the argument cannot change the state', () => {
    const { AppState } = fresh();
    const view = { scale: 2, x: 10, y: 20 };
    AppState.setView(view);
    view.scale = 99;
    assert.equal(AppState.getState().view.scale, 2);
    AppState.resetView();
    assert.deepEqual(plain(AppState.getState().view), { scale: 1, x: 0, y: 0 });
});

test('the topology is built once per board and rebuilt for a new board', () => {
    const env = fresh();
    const { AppState } = env;
    AppState.setPolygons(tiles(env));
    const first = AppState.getTopology();
    assert.equal(AppState.getTopology(), first, 'cached for the same board');
    assert.equal(first.adjacency.ids.length, 12);
    AppState.getState().polygons[0].color = '#123456';
    assert.equal(AppState.getTopology(), first, 'colour changes do not invalidate it');
    AppState.setPolygons(tiles(env, { width: 5, height: 5 }));
    const second = AppState.getTopology();
    assert.notEqual(second, first);
    assert.equal(second.adjacency.ids.length, 25);
    assert.deepEqual(plain(second.adjacency.ids), plain(AppState.getState().polygons.map((p) => p.id)), 'tile order matches the board');
    const centre = AppState.getState().polygons[12].center;
    assert.equal(second.locate(centre).id, AppState.getState().polygons[12].id);
});

test('undo/redo snapshots keep colours and objects, and restoring them deletes stale objects', () => {
    const env = fresh();
    const { AppState } = env;
    AppState.setPolygons(tiles(env));
    AppState.recordHistory();
    const polygons = AppState.getState().polygons;
    polygons[0].color = '#111111';
    polygons[1].object = 'castle';
    AppState.recordHistory();
    const back = AppState.undo();
    AppState.restoreSnapshot(back);
    assert.equal(polygons[0].color, '#ffffff');
    assert.equal(polygons[1].object, undefined);
    AppState.restoreSnapshot(AppState.redo());
    assert.equal(polygons[0].color, '#111111');
    assert.equal(polygons[1].object, 'castle');
});
