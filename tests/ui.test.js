'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load');

/** The board form as UI.init finds it: inputs and selects with a value, fields with a class list. */
function fresh() {
    const make = (value = '') => {
        const classes = new Set();
        let text = String(value);
        return { get value() { return text; }, set value(v) { text = String(v); }, options: [], classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)), has: (name) => classes.has(name), add: (n) => classes.add(n), remove: (n) => classes.delete(n) }, addEventListener() {}, textContent: '' };
    };
    const byName = {
        'select[name="gridType"]': make('hexagon'),
        'select[name="gridOrientation"]': make('pointy-top'),
        'select[name="boardOutline"]': make('hexagon'),
        'input[name="boardWidth"]': make('11'),
        'input[name="boardHeight"]': make('11'),
        'input[name="boardRadius"]': make('6'),
        'input[name="boardSize"]': make('10'),
        'select[name="triangleOrientation"]': make('up'),
        'select[name="boardCenter"]': make('tile')
    };
    const byId = {};
    for (const id of ['orientationField', 'radiusField', 'sizeField', 'centerField', 'rectangularFields', 'triangleOrientationField', 'radiusHint', 'widthLabel', 'heightLabel', 'sizeLabel', 'radiusLabel']) byId[id] = make();
    const document = { querySelector: (q) => byName[q] || null, getElementById: (id) => byId[id] || null };
    const app = loadApp(['app/js/config.js', 'app/js/ui.js'], { document, window: {} });
    const UI = app.run('UI');
    UI.init();
    return { UI, form: (name) => byName[`select[name="${name}"]`] || byName[`input[name="${name}"]`], byId, refresh: () => UI.applyBoardShapeVisibility() };
}

test('a size field reads 1e2 as 100 (clamped to the largest allowed), not 1', () => {
    const { UI, form } = fresh();
    form('boardOutline').value = 'rectangle';
    form('boardWidth').value = '1e2';
    form('boardHeight').value = '2e1';
    const config = UI.getBoardConfig();
    assert.equal(config.width, 100);
    assert.equal(config.height, 20);
    assert.equal(form('boardWidth').value, '100');
    form('boardWidth').value = '7.9';
    assert.equal(UI.getBoardConfig().width, 7, 'fractions are cut off');
    form('boardWidth').value = '1e9';
    assert.equal(UI.getBoardConfig().width, 100);
    form('boardWidth').value = '-4';
    assert.equal(UI.getBoardConfig().width, 1);
});

test('an empty or invalid field uses the default and shows it', () => {
    const { UI, form } = fresh();
    form('boardOutline').value = 'rectangle';
    const defaults = loadApp(['app/js/config.js']).run('Config.DEFAULT_BOARD_CONFIG');
    form('boardWidth').value = '';
    form('boardHeight').value = 'abc';
    const config = UI.getBoardConfig();
    assert.equal(config.width, defaults.width);
    assert.equal(config.height, defaults.height);
    assert.equal(form('boardWidth').value, String(defaults.width));
    assert.equal(form('boardHeight').value, String(defaults.height));
});

test('the orientation control is for hexagon tiles and hexagon boards of triangles, not for a circle of triangles', () => {
    const { UI, form, byId } = fresh();
    const shown = () => { UI.applyGridTypeVisibility(); return !byId.orientationField.classList.has('hidden'); };
    form('gridType').value = 'hexagon';
    assert.equal(shown(), true);
    form('gridType').value = 'triangle';
    form('boardCenter').value = 'point';
    form('boardOutline').value = 'hexagon';
    assert.equal(shown(), true, 'a hexagon of triangles around a point can be turned');
    form('boardOutline').value = 'circle';
    assert.equal(shown(), false, 'a circle of triangles is not rotated by it');
    form('boardOutline').value = 'rectangle';
    assert.equal(shown(), false);
});

test('a board generated from the controls is made by the current generator', () => {
    const { UI, form } = fresh();
    const current = loadApp(['app/js/config.js']).run('Config.GENERATOR_VERSION');
    for (const outline of ['circle', 'hexagon', 'rectangle']) {
        form('boardOutline').value = outline;
        assert.equal(UI.getBoardConfig().generator, current, outline);
    }
});
