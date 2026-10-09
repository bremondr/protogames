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
        querySelector: () => ({ focus() {}, select() {}, textContent: '', value: '', addEventListener() {} }),
        remove() { element.removed = true; }
    };
    return element;
}

function fresh({ storage = makeStorage() } = {}) {
    const calls = { restored: 0, modals: [], removed: [] };
    const slots = { ownKey: () => 'protogames_autosave:test', takeRestorable: () => null, remove: (key) => calls.removed.push(key) };
    const ui = makeUI();
    const document = {
        createElement: () => { const el = makeElement(); calls.modals.push(el); return el; },
        body: { appendChild() {} },
        getElementById: () => null
    };
    const app = loadApp(['js/config.js', 'js/utils.js', 'js/projectFormat.js', 'js/viewMath.js', 'js/state.js', 'js/fileManager.js'], {
        document,
        localStorage: storage,
        CustomEvent: class {},
        clearInterval() {},
        UI: ui,
        Renderer: { renderBoard() {} },
        Infinite: { isActive: () => false },
        Interactions: {},
        AutosaveSlots: slots
    });
    app.context.window = { localStorage: storage, dispatchEvent() { calls.restored++; }, setInterval: () => 1 };
    const AppState = app.run('AppState');
    return { app, calls, ui, storage, slots, AppState, FileManager: app.run('FileManager'), ProjectFormat: app.run('ProjectFormat'), Config: app.run('Config') };
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

test('opening a file over a blank board does not ask, even though the board has tiles', () => {
    const env = fresh();
    env.FileManager.restoreState(project(env));
    env.AppState.getState().polygons.forEach((p) => { p.color = env.Config.DEFAULT_TILE_COLOR; delete p.object; });
    const modalsBefore = env.calls.modals.length;
    env.AppState.setProjectName('before');
    env.FileManager.openProject(env.ProjectFormat.parse(fixture('v0-legacy-project.protogames.json')));
    assert.equal(env.calls.modals.length, modalsBefore, 'no confirmation dialog');
    assert.equal(env.AppState.getState().currentProjectName, 'legacy-board');
});

test('a full storage is reported once, not on every failed save, and again after a save works', () => {
    const env = fresh();
    env.FileManager.restoreState(project(env));
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
    Object.defineProperty(env.app.context.window, 'localStorage', { get() { throw blocked; } });
    assert.doesNotThrow(() => env.FileManager.restoreState(project(env)), 'a file that loads fine is not reported as failed');
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

test('an autosave from a newer version is left in storage, a corrupt orphan is deleted', () => {
    const env = fresh();
    const newer = JSON.stringify({ ...JSON.parse(fixture('v2-space-arctic.protogames.json')), version: env.ProjectFormat.CURRENT_VERSION + 1 });
    env.slots.takeRestorable = () => ({ key: 'protogames_autosave:other', raw: newer, own: false });
    assert.equal(env.FileManager.loadAutoSave(), null);
    assert.deepEqual(env.calls.removed, [], 'kept for the newer app');
    env.slots.takeRestorable = () => ({ key: 'protogames_autosave:broken', raw: '{nope', own: false });
    assert.equal(env.FileManager.loadAutoSave(), null);
    assert.deepEqual(env.calls.removed, ['protogames_autosave:broken']);
});

test('opening a file over painted work asks first and only replaces after the answer', () => {
    const env = fresh();
    env.FileManager.restoreState(project(env));
    env.AppState.getState().polygons[0].color = '#123456';
    const before = env.AppState.getState().polygons;
    env.FileManager.openProject(env.ProjectFormat.parse(fixture('v0-legacy-project.protogames.json')));
    const modal = env.calls.modals[env.calls.modals.length - 1];
    assert.equal(env.AppState.getState().polygons, before, 'nothing replaced yet');
    modal.listeners.click({ target: { closest: () => ({ dataset: { action: 'cancel' } }) } });
    assert.equal(env.AppState.getState().polygons, before, 'cancel keeps the board');
    assert.equal(modal.removed, true);
});
