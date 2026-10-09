'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load');

const app = loadApp(['js/config.js', 'js/textureUtils.js', 'js/textures.js']);
const Textures = app.run('Textures');

test('the colours-only view is off by default and can be switched on and off', () => {
    assert.equal(Textures.isFlat(), false);
    Textures.setFlat(true);
    assert.equal(Textures.isFlat(), true);
    Textures.setFlat(false);
    assert.equal(Textures.isFlat(), false);
    Textures.setFlat('yes');
    assert.equal(Textures.isFlat(), true, 'any truthy value counts');
    Textures.setFlat(0);
    assert.equal(Textures.isFlat(), false);
});

test('in the colours-only view no texture, feature or swatch image is produced', () => {
    Textures.setFlat(true);
    try {
        // None of these may touch the canvas context: flat colours are drawn by the caller.
        assert.equal(Textures.patternFor(null, '#2D5016'), null);
        assert.equal(Textures.urlFor('#2D5016'), null);
        assert.equal(Textures.drawFeature(null, '#2D5016', { vertices: [] }), false);
    } finally {
        Textures.setFlat(false);
    }
});

/** Generates a texture on a recording fake canvas and returns the colour stops and line widths it used. */
function recordTexture(hex) {
    const stops = [];
    const widths = [];
    const ctx = new Proxy({}, {
        get(target, prop) {
            if (prop === 'createRadialGradient') return () => ({ addColorStop: (at, color) => stops.push(`${at}:${color}`) });
            return typeof target[prop] === 'undefined' ? () => {} : target[prop];
        },
        set(target, prop, value) {
            if (prop === 'lineWidth') widths.push(value);
            target[prop] = value;
            return true;
        }
    });
    const recorder = loadApp(['js/config.js', 'js/textureUtils.js', 'js/textures.js'], {
        document: { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, toDataURL: () => 'data:,' }) }
    });
    recorder.run('Textures').dataUrlFor(hex);
    return { stops, widths };
}

const hexOf = (pattern) => {
    for (const palette of app.run('Config').COLOR_PALETTES) {
        const color = palette.colors.find((c) => pattern.test(c.label.toLowerCase()));
        if (color) return color.hex;
    }
    throw new Error(`no palette colour for ${pattern}`);
};

function fakeBrowser() {
    const revoked = [];
    let n = 0;
    const ctx = new Proxy({}, { get: (target, prop) => (prop === 'createRadialGradient' ? () => ({ addColorStop() {} }) : target[prop] || (() => {})), set: () => true });
    const globals = {
        document: { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,AAAA' }) },
        URL: { createObjectURL: () => `blob:test/${++n}`, revokeObjectURL: (url) => revoked.push(url) },
        Blob, atob
    };
    return { revoked, app: loadApp(['js/config.js', 'js/textureUtils.js', 'js/textures.js'], globals) };
}

test('a colour without a label is not remembered as "no texture" for good', () => {
    const { app: browser } = fakeBrowser();
    const T = browser.run('Textures');
    const C = browser.run('Config');
    const hex = '#123456';
    assert.equal(T.dataUrlFor(hex), null, 'unknown colour has no texture');
    // A theme adds the colour to a palette afterwards.
    C.COLOR_PALETTES[0].colors.push({ hex, label: 'Forest edge' });
    T.resetLabels();
    assert.ok(T.dataUrlFor(hex), 'it gets its texture once the palette knows it');
});

test('object URLs are revoked when their texture is replaced or removed', () => {
    const { app: browser, revoked } = fakeBrowser();
    const T = browser.run('Textures');
    const forest = browser.run('Config').COLOR_PALETTES.flatMap((p) => p.colors).find((c) => /forest/i.test(c.label)).hex;
    const url = T.urlFor(forest);
    assert.ok(url);
    assert.equal(T.urlFor(forest), url, 'the URL is cached');
    T.registerImage(forest, { width: 10, height: 10 });
    assert.deepEqual(revoked, [url], 'replacing the texture frees the old blob');
    const second = T.urlFor(forest);
    T.unregister(forest);
    assert.deepEqual(revoked, [url, second]);
});

test('TextureUtils.createUrlCache revokes a blob URL when it is dropped', () => {
    const { app: browser, revoked } = fakeBrowser();
    const cache = browser.run('TextureUtils').createUrlCache();
    cache.set('a', 'blob:test/a');
    assert.equal(cache.get('a'), 'blob:test/a');
    cache.drop('a');
    cache.drop('missing');
    assert.deepEqual(revoked, ['blob:test/a']);
    assert.equal(cache.has('a'), false);
});
