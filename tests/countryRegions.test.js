'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, GEOMETRY_SCRIPTS, plain } = require('./support/load');

const real = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'app', 'data', 'countries-50m.json'), 'utf8'));

/** Two countries that share a border: the east side of Squareland is the west side of Next door. */
function fakeTopology() {
    const ring = (x, y, w, h) => [[x, y], [w, 0], [0, h], [-w, 0], [0, -h]];
    return {
        type: 'Topology',
        transform: { scale: [1, 1], translate: [0, 0] },
        arcs: [ring(10, 40, 10, 5), ring(20, 40, 10, 5)],
        objects: {
            countries: {
                type: 'GeometryCollection',
                geometries: [
                    { type: 'Polygon', arcs: [[0]], properties: { name: 'Squareland' } },
                    { type: 'Polygon', arcs: [[1]], properties: { name: 'Next door' } }
                ]
            }
        }
    };
}

/** A canvas context that only remembers what was drawn. */
function recorder() {
    const calls = [];
    const ctx = new Proxy({}, {
        get(target, name) { return name in target ? target[name] : (...args) => { calls.push([name, ...args]); }; },
        set(target, name, value) { target[name] = value; calls.push(['set ' + name, value]); return true; }
    });
    return { ctx, calls };
}

async function load(topology) {
    const Renderer = { onRender() {}, paint() { return { drawn: 0, total: 0 }; }, createExportCanvas() { return null; } };
    const document = { addEventListener() {}, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; } };
    const fetch = async () => ({ ok: true, json: async () => topology });
    const app = loadApp([...GEOMETRY_SCRIPTS, 'app/js/viewMath.js', 'app/js/state.js', 'app/js/countryBoard.js', 'app/js/countryRegions.js'], { document, fetch, Renderer });
    const CountryBoard = app.run('CountryBoard');
    await CountryBoard.ready();
    return { app, CountryBoard, CountryRegions: app.run('CountryRegions'), Renderer, Geometry: app.context.Geometry, AppState: app.run('AppState'), Config: app.run('Config') };
}

const CANVAS = { width: 1200, height: 800 };
const board = (Config, overrides) => ({ ...Config.DEFAULT_BOARD_CONFIG, gridType: 'square', boardShape: 'country', width: 24, ...overrides });

test('every country a region names exists in the outlines that ship with the app', async () => {
    const { CountryBoard, CountryRegions } = await load(real);
    const known = new Set(real.objects.countries.geometries.filter((g) => g.properties && g.properties.name).map((g) => g.properties.name));
    const missing = [];
    for (const [region, members] of Object.entries(CountryRegions.REGIONS)) {
        for (const member of members) if (!known.has(member)) missing.push(`${region}: ${member}`);
    }
    assert.deepEqual(missing, [], 'a misspelt member would silently be left off its region');
    for (const region of Object.keys(CountryRegions.REGIONS)) assert.ok(CountryBoard.names().includes(region), region);
});

test('regions are listed first and can be picked like countries', async () => {
    const { CountryBoard, CountryRegions } = await load(real);
    const names = CountryBoard.names();
    const regionCount = Object.keys(CountryRegions.REGIONS).length;
    assert.ok(names.slice(0, regionCount).every((n) => CountryBoard.isRegion(n)), 'regions come before the countries');
    assert.ok(!CountryBoard.isRegion('Czechia'));
    assert.equal(CountryBoard.shapeOf('Benelux', 'nearby').multi, true);
    assert.ok(CountryBoard.shapeOf('Benelux', 'nearby').parts.length >= 3);
});

test('Europe leaves out Russia, Turkey and Kazakhstan, whose outlines cannot be split', async () => {
    const { CountryRegions } = await load(real);
    for (const name of ['Russia', 'Turkey', 'Kazakhstan']) assert.ok(!CountryRegions.REGIONS.Europe.includes(name), name);
});

test('a board cut from several countries knows which country each tile belongs to', async () => {
    const { Geometry, Config, CountryBoard } = await load(fakeTopology());
    CountryBoard.registerRegion('Duo', ['Squareland', 'Next door']);
    const tiles = Geometry.generateGrid(board(Config, { country: 'Duo' }), CANVAS, null);
    assert.equal(CountryBoard.hasOwners(), true);
    assert.ok(tiles.every((t) => CountryBoard.ownerOf(t.id)), 'every tile has an owner');
    const west = tiles.filter((t) => CountryBoard.ownerOf(t.id) === 'Squareland');
    const east = tiles.filter((t) => CountryBoard.ownerOf(t.id) === 'Next door');
    assert.ok(west.length > 0 && east.length > 0);
    assert.ok(Math.max(...west.map((t) => t.center.x)) < Math.min(...east.map((t) => t.center.x)), 'Squareland is on the west, Next door on the east');
    // Both countries are the same size, so the board splits about half and half.
    assert.ok(Math.abs(west.length - east.length) / tiles.length < 0.2, `${west.length} / ${east.length}`);
});

test('borders are the tile edges between two countries, and only those', async () => {
    const { Geometry, Config, CountryBoard, CountryRegions } = await load(fakeTopology());
    CountryBoard.registerRegion('Duo', ['Squareland', 'Next door']);
    const tiles = Geometry.generateGrid(board(Config, { country: 'Duo' }), CANVAS, null);
    const edges = CountryRegions.borderEdges(tiles);
    assert.ok(edges.length > 4, `edges: ${edges.length}`);
    // The border is one vertical line, so every edge has about the same x.
    const xs = edges.flatMap(([a, b]) => [a.x, b.x]);
    const tile = tiles[0].bounds.maxX - tiles[0].bounds.minX;
    assert.ok(Math.max(...xs) - Math.min(...xs) < tile * 0.1, 'the border is a straight line');
    assert.equal(CountryRegions.borderEdges(tiles), edges, 'worked out once per tile list');
});

test('a single country has no borders to draw', async () => {
    const { Geometry, Config, CountryBoard, CountryRegions } = await load(fakeTopology());
    const tiles = Geometry.generateGrid(board(Config, { country: 'Squareland' }), CANVAS, null);
    assert.equal(CountryBoard.hasOwners(), false);
    assert.deepEqual(plain(CountryRegions.borderEdges(tiles)), []);
});

test('print and export pages get the borders too, unless they are switched off or the board is not a region', async () => {
    const { Geometry, Config, CountryBoard, Renderer, AppState } = await load(fakeTopology());
    CountryBoard.registerRegion('Duo', ['Squareland', 'Next door']);
    const config = board(Config, { country: 'Duo' });
    const tiles = Geometry.generateGrid(config, CANVAS, null);
    const view = { scale: 2, x: 0, y: 0 };
    const strokes = (cfg) => {
        AppState.getState().boardConfig = cfg;
        const { ctx, calls } = recorder();
        Renderer.paint(ctx, { polygons: tiles, width: 100, height: 100, view });
        return calls.filter((c) => c[0] === 'stroke').length;
    };
    assert.equal(strokes(config), 2, 'a shadow and a white line');
    assert.equal(strokes({ ...config, countryBorders: false }), 0, 'switched off');
    assert.equal(strokes({ ...config, country: 'Squareland' }), 0, 'not a region');
    assert.equal(strokes({ ...config, boardShape: 'hexagon' }), 0, 'not a country board');
});
