'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, loadApp, plain } = require('./support/load');

const app = loadApp(['app/js/config.js', 'app/js/projectFormat.js']);
const Config = app.run('Config');
const PF = app.run('ProjectFormat');

const load = (entry) => plain(PF.parse(fs.readFileSync(path.join(ROOT, 'app', entry.file), 'utf8')));
const tilesOf = (project, color) => project.appState.polygons.filter((p) => p.color.toLowerCase() === color.toLowerCase());
const hexOf = (project, label) => Config.getPaletteById(project.appState.paletteId).colors.find((c) => c.label === label).hex;

test('every listed showcase ships its file, which loads, uses only its own palette and has a distinct id', () => {
    const ids = new Set();
    for (const entry of Config.SHOWCASES) {
        assert.ok(!ids.has(entry.id), `${entry.id} is listed twice`);
        ids.add(entry.id);
        assert.equal(entry.file, `showcases/${entry.id}.protogames.json`);
        const project = load(entry);
        const palette = Config.getPaletteById(project.appState.paletteId);
        assert.ok(palette, `${entry.id} names a palette that exists`);
        const hexes = new Set(palette.colors.map((c) => c.hex.toLowerCase()));
        for (const polygon of project.appState.polygons) assert.ok(hexes.has(polygon.color.toLowerCase()), `${entry.id}: ${polygon.id} is painted in a colour of ${palette.id}`);
    }
});

test('every shipped showcase file is listed, so none is forgotten', () => {
    const listed = new Set(Config.SHOWCASES.map((entry) => path.basename(entry.file)));
    const shipped = fs.readdirSync(path.join(ROOT, 'app', 'showcases')).filter((name) => name.endsWith('.json'));
    assert.deepEqual(shipped.sort(), [...listed].sort());
});

test('start markers only use colours of players that have enough pieces for them', () => {
    for (const entry of Config.SHOWCASES) {
        const { players, polygons } = load(entry).appState;
        const markers = {};
        for (const polygon of polygons) if (polygon.start) markers[polygon.start.toLowerCase()] = (markers[polygon.start.toLowerCase()] || 0) + 1;
        for (const [color, count] of Object.entries(markers)) {
            const owner = players.find((p) => p.color.toLowerCase() === color);
            assert.ok(owner, `${entry.id}: the ${color} markers belong to a player`);
            const pieces = owner.pieces.reduce((sum, piece) => sum + piece.count, 0);
            assert.equal(pieces, count, `${entry.id}: ${color} has as many pieces as start markers`);
        }
    }
});

test('chess is 8 x 8 with alternating squares, a dark square at the bottom left, and two armies of 16', () => {
    const project = load(Config.SHOWCASES.find((e) => e.id === 'chess'));
    const byId = new Map(project.appState.polygons.map((p) => [p.id, p]));
    assert.equal(byId.size, 64);
    assert.equal(byId.get('square_7_0').color, hexOf(project, 'Dark square'));
    assert.equal(byId.get('square_7_1').color, hexOf(project, 'Light square'));
    assert.equal(byId.get('square_0_0').color, hexOf(project, 'Light square'));
    assert.equal(tilesOf(project, hexOf(project, 'Dark square')).length, 32);
    assert.deepEqual(project.appState.players.map((p) => p.pieces[0].count), [16, 16]);
    assert.deepEqual(project.appState.dice, []);
});

test('the island has 19 land tiles in rows of 3, 4, 5, 4 and 3, in the standard mix, inside a ring of sea', () => {
    const project = load(Config.SHOWCASES.find((e) => e.id === 'island-settlers'));
    const counts = Object.fromEntries(
        Config.getPaletteById('island-settlers').colors.map((c) => [c.label, tilesOf(project, c.hex).length])
    );
    assert.deepEqual(counts, { Forest: 4, Hills: 3, 'Pasture grass': 4, 'Wheat fields': 4, Mountains: 3, Desert: 1, 'Sea water': 18 });
    const rows = new Map();
    for (const polygon of project.appState.polygons) {
        if (polygon.color.toLowerCase() === hexOf(project, 'Sea water').toLowerCase()) continue;
        const r = Number(polygon.id.split('_')[2]);
        rows.set(r, (rows.get(r) || 0) + 1);
    }
    assert.deepEqual([...rows].sort((a, b) => a[0] - b[0]).map(([, n]) => n), [3, 4, 5, 4, 3]);
    assert.equal(project.appState.players.length, 0, 'the island is a board without pieces');
});

test('peg solitaire is a triangle of 15 holes with 14 pegs, the apex empty', () => {
    const project = load(Config.SHOWCASES.find((e) => e.id === 'peg-solitaire'));
    const { polygons } = project.appState;
    assert.equal(project.appState.boardConfig.boardShape, 'triangle');
    assert.equal(polygons.length, 15);
    assert.equal(polygons.filter((p) => p.start).length, 14);
    const apex = polygons.reduce((top, p) => (p.center.y < top.center.y ? p : top));
    assert.equal(apex.start, undefined);
});

test('the Chinese checkers star has 121 holes, six corners of 10 and a middle of 61', () => {
    const project = load(Config.SHOWCASES.find((e) => e.id === 'chinese-checkers'));
    const palette = Config.getPaletteById('classic-wood');
    const holes = palette.colors.filter((c) => c.label === 'Hole' || /corner$/.test(c.label));
    assert.equal(holes.reduce((sum, c) => sum + tilesOf(project, c.hex).length, 0), 121);
    assert.equal(tilesOf(project, hexOf(project, 'Hole')).length, 61);
    for (const corner of holes.filter((c) => /corner$/.test(c.label))) assert.equal(tilesOf(project, corner.hex).length, 10, corner.label);
    assert.equal(project.appState.players.length, 6);
    // Opposite corners belong to players on opposite seats' sides: no two players share a start tile.
    const starts = project.appState.polygons.filter((p) => p.start);
    assert.equal(new Set(starts.map((p) => p.id)).size, 60);
});

test('the board-game palettes share no colour with any other palette, since the colour is the tile identity', () => {
    const own = new Set(['chess', 'island-settlers', 'classic-wood']);
    const others = new Set();
    for (const palette of Config.COLOR_PALETTES) if (!own.has(palette.id)) palette.colors.forEach((c) => others.add(c.hex.toLowerCase()));
    const seen = new Set();
    for (const id of own) {
        for (const color of Config.getPaletteById(id).colors) {
            const hex = color.hex.toLowerCase();
            assert.ok(!others.has(hex) && !seen.has(hex), `${hex} (${color.label}) is used by another palette`);
            seen.add(hex);
        }
    }
});
