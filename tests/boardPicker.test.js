'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, GEOMETRY_SCRIPTS, plain } = require('./support/load');

const app = loadApp([...GEOMETRY_SCRIPTS, 'app/js/boardPicker.js']);
const { Geometry, GeometryChecks: Checks } = app.context;
const Picker = app.run('BoardPicker');
const CANVAS = { width: 1200, height: 800 };

/** Tiles per layer, counted from the middle by shared corners (the independent check of the generator). */
const layerSizes = (polygons) => {
    const layers = plain(Picker.layersOf(polygons));
    const sizes = [];
    for (const layer of layers) sizes[layer] = (sizes[layer] || 0) + 1;
    return sizes;
};
const board = (tile, center, layers, extra = {}) => {
    const shape = extra.shape || 'hexagon';
    const radius = tile === 'triangle' ? layers : layers - 1;
    const config = Checks.makeConfig(shape, tile, extra.orientation || 'pointy-top', extra.triangleOrientation || 'point-up', { radius, center });
    return Geometry.generateGrid(config, CANVAS, null);
};

// ---- The layers of a board built from the middle ---------------------------------------------------------------------

test('hexagon tiles grow in rings of 6, 12, 18 around a tile and 3, 9, 15, 21 around a point', () => {
    for (const orientation of ['pointy-top', 'flat-top']) {
        assert.deepEqual(layerSizes(board('hexagon', 'tile', 4, { orientation })), [1, 6, 12, 18], orientation);
        assert.deepEqual(layerSizes(board('hexagon', 'point', 4, { orientation })), [3, 9, 15, 21], orientation);
    }
});

test('triangles grow in layers of 6, 18, 30 around a point and 1, 12, 24, 36 around a triangle (up or down)', () => {
    assert.deepEqual(layerSizes(board('triangle', 'point', 4)), [6, 18, 30, 42]);
    for (const triangleOrientation of ['point-up', 'point-down']) {
        assert.deepEqual(layerSizes(board('triangle', 'tile', 4, { triangleOrientation })), [1, 12, 24, 36], triangleOrientation);
    }
});

test('the size is the number of layers: layer 1 is the centre, and one layer more adds exactly the next ring', () => {
    const counts = (tile, center, layers) => board(tile, center, layers).length;
    for (let layers = 1; layers <= 5; layers++) {
        assert.equal(counts('hexagon', 'tile', layers), 3 * layers * (layers - 1) + 1, `hexagon around a tile, ${layers} layers`);
        assert.equal(counts('hexagon', 'point', layers), 3 * layers * layers, `hexagon around a point, ${layers} layers`);
        assert.equal(counts('triangle', 'point', layers), 6 * layers * layers, `triangle around a point, ${layers} layers`);
    }
    assert.equal(counts('triangle', 'tile', 1), 1);
    assert.equal(counts('triangle', 'tile', 2), 13);
    assert.equal(counts('triangle', 'tile', 3), 37);
    assert.equal(counts('triangle', 'tile', 4), 73);
});

test('square tiles: a board around a tile is 2n - 1 across, around a point 2n, and both stay 4-fold symmetric', () => {
    for (const layers of [1, 2, 3, 4]) {
        for (const [center, across] of [['tile', 2 * layers - 1], ['point', 2 * layers]]) {
            const config = Checks.makeConfig('circle', 'square', 'pointy-top', 'point-up', { radius: layers - 1, center });
            assert.equal(config.width, across);
            const polygons = Geometry.generateGrid(config, CANVAS, null);
            const columns = new Set(polygons.map((p) => Math.round(p.center.x))).size;
            assert.ok(columns <= across && columns >= across - 2, `${center} ${layers}: ${columns} columns for ${across} across`);
            if (polygons.length > 3) assert.equal(Checks.rotationMisses(polygons, 4), 0, `${center} ${layers} layers`);
        }
    }
});

test('boards saved before the choice existed (no centre) are built exactly as before: triangles around a point, others around a tile', () => {
    const legacy = (tile) => {
        const config = Checks.makeConfig('hexagon', tile, 'pointy-top', 'point-up', { radius: 3 });
        delete config.center;
        return Geometry.generateGrid(config, CANVAS, null);
    };
    const explicit = (tile, center) => Geometry.generateGrid(Checks.makeConfig('hexagon', tile, 'pointy-top', 'point-up', { radius: 3, center }), CANVAS, null);
    assert.deepEqual(plain(legacy('hexagon').map((p) => p.id)), plain(explicit('hexagon', 'tile').map((p) => p.id)));
    assert.deepEqual(plain(legacy('triangle').map((p) => p.id)), plain(explicit('triangle', 'point').map((p) => p.id)));
    assert.equal(legacy('triangle').length, 6 * 3 * 3);
});

test('the hexagon of hexagon tiles around a tile has the ids and tiles it always had', () => {
    const polygons = Geometry.generateGrid(Checks.makeConfig('hexagon', 'hexagon', 'pointy-top', 'point-up', { radius: 2, center: 'tile' }), CANVAS, null);
    assert.equal(polygons.length, 19);
    assert.ok(polygons.some((p) => p.id === 'hex_0_0') && polygons.some((p) => p.id === 'hex_2_-2'));
});

// ---- The pictures --------------------------------------------------------------------------------------------------------

const generate = (config, canvas, colors) => Geometry.generateGrid(config, canvas, colors);
const markup = (shape, choice) => Picker.previewMarkup(shape, choice, generate);

