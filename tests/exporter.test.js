'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load');
const { makeUI } = require('./support/fakes');

function fresh(state, extra = {}) {
    const ui = makeUI();
    const downloads = [];
    const app = loadApp(['app/js/config.js', 'app/js/utils.js', 'app/js/exporter.js'], {
        AppState: { getState: () => state },
        UI: ui,
        Infinite: { isActive: () => false },
        Renderer: {},
        ...extra
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

test('PNG options are kept within what the export can do, anything odd becomes the default', () => {
    const { Exporter } = fresh({});
    const plain = (value) => JSON.parse(JSON.stringify(value));
    assert.deepEqual(plain(Exporter.normalizePng()), { scale: 1, textures: true, objects: true, grid: true, background: 'transparent' });
    assert.deepEqual(plain(Exporter.normalizePng({ scale: '3', textures: false, objects: false, grid: false, background: 'white' })), { scale: 3, textures: false, objects: false, grid: false, background: 'white' });
    assert.equal(Exporter.normalizePng({ scale: 99 }).scale, 4, 'at most 4 times');
    assert.equal(Exporter.normalizePng({ scale: 0 }).scale, 1);
    assert.equal(Exporter.normalizePng({ scale: 'big' }).scale, 1);
    assert.equal(Exporter.normalizePng({ scale: 2.9 }).scale, 2);
    assert.equal(Exporter.normalizePng({ background: 'url(x)' }).background, 'transparent', 'only the two backgrounds exist');
    assert.equal(Exporter.normalizePng({ grid: 'no' }).grid, true, 'a value that is not true or false is ignored');
});

test('SVG options default to what the SVG always was: flat colours, grid lines, no objects, no background', () => {
    const { Exporter } = fresh({});
    const plain = (value) => JSON.parse(JSON.stringify(value));
    assert.deepEqual(plain(Exporter.normalizeSvg()), { textures: false, objects: false, grid: true, background: 'transparent' });
    assert.deepEqual(plain(Exporter.normalizeSvg({ textures: true, objects: true, grid: false, background: 'white' })), { textures: true, objects: true, grid: false, background: 'white' });
});

test('an SVG without grid lines strokes each tile in its own colour, so no gaps show between tiles', () => {
    const { Exporter, Config } = fresh({});
    const svg = Exporter.buildSvg([triangle('#7cb342')], { width: 10, height: 9, viewBox: '0 0 10 9', grid: false });
    assert.match(svg, /fill="#7cb342" stroke="#7cb342"/);
    assert.ok(!svg.includes(Config.GRID_STROKE));
    assert.match(Exporter.buildSvg([triangle('#7cb342')], { width: 10, height: 9, viewBox: '0 0 10 9' }), /stroke="[^"]*"/);
});

test('an SVG background is a rectangle over the whole view box, also when the view box does not start at zero', () => {
    const { Exporter } = fresh({});
    const svg = Exporter.buildSvg([triangle('#7cb342')], { width: 40, height: 30, viewBox: '-5.5 12 40 30', background: '#ffffff' });
    assert.match(svg, /<rect x="-5.5" y="12" width="40" height="30" fill="#ffffff"\/>/);
    assert.ok(svg.indexOf('<rect') < svg.indexOf('<path'), 'behind the tiles');
    assert.ok(!Exporter.buildSvg([triangle('#7cb342')], { width: 10, height: 9, viewBox: '0 0 10 9' }).includes('<rect'));
});

test('objects are embedded once per kind and placed where they are drawn on screen, lower ones over higher ones', () => {
    const asked = [];
    const Objects = { dataUrlFor: (id) => { asked.push(id); return id === 'missing' ? null : 'data:image/png;base64,AAAA'; } };
    const { Exporter } = fresh({}, { Objects });
    const tile = (x, y, object) => ({ color: '#7cb342', object, vertices: [{ x, y }, { x: x + 10, y }, { x: x + 10, y: y + 10 }, { x, y: y + 10 }] });
    const polygons = [tile(0, 20, 'castle'), tile(0, 0, 'castle'), tile(20, 0, 'missing'), tile(30, 0)];
    const svg = Exporter.buildSvg(polygons, { width: 40, height: 40, viewBox: '0 0 40 40', objects: true });
    assert.equal(svg.match(/<symbol /g).length, 1, 'one picture for both castles');
    assert.equal(svg.match(/<use /g).length, 2, 'an object without a picture and a tile without an object add nothing');
    assert.ok(svg.indexOf('y="0.32"') < svg.indexOf('y="20.32"'), 'the higher tile first, so the lower one overlaps it');
    assert.match(svg, /<use href="#o0" x="0.75" y="0.32" width="8.50" height="8.50"\/>/, 'size 85% of the tile, 55% of it above the centre');
    assert.ok(!Exporter.buildSvg(polygons, { width: 40, height: 40, viewBox: '0 0 40 40' }).includes('<symbol'), 'objects are off unless asked for');
});

test('the PNG is made with the chosen options, and the colours-only view of the board comes back after it', () => {
    const calls = [];
    const flatCalls = [];
    let flat = true; // the person's board view shows colours only
    const Textures = { isFlat: () => flat, setFlat: (on) => { flatCalls.push(on); flat = on; } };
    const Renderer = { createExportCanvas: (options) => { calls.push({ ...options, flatWhilePainting: flat }); return { toDataURL: () => 'data:image/png;base64,AAAA' }; } };
    const state = { canvas: { width: 10, height: 10 }, polygons: [triangle('#fff')] };
    const { Exporter, Utils } = fresh(state, { Renderer, Textures });
    Exporter.pngCanvas({ scale: 2, textures: true, objects: false, grid: false, background: 'white' });
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), { scale: 2, objects: false, grid: false, background: '#ffffff', flatWhilePainting: false });
    assert.equal(flat, true, 'restored');
    Exporter.pngCanvas({ textures: false });
    assert.equal(calls[1].flatWhilePainting, true);
    assert.equal(calls[1].background, null, 'transparent means no background colour');
    assert.equal(flat, true);
    const names = [];
    Utils.triggerDataUrlDownload = (url, name) => names.push(name);
    state.currentProjectName = 'My board';
    Exporter.exportToPNG({ scale: 3 });
    assert.equal(calls[2].scale, 3);
    assert.deepEqual(Array.from(names), ['My board.png'], 'a file named after the project');
});

test('the SVG file is made from the chosen options', () => {
    const state = { canvas: { width: 20, height: 18 }, polygons: [triangle('#abcdef')], currentProjectName: 'Isle' };
    const { Exporter } = fresh(state);
    const made = Exporter.svgForBoard({ grid: false, background: 'white' });
    assert.equal(made.width, 20);
    assert.equal(made.height, 18);
    assert.match(made.svg, /<rect [^>]*fill="#ffffff"/);
    assert.match(made.svg, /stroke="#abcdef"/);
    assert.equal(fresh({ canvas: null, polygons: [] }).Exporter.svgForBoard(), null, 'no board, no svg');
});

const square = (x, y, color, extra = {}) => ({ color, center: { x: x + 5, y: y + 5 }, vertices: [{ x, y }, { x: x + 10, y }, { x: x + 10, y: y + 10 }, { x, y: y + 10 }], ...extra });

test('with textures every colour is a repeating picture that fills its tiles, one per colour', () => {
    const images = { '#2d5016': { tile: 'data:image/png;base64,FOREST', feature: null, size: 128 }, '#7cb342': { tile: 'data:image/png;base64,GRASS', feature: null, size: 128 } };
    const { Exporter } = fresh({});
    const textures = { images: (hex) => images[hex.toLowerCase()] || null, scale: 0.5 };
    const svg = Exporter.buildSvg([square(0, 0, '#2D5016'), square(10, 0, '#2d5016'), square(20, 0, '#7CB342'), square(30, 0, '#abcdef')], { width: 40, height: 10, viewBox: '0 0 40 10', textures });
    assert.equal(svg.match(/<pattern /g).length, 2, 'one pattern per colour, whatever the letter case');
    assert.match(svg, /<pattern id="t0" width="64.00" height="64.00" patternUnits="userSpaceOnUse"><image width="64.00" height="64.00" href="data:image\/png;base64,FOREST"\/><\/pattern>/, 'the picture is repeated at the size the board shows it');
    assert.equal(svg.match(/fill="url\(#t0\)"/g).length, 2);
    assert.equal(svg.match(/fill="url\(#t1\)"/g).length, 1);
    assert.match(svg, /fill="#abcdef"/, 'a colour without a texture stays flat');
    assert.ok(!Exporter.buildSvg([square(0, 0, '#2D5016')], { width: 10, height: 10, viewBox: '0 0 10 10' }).includes('<pattern'), 'flat colours unless textures are asked for');
});

test('with textures and no grid lines the seam-closing stroke is the flat colour, not the pattern', () => {
    const { Exporter } = fresh({});
    const textures = { images: () => ({ tile: 'data:image/png;base64,X', feature: null, size: 128 }), scale: 1 };
    const svg = Exporter.buildSvg([square(0, 0, '#2d5016')], { width: 10, height: 10, viewBox: '0 0 10 10', textures, grid: false });
    assert.match(svg, /fill="url\(#t0\)" stroke="#2d5016"/);
});

test('a colour with a picture of its own (a village) gets it laid over each tile, clipped to the tile', () => {
    const images = { '#795548': { tile: 'data:image/png;base64,GROUND', feature: 'data:image/png;base64,HOUSES', size: 128 } };
    const { Exporter } = fresh({});
    const textures = { images: (hex) => images[hex.toLowerCase()] || null, scale: 1 };
    const svg = Exporter.buildSvg([square(0, 0, '#795548'), square(10, 0, '#795548'), square(20, 0, '#111111')], { width: 30, height: 10, viewBox: '0 0 30 10', textures });
    assert.equal(svg.match(/<symbol /g).length, 1, 'the picture is stored once');
    assert.equal(svg.match(/<clipPath /g).length, 2, 'one clip per tile that has it');
    assert.equal(svg.match(/<use href="#f0"/g).length, 2);
    assert.match(svg, /<g clip-path="url\(#c0\)"><use href="#f0" x="0.25" y="0.25" width="9.50" height="9.50"\/><\/g>/, '95% of the tile, centred, clipped by a group (a clip on the use itself would move with its x and y)');
    assert.ok(svg.indexOf('<use') > svg.indexOf('<path d='), 'over the tiles');
});

test('start markers are drawn with the objects: a white line under a coloured one, pulled in to 86% of the tile', () => {
    const { Exporter } = fresh({});
    const polygons = [square(0, 0, '#7cb342', { start: '#c62828' }), square(10, 0, '#7cb342')];
    const svg = Exporter.buildSvg(polygons, { width: 20, height: 10, viewBox: '0 0 20 10', objects: true });
    assert.equal(svg.match(/stroke-width="6"/g).length, 1);
    assert.match(svg, /stroke="#c62828" stroke-width="3.5"/);
    assert.match(svg, /M 0.70 0.70 L 9.30 0.70 L 9.30 9.30 L 0.70 9.30 Z/, 'the outline pulled in around the centre');
    assert.ok(!Exporter.buildSvg(polygons, { width: 20, height: 10, viewBox: '0 0 20 10' }).includes('#c62828'), 'not without objects');
});

test('the borders between countries are lines over the tiles, a dark one under a light one, and nothing when there are none', () => {
    const { Exporter } = fresh({});
    const borders = { edges: [[{ x: 10, y: 0 }, { x: 10, y: 10 }], [{ x: 10, y: 10 }, { x: 20, y: 10 }]], color: 'rgba(255, 255, 255, 0.95)', shadow: 'rgba(10, 14, 22, 0.75)', width: 2.5 };
    const svg = Exporter.buildSvg([square(0, 0, '#7cb342'), square(10, 0, '#2d5016')], { width: 20, height: 10, viewBox: '0 0 20 10', borders });
    assert.match(svg, /<path d="M 10.00 0.00 L 10.00 10.00 M 10.00 10.00 L 20.00 10.00" fill="none" stroke="rgba\(10, 14, 22, 0.75\)" stroke-width="4.5" stroke-linecap="round"\/>/);
    assert.match(svg, /stroke="rgba\(255, 255, 255, 0.95\)" stroke-width="2.5" stroke-linecap="round"/);
    assert.ok(svg.lastIndexOf('stroke-width="1"') < svg.indexOf('stroke-width="4.5"'), 'drawn after the tiles');
    assert.ok(!Exporter.buildSvg([square(0, 0, '#7cb342')], { width: 10, height: 10, viewBox: '0 0 10 10', borders: { ...borders, edges: [] } }).includes('stroke-linecap'));
    const hostile = Exporter.buildSvg([square(0, 0, '#7cb342')], { width: 10, height: 10, viewBox: '0 0 10 10', borders: { ...borders, color: 'red" onload="x' } });
    assert.ok(!/onload="x/.test(hostile), 'a border colour cannot break out of its attribute');
});

test('country borders are the last thing in the SVG, over objects and start markers, as on screen', () => {
    const { Exporter } = fresh({});
    const borders = { edges: [[{ x: 10, y: 0 }, { x: 10, y: 10 }]], color: '#fff', shadow: '#000', width: 2.5 };
    const polygons = [square(0, 0, '#7cb342', { start: '#c62828' }), square(10, 0, '#7cb342')];
    const svg = Exporter.buildSvg(polygons, { width: 20, height: 10, viewBox: '0 0 20 10', objects: true, borders });
    assert.ok(svg.indexOf('stroke="#c62828"') < svg.indexOf('stroke-width="4.5"'), 'the start marker is under the border');
    assert.ok(svg.lastIndexOf('<path') > svg.indexOf('stroke="#c62828"'));
    assert.ok(svg.indexOf('stroke-width="2.5"') > svg.indexOf('stroke-width="3.5"'));
});

test('saved PNG and SVG options that are null or not objects become the defaults', () => {
    const { Exporter } = fresh({});
    const plain = (value) => JSON.parse(JSON.stringify(value));
    for (const bad of [null, 'text', 7, [], true]) {
        assert.deepEqual(plain(Exporter.normalizePng(bad)), plain(Exporter.PNG_DEFAULTS));
        assert.deepEqual(plain(Exporter.normalizeSvg(bad)), plain(Exporter.SVG_DEFAULTS));
    }
    assert.deepEqual(plain(Exporter.normalizeSvg(undefined)), plain(Exporter.SVG_DEFAULTS));
});
