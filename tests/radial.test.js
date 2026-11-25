'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, GEOMETRY_SCRIPTS, plain } = require('./support/load');

const app = loadApp(GEOMETRY_SCRIPTS);
const { Geometry } = app.context;
const Radial = app.context.GeometryRadial;
const CANVAS = { width: 800, height: 700 };
const radial = (extra = {}) => ({
    gridType: 'hexagon', orientation: 'pointy-top', boardShape: 'radial', width: 9, height: 9, radius: 5, size: 10,
    triangleOrientation: 'point-up', center: 'tile', generator: 2, rings: 4, sectors: 8, hole: 1, sectorsGrow: true, ...extra
});
const build = (extra) => Geometry.generateGrid(radial(extra), CANVAS, null);
const ringOf = (p) => Number(p.id.split('_')[1]);
const area = (vertices) => Math.abs(vertices.reduce((sum, v, i) => {
    const w = vertices[(i + 1) % vertices.length];
    return sum + (v.x * w.y - w.x * v.y);
}, 0) / 2);

const SETTINGS = [];
for (const rings of [1, 4, 24]) for (const sectors of [3, 8, 48]) for (const hole of [0, 1, 4]) for (const sectorsGrow of [true, false]) {
    SETTINGS.push({ rings, sectors, hole, sectorsGrow });
}

test('rings and spaces: counts follow the settings', () => {
    const tiles = build({ rings: 3, sectors: 6, hole: 1, sectorsGrow: false });
    assert.equal(tiles.length, 18);
    assert.equal(new Set(tiles.map((p) => p.id)).size, 18, 'ids are unique');
    assert.deepEqual([0, 1, 2].map((r) => tiles.filter((p) => ringOf(p) === r).length), [6, 6, 6]);
});

test('with growth the outer rings have more spaces and keep them about as wide as the first ring', () => {
    const counts = Radial.sectorCounts(Radial.normalize(radial({ rings: 4, sectors: 8, hole: 1 })));
    assert.deepEqual(plain(counts), [8, 13, 19, 24]);
    for (let i = 1; i < counts.length; i++) assert.ok(counts[i] > counts[i - 1]);
    assert.deepEqual(plain(Radial.sectorCounts(Radial.normalize(radial({ rings: 3, sectors: 5, sectorsGrow: false })))), [5, 5, 5]);
});

test('missing or silly settings fall back to usable ones', () => {
    assert.equal(build({ rings: undefined, sectors: undefined, hole: undefined }).length > 0, true);
    const n = Radial.normalize({ rings: 99, sectors: 1, hole: -3 });
    assert.deepEqual(plain(n), { rings: 24, sectors: 3, hole: 0, grow: true });
});

test('every combination of the limits builds a clean board', () => {
    for (const settings of SETTINGS) {
        const label = JSON.stringify(settings);
        const tiles = build(settings);
        assert.ok(tiles.length > 0, label);
        assert.ok(tiles.length <= Radial.MAX_TILES, label);
        assert.equal(new Set(tiles.map((p) => p.id)).size, tiles.length, `${label}: unique ids`);
        for (const p of tiles) {
            assert.ok(p.vertices.length >= 3 && p.vertices.length <= 64, `${label}: ${p.id} has ${p.vertices.length} vertices (project files allow 3 to 64)`);
            assert.ok(p.vertices.every((v) => Number.isFinite(v.x) && Number.isFinite(v.y)), `${label}: ${p.id} finite`);
            assert.ok(area(p.vertices) > 0, `${label}: ${p.id} has area`);
            assert.equal(p.type, 'radial');
        }
    }
});

