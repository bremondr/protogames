'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, GEOMETRY_SCRIPTS } = require('./support/load');
const { makeStorage, makeUI } = require('./support/fakes');

function fresh() {
    const calls = { saves: [], renders: 0, events: 0 };
    const storage = makeStorage();
    const ui = makeUI();
    const app = loadApp([...GEOMETRY_SCRIPTS.slice(0, 7), 'app/js/viewMath.js', 'app/js/state.js', 'app/js/themeManager.js'], {
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

test('a tile colour is its identity: a colour another palette (or the same theme) already uses is moved to a free one', async () => {
    const { ThemeManager, Config } = fresh();
    const taken = Config.COLOR_PALETTES[0].colors[0].hex.toLowerCase();
    await ThemeManager.saveTheme('tiles', { name: 'Clash', tiles: [{ label: 'Same as built-in', hex: taken }, { label: 'Fresh', hex: '#4b5d3a' }, { label: 'Fresh again', hex: '#4b5d3a' }] });
    const hexes = ThemeManager.get('tiles', ThemeManager.list('tiles')[0].id).tiles.map((tile) => tile.hex);
    assert.equal(new Set(hexes).size, 3, 'three different colours');
    assert.notEqual(hexes[0], taken, 'not the built-in one');
    assert.equal(hexes[1], '#4b5d3a', 'a free colour is kept as it is');
    assert.equal(hexes[2], '#4b5d3b', 'the next one up');
    // A second theme asking for the same colours gets neither of them.
    await ThemeManager.saveTheme('tiles', { name: 'Second', tiles: [{ label: 'Fresh', hex: '#4b5d3a' }] });
    const second = ThemeManager.get('tiles', ThemeManager.list('tiles')[1].id).tiles[0].hex;
    assert.ok(!hexes.includes(second) && second !== taken, 'unique across themes');
});

test('white is blank, so a theme that asks for it gets the colour just below instead of wrapping past the top of the range', async () => {
    const { ThemeManager } = fresh();
    await ThemeManager.saveTheme('tiles', { name: 'Snow', tiles: [{ label: 'Snow', hex: '#ffffff' }, { label: 'Snow too', hex: '#ffffff' }] });
    const hexes = ThemeManager.get('tiles', ThemeManager.list('tiles')[0].id).tiles.map((tile) => tile.hex);
    assert.deepEqual(Array.from(hexes), ['#fffffe', '#fffffd']);
});
