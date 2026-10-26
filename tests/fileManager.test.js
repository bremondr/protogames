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
        getElementById: () => null,
        addEventListener() {},
        removeEventListener() {}
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
    env.AppState.markDirty();
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
    assert.equal(env.FileManager.autoSaveToLocalStorage(true), false);
    assert.deepEqual(env.storage.dump(), {}, 'no project, no save');
    assert.deepEqual(env.ui.notes.filter((n) => /not available|storage is full/.test(n)), [], 'and that is not reported as a failed save');
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
    Object.defineProperty(env.app.context.window, 'localStorage', { get() { throw blocked; } }); // the app reads both spellings
    assert.doesNotThrow(() => env.FileManager.restoreState(project(env)), 'a file that loads fine is not reported as failed');
    env.AppState.setProjectId('abcdef-1234');
    assert.doesNotThrow(() => env.FileManager.autoSaveToLocalStorage(true));
    assert.equal(env.ui.notes.some((n) => /storage is full/.test(n)), false);
    assert.equal(env.ui.notes.filter((n) => /not available/.test(n)).length, 1, 'but the person is told once that nothing is saved');
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

/** Presses a button of the dialog `modal` (a stand-in element from fresh()). */
const press = (modal, action) => modal.listeners.click({ target: { closest: () => ({ dataset: { action } }) } });
const lastModal = (env) => env.calls.modals[env.calls.modals.length - 1];

test('autosave says whether it wrote, and a failed save is reported once per run of failures', () => {
    const env = fresh();
    env.FileManager.restoreState(project(env));
    env.FileManager.registerNewProject('Tell me');
    assert.equal(env.FileManager.autoSaveToLocalStorage(true), true);
    env.storage.failWritesWith = new Error('denied');
    assert.equal(env.FileManager.autoSaveToLocalStorage(true), false);
    env.FileManager.autoSaveToLocalStorage(true);
    assert.equal(env.ui.notes.filter((n) => /not available/.test(n)).length, 1);
    env.storage.failWritesWith = null;
    assert.equal(env.FileManager.autoSaveToLocalStorage(true), true);
    env.storage.failWritesWith = quotaError();
    env.FileManager.autoSaveToLocalStorage(true);
    assert.equal(env.ui.notes.filter((n) => /not available/.test(n)).length, 1, 'a full storage has its own text');
    assert.equal(env.ui.notes.filter((n) => /storage is full/.test(n)).length, 1);
});

test('replacing a board whose last save failed asks first; a saved board is replaced without a question', () => {
    const env = fresh();
    env.FileManager.restoreState(project(env));
    env.FileManager.registerNewProject('Precious');
    env.AppState.getState().polygons[0].color = '#123456';
    env.AppState.markDirty();
    env.storage.failWritesWith = quotaError();
    const modals = env.calls.modals.length;
    const other = env.ProjectFormat.parse(fixture('v0-legacy-project.protogames.json'));
    env.FileManager.openProject(other);
    assert.equal(env.calls.modals.length, modals + 1, 'asked');
    assert.equal(env.AppState.getState().currentProjectName, 'Precious', 'nothing replaced yet');
    press(lastModal(env), 'cancel');
    assert.equal(env.AppState.getState().currentProjectName, 'Precious');
    env.FileManager.openProject(other);
    press(lastModal(env), 'confirm');
    assert.equal(env.AppState.getState().currentProjectName, 'legacy-board');
    // Storage works again: the next replacement is not asked.
    env.storage.failWritesWith = null;
    env.FileManager.autoSaveToLocalStorage(true);
    const asked = env.calls.modals.length;
    env.FileManager.openProject(other);
    assert.equal(env.calls.modals.length, asked);
});

