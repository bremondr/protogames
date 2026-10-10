'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, GEOMETRY_SCRIPTS, plain } = require('./support/load');

/** A tiny world in the format of world-atlas (quantized TopoJSON); coordinates are degrees. */
function fakeTopology() {
    const ring = (x, y, w, h) => [[x, y], [w, 0], [0, h], [-w, 0], [0, -h]];
    return {
        type: 'Topology',
        transform: { scale: [1, 1], translate: [0, 0] },
        arcs: [
            ring(10, 40, 10, 5), // 0 Squareland: 10 x 5 degrees
            ring(30, 40, 10, 5), // 1 Archipelago: the main island
            ring(41, 41, 0.5, 0.5), // 2 a tiny islet about 85 km off the coast
            ring(90, 41, 1, 1), // 3 a tiny islet far away
            ring(20, 40, 5, 5), // 4 Next door, sharing the east side of Squareland
            ring(100, -70, 10, 5) // 5 Antarctica
        ],
        objects: {
            countries: {
                type: 'GeometryCollection',
                geometries: [
                    { type: 'Polygon', arcs: [[0]], properties: { name: 'Squareland' } },
                    { type: 'MultiPolygon', arcs: [[[1]], [[2]], [[3]]], properties: { name: 'Archipelago' } },
                    { type: 'Polygon', arcs: [[4]], properties: { name: 'Next door' } },
                    { type: 'Polygon', arcs: [[5]], properties: { name: 'Antarctica' } },
                    { type: 'Polygon', properties: { name: 'No outline' } }
                ]
            }
        }
    };
}

/** Loads the module with a stand-in for fetch and the few DOM calls it makes while loading. */
function load({ fetchImpl } = {}) {
    const document = {
        addEventListener() {},
        getElementById() { return null; },
        querySelector() { return null; },
        querySelectorAll() { return []; }
    };
    const fetched = [];
    const fetch = fetchImpl || (async (url) => {
        fetched.push(url);
        return { ok: true, json: async () => fakeTopology() };
    });
    const app = loadApp([...GEOMETRY_SCRIPTS, 'js/viewMath.js', 'js/countryBoard.js'], { document, fetch });
    return { app, fetched, CountryBoard: app.run('CountryBoard'), Geometry: app.context.Geometry, Config: app.run('Config') };
}

const CANVAS = { width: 1200, height: 800 };
const config = (Config, overrides) => ({ ...Config.DEFAULT_BOARD_CONFIG, gridType: 'square', boardShape: 'country', country: 'Squareland', width: 10, ...overrides });

test('outlines are fetched once, from the file that ships with the app, and the country list is sorted without Antarctica', async () => {
    const { CountryBoard, fetched } = load();
    assert.deepEqual(plain(CountryBoard.names()), []);
    assert.equal(await CountryBoard.ready(), true);
    assert.equal(await CountryBoard.ready(), true);
    assert.equal(fetched.length, 1, 'the second call reuses the first download');
    assert.equal(fetched[0], 'data/countries-50m.json', 'same origin and relative, so it also works under /preview/pr-<n>/ and passes the Content-Security-Policy');
    assert.deepEqual(plain(CountryBoard.names()), ['Archipelago', 'Next door', 'Squareland']);
});

test('a failed download resolves to false so the caller can say so, and can be retried', async () => {
    let calls = 0;
    const { CountryBoard } = load({ fetchImpl: async () => { calls += 1; throw new Error('offline'); } });
    const error = console.error;
    console.error = () => {};
    try {
        assert.equal(await CountryBoard.ready(), false);
        assert.equal(await CountryBoard.ready(), false);
    } finally {
        console.error = error;
    }
    assert.equal(calls, 2, 'a failure is not remembered');
});

