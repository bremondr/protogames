'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load');
const { makeStorage, makeUI } = require('./support/fakes');

const { quotaError } = require('./support/fakes');
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

/** A DOM element that records its listeners and hands out stand-ins for whatever is looked up inside it. */
function makeElement() {
    const element = {
        listeners: {},
        removed: false,
        classList: { add() {}, remove() {} },
        addEventListener(type, fn) { element.listeners[type] = fn; },
        querySelector: () => ({ focus() {}, select() {}, setAttribute() {}, textContent: '', value: '', addEventListener() {} }),
        remove() { element.removed = true; }
    };
    return element;
}

function fresh({ storage = makeStorage() } = {}) {
    const calls = { restored: 0, modals: [], addresses: [], navigations: [], generated: 0 };
    const location = { pathname: '/app/', search: '', assign: (url) => calls.navigations.push(url) };
    const ui = makeUI();
    const document = {
        createElement: () => { const el = makeElement(); calls.modals.push(el); return el; },
        body: { appendChild() {} },
        getElementById: () => null
    };
    const app = loadApp(['app/js/config.js', 'app/js/utils.js', 'app/js/projectFormat.js', 'app/js/projectLibrary.js', 'app/js/viewMath.js', 'app/js/state.js', 'app/js/focusUtils.js', 'app/js/fileManager.js'], {
        document,
        localStorage: storage,
        location,
        URLSearchParams,
        history: { replaceState: (...args) => { calls.addresses.push(args[2]); location.search = args[2].includes('?') ? args[2].slice(args[2].indexOf('?')) : ''; } },
        CustomEvent: class {},
        clearInterval() {},
        UI: ui,
        Renderer: { renderBoard() {} },
        Infinite: { isActive: () => false },
        Interactions: { generateBoard: () => { calls.generated++; } }
    });
    app.context.window = { localStorage: storage, dispatchEvent() { calls.restored++; }, setInterval: () => 1 };
    const AppState = app.run('AppState');
    return { app, calls, ui, storage, location, AppState, Library: app.run('ProjectLibrary'), FileManager: app.run('FileManager'), ProjectFormat: app.run('ProjectFormat'), Config: app.run('Config') };
}

const project = (env) => env.ProjectFormat.parse(fixture('v2-space-arctic.protogames.json'));

test('hasUserWork is false for a blank board and true once something is painted or placed', () => {
    const env = fresh();
    env.FileManager.restoreState(project(env));
    env.AppState.getState().polygons.forEach((p) => { p.color = env.Config.DEFAULT_TILE_COLOR; delete p.object; });
    assert.equal(env.FileManager.hasUserWork(), false);
    env.AppState.getState().polygons[0].object = 'castle';
    assert.equal(env.FileManager.hasUserWork(), true);
    delete env.AppState.getState().polygons[0].object;
    env.AppState.getState().polygons[1].color = '#123456';
    assert.equal(env.FileManager.hasUserWork(), true);
});

test('opening a file makes it a new project: nothing is asked and the open project stays as it was', () => {
    const env = fresh();
    env.FileManager.restoreState(project(env));
    const first = env.FileManager.registerNewProject('First board');
    env.AppState.getState().polygons[0].color = '#123456';
    const modalsBefore = env.calls.modals.length;
    env.FileManager.openProject(env.ProjectFormat.parse(fixture('v0-legacy-project.protogames.json')));
    assert.equal(env.calls.modals.length, modalsBefore, 'no confirmation dialog, even over painted work');
    const state = env.AppState.getState();
    assert.equal(state.currentProjectName, 'legacy-board');
    assert.notEqual(state.currentProjectId, first);
    const stored = env.Library.list();
    assert.deepEqual(Array.from(stored, (entry) => entry.name).sort(), ['First board', 'legacy-board']);
    const kept = JSON.parse(env.Library.read(first));
    assert.equal(kept.appState.polygons[0].color, '#123456', 'the first project kept the work done in it');
    assert.equal(env.calls.addresses[env.calls.addresses.length - 1], '/app/?project=' + state.currentProjectId, 'the address names the new project');
});