test('project switches and a new project ask as well when the save failed, and navigate when confirmed', () => {
    const env = fresh();
    env.FileManager.restoreState(project(env));
    env.FileManager.registerNewProject('Precious');
    env.AppState.getState().polygons[0].color = '#123456';
    env.AppState.markDirty();
    env.storage.failWritesWith = quotaError();
    env.FileManager.startAnotherProject();
    env.FileManager.openProjectById('other-project-1');
    assert.deepEqual(env.calls.navigations, []);
    press(lastModal(env), 'confirm');
    assert.equal(env.calls.navigations.length, 1);
});

test('a board that is blank is replaced without a question even when saving fails', () => {
    const env = fresh();
    env.FileManager.restoreState(project(env));
    env.FileManager.registerNewProject('Empty');
    env.AppState.getState().polygons.forEach((p) => { p.color = env.Config.DEFAULT_TILE_COLOR; delete p.object; delete p.start; });
    env.storage.failWritesWith = quotaError();
    env.FileManager.autoSaveToLocalStorage(true);
    const modals = env.calls.modals.length;
    env.FileManager.startAnotherProject();
    assert.equal(env.calls.modals.length, modals);
    assert.equal(env.calls.navigations.length, 1);
});

test('hasUserWork reads colours case-insensitively: a board of #FFFFFF is blank', () => {
    const env = fresh();
    env.FileManager.restoreState(project(env));
    env.AppState.getState().polygons.forEach((p) => { p.color = env.Config.DEFAULT_TILE_COLOR.toUpperCase(); delete p.object; delete p.start; });
    assert.equal(env.FileManager.hasUserWork(), false);
});

test('a file that says autoSaveEnabled:false does not turn saving off', () => {
    const env = fresh();
    const file = project(env);
    file.appState.autoSaveEnabled = false;
    env.FileManager.restoreState(file);
    assert.equal(env.AppState.getState().autoSaveEnabled, true);
});

test('a project that did not change is not rewritten when it is left or looked at', () => {
    const env = fresh();
    env.FileManager.restoreState(project(env));
    const id = env.FileManager.registerNewProject('Quiet');
    const before = env.Library.read(id);
    assert.equal(env.FileManager.autoSaveToLocalStorage(), false, 'not dirty, nothing written');
    env.FileManager.openProjectById('other-project-1');
    assert.equal(env.Library.read(id), before, 'the stored text and its time are untouched');
    assert.equal(env.calls.navigations.length, 1);
    env.AppState.markDirty();
    assert.equal(env.FileManager.autoSaveToLocalStorage(), true, 'a changed board is saved');
});

test('the same project saved from another tab is not overwritten silently', () => {
    const storage = makeStorage();
    const a = fresh({ storage });
    a.FileManager.restoreState(project(a));
    const id = a.FileManager.registerNewProject('Shared');
    const b = fresh({ storage });
    b.FileManager.openStoredProject(id);
    b.AppState.getState().polygons[0].color = '#bbbbbb';
    b.AppState.markDirty();
    assert.equal(b.FileManager.autoSaveToLocalStorage(true), true);
    const theirs = a.Library.read(id);
    a.AppState.getState().polygons[0].color = '#aaaaaa';
    a.AppState.markDirty();
    const modals = a.calls.modals.length;
    assert.equal(a.FileManager.autoSaveToLocalStorage(true), false);
    assert.equal(a.calls.modals.length, modals + 1, 'the person is asked');
    assert.equal(a.Library.read(id), theirs, 'nothing written over the other tab');
    a.FileManager.autoSaveToLocalStorage(true);
    assert.equal(a.calls.modals.length, modals + 1, 'one dialog at a time');
    press(lastModal(a), 'primary');
    assert.equal(JSON.parse(a.Library.read(id)).appState.polygons[0].color, '#aaaaaa', 'keeping this tab writes it');
    assert.equal(a.FileManager.autoSaveToLocalStorage(true), true, 'and saving goes on');
});

