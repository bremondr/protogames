'use strict';
/**
 * Opening a project lays its board out for the canvas it is shown on (issue #19): the saved tiles carry the
 * pixel coordinates of the canvas they were drawn on.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, GEOMETRY_SCRIPTS, plain } = require('./support/load');
const { makeStorage, makeUI } = require('./support/fakes');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

function fresh({ canvas = { width: 600, height: 400 }, infinite = false, country = null } = {}) {
    const ui = makeUI();
    const storage = makeStorage();
    const renders = [];
    const app = loadApp([
        ...GEOMETRY_SCRIPTS, 'app/js/utils.js', 'app/js/projectFormat.js', 'app/js/projectLibrary.js', 'app/js/viewMath.js',
        'app/js/toolOps.js', 'app/js/state.js', 'app/js/focusUtils.js', 'app/js/interactions.js', 'app/js/fileManager.js'
    ], {
        document: { addEventListener() {}, getElementById: () => null },
        CustomEvent: class {},
        performance: { now: () => Date.now() },
        localStorage: storage,
        clearInterval() {},
        UI: Object.assign(ui, { getBoardConfig: () => ({}) }),
        Renderer: { renderBoard: () => renders.push(1) },
        Infinite: { isActive: () => infinite },
        ...(country ? { CountryBoard: country } : {})
    });
    app.context.window = { localStorage: storage, dispatchEvent() {}, setInterval: () => 1 };
    const AppState = app.run('AppState');
    AppState.setCanvas({ ...canvas }, null);
    return { app, AppState, FileManager: app.run('FileManager'), ProjectFormat: app.run('ProjectFormat'), Config: app.run('Config'), renders };
}

const bounds = (polygons) => {
    const xs = polygons.flatMap((p) => p.vertices.map((v) => v.x));
    const ys = polygons.flatMap((p) => p.vertices.map((v) => v.y));
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
};

/** A saved project of a hexagon board drawn on a large canvas, with some painting, an object and a start marker. */
function bigProject(env) {
    const project = env.ProjectFormat.parse(fixture('v2-space-arctic.protogames.json'));
    const config = project.appState.boardConfig;
    const big = env.app.context.Geometry.generateGrid(config, { width: 1620, height: 1055 }, null);
    big.forEach((p, i) => { p.color = i % 3 === 0 ? '#2D5016' : env.Config.DEFAULT_TILE_COLOR; });
    big[1].object = 'castle';
    big[2].start = '#c62828';
    project.appState.polygons = JSON.parse(JSON.stringify(big));
    return { project, big };
}

test('a project saved on a large canvas is laid out for a small one when it is opened', () => {
    const env = fresh({ canvas: { width: 600, height: 400 } });
    const { project, big } = bigProject(env);
    assert.ok(bounds(big).maxX > 600, 'as saved it would run off a 600 pixel wide canvas');
    env.FileManager.restoreState(project, { skipNotification: true });
    const { polygons } = env.AppState.getState();
    const b = bounds(polygons);
    assert.ok(b.minX >= 0 && b.maxX <= 600 && b.minY >= 0 && b.maxY <= 400, `inside the canvas: ${JSON.stringify(b)}`);
    assert.equal(polygons.length, big.length, 'the same tiles');
});

test('colours, objects and start markers are carried over by tile id', () => {
    const env = fresh();
    const { project, big } = bigProject(env);
    env.FileManager.restoreState(project, { skipNotification: true });
    const { polygons } = env.AppState.getState();
    const byId = new Map(polygons.map((p) => [p.id, p]));
    for (const saved of big) {
        const now = byId.get(saved.id);
        assert.ok(now, `${saved.id} still exists`);
        assert.equal(now.color, saved.color, `colour of ${saved.id}`);
        assert.equal(now.object, saved.object);
        assert.equal(now.start, saved.start);
    }
});

test('the view is reset, the board is clean and the undo history starts from the opened board', () => {
    const env = fresh();
    const { project } = bigProject(env);
    env.AppState.setView({ scale: 5, x: -900, y: -400 });
    env.FileManager.restoreState(project, { skipNotification: true });
    const state = env.AppState.getState();
    assert.deepEqual(plain(state.view), plain(env.app.run('ViewMath.identity()')), 'shown whole, not at the old pan and zoom');
    assert.equal(state.isDirty, false);
    assert.equal(state.history.length, 1);
    assert.equal(state.polygons[0].color, project.appState.polygons[0].color, 'the first undo step has the painting');
});

test('an infinite board keeps its tiles: they do not depend on the canvas', () => {
    const env = fresh({ infinite: true });
    const { project, big } = bigProject(env);
    env.FileManager.restoreState(project, { skipNotification: true });
    assert.deepEqual(plain(bounds(env.AppState.getState().polygons)), plain(bounds(big)));
});

