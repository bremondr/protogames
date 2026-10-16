'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, GEOMETRY_SCRIPTS, plain } = require('./support/load');

const app = loadApp([...GEOMETRY_SCRIPTS, 'app/js/projectFormat.js', 'app/js/shareLink.js'], {
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
    assert.equal(data.v, 1, 'links of fixed boards stay version 1 so older apps can open them');
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
    reject((d) => { d.v = ShareLink.LINK_VERSION + 1; }, /newer version/);
    reject((d) => { d.v = '3'; }, /Unrecognised/);
    reject((d) => { d.v = '1'; }, /Unrecognised/);
    reject((d) => { d.c = { ...d.c, boardShape: 'infinite' }; }, /Unrecognised/);
    reject((d) => { d.v = 0; }, /Unrecognised/);
    reject((d) => { d.v = 1.5; }, /Unrecognised/);
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

test('link size levels: fine up to 2000 characters, long up to 8000, then very long', () => {
    assert.equal(ShareLink.sizeLevel(0), 'ok');
    assert.equal(ShareLink.sizeLevel(ShareLink.LONG_LINK), 'ok');
    assert.equal(ShareLink.sizeLevel(ShareLink.LONG_LINK + 1), 'long');
    assert.equal(ShareLink.sizeLevel(ShareLink.VERY_LONG_LINK), 'long');
    assert.equal(ShareLink.sizeLevel(ShareLink.VERY_LONG_LINK + 1), 'veryLong');
    assert.ok(ShareLink.LONG_LINK < ShareLink.VERY_LONG_LINK);
});

// ---- Infinite boards ----------------------------------------------------------------------------

test('an infinite board link names its tiles and is version 2', () => {
    const config = { ...CONFIG, boardShape: 'infinite' };
    const tiles = ['inf_hp_0_0', 'inf_hp_1_0', 'inf_hp_-4_9'].map((id, i) => ({ id, color: i === 1 ? '#1976D2' : '#7CB342', ...(i === 2 ? { object: 'castle' } : {}) }));
    const data = plain(ShareLink.pack({ projectName: 'Endless', boardConfig: config, paletteId: 'landscape', polygons: tiles, formatVersion: ProjectFormat.CURRENT_VERSION }));
    assert.equal(data.v, 2);
    assert.equal(data.i, 'inf_hp_0_0.inf_hp_1_0.inf_hp_-4_9');
    // The receiver rebuilds the tiles from the ids and unpacks onto them as for any board.
    const rebuilt = data.i.split('.').map((id) => ({ id, vertices: [], color: '#ffffff' }));
    const project = plain(ShareLink.unpack(data, rebuilt));
    assert.deepEqual(project.appState.polygons.map((p) => [p.id, p.color.toLowerCase(), p.object]), [
        ['inf_hp_0_0', '#7cb342', undefined], ['inf_hp_1_0', '#1976d2', undefined], ['inf_hp_-4_9', '#7cb342', 'castle']
    ]);
});

test('a fixed board link does not carry tile ids', () => {
    assert.equal(packOf(painted()).i, undefined);
});

test('an infinite link can be compressed and decoded like any other', async () => {
    const config = { ...CONFIG, boardShape: 'infinite' };
    const tiles = Array.from({ length: 50 }, (_, i) => ({ id: `inf_s_${i}_${-i}`, color: '#7CB342' }));
    const data = plain(ShareLink.pack({ projectName: '', boardConfig: config, paletteId: 'landscape', polygons: tiles, formatVersion: 3 }));
    assert.deepEqual(plain(await ShareLink.decode(await ShareLink.encode(data))), data);
});

// ---- Country boards ----------------------------------------------------------------------------------

test('a country board link is version 3, so older apps say "newer version" instead of failing oddly', () => {
    const config = { ...CONFIG, boardShape: 'country', country: 'Czechia', width: 24, height: 15, countryParts: 'nearby' };
    const tiles = painted().slice(0, 3);
    const data = plain(ShareLink.pack({ projectName: 'Czechia', boardConfig: config, paletteId: 'landscape', polygons: tiles, formatVersion: ProjectFormat.CURRENT_VERSION }));
    assert.equal(data.v, 3);
    assert.equal(data.c.country, 'Czechia');
    assert.equal(data.i, undefined, 'the tiles are regenerated from the settings, not named');
    // A link that claims an older version but describes a country board is refused.
    assert.throws(() => ShareLink.unpack({ ...data, v: 2 }, blankBoard()), /Unrecognised/);
});

test('a country board may be wider and taller than other boards, within its own limits', () => {
    const polygons = blankBoard();
    const link = (c) => ({ ...packOf(polygons), v: 3, c });
    const country = { ...CONFIG, boardShape: 'country', country: 'Chile', width: 120, height: 201 };
    assert.doesNotThrow(() => ShareLink.unpack(link(country), polygons));
    assert.throws(() => ShareLink.unpack(link({ ...country, width: 121 }), polygons), /width in the link is out of range/);
    assert.throws(() => ShareLink.unpack(link({ ...country, height: 202 }), polygons), /height in the link is out of range/);
    // Every other shape keeps the old limit.
    assert.throws(() => ShareLink.unpack(link({ ...CONFIG, width: 101 }), polygons), /width in the link is out of range/);
});

// ---- Square boards (united with rectangle boards in project format 5) -------------------------------------

test('a share link made before the shapes were united still opens: the square board becomes a rectangle of size x size', () => {
    const config = { ...Config.DEFAULT_BOARD_CONFIG, gridType: 'square', boardShape: 'square', size: 4, width: 4, height: 4 };
    const polygons = Geometry.generateGrid(config, CANVAS, null);
    assert.equal(polygons.length, 16, 'the old shape is still generated as size x size tiles');
    const data = plain(ShareLink.pack({ projectName: 'Old', boardConfig: config, paletteId: 'landscape', polygons, formatVersion: 4 }));
    assert.equal(data.v, 1, 'links of square boards were always version 1');
    const project = plain(ProjectFormat.parse(ShareLink.unpack(data, polygons)));
    assert.equal(project.version, ProjectFormat.CURRENT_VERSION);
    assert.deepEqual([project.appState.boardConfig.boardShape, project.appState.boardConfig.width, project.appState.boardConfig.height], ['rectangle', 4, 4]);
    assert.equal(project.appState.polygons.length, 16);
});

test('a link of a rectangle board is still version 1, so older apps open it', () => {
    const config = { ...Config.DEFAULT_BOARD_CONFIG, gridType: 'square', boardShape: 'rectangle', width: 4, height: 4 };
    const polygons = Geometry.generateGrid(config, CANVAS, null);
    assert.equal(ShareLink.pack({ projectName: '', boardConfig: config, paletteId: 'landscape', polygons, formatVersion: ProjectFormat.CURRENT_VERSION }).v, 1);
});

// ---- Players and start markers ---------------------------------------------------------------------------

const RED = '#c62828';
const BLUE = '#1565c0';
const PLAYERS = [
    { color: RED, seat: 'bottom', pieces: [{ kind: 'pawn', count: 4 }, { kind: 'cube', count: 2 }] },
    { color: BLUE, seat: 'top', pieces: [{ kind: 'meeple', count: 1 }] }
];
const packWith = (polygons, players) =>
    plain(ShareLink.pack({ projectName: 'Game', boardConfig: CONFIG, paletteId: 'landscape', polygons, formatVersion: ProjectFormat.CURRENT_VERSION, players }));
const STANDARD = [3, 4, 6, 8, 10, 12, 20].map((sides) => ({ sides }));

test('a link without players or start markers is still version 1 and carries no extra keys', () => {
    const data = packWith(painted(), []);
    assert.equal(data.v, 1);
    for (const key of ['pl', 'sc', 's']) assert.equal(data[key], undefined, key);
    assert.equal(plain(ShareLink.pack({ projectName: 'x', boardConfig: CONFIG, paletteId: 'landscape', polygons: painted(), formatVersion: 5 })).v, 1, 'players left out entirely');
});

test('players and start markers make a link version 4 and come back unchanged', () => {
    const polygons = painted();
    polygons[0].start = RED;
    polygons[7].start = RED.toUpperCase();
    polygons[8].start = BLUE;
    const data = packWith(polygons, PLAYERS);
    assert.equal(data.v, 4, 'older apps say "newer version" instead of dropping the players');
    assert.equal(ShareLink.LINK_VERSION, 4);
    assert.deepEqual(data.pl, [[RED, 'bottom', [['pawn', 4], ['cube', 2]]], [BLUE, 'top', [['meeple', 1]]]]);
    assert.deepEqual(data.sc, [RED, BLUE], 'start colours are kept once each, in lower case');

    const project = plain(ShareLink.unpack(data, blankBoard()));
    assert.deepEqual(project.appState.players, PLAYERS);
    assert.equal(project.appState.polygons[0].start, RED);
    assert.equal(project.appState.polygons[7].start, RED);
    assert.equal(project.appState.polygons[8].start, BLUE);
    assert.equal(project.appState.polygons[1].start, undefined);
    assert.deepEqual(project.appState.dice, STANDARD, 'the standard dice are implied');
    assert.doesNotThrow(() => ProjectFormat.parse(project));
    assert.deepEqual(plain(ProjectFormat.parse(project)).appState.players, PLAYERS);
});

test('start markers alone, without players, also make a version 4 link', () => {
    const polygons = painted();
    polygons[2].start = BLUE;
    const data = packWith(polygons, []);
    assert.equal(data.v, 4);
    assert.equal(data.pl, undefined);
    const project = plain(ShareLink.unpack(data, blankBoard()));
    assert.equal(project.appState.polygons[2].start, BLUE);
    assert.deepEqual(project.appState.players, []);
});

test('an infinite or country board with players is at least version 4', () => {
    const config = { ...CONFIG, boardShape: 'infinite' };
    const data = plain(ShareLink.pack({ projectName: 'x', boardConfig: config, paletteId: 'landscape', polygons: painted().slice(0, 2), formatVersion: ProjectFormat.CURRENT_VERSION, players: PLAYERS }));
    assert.equal(data.v, 4);
    assert.equal(typeof data.i, 'string');
});

test('a link made before players existed opens with no players and the standard dice through the migration', () => {
    const data = packOf(painted(), 5);
    const project = plain(ShareLink.unpack(data, blankBoard()));
    assert.equal(project.appState.players, undefined, 'the file format of that link has none yet');
    const loaded = plain(ProjectFormat.parse(project));
    assert.deepEqual(loaded.appState.players, []);
    assert.deepEqual(loaded.appState.dice, STANDARD);
});

test('links with unusable players or start markers are refused', () => {
    const polygons = painted();
    polygons[0].start = RED;
    const good = () => packWith(polygons, PLAYERS);
    const reject = (mutate, pattern) => {
        const data = good();
        mutate(data);
        assert.throws(() => ShareLink.unpack(data, blankBoard()), pattern);
    };
    assert.doesNotThrow(() => ShareLink.unpack(good(), blankBoard()));
    reject((d) => { d.v = 3; }, /Unrecognised/);
    reject((d) => { d.pl = 'players'; }, /invalid players/);
    reject((d) => { d.pl = Array.from({ length: 9 }, () => [RED, 'bottom', []]); }, /invalid players/);
    reject((d) => { d.pl = [[RED, 'bottom']]; }, /invalid players/);
    reject((d) => { d.pl = [['red', 'bottom', []]]; }, /invalid players/);
    reject((d) => { d.pl = [[RED, 'middle', []]]; }, /invalid players/);
    reject((d) => { d.pl = [[RED, 'bottom', 'pawns']]; }, /invalid players/);
    reject((d) => { d.pl = [[RED, 'bottom', [['dragon', 1]]]]; }, /invalid pieces/);
    reject((d) => { d.pl = [[RED, 'bottom', [['pawn', 1.5]]]]; }, /invalid pieces/);
    reject((d) => { d.pl = [[RED, 'bottom', [['pawn']]]]; }, /invalid pieces/);
    reject((d) => { d.sc = ['red']; }, /invalid start colours/);
    reject((d) => { d.sc = 'red'; }, /invalid start colours/);
    reject((d) => { d.s = '99999:0'; }, /start marker on a tile that does not exist/);
    reject((d) => { d.s = '0:9'; }, /start marker on a tile that does not exist/);
    // Meaning (unique colours, piece caps) is checked by the project format after unpacking.
    const duplicate = good();
    duplicate.pl = [[RED, 'bottom', []], [RED, 'top', []]];
    assert.throws(() => ProjectFormat.parse(ShareLink.unpack(duplicate, blankBoard())), /share the colour/);
    const tooMany = good();
    tooMany.pl = [[RED, 'bottom', [['pawn', 501]]]];
    assert.throws(() => ProjectFormat.parse(ShareLink.unpack(tooMany, blankBoard())), /invalid number of pawn/);
});