test('a project that fails to open leaves the open project open and saving to itself', () => {
    const env = fresh();
    env.FileManager.restoreState(project(env));
    const first = env.FileManager.registerNewProject('First board');
    const other = env.ProjectFormat.parse(fixture('v0-legacy-project.protogames.json'));
    env.app.run('Utils').clonePolygons = () => { throw new Error('boom'); };
    env.FileManager.openProject(other);
    assert.equal(env.AppState.getState().currentProjectId, first, 'still the first project');
    assert.equal(env.Library.list().length, 1, 'no half-made second project');
});

test('registerNewProject names the open board, gives it an id, puts it in the address and saves it', () => {
    const env = fresh();
    env.FileManager.restoreState(project(env));
    assert.equal(env.Library.list().length, 0, 'before it has a name nothing is saved');
    const id = env.FileManager.registerNewProject('  Dragon   isle ');
    assert.equal(env.AppState.getState().currentProjectName, 'Dragon isle');
    assert.deepEqual(env.calls.addresses, ['/app/?project=' + id]);
    const [entry] = env.Library.list();
    assert.equal(entry.id, id);
    assert.equal(entry.name, 'Dragon isle');
    assert.equal(env.FileManager.projectIdFromUrl(), id);
    env.FileManager.registerNewProject('');
    assert.equal(env.AppState.getState().currentProjectName, 'Untitled board', 'an empty name gets a default');
});

test('autosave writes into the open project only, and does nothing before there is one', () => {
    const env = fresh();
    env.FileManager.restoreState(project(env));
    env.FileManager.autoSaveToLocalStorage(true);
    assert.deepEqual(env.storage.dump(), {}, 'no project, no save');
    const a = env.FileManager.registerNewProject('A');
    const b = env.FileManager.registerNewProject('B');
    env.AppState.getState().polygons[0].color = '#abcdef';
    env.FileManager.autoSaveToLocalStorage(true);
    assert.equal(JSON.parse(env.Library.read(b)).appState.polygons[0].color, '#abcdef');
    assert.notEqual(JSON.parse(env.Library.read(a)).appState.polygons[0].color, '#abcdef', 'the other project is untouched');
});

test('a stored project opens, without being rewritten just for being looked at', () => {
    const env = fresh();
    env.FileManager.restoreState(project(env));
    const id = env.FileManager.registerNewProject('Keep me');
    const before = env.Library.read(id);
    const other = fresh({ storage: makeStorage({ ['protogames_project:' + id]: before }) });
    assert.equal(other.FileManager.openStoredProject(id), true);
    assert.equal(other.AppState.getState().currentProjectId, id);
    assert.equal(other.AppState.getState().currentProjectName, 'Keep me');
    assert.equal(other.Library.read(id), before, 'opening does not change the saved copy or its time');
    assert.equal(other.AppState.getState().polygons.length, env.AppState.getState().polygons.length);
});

test('a project that is missing, damaged or from a newer version is reported, and kept', () => {
    const env = fresh();
    const modals = env.calls.modals.length;
    assert.equal(env.FileManager.openStoredProject('nothing-here-1'), false);
    assert.ok(env.calls.modals.length > modals, 'the person is told');
    const newer = JSON.stringify({ ...JSON.parse(fixture('v2-space-arctic.protogames.json')), version: env.ProjectFormat.CURRENT_VERSION + 1 });
    env.storage.setItem('protogames_project:newer-aaaa', newer);
    env.storage.setItem('protogames_project:broken-bbbb', '{nope');
    assert.equal(env.FileManager.openStoredProject('newer-aaaa'), false);
    assert.equal(env.FileManager.openStoredProject('broken-bbbb'), false);
    assert.equal(env.Library.read('newer-aaaa'), newer, 'a newer version project is not damaged, it is kept for the newer app');
    assert.equal(env.Library.read('broken-bbbb'), '{nope', 'and nothing is deleted behind the persons back');
    assert.equal(env.AppState.getState().currentProjectId, null);
});