test('choosing the other version loads it and does not write over it', () => {
    const storage = makeStorage();
    const a = fresh({ storage });
    a.FileManager.restoreState(project(a));
    const id = a.FileManager.registerNewProject('Shared');
    const b = fresh({ storage });
    b.FileManager.openStoredProject(id);
    b.AppState.getState().polygons[0].color = '#bbbbbb';
    b.AppState.markDirty();
    b.FileManager.autoSaveToLocalStorage(true);
    const theirs = a.Library.read(id);
    a.AppState.markDirty();
    a.FileManager.autoSaveToLocalStorage(true);
    press(lastModal(a), 'secondary');
    assert.equal(a.Library.read(id), theirs);
    assert.equal(a.AppState.getState().polygons[0].color, '#bbbbbb');
    assert.equal(a.AppState.getState().currentProjectId, id);
});

test('a storage event about the open project pauses saving before the next save', () => {
    const storage = makeStorage();
    const a = fresh({ storage });
    a.FileManager.restoreState(project(a));
    const id = a.FileManager.registerNewProject('Shared');
    const modals = a.calls.modals.length;
    a.FileManager.handleStorageEvent({ key: 'protogames_project:somebody-else' });
    assert.equal(a.calls.modals.length, modals, 'another project is not our business');
    storage.setItem('protogames_project:' + id, JSON.stringify({ ...JSON.parse(a.Library.read(id)), timestamp: Date.now() + 5 }));
    a.FileManager.handleStorageEvent({ key: 'protogames_project:' + id });
    assert.equal(a.calls.modals.length, modals + 1);
});

test('a project deleted elsewhere is not recreated by the next save', () => {
    const storage = makeStorage();
    const a = fresh({ storage });
    a.FileManager.restoreState(project(a));
    const id = a.FileManager.registerNewProject('Doomed');
    storage.removeItem('protogames_project:' + id);
    a.AppState.markDirty();
    const modals = a.calls.modals.length;
    assert.equal(a.FileManager.autoSaveToLocalStorage(true), false);
    assert.equal(a.calls.modals.length, modals + 1, 'the person is told');
    assert.equal(a.AppState.getState().currentProjectId, null);
    assert.deepEqual(storage.dump(), {}, 'nothing was written back');
    assert.equal(a.calls.addresses[a.calls.addresses.length - 1], '/app/', 'the address no longer names it');
    press(lastModal(a), 'primary');
    const [entry] = a.Library.list();
    assert.equal(entry.name, 'Doomed', 'saved again as a project of its own');
    assert.notEqual(entry.id, id);
});

test('earlier autosaves that were recovered are announced once; the ones that could not be copied are reported', () => {
    const raw = fixture('v2-space-arctic.protogames.json');
    const env = fresh({ storage: makeStorage({ 'protogames_autosave:tab1': raw, 'protogames_autosave:tab2': raw }) });
    assert.equal(env.FileManager.recoverLegacyProjects(), 2);
    assert.equal(env.ui.notes.filter((n) => /2 earlier autosaves were recovered/.test(n)).length, 1);
    assert.equal(env.FileManager.recoverLegacyProjects(), 0);
    assert.equal(env.ui.notes.length, 1, 'nothing more to say the second time');
    const full = fresh({ storage: makeStorage({ 'protogames_autosave:tab9': raw }) });
    full.storage.failWritesWith = quotaError();
    full.FileManager.recoverLegacyProjects();
    assert.ok(full.ui.notes.some((n) => /could not be copied/.test(n)));
    assert.ok('protogames_autosave:tab9' in full.storage.dump(), 'the original stays');
});

// ---- restoreState: what a loaded project resets ------------------------------------------------------------------

test('restoring a project shows it whole: the pan and zoom of the board before it are dropped', () => {
    const env = fresh();
    env.FileManager.restoreState(project(env));
    env.AppState.setView({ scale: 2.5, x: 120, y: -80 });
    env.FileManager.restoreState(project(env));
    assert.deepEqual(JSON.parse(JSON.stringify(env.AppState.getState().view)), { scale: 1, x: 0, y: 0 });
});

