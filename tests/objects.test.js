'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load');

test('object ids that name inherited properties are not objects (a file with "__proto__" cannot break every frame)', () => {
    const app = loadApp(['js/textureUtils.js', 'js/objects.js'], { document: { createElement: () => { throw new Error('no canvas for an unknown id'); } } });
    const Objects = app.run('Objects');
    for (const id of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
        assert.equal(Objects.dataUrlFor(id), null, id);
        let drawn = 0;
        const polygon = { object: id, vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }] };
        assert.doesNotThrow(() => Objects.drawOnPolygon({ drawImage: () => { drawn++; } }, polygon), id);
        assert.equal(drawn, 0, id);
    }
});

test('removing an imported item set revokes its blob URLs', () => {
    const revoked = [];
    let n = 0;
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/png;base64,AAAA' };
    const app = loadApp(['js/textureUtils.js', 'js/objects.js'], {
        document: { createElement: () => canvas },
        URL: { createObjectURL: () => `blob:test/${++n}`, revokeObjectURL: (url) => revoked.push(url) },
        Blob, atob
    });
    const Objects = app.run('Objects');
    Objects.registerSet({ id: 'mine', name: 'Mine', items: [{ id: 'mine_1', label: 'One', img: { width: 10, height: 10 } }] });
    assert.equal(Objects.urlFor('mine_1'), 'blob:test/1');
    assert.equal(Objects.urlFor('mine_1'), 'blob:test/1', 'cached');
    Objects.removeSet('mine');
    assert.deepEqual(revoked, ['blob:test/1']);
});