test('the address names the project or the showcase, and anything else is ignored', () => {
    const env = fresh();
    env.location.search = '?project=abcdef-1234';
    assert.equal(env.FileManager.projectIdFromUrl(), 'abcdef-1234');
    env.location.search = '?project=../../x';
    assert.equal(env.FileManager.projectIdFromUrl(), null);
    env.location.search = '?showcase=fantasy-landscape';
    assert.equal(env.FileManager.showcaseFromUrl(), 'fantasy-landscape');
    assert.equal(env.FileManager.projectIdFromUrl(), null);
    env.location.search = '';
    assert.equal(env.FileManager.showcaseFromUrl(), null);
});

test('a showcase opens as a new project named after it, and the open project stays', async () => {
    const env = fresh();
    env.FileManager.restoreState(project(env));
    const first = env.FileManager.registerNewProject('Mine');
    const showcase = fixture('v2-space-arctic.protogames.json');
    env.app.context.fetch = async () => ({ ok: true, text: async () => showcase });
    assert.equal(await env.FileManager.openShowcase('fantasy-landscape'), true);
    const state = env.AppState.getState();
    assert.equal(state.currentProjectName, 'Fantasy landscape');
    assert.notEqual(state.currentProjectId, first);
    assert.deepEqual(Array.from(env.Library.list(), (entry) => entry.name).sort(), ['Fantasy landscape', 'Mine']);
    assert.equal(env.calls.generated, 1, 'the grid is rebuilt for this canvas');
});

test('an unknown showcase, or one that cannot be fetched, is reported and changes nothing', async () => {
    const env = fresh();
    assert.equal(await env.FileManager.openShowcase('no-such-board'), false);
    env.app.context.fetch = async () => ({ ok: false, status: 404 });
    assert.equal(await env.FileManager.openShowcase('fantasy-landscape'), false);
    assert.equal(env.Library.list().length, 0);
    assert.equal(env.AppState.getState().currentProjectId, null);
});

test('a full storage is reported once, not on every failed save, and again after a save works', () => {
    const env = fresh();
    env.FileManager.restoreState(project(env));
    env.FileManager.registerNewProject('Full');
    env.storage.failWith = quotaError();
    for (let i = 0; i < 4; i++) env.FileManager.autoSaveToLocalStorage(true);
    assert.equal(env.ui.notes.filter((n) => /storage is full/.test(n)).length, 1);
    env.storage.failWith = null;
    env.FileManager.autoSaveToLocalStorage(true);
    env.storage.failWith = quotaError();
    env.FileManager.autoSaveToLocalStorage(true);
    assert.equal(env.ui.notes.filter((n) => /storage is full/.test(n)).length, 2);
});

test('blocked storage (reading window.localStorage throws) does not break saving or opening a file', () => {
    const env = fresh();
    const blocked = new Error('denied');
    blocked.name = 'SecurityError';
    Object.defineProperty(env.app.context, 'localStorage', { get() { throw blocked; } });
    assert.doesNotThrow(() => env.FileManager.restoreState(project(env)), 'a file that loads fine is not reported as failed');
    env.AppState.setProjectId('abcdef-1234');
    assert.doesNotThrow(() => env.FileManager.autoSaveToLocalStorage(true));
    assert.equal(env.ui.notes.some((n) => /storage is full/.test(n)), false);
});

test('restoring a file replaces the board settings instead of merging them into the previous board', () => {
    const env = fresh();
    env.AppState.updateBoardConfig({ gridType: 'square', boardShape: 'rectangle', width: 30, height: 30, radius: 77, size: 66, triangleOrientation: 'point-down', leftover: true });
    const file = env.ProjectFormat.parse(fixture('v2-space-arctic.protogames.json'));
    delete file.appState.boardConfig.radius;
    delete file.appState.boardConfig.triangleOrientation;
    env.FileManager.restoreState(file);
    const config = env.AppState.getState().boardConfig;
    assert.equal(config.radius, env.Config.DEFAULT_BOARD_CONFIG.radius, 'not 77 from the old board');
    assert.equal(config.triangleOrientation, 'point-up');
    assert.equal('leftover' in config, false, 'unknown keys are dropped');
    assert.equal(config.gridType, 'hexagon');
});
