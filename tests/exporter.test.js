'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load');
const { makeUI } = require('./support/fakes');

function fresh(state) {
    const ui = makeUI();
    const downloads = [];
    const app = loadApp(['js/config.js', 'js/utils.js', 'js/exporter.js'], {
        AppState: { getState: () => state },
        UI: ui,
        Infinite: { isActive: () => false },
        Renderer: {}
    });
    app.run('Utils').triggerBlobDownload = (blob, name) => downloads.push({ blob, name });
    return { Exporter: app.run('Exporter'), Utils: app.run('Utils'), ui, downloads, Config: app.run('Config') };
}

const triangle = (color) => ({ vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8.66 }], color });

test('a colour cannot break out of its attribute in an exported SVG', () => {
    const { Exporter } = fresh({});
    const svg = Exporter.buildSvg([triangle('red" onload="alert(1)'), triangle("x' y='z"), triangle('<script>')], { width: 10, height: 9, viewBox: '0 0 10 9' });
    assert.ok(!/onload="/.test(svg), 'no injected attribute');
    assert.ok(!svg.includes('<script>'));
    assert.match(svg, /fill="red&quot; onload=&quot;alert\(1\)"/);
    assert.equal(svg.match(/<path /g).length, 3);
    assert.equal(svg.match(/ fill="/g).length, 3, 'one fill per tile');
});

test('an ordinary colour is written as is', () => {
    const { Exporter } = fresh({});
    assert.match(Exporter.buildSvg([triangle('#7cb342')], { width: 10, height: 9, viewBox: '0 0 10 9' }), /fill="#7cb342"/);
});

test('exporting without a board says so in the app instead of an alert', () => {
    const state = { canvas: { width: 10, height: 10 }, polygons: [] };
    const env = fresh(state);
    env.Exporter.exportToSVG();
    env.Exporter.exportToPNG();
    assert.deepEqual(env.ui.notes, ['Generate a board before exporting.', 'Generate a board before exporting.']);
    assert.equal(env.downloads.length, 0);
});

test('escapeAttribute handles every character that matters in an attribute', () => {
    const { Utils } = fresh({});
    assert.equal(Utils.escapeAttribute(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
    assert.equal(Utils.escapeAttribute(42), '42');
});
