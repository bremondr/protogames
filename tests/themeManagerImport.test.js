'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('./support/load');
const { makeStorage, makeUI } = require('./support/fakes');

function fresh(stored, extra = {}) {
    const storage = makeStorage(stored ? { protogames_custom_themes: JSON.stringify(stored) } : {});
    const ui = makeUI();
    class FileReader {
        readAsText(file) { setTimeout(() => { this.result = file.text; this.onload(); }); }
    }
    const app = loadApp(['app/js/config.js', 'app/js/viewMath.js', 'app/js/state.js', 'app/js/themeManager.js'], {
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
        Utils: {},
        setTimeout,
        clearTimeout,
        ...extra
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

test('a white or near-white tile is bumped down from the top of the range, never wrapped round to black', async () => {
    const env = fresh();
    // #ffffff is the board's own fill, so it is taken; the second and third tiles collide with it and each other.
    await env.ThemeManager.importFiles('tiles', [themeFile([
        { label: 'Snow', hex: '#ffffff' }, { label: 'Snow 2', hex: '#fff' }, { label: 'Almost', hex: '#fffffe' }, { label: 'Ink', hex: '#000000' }
    ])]);
    const hexes = plain(swatches(env).map((c) => c.hex));
    assert.equal(new Set(hexes).size, 4, 'all four stay distinct');
    assert.ok(!hexes.slice(0, 3).includes('#000000'), `none of the whites became black: ${hexes}`);
    hexes.slice(0, 3).forEach((hex) => assert.ok(parseInt(hex.slice(1), 16) > 0xfffff0, `${hex} is still near white`));
    assert.ok(hexes.includes('#000000'), 'black itself is kept');
});

// ---- Start-up: pictures must not hold anything back ------------------------------------------------------

/** An Image whose address answers (or never does): "hang" never loads, "gone" fails, anything else loads. */
class FakeImage {
    set src(value) {
        this._src = value;
        if (!value || /hang/.test(value)) return;
        setTimeout(() => (/gone/.test(value) ? this.onerror() : this.onload()), 1);
    }
    get src() { return this._src; }
}

const stored = (...images) => ({ tiles: [{ id: 'custom-slow', name: 'Slow', tiles: images.map((image, i) => ({ label: `T${i}`, hex: `#12345${i}`, image })) }], items: [] });

test('init puts a stored theme\'s palette in place at once and does not wait for its pictures', async () => {
    const registered = [];
    let renders = 0;
    const env = fresh(stored('https://host/hang/a.png', 'https://host/hang/b.png'), {
        Image: FakeImage,
        Textures: { registerImage: (hex) => registered.push(hex), unregister() {}, resetLabels() {}, dataUrlFor: () => null },
        Renderer: { renderBoard: () => { renders++; } }
    });
    const started = Date.now();
    const done = env.ThemeManager.init({ imageTimeoutMs: 40 });
    // Synchronously after the call: the palette exists, so a project that uses these colours opens as itself.
    assert.ok(env.Config.COLOR_PALETTES.some((p) => p.id === 'custom-slow'), 'the palette is registered before any picture');
    assert.deepEqual(registered, []);
    await done;
    assert.ok(Date.now() - started < 1000, 'both hanging pictures were given up on after the timeout, in parallel');
    assert.deepEqual(registered, [], 'no texture: the tiles keep their flat colour');
    assert.ok(env.Config.COLOR_PALETTES.some((p) => p.id === 'custom-slow'));
});

test('pictures that arrive are applied and the view is redrawn; a failed or hanging one does not stop the others', async () => {
    const registered = [];
    let renders = 0;
    let swatches = 0;
    const env = fresh(stored('https://host/ok.png', 'https://host/gone.png', 'https://host/hang.png', 'data:image/png;base64,AAAA'), {
        Image: FakeImage,
        Textures: { registerImage: (hex) => registered.push(hex), unregister() {}, resetLabels() {}, dataUrlFor: () => null },
        Renderer: { renderBoard: () => { renders++; } },
        UI: Object.assign(makeUI(), { initializePaletteSelector() {}, renderColorPalette: () => { swatches++; } })
    });
    await env.ThemeManager.init({ imageTimeoutMs: 40 });
    assert.deepEqual(registered.sort(), ['#123450', '#123453']);
    assert.ok(renders >= 2, 'the board was redrawn as pictures arrived');
    assert.ok(swatches >= 2, 'and so were the swatches');
});