test('a board saved with other tile ids keeps its geometry instead of losing its colours', () => {
    const env = fresh();
    const { project } = bigProject(env);
    // ids as older versions wrote them: not found again when the grid is generated
    project.appState.polygons.forEach((p, i) => { p.id = `triangle_hex_${i}_old`; });
    const saved = JSON.parse(JSON.stringify(project.appState.polygons));
    env.FileManager.restoreState(project, { skipNotification: true });
    const { polygons } = env.AppState.getState();
    assert.deepEqual(plain(polygons.map((p) => [p.id, p.color])), plain(saved.map((p) => [p.id, p.color])), 'nothing was thrown away');
    assert.equal(bounds(polygons).maxX, bounds(saved).maxX, 'the geometry is the saved one');
});

test('a blank saved board with other ids is laid out anyway: nothing is lost by it', () => {
    const env = fresh();
    const { project } = bigProject(env);
    project.appState.polygons.forEach((p, i) => { p.id = `triangle_hex_${i}_old`; p.color = env.Config.DEFAULT_TILE_COLOR; delete p.object; delete p.start; });
    env.FileManager.restoreState(project, { skipNotification: true });
    assert.ok(bounds(env.AppState.getState().polygons).maxX <= 600);
});

test('a country board waits for its outlines before it is laid out again, and only if nothing replaced it meanwhile', async () => {
    let release;
    const country = { ready: () => new Promise((resolve) => { release = resolve; }) };
    const env = fresh({ country });
    const { project, big } = bigProject(env);
    project.appState.boardConfig = { ...project.appState.boardConfig, boardShape: 'country', country: 'Czechia' };
    env.FileManager.restoreState(project, { skipNotification: true });
    assert.deepEqual(plain(bounds(env.AppState.getState().polygons)), plain(bounds(big)), 'as saved while the outlines download');
    // a person opens something else before they arrive
    const other = bigProject(env).project;
    env.FileManager.restoreState(other, { skipNotification: true });
    const current = env.AppState.getState().polygons;
    release(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(env.AppState.getState().polygons, current, 'the late outlines leave the newer board alone');
});

// ---- Generator versions: an old board keeps the tiles it was made with ----------------------------------------------------

const V7_FIXTURES = ['v7-circle-hexagon.protogames.json', 'v7-circle-triangle.protogames.json'];

test('a v7 circle board is opened with generator 1 and keeps every tile and colour, on any canvas', () => {
    for (const name of V7_FIXTURES) {
        for (const canvas of [{ width: 1000, height: 800 }, { width: 700, height: 500 }]) {
            const env = fresh({ canvas });
            const project = env.ProjectFormat.parse(fixture(name));
            const saved = JSON.parse(JSON.stringify(project.appState.polygons));
            assert.equal(project.appState.boardConfig.generator, 1, `${name} migrates to generator 1`);
            env.FileManager.restoreState(project, { skipNotification: true });
            const state = env.AppState.getState();
            assert.equal(state.boardConfig.generator, 1, `${name} stays generator 1`);
            assert.equal(state.polygons.length, saved.length, `${name}: the same number of tiles`);
            const byId = new Map(state.polygons.map((p) => [p.id, p]));
            for (const tile of saved) assert.equal(byId.get(tile.id)?.color, tile.color, `${name}: ${tile.id}`);
            const b = bounds(state.polygons);
            assert.ok(b.maxX <= canvas.width && b.maxY <= canvas.height, `${name} is regenerated for the canvas`);
        }
    }
});

test('the generator 1 board of a v7 file would grow tiles under generator 2: that is what the stored version prevents', () => {
    const env = fresh({ canvas: { width: 1000, height: 800 } });
    const project = env.ProjectFormat.parse(fixture('v7-circle-hexagon.protogames.json'));
    const config = project.appState.boardConfig;
    const generate = (generator) => env.app.context.Geometry.generateGrid({ ...config, generator }, { width: 1000, height: 800 }, null).length;
    assert.equal(generate(1), project.appState.polygons.length);
    assert.ok(generate(2) > generate(1));
});

test('a generator 1 board is saved and reloaded as generator 1, and an autosave of it too', () => {
    const env = fresh();
    env.FileManager.restoreState(env.ProjectFormat.parse(fixture('v7-circle-hexagon.protogames.json')), { skipNotification: true });
    const state = env.AppState.getState();
    const appState = { boardConfig: { ...state.boardConfig }, currentColor: state.currentColor, paletteId: state.currentPaletteId, isEraserActive: false, autoSaveEnabled: true, players: [], dice: [], polygons: state.polygons };
    for (const make of ['createProject', 'createAutosave']) {
        const text = JSON.stringify(env.ProjectFormat[make]({ projectName: 'again', appState, now: 0 }));
        assert.equal(env.ProjectFormat.parse(text).appState.boardConfig.generator, 1, make);
    }
});

test('a new board gets the current generator, even when the board that was open used an older one', () => {
    const env = fresh();
    env.FileManager.restoreState(env.ProjectFormat.parse(fixture('v7-circle-hexagon.protogames.json')), { skipNotification: true });
    assert.equal(env.AppState.getState().boardConfig.generator, 1);
    env.FileManager.startNewProject().catch(() => {}); // the naming dialog needs a page; the board is made first
    assert.equal(env.AppState.getState().boardConfig.generator, env.Config.GENERATOR_VERSION);
});
