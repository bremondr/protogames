'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('./support/load');

/** A 2D context that accepts every call, so the drawing code runs without a browser. */
function fakeContext() {
    const target = {};
    return new Proxy(target, {
        get(object, prop) {
            if (prop in object) return object[prop];
            if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => ({ addColorStop() {} });
            if (prop === 'createPattern') return () => ({});
            if (prop === 'getImageData' || prop === 'createImageData') return (x, y, w = 128, h = 128) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
            return () => {};
        },
        set(object, prop, value) { object[prop] = value; return true; }
    });
}

function load() {
    const drawn = [];
    const document = {
        createElement: () => {
            const context = fakeContext();
            const canvas = { width: 0, height: 0, getContext: () => context, toDataURL: () => `data:image/png;base64,${drawn.push(1)}` };
            return canvas;
        }
    };
    const app = loadApp(['app/js/config.js', 'app/js/textureUtils.js', 'app/js/textures.js', 'app/js/objects.js'], { document });
    return { app, Config: app.run('Config'), Textures: app.run('Textures'), Objects: app.run('Objects') };
}

const nordicPalette = (Config) => Config.COLOR_PALETTES.find((p) => p.id === 'simple-nordic');

test('Simple nordic is a built-in palette of the same eight terrains as Landscape, with colours of its own', () => {
    const { Config } = load();
    const nordic = nordicPalette(Config);
    const landscape = Config.getPaletteById('landscape');
    assert.equal(nordic.name, 'Simple nordic');
    assert.equal(nordic.style, 'nordic');
    assert.deepEqual(plain(nordic.colors.map((c) => c.label)), plain(landscape.colors.map((c) => c.label)));
    for (const color of nordic.colors) assert.match(color.hex, /^#[0-9A-F]{6}$/i, color.label);
    // A colour is a tile's identity in saved files and share links: a nordic colour may not be in another palette either.
    const others = new Map();
    for (const palette of Config.COLOR_PALETTES.filter((p) => p.id !== 'simple-nordic')) palette.colors.forEach((c) => others.set(c.hex.toLowerCase(), palette.id));
    const own = new Set();
    for (const color of nordic.colors) {
        const key = color.hex.toLowerCase();
        assert.equal(others.has(key), false, `${color.hex} is also in ${others.get(key)}`);
        assert.equal(own.has(key), false, `${color.hex} is used twice`);
        own.add(key);
    }
    assert.equal(own.has(String(Config.DEFAULT_FILL).toLowerCase()), false, 'and none is the blank tile colour');
    assert.equal(Config.getAllPalettes().some((p) => p.id === 'simple-nordic'), true, 'it is offered in the palette list');
});

test('every Simple nordic terrain draws, and the ones with a picture of their own are the pines, mountain, cabin and volcano (Grassland is plain)', () => {
    const { Config, Textures } = load();
    const withFeature = [];
    for (const color of nordicPalette(Config).colors) {
        assert.ok(Textures.dataUrlFor(color.hex), `${color.label} has a texture`);
        if (Textures.isFeature(color.hex)) withFeature.push(color.label);
    }
    assert.deepEqual(withFeature, ['Forest', 'Mountain', 'Village', 'Volcanic']);
});

test('the Landscape palette is drawn as before: only the village and the volcano are pictures', () => {
    const { Config, Textures } = load();
    const withFeature = plain(Config.getPaletteById('landscape').colors.filter((c) => Textures.isFeature(c.hex)).map((c) => c.label));
    assert.deepEqual(withFeature, ['Village', 'Volcanic']);
});

test('the style follows the colour, also after the palettes change', () => {
    const { Config, Textures } = load();
    const forest = nordicPalette(Config).colors[0].hex;
    assert.equal(Textures.isFeature(forest), true);
    // an imported theme appears and the label index is rebuilt: nothing about the built-in palettes is lost
    Config.COLOR_PALETTES.push({ id: 'imported', name: 'Imported', colors: [{ label: 'Bog', hex: '#4b5d3a' }] });
    Textures.resetLabels();
    assert.equal(Textures.isFeature(forest), true);
    assert.equal(Textures.isFeature(Config.getPaletteById('landscape').colors[0].hex), false, 'the landscape forest has no single-tile picture');
});

test('Simple nordic is an item set of its own, and every item in it draws', () => {
    const { Objects } = load();
    assert.ok(plain(Objects.themes()).some((t) => t.id === 'simple-nordic' && t.name === 'Simple nordic'));
    const items = plain(Objects.list('simple-nordic'));
    assert.deepEqual(items.map((i) => i.label), ['Cabin', 'Longhouse', 'Watchtower', 'Pine', 'Dwarf birch', 'Pine grove', 'Runestone', 'Campfire', 'Longship', 'Banner']);
    const medieval = new Set(plain(Objects.list('medieval')).map((i) => i.id));
    for (const item of items) {
        assert.equal(medieval.has(item.id), false, `${item.id} does not collide with a medieval item`);
        assert.ok(Objects.dataUrlFor(item.id), `${item.label} draws`);
        assert.equal(Objects.labelFor(item.id), item.label);
    }
    assert.equal(new Set(items.map((i) => i.id)).size, items.length, 'ids are unique');
});
