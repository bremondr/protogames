'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, GEOMETRY_SCRIPTS, plain } = require('./support/load');

const app = loadApp([...GEOMETRY_SCRIPTS, 'js/projectFormat.js', 'js/shareLink.js'], {
    btoa, atob, TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response, Blob
});
const ShareLink = app.run('ShareLink');
const ProjectFormat = app.run('ProjectFormat');
const Geometry = app.context.Geometry;
const Config = app.run('Config');

const CANVAS = { width: 1200, height: 800 };
const CONFIG = { ...Config.DEFAULT_BOARD_CONFIG, radius: 2, width: 5, height: 5 };
const blankBoard = () => Geometry.generateGrid(CONFIG, CANVAS, null);

function painted() {
    const polygons = blankBoard();
    polygons[0].color = '#7CB342';
    polygons[1].color = '#7cb342';
    polygons[2].color = '#1976D2';
    polygons[3].object = 'castle';
    polygons[4].object = 'castle';
    polygons[5].object = 'tower';
    return polygons;
}

const packOf = (polygons, formatVersion = ProjectFormat.CURRENT_VERSION) =>
    plain(ShareLink.pack({ projectName: 'My board', boardConfig: CONFIG, paletteId: 'landscape', polygons, formatVersion }));

test('pack keeps each distinct colour and object once and unpack restores the board', () => {
    const polygons = painted();
    const data = packOf(polygons);
    assert.equal(data.v, ShareLink.LINK_VERSION);
    assert.equal(data.f, ProjectFormat.CURRENT_VERSION);
    assert.deepEqual(data.ob, ['castle', 'tower']);
    assert.equal(data.k.length, new Set(polygons.map((p) => p.color.toLowerCase())).size, 'colours are case-insensitive');

    const project = plain(ShareLink.unpack(data, blankBoard()));
    assert.equal(project.projectName, 'My board');
    assert.equal(project.appState.paletteId, 'landscape');
    project.appState.polygons.forEach((tile, i) => {
        assert.equal(tile.color.toLowerCase(), polygons[i].color.toLowerCase(), `colour of tile ${i}`);
        assert.equal(tile.object, polygons[i].object, `object of tile ${i}`);
    });
});

test('an unpacked link is a valid project of the format version it was made with', () => {
    const project = ShareLink.unpack(packOf(painted()), blankBoard());
    assert.equal(project.version, ProjectFormat.CURRENT_VERSION);
    assert.doesNotThrow(() => ProjectFormat.parse(project));
});

test('a link made before a palette change migrates like a saved file', () => {
    const polygons = blankBoard();
    polygons[0].color = '#FFD60A'; // the retired Space "Star" colour of format 1
    polygons[1].color = '#B3E5FC'; // retired Arctic "Ice"
    const project = plain(ProjectFormat.parse(ShareLink.unpack(packOf(polygons, 1), blankBoard())));
    assert.equal(project.version, ProjectFormat.CURRENT_VERSION);
    assert.equal(project.appState.polygons[0].color, '#0D1B2A');
    assert.equal(project.appState.polygons[0].object, 'star');
    assert.equal(project.appState.polygons[1].color, '#D6E8F2');
});

test('unpack refuses links it cannot trust', () => {
    const good = () => packOf(painted());
    const reject = (mutate, pattern) => {
        const data = good();
        mutate(data);
        assert.throws(() => ShareLink.unpack(data, blankBoard()), pattern);
    };
    reject((d) => { d.v = 2; }, /newer version/);
    reject((d) => { d.v = 0; }, /Unrecognised/);
    reject((d) => { delete d.f; }, /Unrecognised/);
    reject((d) => { d.k = ['red']; }, /invalid colours/);
    reject((d) => { d.k = ['#fff', 5]; }, /invalid colours/);
    reject((d) => { d.t = d.t.split('.').slice(1).join('.'); }, /size mismatch/);
    reject((d) => { d.t = d.t.replace(/^[^.]+/, 'zz'); }, /colour it does not contain/);
    reject((d) => { d.o = '0:9'; }, /tile that does not exist/);
    reject((d) => { d.o = 'zzz:0'; }, /tile that does not exist/);
    reject((d) => { d.ob = [1]; }, /invalid items/);
    reject((d) => { d.c = { ...d.c, width: 100000 }; }, /out of range/);
    reject((d) => { d.c = null; }, /board settings/);
    assert.throws(() => ShareLink.unpack(null, blankBoard()), /Unrecognised/);
});

test('base64url is URL safe and round-trips every byte', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    const text = ShareLink.toBase64Url(bytes);
    assert.match(text, /^[A-Za-z0-9_-]+$/);
    assert.deepEqual([...ShareLink.fromBase64Url(text)], [...bytes]);
    for (const length of [0, 1, 2, 3, 4, 5]) {
        const part = bytes.slice(0, length);
        assert.deepEqual([...ShareLink.fromBase64Url(ShareLink.toBase64Url(part))], [...part], `length ${length}`);
    }
});

test('encode and decode round-trip a board through compression', async () => {
    const data = packOf(painted());
    const decoded = plain(await ShareLink.decode(await ShareLink.encode(data)));
    assert.deepEqual(decoded, data);
});

test('a bigger board stays small in the link', async () => {
    const config = { ...Config.DEFAULT_BOARD_CONFIG, radius: 10, width: 21, height: 21 };
    const polygons = Geometry.generateGrid(config, CANVAS, null);
    polygons.forEach((p, i) => { p.color = i % 3 ? '#7CB342' : '#1976D2'; });
    const encoded = await ShareLink.encode(ShareLink.pack({ projectName: '', boardConfig: config, paletteId: 'landscape', polygons, formatVersion: 2 }));
    assert.ok(encoded.length < 1200, `link payload is ${encoded.length} characters`);
});

test('hashPayload finds the board in an address hash', () => {
    assert.equal(ShareLink.hashPayload('#b=abc_-123'), 'abc_-123');
    assert.equal(ShareLink.hashPayload('#x=1&b=abc'), 'abc');
    assert.equal(ShareLink.hashPayload(''), null);
    assert.equal(ShareLink.hashPayload('#other'), null);
    assert.equal(ShareLink.hashPayload(undefined), null);
});

test('urlFor replaces an existing hash and describeLength is readable', () => {
    assert.equal(ShareLink.urlFor('http://x/app?y=1#old', 'AB'), 'http://x/app?y=1#b=AB');
    assert.equal(ShareLink.describeLength(279), '279 characters link');
    assert.equal(ShareLink.describeLength(2048), '2.0 KB link');
});
