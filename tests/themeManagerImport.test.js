'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('./support/load');
const { makeStorage, makeUI } = require('./support/fakes');

function fresh(stored) {
    const storage = makeStorage(stored ? { protogames_custom_themes: JSON.stringify(stored) } : {});
    const ui = makeUI();
    class FileReader {
        readAsText(file) { setTimeout(() => { this.result = file.text; this.onload(); }); }
    }
    const app = loadApp(['js/config.js', 'js/viewMath.js', 'js/state.js', 'js/themeManager.js'], {
        localStorage: storage,
        FileReader,
        window: { dispatchEvent() {} },
        CustomEvent: class {},
        document: { getElementById: () => null },
        Textures: { registerImage() {}, unregister() {}, resetLabels() {}, dataUrlFor: () => null },
        Objects: { registerSet() {}, removeSet() {}, themes: () => [], list: () => [] },
        UI: Object.assign(ui, { initializePaletteSelector() {}, renderColorPalette() {} }),
        Renderer: { renderBoard() {} },
        FileManager: { autoSaveToLocalStorage() {} },
        Utils: {}
    });
    return { app, storage, ThemeManager: app.run('ThemeManager'), Config: app.run('Config') };
}

const themeFile = (tiles) => ({ name: 'theme.json', type: 'application/json', text: JSON.stringify({ type: 'protogames-tile-theme', name: 'Test', tiles }) });
const swatches = (env) => env.Config.COLOR_PALETTES.find((p) => p.custom).colors;

test('an imported theme keeps real hex colours, expands short ones and defaults a missing one', async () => {
    const env = fresh();
    await env.ThemeManager.importFiles('tiles', [themeFile([{ label: 'A', hex: '#4B5D3A' }, { label: 'B', hex: '#abc' }, { label: 'C' }])]);
    assert.deepEqual(plain(swatches(env).map((c) => c.hex)), ['#4b5d3a', '#aabbcc', '#cccccc']);
});

test('a theme with a colour that is not hex (a url(), markup, a name) is refused', async () => {
    for (const hex of ['url(https://example.com/track.png)', 'red', '#12345', '#ggg000', '"><img src=x>', 42, {}]) {
        const env = fresh();
        await assert.rejects(() => env.ThemeManager.importFiles('tiles', [themeFile([{ label: 'A', hex }])]), /invalid colour/, String(hex));
        assert.equal(env.Config.COLOR_PALETTES.some((p) => p.custom), false);
        assert.equal(env.storage.getItem('protogames_custom_themes'), null, 'nothing is stored');
    }
});

test('themes stored by an older version with bad colours are cleaned when restored', async () => {
    const env = fresh({ tiles: [{ id: 'custom-old', name: 'Old', tiles: [{ label: 'X', hex: 'url(https://example.com/x)' }, { label: 'Y', hex: '#ABCDEF' }] }], items: [] });
    await env.ThemeManager.init();
    assert.deepEqual(plain(swatches(env).map((c) => c.hex)), ['#cccccc', '#abcdef']);
});
