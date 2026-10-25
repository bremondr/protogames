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
    const app = loadApp([...GEOMETRY_SCRIPTS, 'app/js/viewMath.js', 'app/js/toolOps.js', 'app/js/state.js', 'app/js/interactions.js'], {
        document: { addEventListener() {} },
        CustomEvent: class {},
        performance: { now: () => Date.now() + 1000 },
        localStorage: makeStorage(),
        Renderer: { renderBoard: () => { calls.renders++; } },
        FileManager,
        UI: Object.assign(ui, { getBoardConfig: () => ({ ...app.run('Config.DEFAULT_BOARD_CONFIG') }) })
    });
    // Set only now: the geometry scripts attach themselves to `window` when it exists, and here it must stay the global.
    const windowHandlers = {};
    app.context.window = { dispatchEvent() {}, addEventListener: (type, fn) => (windowHandlers[type] = windowHandlers[type] || []).push(fn) };
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
    const clearHandlers = [];
    const clearButton = { addEventListener: (type, fn) => clearHandlers.push(fn) };
    Interactions.init({ canvas, generateButton, clearButton });
    const state = AppState.getState();
    const at = (index) => state.polygons[index].center;
    return { app, canvas, calls, state, AppState, Interactions, Config, at, ui, clickGenerate: () => generateHandlers.forEach((fn) => fn()), clickClear: () => clearHandlers.forEach((fn) => fn()), fireWindow: (type) => (windowHandlers[type] || []).forEach((fn) => fn({})) };
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

// ---- Start markers -----------------------------------------------------------------------------------------

test('the start tool sets a marker in the chosen colour, replaces it with another colour and clears it with the same one', () => {
    const env = fresh();
    env.Interactions.selectStartTool('#c62828');
    assert.equal(env.state.isStartToolActive, true);
    press(env, 0);
    release(env, 0);
    assert.equal(env.state.polygons[0].start, '#c62828');
    assert.equal(env.state.history.length, 2, 'one undo step');

    env.Interactions.selectStartTool('#1565c0');
    press(env, 0);
    release(env, 0);
    assert.equal(env.state.polygons[0].start, '#1565c0', 'another colour replaces it');

    press(env, 0);
    release(env, 0);
    assert.equal(env.state.polygons[0].start, undefined, 'the same colour again takes it away');
    assert.equal(env.state.history.length, 4);
});

test('the colour is compared without regard to case', () => {
    const env = fresh();
    env.state.polygons[1].start = '#C62828';
    env.Interactions.selectStartTool('#c62828');
    press(env, 1);
    release(env, 1);
    assert.equal(env.state.polygons[1].start, undefined);
});

test('a start marker does not touch the tile colour or object, and a drag does not spread it', () => {
    const env = fresh();
    env.state.polygons[0].color = '#445566';
    env.state.polygons[0].object = 'castle';
    env.Interactions.selectStartTool('#c62828');
    press(env, 0);
    env.canvas.fire('pointermove', pointer(env.at(1).x, env.at(1).y));
    env.canvas.fire('pointermove', pointer(env.at(2).x, env.at(2).y));
    release(env, 2);
    assert.equal(env.state.polygons[0].color, '#445566');
    assert.equal(env.state.polygons[0].object, 'castle');
    assert.equal(env.state.polygons[0].start, '#c62828');
    assert.equal(env.state.polygons[1].start, undefined);
    assert.equal(env.state.polygons[2].start, undefined);
});

test('choosing any other tool leaves the start tool', () => {
    const env = fresh();
    env.Interactions.selectStartTool('#c62828');
    env.Interactions.selectObjectTool('castle');
    assert.equal(env.state.isStartToolActive, false);
    env.Interactions.selectStartTool();
    assert.equal(env.state.isObjectToolActive, false);
    env.Interactions.toggleEraser();
    assert.equal(env.state.isStartToolActive, false);
    env.Interactions.selectStartTool();
    env.ui.getElements = () => ({ paletteButtons: [{ dataset: { color: '#112233' } }] });
    env.Interactions.selectColorTool();
    assert.equal(env.state.isStartToolActive, false);
});

test('the eraser removes an object first, then a start marker, then the colour', () => {
    const env = fresh();
    Object.assign(env.state.polygons[0], { color: '#445566', object: 'castle', start: '#c62828' });
    env.AppState.setEraserActive(true);
    const click = () => { press(env, 0); release(env, 0); };
    click();
    assert.equal(env.state.polygons[0].object, undefined);
    assert.equal(env.state.polygons[0].start, '#c62828');
    click();
    assert.equal(env.state.polygons[0].start, undefined);
    assert.equal(env.state.polygons[0].color, '#445566');
    click();
    assert.equal(env.state.polygons[0].color, env.Config.DEFAULT_TILE_COLOR);
});

test('clearing the board clears start markers too, and undo brings them back', () => {
    const env = fresh();
    env.state.polygons[3].start = '#c62828';
    env.state.polygons[3].color = '#445566';
    env.AppState.recordHistory();
    env.clickClear();
    assert.equal(env.state.polygons[3].start, undefined);
    assert.equal(env.state.polygons[3].color, env.Config.DEFAULT_TILE_COLOR);
    env.Interactions.undo();
    assert.equal(env.state.polygons[3].start, '#c62828');
});