test('the spaces tile the disc: their areas add up to the annulus and fit the drawable area', () => {
    for (const settings of [{ rings: 4, sectors: 8, hole: 1, sectorsGrow: true }, { rings: 3, sectors: 12, hole: 0, sectorsGrow: false }]) {
        const tiles = build(settings);
        const xs = tiles.flatMap((p) => p.vertices.map((v) => v.x));
        const ys = tiles.flatMap((p) => p.vertices.map((v) => v.y));
        const outer = (Math.max(...xs) - Math.min(...xs)) / 2;
        const inner = outer * settings.hole / (settings.hole + settings.rings);
        const expected = Math.PI * (outer ** 2 - inner ** 2);
        const sum = tiles.reduce((s, p) => s + area(p.vertices), 0);
        // The arcs are straight edges, so the polygons are slightly smaller than the true annulus.
        assert.ok(sum < expected && sum > expected * 0.98, `area ${sum.toFixed(0)} vs ${expected.toFixed(0)}`);
        assert.ok(Math.max(...ys) - Math.min(...ys) <= CANVAS.height, 'fits the height');
    }
});

test('hit testing finds the space under a point and nothing in the hole or outside', () => {
    const tiles = build({ rings: 3, sectors: 8, hole: 1, sectorsGrow: false });
    for (const p of tiles) assert.equal(Geometry.findPolygonAtPoint(p.center, tiles)?.id, p.id, p.id);
    const xs = tiles.flatMap((p) => p.vertices.map((v) => v.x));
    const ys = tiles.flatMap((p) => p.vertices.map((v) => v.y));
    const middle = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    assert.equal(Geometry.findPolygonAtPoint(middle, tiles) ?? null, null, 'the empty middle');
    assert.equal(Geometry.findPolygonAtPoint({ x: 1, y: 1 }, tiles) ?? null, null, 'outside');
});

test('neighbours: next and previous space in the ring, and the spaces that touch across rings', () => {
    const tiles = build({ rings: 3, sectors: 8, hole: 1, sectorsGrow: false });
    const adjacency = Geometry.buildAdjacency(tiles);
    const near = (id) => adjacency.neighbors[adjacency.index.get(id)].map((i) => adjacency.ids[i]).sort();
    assert.deepEqual(plain(near('radial_1_3')), ['radial_0_3', 'radial_1_2', 'radial_1_4', 'radial_2_3']);
    assert.deepEqual(plain(near('radial_0_0')), ['radial_0_1', 'radial_0_7', 'radial_1_0']);
    assert.deepEqual(plain(near('radial_1_0')), ['radial_0_0', 'radial_1_1', 'radial_1_7', 'radial_2_0']);
});

test('neighbours stay symmetric when rings have different numbers of spaces', () => {
    for (const settings of [{ rings: 4, sectors: 8, hole: 1, sectorsGrow: true }, { rings: 3, sectors: 5, hole: 0, sectorsGrow: true }]) {
        const tiles = build(settings);
        const { neighbors, ids } = Geometry.buildAdjacency(tiles);
        neighbors.forEach((list, i) => list.forEach((j) => assert.ok(neighbors[j].includes(i), `${ids[i]} <-> ${ids[j]}`)));
        const counts = Radial.sectorCounts(Radial.normalize(radial(settings)));
        // A space is touched by its two neighbours in the ring and by every space of the next ring that shares part of its outer arc.
        const near = (id) => neighbors[ids.indexOf(id)].map((k) => ids[k]);
        const [n0, n1] = counts;
        const touching = near('radial_0_0').filter((id) => id.startsWith('radial_1_'));
        const expected = new Set();
        for (let j = 0; j < n1; j++) if (j / n1 < 1 / n0 - 1e-9 && (j + 1) / n1 > 0 + 1e-9) expected.add(`radial_1_${j}`);
        assert.deepEqual(plain(touching).sort(), [...expected].sort());
        assert.ok(Geometry.floodFill(Geometry.buildAdjacency(tiles), tiles[0].id, () => true).length === tiles.length, 'the board is one connected piece');
    }
});

test('an unknown id colour map is applied: colours survive a rebuild', () => {
    const tiles = build({ rings: 2, sectors: 4, hole: 1, sectorsGrow: false });
    const colors = new Map([['radial_1_2', '#123456']]);
    const again = Geometry.generateGrid(radial({ rings: 2, sectors: 4, sectorsGrow: false }), CANVAS, colors);
    assert.equal(again.find((p) => p.id === 'radial_1_2').color, '#123456');
    assert.equal(again.length, tiles.length);
});

