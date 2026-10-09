'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, GEOMETRY_SCRIPTS } = require('./support/load');
const { makeStorage, makeUI, makeCanvas, pointer } = require('./support/fakes');

function fresh({ hasWork = false } = {}) {
    const canvas = makeCanvas();
    const calls = { saves: 0, confirms: [], generated: 0, renders: 0 };
    const generateHandlers = [];
    const ui = makeUI();
    const FileManager = {
        autoSaveToLocalStorage: () => { calls.saves++; },
        hasUserWork: () => hasWork,
        confirmReplace: (onConfirm, options) => calls.confirms.push({ onConfirm, options })
    };
    const app = loadApp([...GEOMETRY_SCRIPTS, 'js/viewMath.js', 'js/toolOps.js', 'js/state.js', 'js/interactions.js'], {
        document: { addEventListener() {} },
        CustomEvent: class {},
        performance: { now: () => Date.now() + 1000 },
        localStorage: makeStorage(),
        Renderer: { renderBoard: () => { calls.renders++; } },
        FileManager,
        UI: Object.assign(ui, { getBoardConfig: () => ({ ...app.run('Config.DEFAULT_BOARD_CONFIG') }) })
    });
    // Set only now: the geometry scripts attach themselves to `window` when it exists, and here it must stay the global.
    app.context.window = { dispatchEvent() {} };
    const Config = app.run('Config');
    const AppState = app.run('AppState');
    const Interactions = app.run('Interactions');
    const config = { ...Config.DEFAULT_BOARD_CONFIG, gridType: 'square', boardShape: 'rectangle', width: 4, height: 3 };
    AppState.setCanvas(canvas, null);
    AppState.setPolygons(app.context.Geometry.generateGrid(config, canvas, null));
    AppState.updateBoardConfig(config);
    AppState.recordHistory();
    AppState.setCurrentColor('#112233');
    const generateButton = { addEventListener: (type, fn) => generateHandlers.push(fn) };
    Interactions.init({ canvas, generateButton });
    const state = AppState.getState();
    const at = (index) => state.polygons[index].center;
    return { app, canvas, calls, state, AppState, Interactions, Config, at, ui, clickGenerate: () => generateHandlers.forEach((fn) => fn()) };
}

const press = (env, index, extra) => env.canvas.fire('pointerdown', pointer(env.at(index).x, env.at(index).y, extra));
const release = (env, index) => env.canvas.fire('pointerup', pointer(env.at(index).x, env.at(index).y));

test('only the primary mouse button paints', () => {
    const env = fresh();
    const event = pointer(env.at(0).x, env.at(0).y, { button: 2 });
    env.canvas.fire('pointerdown', event);
    assert.equal(env.state.isDrawing, false);
    assert.equal(env.state.polygons[0].color, env.Config.DEFAULT_TILE_COLOR);
    assert.notEqual(event.prevented, true, 'the context menu is left alone');
    env.canvas.fire('pointerup', event);
    assert.equal(env.state.history.length, 1);
});

test('a click that changes nothing leaves no undo step', () => {
    const env = fresh();
    press(env, 0);
    release(env, 0);
    assert.equal(env.state.polygons[0].color, '#112233');
    assert.equal(env.state.history.length, 2, 'the first paint is one step');
    press(env, 0);
    release(env, 0);
    assert.equal(env.state.history.length, 2, 'painting the same colour again records nothing');
    const saves = env.calls.saves;
    env.AppState.setEraserActive(true);
    press(env, 5);
    release(env, 5);
    assert.equal(env.state.history.length, 2, 'erasing a blank tile records nothing');
    assert.equal(env.calls.saves, saves);
});

test('a stroke over tiles that already have the colour records nothing, but one that changes a later tile does', () => {
    const env = fresh();
    env.state.polygons[0].color = '#112233';
    press(env, 0);
    assert.equal(env.state.isDrawing, true);
    env.canvas.fire('pointermove', pointer(env.at(1).x, env.at(1).y));
    release(env, 1);
    assert.equal(env.state.polygons[1].color, '#112233');
    assert.equal(env.state.history.length, 2, 'the drag painted tile 1, so one step');
});

test('a fill is taken back when a second finger starts a gesture', () => {
    const env = fresh();
    env.AppState.setDrawMode('fill');
    press(env, 0);
    assert.ok(env.state.polygons.every((p) => p.color === '#112233'), 'the fill landed');
    assert.equal(env.state.history.length, 2);
    env.Interactions.cancelStroke();
    assert.ok(env.state.polygons.every((p) => p.color === env.Config.DEFAULT_TILE_COLOR), 'rolled back');
    assert.equal(env.state.history.length, 1);
    assert.equal(env.AppState.redo(), null, 'and it cannot be redone');
    env.Interactions.cancelStroke();
    assert.equal(env.state.history.length, 1, 'a second cancel does nothing');
});

test('a finished fill is kept when no gesture follows', () => {
    const env = fresh();
    env.AppState.setDrawMode('fill');
    press(env, 0);
    release(env, 0);
    env.Interactions.cancelStroke();
    assert.ok(env.state.polygons.every((p) => p.color === '#112233'));
    assert.equal(env.state.history.length, 2);
});

test('Generate Board asks before replacing painted work, and goes straight ahead on a blank board', () => {
    const blank = fresh();
    blank.clickGenerate();
    assert.equal(blank.calls.confirms.length, 0);
    assert.ok(blank.ui.notes.includes('Board generated'));

    const painted = fresh({ hasWork: true });
    const before = painted.state.polygons;
    painted.clickGenerate();
    assert.equal(painted.calls.confirms.length, 1);
    assert.equal(painted.state.polygons, before, 'nothing changed yet');
    painted.calls.confirms[0].onConfirm();
    assert.notEqual(painted.state.polygons, before);
    assert.ok(painted.ui.notes.includes('Board generated'));
});
