'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, GEOMETRY_SCRIPTS } = require('./support/load');

const app = loadApp([...GEOMETRY_SCRIPTS, 'app/js/viewMath.js', 'app/js/state.js', 'app/js/textureUtils.js', 'app/js/textures.js']);
const Textures = app.run('Textures');
const AppState = app.run('AppState');
const ViewMath = app.run('ViewMath');
const Geometry = app.context.Geometry;
const Config = app.run('Config');

const CANVAS = { width: 1200, height: 800 };

function useBoard(overrides) {
    const config = { ...Config.DEFAULT_BOARD_CONFIG, ...overrides };
    AppState.getState().canvas = CANVAS;
    const polygons = Geometry.generateGrid(config, CANVAS, null);
    AppState.setPolygons(polygons);
    return AppState.getState().polygons;
}

test('without a board textures are drawn 1:1', () => {
    AppState.getState().polygons = [];
    assert.equal(Textures.patternScale(), 1);
});

test('textures scale with the typical tile size, 1:1 at REF_TILE_PX', () => {
    const polygons = useBoard({ boardShape: 'hexagon', radius: 3, width: 7, height: 7 });
    const size = ViewMath.typicalTileSize(polygons);
    assert.ok(Math.abs(Textures.patternScale() - Math.round((size / Textures.REF_TILE_PX) * 1000) / 1000) < 1e-9);
    assert.equal(Textures.REF_TILE_PX, 80);
});

test('a bigger board has smaller tiles, so its textures shrink with them', () => {
    useBoard({ boardShape: 'hexagon', radius: 2, width: 5, height: 5 });
    const few = Textures.patternScale();
    useBoard({ boardShape: 'hexagon', radius: 10, width: 21, height: 21 });
    const many = Textures.patternScale();
    assert.ok(many < few, `${many} < ${few}`);
    assert.ok(many > 0);
});

test('the scale is worked out once per tile list, not on every redraw', () => {
    const polygons = useBoard({ boardShape: 'hexagon', radius: 4, width: 9, height: 9 });
    const first = Textures.patternScale();
    // Changing the tiles in place (a repaint) leaves the cached value alone: same array, same answer.
    polygons.forEach((p) => { p.color = '#7CB342'; });
    assert.equal(Textures.patternScale(), first);
    // A new board is a new array and gets its own scale.
    useBoard({ boardShape: 'hexagon', radius: 2, width: 5, height: 5 });
    assert.notEqual(Textures.patternScale(), first);
});