// ---- Project files and share links ----------------------------------------------------------

const full = loadApp([...GEOMETRY_SCRIPTS, 'app/js/projectFormat.js', 'app/js/shareLink.js'], {
    btoa, atob, TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response, Blob
});
const PF = full.run('ProjectFormat');
const ShareLink = full.run('ShareLink');
const fixtureProject = () => plain(PF.migrate(require('./fixtures/v0-legacy-project.protogames.json')));

function radialProject(extra = {}) {
    const base = fixtureProject();
    const boardConfig = radial(extra);
    const polygons = full.context.Geometry.generateGrid(boardConfig, CANVAS, null);
    polygons[3].color = '#1976d2';
    polygons[5].object = 'castle';
    return plain(PF.createProject({ projectName: 'rings', appState: { ...base.appState, boardConfig: plain(boardConfig), polygons: plain(polygons) }, now: 0 }));
}

test('a radial board is a current project file: it validates and survives parse unchanged', () => {
    const project = radialProject();
    assert.equal(project.version, 9);
    assert.doesNotThrow(() => PF.validate(project));
    const loaded = plain(PF.parse(JSON.stringify(project)));
    assert.equal(loaded.appState.boardConfig.boardShape, 'radial');
    assert.equal(loaded.appState.polygons.length, project.appState.polygons.length);
});

test('radial settings outside their limits are refused with a message that names the setting', () => {
    for (const bad of [{ rings: 0 }, { rings: 25 }, { sectors: 2 }, { sectors: 49 }, { hole: 5 }, { hole: -1 }, { rings: 2.5 }, { sectors: '8' }, { sectorsGrow: 'yes' }]) {
        const [key] = Object.keys(bad);
        const project = radialProject();
        Object.assign(project.appState.boardConfig, bad);
        assert.throws(() => PF.validate(project), (e) => e.name === 'ProjectFormatError' && new RegExp(key).test(e.message), JSON.stringify(bad));
    }
    const missing = radialProject();
    delete missing.appState.boardConfig.rings;
    assert.throws(() => PF.validate(missing), /rings/);
});

test('v8 to v9 changes nothing but the version, so a v8 file opens as before', () => {
    const v8 = fixtureProject();
    v8.version = 8;
    const next = plain(PF.MIGRATIONS[8](v8));
    assert.equal(next.version, 9);
    assert.deepEqual({ ...next, version: 8 }, v8);
});

test('a link of a radial board is version 6, so older apps say "newer version", and it comes back as the same board', () => {
    const project = radialProject();
    const { appState } = project;
    const data = plain(ShareLink.pack({ projectName: 'rings', boardConfig: appState.boardConfig, paletteId: appState.currentPaletteId, polygons: appState.polygons, formatVersion: PF.CURRENT_VERSION }));
    assert.equal(data.v, 6);
    assert.equal(ShareLink.LINK_VERSION, 6);
    const blank = full.context.Geometry.generateGrid(radial(), CANVAS, null);
    const opened = plain(ShareLink.unpack(data, blank));
    assert.equal(opened.appState.polygons[3].color, '#1976d2');
    assert.equal(opened.appState.polygons[5].object, 'castle');
    assert.doesNotThrow(() => PF.parse(opened));
    assert.equal(plain(PF.parse(opened)).appState.boardConfig.rings, 4);
});

test('a radial link with the version of an older app is refused', () => {
    const { appState } = radialProject();
    const data = plain(ShareLink.pack({ projectName: 'rings', boardConfig: appState.boardConfig, paletteId: appState.currentPaletteId, polygons: appState.polygons, formatVersion: PF.CURRENT_VERSION }));
    data.v = 5;
    assert.throws(() => ShareLink.unpack(data, full.context.Geometry.generateGrid(radial(), CANVAS, null)), /Unrecognised link/);
});
