'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load');

const app = loadApp(['js/config.js', 'js/textures.js']);
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