test('a picture exists for every board shape, tile shape and orientation, and is made of tiles', () => {
    for (const shape of Picker.SHAPES.map((s) => s.value)) {
        for (const tile of ['hexagon', 'square', 'triangle']) {
            for (const orientation of ['pointy-top', 'flat-top']) {
                for (const center of ['tile', 'point']) {
                    const svg = markup(shape, { tile, orientation, triangleOrientation: 'point-up', center });
                    assert.match(svg, /^<svg class="bp-picture" viewBox="[^"]+" aria-hidden="true"/, `${shape} ${tile}`);
                    if (shape === 'country') assert.match(svg, /<path class="bp-country"/);
                    else assert.ok((svg.match(/<polygon /g) || []).length >= 4, `${shape} ${tile} ${orientation} ${center}`);
                }
            }
        }
    }
});

test('on boards built from the middle every layer has its colour, the middle being layer 1', () => {
    const svg = markup('hexagon', { tile: 'hexagon', orientation: 'pointy-top', center: 'tile' });
    assert.equal((svg.match(/class="bp-l0"/g) || []).length, 1, 'one centre tile');
    assert.equal((svg.match(/class="bp-l1"/g) || []).length, 6);
    assert.equal((svg.match(/class="bp-l2"/g) || []).length, 12);
    const point = markup('hexagon', { tile: 'hexagon', orientation: 'pointy-top', center: 'point' });
    assert.equal((point.match(/class="bp-l0"/g) || []).length, 3, 'three tiles around the point');
    const triangles = markup('circle', { tile: 'triangle', orientation: 'pointy-top', triangleOrientation: 'point-down', center: 'tile' });
    assert.equal((triangles.match(/class="bp-l0"/g) || []).length, 1);
    const rectangle = markup('rectangle', { tile: 'hexagon', orientation: 'pointy-top', center: 'tile' });
    assert.ok(!/bp-l0/.test(rectangle) && /bp-n/.test(rectangle), 'a rectangle has no middle to count from');
});

test('the picture follows the choices: orientation, centre and triangle direction change the drawing', () => {
    const a = markup('hexagon', { tile: 'hexagon', orientation: 'pointy-top', center: 'tile' });
    assert.notEqual(markup('hexagon', { tile: 'hexagon', orientation: 'flat-top', center: 'tile' }), a);
    assert.notEqual(markup('hexagon', { tile: 'hexagon', orientation: 'pointy-top', center: 'point' }), a);
    assert.notEqual(markup('hexagon', { tile: 'triangle', orientation: 'pointy-top', triangleOrientation: 'point-up', center: 'tile' }),
        markup('hexagon', { tile: 'triangle', orientation: 'pointy-top', triangleOrientation: 'point-down', center: 'tile' }));
    assert.notEqual(markup('hexagon', { tile: 'hexagon', orientation: 'pointy-top', center: 'tile' }), markup('circle', { tile: 'hexagon', orientation: 'pointy-top', center: 'tile' }));
});

test('an infinite canvas picture fades out towards its edge, and tile shapes of a board are the real generator output', () => {
    const svg = markup('infinite', { tile: 'square', orientation: 'pointy-top', center: 'tile' });
    const opacities = [...svg.matchAll(/opacity:([0-9.]+)/g)].map((m) => Number(m[1]));
    assert.ok(opacities.length >= 20 && Math.max(...opacities) > Math.min(...opacities) + 0.3, 'the edge is fainter than the middle');
    const config = Picker.previewConfig('circle', { tile: 'hexagon', orientation: 'pointy-top', center: 'point' });
    assert.equal(config.boardShape, 'circle');
    assert.equal(config.center, 'point');
    assert.equal(config.width, config.radius * 2 + 2);
    assert.equal(Picker.previewConfig('rectangle', { tile: 'hexagon', center: 'point' }).center, 'tile', 'only hexagon and circle boards have a centre');
    assert.equal(Picker.previewConfig('infinite', { tile: 'square' }).boardShape, 'rectangle');
});

// ---- The form ----------------------------------------------------------------------------------------------------------------

test('the board form has the tile shape first, the picture list for the board shape, the centre and the layer count', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
    const at = (needle) => {
        const i = html.indexOf(needle);
        assert.ok(i > 0, needle);
        return i;
    };
    assert.ok(at('name="gridType"') < at('name="boardOutline"'), 'the tile shape comes first');
    assert.ok(at('name="boardOutline"') < at('id="boardShapePicker"') && at('id="boardShapePicker"') < at('name="gridOrientation"'));
    for (const id of ['boardShapePicker', 'centerField', 'radiusField', 'radiusHint', 'triangleOrientationField', 'orientationField']) {
        assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} appears once`);
    }
    assert.match(html, /name="boardCenter"[\s\S]*value="tile"[\s\S]*value="point"/);
    assert.match(html, /<script defer src="js\/boardPicker\.js"><\/script>/);
    assert.ok(at('js/boardPicker.js') < at('js/countryBoard.js') && at('js/ui.js') < at('js/boardPicker.js'));
    // the picker drives the native select, which every other module reads: it keeps its name and every option
    for (const value of Picker.SHAPES.map((s) => s.value)) assert.match(html, new RegExp(`<option value="${value}"`));
});

test('the panel whose list is open is lifted above the panels below, which would otherwise paint over the list', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'app', 'styles.css'), 'utf8');
    const rule = /\.panel:has\(\.bp-list:not\(\[hidden\]\)\)\s*\{([^}]*)\}/.exec(css);
    assert.ok(rule, 'the rule exists');
    assert.match(rule[1], /position:\s*relative/);
    assert.match(rule[1], /z-index:\s*(\d+)/);
    const list = /\.bp-list\s*\{[^}]*z-index:\s*(\d+)/.exec(css);
    assert.ok(list && Number(/z-index:\s*(\d+)/.exec(rule[1])[1]) >= Number(list[1]), 'the panel is at least as high as its list');
});
