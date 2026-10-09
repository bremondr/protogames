'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, GEOMETRY_SCRIPTS } = require('./support/load');
const { makeStorage, makeUI } = require('./support/fakes');

function fresh() {
    const calls = { saves: [], renders: 0, events: 0 };
    const storage = makeStorage();
    const ui = makeUI();
    const app = loadApp([...GEOMETRY_SCRIPTS.slice(0, 7), 'js/viewMath.js', 'js/state.js', 'js/themeManager.js'], {
        localStorage: storage,
        window: { dispatchEvent: () => { calls.events++; } },
        CustomEvent: class { constructor(type) { this.type = type; } },
        Textures: { registerImage() {}, unregister() {}, resetLabels() {}, dataUrlFor: () => null },
        Objects: { registerSet() {}, removeSet() {}, themes: () => [], list: () => [] },
        UI: ui,
        Renderer: { renderBoard: () => { calls.renders++; } },
        FileManager: { autoSaveToLocalStorage: (force) => calls.saves.push(force) },
        Utils: {}
    });
    return { app, calls, storage, ui, ThemeManager: app.run('ThemeManager'), AppState: app.run('AppState'), Config: app.run('Config') };
}

const tile = (id, color) => ({ id, color, vertices: [], center: { x: 0, y: 0 } });

test('editing a theme recolours the board and its undo history, then marks the board dirty and saves', async () => {
    const { ThemeManager, AppState, calls } = fresh();
    await ThemeManager.saveTheme('tiles', { name: 'Swamp', tiles: [{ label: 'Bog', hex: '#4b5d3a' }, { label: 'Reeds', hex: '#8a9a4a' }] });
    const id = ThemeManager.list('tiles')[0].id;
    const editable = ThemeManager.get('tiles', id);
    const bog = editable.tiles[0].hex;

    AppState.setPolygons([tile('a', bog), tile('b', '#ffffff')]);
    AppState.recordHistory();
    AppState.getState().polygons[1].color = bog;
    AppState.recordHistory();
    AppState.clearDirty();

    await ThemeManager.saveTheme('tiles', {
        name: 'Swamp',
        tiles: [{ label: 'Bog', hex: '#123456', orig: bog }, { label: 'Reeds', hex: '#8a9a4a' }]
    }, id);

    const state = AppState.getState();
    assert.equal(state.polygons[0].color, '#123456');
    assert.equal(state.polygons[1].color, '#123456');
    for (const snapshot of state.history) {
        assert.ok(snapshot.every((entry) => entry.color !== bog), 'no snapshot keeps the old colour');
    }
    AppState.restoreSnapshot(AppState.undo());
    assert.equal(state.polygons[0].color, '#123456', 'undo does not bring the old colour back');
    assert.equal(state.isDirty, true);
    assert.deepEqual(calls.saves, [true]);
});

test('a theme edit that recolours nothing does not touch the autosave', async () => {
    const { ThemeManager, AppState, calls } = fresh();
    await ThemeManager.saveTheme('tiles', { name: 'Swamp', tiles: [{ label: 'Bog', hex: '#4b5d3a' }] });
    const id = ThemeManager.list('tiles')[0].id;
    AppState.setPolygons([tile('a', '#ffffff')]);
    AppState.recordHistory();
    AppState.clearDirty();
    await ThemeManager.saveTheme('tiles', { name: 'Marsh', tiles: [{ label: 'Bog', hex: '#4b5d3a' }] }, id);
    assert.equal(AppState.getState().isDirty, false);
    assert.deepEqual(calls.saves, []);
});