test('the view is reset after the new tiles are in: an infinite board frames what was drawn, which needs them', () => {
    const env = fresh();
    const order = [];
    for (const name of ['setPolygons', 'resetView']) {
        const original = env.AppState[name];
        env.AppState[name] = (...args) => { order.push(name); return original(...args); };
    }
    env.FileManager.restoreState(project(env));
    assert.deepEqual(order, ['setPolygons', 'resetView']);
});

test('restoring a project starts its undo history over, so undo cannot step back into the project before it', () => {
    const env = fresh();
    env.FileManager.restoreState(project(env));
    const state = env.AppState.getState();
    for (const color of ['#111111', '#222222', '#333333']) {
        state.polygons[0].color = color;
        env.AppState.recordHistory();
    }
    assert.ok(state.history.length >= 4);
    env.FileManager.restoreState(env.ProjectFormat.parse(fixture('v0-legacy-project.protogames.json')));
    assert.equal(state.history.length, 1, 'only the loaded board');
    assert.equal(state.historyIndex, 0);
    assert.equal(env.AppState.undo(), null, 'nothing to undo');
    assert.equal(state.isDirty, false, 'and a loaded project is not edited');
});

test('restoring a project tells a running playtest that the design changed, after the new tiles are in place', () => {
    const env = fresh();
    const told = [];
    env.app.context.Playtest = { designChanged: () => told.push(env.AppState.getState().polygons.length) };
    env.FileManager.restoreState(project(env));
    assert.deepEqual(told, [env.AppState.getState().polygons.length], 'told once, with the new board already loaded');
    assert.ok(told[0] > 0);
});

test('a board with players on it is work to lose even when every tile is blank', () => {
    const env = fresh();
    env.FileManager.restoreState(project(env));
    env.AppState.getState().polygons.forEach((p) => { p.color = env.Config.DEFAULT_TILE_COLOR; delete p.object; delete p.start; });
    assert.equal(env.FileManager.hasUserWork(), false);
    env.AppState.setPlayers([{ id: 'p1', name: 'Red', color: '#c62828', pieces: [] }]);
    assert.equal(env.FileManager.hasUserWork(), true);
    env.AppState.setPlayers([]);
    assert.equal(env.FileManager.hasUserWork(), false);
});

// ---- Opening a file -----------------------------------------------------------------------------------------------

/** init() wires the file input; this returns it and a way to make the person "choose" a file with the given text. */
function fileInput(env, text) {
    let handler;
    const input = { value: 'C:\fakepath\board.protogames.json', files: [{ name: 'board.protogames.json' }], addEventListener: (type, fn) => { if (type === 'change') handler = fn; } };
    env.app.context.FileReader = class { readAsText() { this.onload({ target: { result: text } }); } };
    env.FileManager.init({ loadInput: input });
    return { input, choose: () => handler({ target: input }) };
}

test('after a file is chosen the input is cleared, so the same file can be chosen again: after a good file and after a bad one', () => {
    const good = fresh();
    const goodInput = fileInput(good, fixture('v0-legacy-project.protogames.json'));
    goodInput.choose();
    assert.equal(good.AppState.getState().currentProjectName, 'legacy-board', 'the file opened');
    assert.equal(goodInput.input.value, '');
    const bad = fresh();
    const badInput = fileInput(bad, '{nope');
    badInput.choose();
    assert.equal(bad.calls.modals.length, 1, 'the person is told why it did not open');
    assert.equal(badInput.input.value, '', 'cleared when the file could not be read too');
});

test('choosing nothing in the file dialog does nothing', () => {
    const env = fresh();
    let handler;
    env.FileManager.init({ loadInput: { addEventListener: (type, fn) => { handler = fn; } } });
    assert.doesNotThrow(() => handler({ target: { files: [], value: 'x' } }));
    assert.equal(env.AppState.getState().currentProjectId, null);
});