test('regenerating a board with the same tiles keeps the start markers', () => {
    const env = fresh();
    env.state.polygons[4].start = '#1565c0';
    env.AppState.recordHistory();
    env.Interactions.generateBoard(env.state.boardConfig, { preserveColors: true, preserveHistory: true, skipDirtyFlag: true });
    assert.equal(env.state.polygons[4].start, '#1565c0');
    env.Interactions.generateBoard(env.state.boardConfig, { skipDirtyFlag: true });
    assert.equal(env.state.polygons[4].start, undefined, 'a fresh board has none');
});

const move = (env, index, extra) => env.canvas.fire('pointermove', pointer(env.at(index).x, env.at(index).y, extra));

test('the last tiles of a fast stroke are painted on release even when the moves were throttled', () => {
    const env = fresh();
    let clock = 1000;
    env.app.context.performance.now = () => clock;
    press(env, 0);
    clock += 20; move(env, 1);
    clock += 4; move(env, 2);
    clock += 3; move(env, 3);
    release(env, 3);
    assert.equal(env.state.polygons.slice(0, 4).map((p) => p.color).join(' '), '#112233 #112233 #112233 #112233');
    assert.equal(env.state.history.length, 2);
});

test('a stroke belongs to the pointer that started it', () => {
    const env = fresh();
    press(env, 0, { pointerId: 7, pointerType: 'pen' });
    const stray = { pointerId: 9, pointerType: 'touch' };
    env.canvas.fire('pointerdown', pointer(env.at(5).x, env.at(5).y, stray));
    move(env, 6, stray);
    env.canvas.fire('pointerup', pointer(env.at(6).x, env.at(6).y, stray));
    env.canvas.fire('pointercancel', pointer(env.at(6).x, env.at(6).y, stray));
    assert.equal(env.state.isDrawing, true, 'a stray touch does not end the pen stroke');
    assert.equal(env.state.polygons[5].color, env.Config.DEFAULT_TILE_COLOR);
    assert.equal(env.state.polygons[6].color, env.Config.DEFAULT_TILE_COLOR);
    env.canvas.fire('pointerup', pointer(env.at(1).x, env.at(1).y, { pointerId: 7, pointerType: 'pen' }));
    assert.equal(env.state.isDrawing, false);
    assert.equal(env.state.polygons[1].color, '#112233');
});

test('a mouse move without a pressed button ends a stroke whose release was lost', () => {
    const env = fresh();
    press(env, 0);
    move(env, 1, { buttons: 0 });
    assert.equal(env.state.isDrawing, false);
    assert.equal(env.state.polygons[1].color, env.Config.DEFAULT_TILE_COLOR, 'the move did not paint');
    assert.equal(env.state.history.length, 2, 'the tile painted by the press is kept');
});

test('losing window focus commits a stroke so isDrawing never sticks', () => {
    const env = fresh();
    press(env, 0);
    env.fireWindow('blur');
    assert.equal(env.state.isDrawing, false);
    assert.equal(env.state.history.length, 2);
    env.AppState.setDrawMode('line');
    press(env, 2);
    assert.ok(env.state.lineStartId);
    env.fireWindow('blur');
    assert.equal(env.state.lineStartId, null);
});

test('clearing an already blank board records nothing and does not mark it changed', () => {
    const env = fresh();
    const saves = env.calls.saves;
    env.clickClear();
    assert.equal(env.state.history.length, 1);
    assert.equal(env.state.isDirty, false);
    assert.equal(env.calls.saves, saves);
    env.state.polygons[0].color = env.Config.DEFAULT_TILE_COLOR.toUpperCase();
    env.clickClear();
    assert.equal(env.state.history.length, 1, 'a blank colour in another case is still blank');
    env.state.polygons[0].start = '#ff0000';
    env.clickClear();
    assert.equal(env.state.history.length, 2);
    assert.equal(env.state.polygons[0].start, undefined);
});

test('painting a colour that differs only in case changes nothing', () => {
    const env = fresh();
    env.state.polygons[0].color = '#AABBCC';
    env.AppState.setCurrentColor('#aabbcc');
    press(env, 0);
    release(env, 0);
    assert.equal(env.state.history.length, 1);
    assert.equal(env.state.polygons[0].color, '#AABBCC');
});

test('taking back a fill on a pinch restores the redo branch', () => {
    const env = fresh();
    env.state.polygons[0].color = '#445566';
    env.AppState.recordHistory();
    env.AppState.undo();
    assert.equal(env.state.history.length, 2);
    env.AppState.setDrawMode('fill');
    press(env, 5);
    assert.equal(env.state.history.length, 2, 'the fill replaced the redo step');
    env.Interactions.cancelStroke();
    assert.equal(env.state.history.length, 2);
    assert.ok(env.AppState.redo(), 'redo is available again');
});
