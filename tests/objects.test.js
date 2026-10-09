'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load');

test('object ids that name inherited properties are not objects (a file with "__proto__" cannot break every frame)', () => {
    const app = loadApp(['js/objects.js'], { document: { createElement: () => { throw new Error('no canvas for an unknown id'); } } });
    const Objects = app.run('Objects');
    for (const id of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
        assert.equal(Objects.dataUrlFor(id), null, id);
        let drawn = 0;
        const polygon = { object: id, vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }] };
        assert.doesNotThrow(() => Objects.drawOnPolygon({ drawImage: () => { drawn++; } }, polygon), id);
        assert.equal(drawn, 0, id);
    }
});
