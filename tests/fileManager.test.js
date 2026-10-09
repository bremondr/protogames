'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load');
const { makeStorage, makeUI } = require('./support/fakes');

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
    const calls = { restored: 0, modals: [] };
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
        AutosaveSlots: { ownKey: () => 'protogames_autosave:test', takeRestorable: () => null, remove() {} }
    });
    app.context.window = { localStorage: storage, dispatchEvent() { calls.restored++; }, setInterval: () => 1 };
    const AppState = app.run('AppState');
    return { app, calls, ui, storage, AppState, FileManager: app.run('FileManager'), ProjectFormat: app.run('ProjectFormat'), Config: app.run('Config') };
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