test('a bad HTTP status counts as a failed download', async () => {
    const { CountryBoard } = load({ fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
    const error = console.error;
    console.error = () => {};
    try { assert.equal(await CountryBoard.ready(), false); } finally { console.error = error; }
});

test('other board shapes are left alone', async () => {
    const { Geometry, Config, CountryBoard } = load();
    await CountryBoard.ready();
    const tiles = Geometry.generateGrid({ ...Config.DEFAULT_BOARD_CONFIG }, CANVAS, null);
    assert.ok(tiles.length > 50 && tiles.every((t) => !t.id.startsWith('inf_')));
});

test('a country board is a rectangle of tiles with the country\'s proportions, using the ids of that rectangle', async () => {
    const { Geometry, Config, CountryBoard } = load();
    await CountryBoard.ready();
    const cfg = config(Config, { width: 12 });
    const tiles = Geometry.generateGrid(cfg, CANVAS, null);
    const rows = cfg.height;
    assert.ok(rows >= 2 && rows < 12, `rows follow from the proportions (${rows})`);
    // Squareland is 10 x 5 degrees but a degree of longitude is shorter there, so about 8 : 5.5.
    const aspect = rows / 12;
    assert.ok(aspect > 0.5 && aspect < 0.85, `aspect ${aspect}`);
    const rectangle = Geometry.generateGrid({ ...cfg, boardShape: 'rectangle', width: 12, height: rows }, CANVAS, null);
    const ids = new Set(rectangle.map((t) => t.id));
    assert.ok(tiles.every((t) => ids.has(t.id)), 'tiles keep the ids of the underlying rectangle, so paint survives regeneration');
    assert.ok(tiles.length >= rectangle.length * 0.9, 'a rectangular country keeps (almost) every tile');
    assert.equal(new Set(tiles.map((t) => t.id)).size, tiles.length);
    assert.equal(CountryBoard.hasOwners(), false, 'a single country needs no ownership');
});

test('the tile count follows "tiles across", clamped to what a board may have', async () => {
    const { Geometry, Config, CountryBoard } = load();
    await CountryBoard.ready();
    const small = Geometry.generateGrid(config(Config, { width: 6 }), CANVAS, null);
    const large = Geometry.generateGrid(config(Config, { width: 24 }), CANVAS, null);
    assert.ok(large.length > small.length * 8);
    const cfg = config(Config, { width: 100000 });
    Geometry.generateGrid(cfg, CANVAS, null);
    assert.ok(cfg.height <= CountryBoard.MAX_SPAN);
});

test('the islands setting decides which parts of a country are on the board', async () => {
    const { CountryBoard } = load();
    await CountryBoard.ready();
    const parts = (mode) => CountryBoard.shapeOf('Archipelago', mode).parts.length;
    assert.equal(parts('main'), 1, 'only the large island');
    assert.equal(parts('nearby'), 2, 'plus the islet close to the coast, not the far one');
    assert.equal(parts('all'), 3);
    // Settings saved before "countryParts" existed.
    assert.equal(parts(true), 2);
    assert.equal(parts(false), 3);
    assert.equal(CountryBoard.shapeOf('Squareland', 'nearby').parts.length, 1);
    assert.equal(CountryBoard.shapeOf('Nowhere'), null);
});

test('every island still gets a tile, even one far smaller than a tile', async () => {
    const { Geometry, Config, CountryBoard } = load();
    await CountryBoard.ready();
    const components = (tiles) => {
        const adjacency = Geometry.buildAdjacency(tiles);
        const seen = new Set();
        let count = 0;
        for (let start = 0; start < tiles.length; start++) {
            if (seen.has(start)) continue;
            count += 1;
            const queue = [start];
            seen.add(start);
            while (queue.length) for (const next of adjacency.neighbors[queue.pop()]) if (!seen.has(next)) { seen.add(next); queue.push(next); }
        }
        return count;
    };
    const main = Geometry.generateGrid(config(Config, { country: 'Archipelago', countryParts: 'main', width: 20 }), CANVAS, null);
    const all = Geometry.generateGrid(config(Config, { country: 'Archipelago', countryParts: 'all', width: 20 }), CANVAS, null);
    assert.equal(components(main), 1, 'the main island alone is one block of tiles');
    // The far islet is 60 degrees away and far smaller than a tile, but it is on the board as a tile of its own.
    assert.ok(components(all) >= 2, `separate islands are separate blocks (${components(all)})`);
});

test('an unknown country falls back to a plain rectangle instead of failing', async () => {
    const { Geometry, Config, CountryBoard } = load();
    await CountryBoard.ready();
    const tiles = Geometry.generateGrid(config(Config, { country: 'Atlantis', width: 8, height: 6 }), CANVAS, null);
    assert.equal(tiles.length, 8 * 6);
});

test('before the outlines have arrived the board is the plain rectangle, and a missing country name means the default', async () => {
    const { Geometry, Config } = load({ fetchImpl: () => new Promise(() => {}) });
    const cfg = config(Config, { country: '', width: 8, height: 6 });
    const tiles = Geometry.generateGrid(cfg, CANVAS, null);
    assert.equal(tiles.length, 8 * 6);
    assert.equal(cfg.country, 'Czechia', 'a missing name is filled in with the default');
});

test('colours painted on the rectangle carry over onto the cut board', async () => {
    const { Geometry, Config, CountryBoard } = load();
    await CountryBoard.ready();
    const cfg = config(Config, { width: 10 });
    const first = Geometry.generateGrid(cfg, CANVAS, null);
    const colorMap = new Map(first.map((t, i) => [t.id, i % 2 ? '#7CB342' : '#1976D2']));
    const again = Geometry.generateGrid(config(Config, { width: 10 }), CANVAS, colorMap);
    assert.deepEqual(plain(again.map((t) => [t.id, t.color])), plain(first.map((t, i) => [t.id, i % 2 ? '#7CB342' : '#1976D2'])));
});

test('the outlines file that ships with the app decodes, and has the countries the app relies on', async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const real = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'data', 'countries-50m.json'), 'utf8'));
    const { CountryBoard } = load({ fetchImpl: async () => ({ ok: true, json: async () => real }) });
    assert.equal(await CountryBoard.ready(), true);
    const names = CountryBoard.names();
    for (const name of ['Czechia', 'France', 'Fiji', 'Japan', 'Indonesia', 'Chile', 'United States of America']) assert.ok(names.includes(name), name);
    assert.ok(!names.includes('Antarctica'));
    assert.ok(names.length > 170);
    const czechia = CountryBoard.shapeOf('Czechia', 'nearby');
    assert.equal(czechia.parts.length, 1);
    assert.ok(czechia.bbox.w > czechia.bbox.h, 'Czechia is wider than tall');
    assert.ok(CountryBoard.shapeOf('Japan', 'main').parts.length < CountryBoard.shapeOf('Japan', 'all').parts.length, 'the islands setting matters for archipelagos');
    assert.ok(CountryBoard.shapeOf('Fiji', 'nearby').parts.length > 3, 'Fiji keeps its islands even though it crosses the antimeridian');
});
