'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, GEOMETRY_SCRIPTS, plain } = require('./support/load');

const app = loadApp([...GEOMETRY_SCRIPTS, 'js/pieces.js']);
const Pieces = app.run('Pieces');
const Geometry = app.context.Geometry;
const Config = app.run('Config');
const Neighbors = app.context.GeometryNeighbors;

const CONFIG = { ...Config.DEFAULT_BOARD_CONFIG, gridType: 'square', boardShape: 'rectangle', width: 4, height: 3 };
const board = () => Geometry.generateGrid(CONFIG, { width: 800, height: 600 }, null);
const hit = (...args) => { const found = Pieces.hitTest(...args); return found ? found.id : null; };
const piece = (id, tileId, extra = {}) => ({ id, kind: 'pawn', color: '#c62828', tileId, ...extra });

test('a piece is half the smaller side of its tile', () => {
    const [tile] = board();
    const side = Math.min(tile.bounds.maxX - tile.bounds.minX, tile.bounds.maxY - tile.bounds.minY);
    assert.equal(Pieces.tileSize(tile), side);
    assert.equal(Pieces.pieceSize(tile), side * Pieces.SIZE_FACTOR);
});

test('pieces sharing a tile are spread so that all stay visible, and pile up beyond four', () => {
    assert.deepEqual(plain(Pieces.offsets(1)), [[0, 0]]);
    for (const n of [2, 3, 4]) {
        const spots = plain(Pieces.offsets(n));
        assert.equal(spots.length, n);
        assert.equal(new Set(spots.map((s) => s.join(','))).size, n, `${n} distinct spots`);
    }
    const many = plain(Pieces.offsets(9));
    assert.equal(many.length, 9);
    assert.deepEqual(many.slice(0, 4), plain(Pieces.offsets(4)));
    assert.ok(many[8][1] < many[4][1], 'the pile rises');
});

test('placements put a piece on its tile and skip pieces in the tray or on tiles that do not exist', () => {
    const tiles = board();
    const byId = Pieces.polygonMap(tiles);
    const list = Pieces.placements([piece('a', tiles[0].id), piece('b', null), piece('c', 'gone'), piece('d', tiles[1].id), piece('e', tiles[1].id)], byId);
    assert.deepEqual(plain(list.map((e) => e.piece.id)), ['a', 'd', 'e']);
    const alone = list[0];
    assert.equal(alone.x, tiles[0].center.x);
    assert.equal(alone.y, tiles[0].center.y);
    const [d, e] = list.slice(1);
    assert.notEqual(d.x, e.x, 'two pieces on one tile do not overlap exactly');
});

test('a point on a piece hits it, one far away does not, and the lower piece is on top', () => {
    const tiles = board();
    const byId = Pieces.polygonMap(tiles);
    const list = Pieces.placements([piece('a', tiles[0].id), piece('b', tiles[5].id)], byId);
    const a = list[0];
    assert.equal(hit(list, { x: a.x, y: a.y - a.size * 0.5 }), 'a');
    assert.equal(hit(list, { x: a.x + a.size * 3, y: a.y }), null);
    assert.equal(hit(list, { x: a.x, y: a.y + a.size * 3 }), null);
    // A fingertip is allowed more room than a mouse.
    const edge = { x: a.x + a.size / 2 + 5, y: a.y - a.size * 0.5 };
    assert.equal(hit(list, edge), null);
    assert.equal(hit(list, edge, 10), 'a');
    // Pieces that overlap: the one drawn last (lower on screen, then later in the list) wins. The fifth piece on a
    // tile piles up in the middle, and the fourth stands lower right of it, in front.
    const stacked = Pieces.placements(['x', 'y', 'z', 'w', 'v'].map((id) => piece(id, tiles[2].id)), byId);
    const pile = stacked.find((entry) => entry.piece.id === 'v');
    assert.equal(hit(stacked, { x: pile.x, y: pile.y - pile.size * 0.2 }), 'w', 'w stands in front of v');
    const middle = Pieces.placements([piece('p', tiles[3].id), piece('q', tiles[3].id)], byId);
    const lower = middle.reduce((a, b) => (b.y > a.y ? b : a));
    assert.equal(hit(middle, { x: lower.x, y: lower.y - lower.size * 0.2 }), lower.piece.id);
});

test('shade makes a colour lighter or darker', () => {
    assert.equal(Pieces.shade('#808080', 0), 'rgb(128, 128, 128)');
    assert.equal(Pieces.shade('#000000', 1), 'rgb(255, 255, 255)');
    assert.equal(Pieces.shade('#ffffff', -1), 'rgb(0, 0, 0)');
    assert.equal(Pieces.shade('#fff', 0), 'rgb(255, 255, 255)');
    assert.equal(Pieces.shade('nonsense', 0), 'rgb(128, 128, 128)');
});

test('an arrow key picks the neighbour that lies that way, and nothing past the edge', () => {
    const tiles = board();
    const adjacency = Neighbors.buildAdjacency(tiles);
    const row = tiles.filter((t) => t.center.y === tiles[0].center.y);
    const first = row[0];
    const second = row[1];
    assert.equal(Pieces.neighborInDirection(tiles, adjacency, first.id, 1, 0), second.id);
    assert.equal(Pieces.neighborInDirection(tiles, adjacency, second.id, -1, 0), first.id);
    assert.equal(Pieces.neighborInDirection(tiles, adjacency, first.id, -1, 0), null, 'the board ends there');
    assert.equal(Pieces.neighborInDirection(tiles, adjacency, first.id, 0, -1), null, 'and there');
    const below = Pieces.neighborInDirection(tiles, adjacency, first.id, 0, 1);
    assert.ok(tiles.find((t) => t.id === below).center.y > first.center.y);
    assert.equal(Pieces.neighborInDirection(tiles, adjacency, 'missing', 1, 0), null);
});

test('hexagon tiles can be left in six directions, each closer to some arrow than another', () => {
    const hexes = Geometry.generateGrid({ ...Config.DEFAULT_BOARD_CONFIG, radius: 3 }, { width: 800, height: 600 }, null);
    const adjacency = Neighbors.buildAdjacency(hexes);
    const middle = hexes.reduce((best, t) => (Math.hypot(t.center.x - 400, t.center.y - 300) < Math.hypot(best.center.x - 400, best.center.y - 300) ? t : best));
    const right = Pieces.neighborInDirection(hexes, adjacency, middle.id, 1, 0);
    const left = Pieces.neighborInDirection(hexes, adjacency, middle.id, -1, 0);
    assert.ok(right && left && right !== left);
    assert.ok(hexes.find((t) => t.id === right).center.x > middle.center.x);
    assert.ok(hexes.find((t) => t.id === left).center.x < middle.center.x);
});

test('a tile is described by its column and row among the board', () => {
    const tiles = board();
    const first = tiles[0];
    const labels = tiles.map((t) => Pieces.tileLabel(tiles, t));
    assert.equal(new Set(labels).size, tiles.length, 'every tile of a plain grid has its own label');
    const topLeft = tiles.reduce((a, b) => (b.center.x + b.center.y < a.center.x + a.center.y ? b : a));
    assert.equal(Pieces.tileLabel(tiles, topLeft), 'column 1, row 1');
    assert.match(Pieces.tileLabel(tiles, first), /^column \d+, row \d+$/);
});

test('drawing a piece of an unknown kind falls back to a pawn, and every kind draws something', () => {
    const calls = [];
    const gradient = { addColorStop() {} };
    const ctx = new Proxy({}, {
        get: (target, name) => {
            if (name === 'createLinearGradient' || name === 'createRadialGradient') return () => gradient;
            return (...args) => { calls.push(name); return args; };
        },
        set: () => true
    });
    for (const kind of ['pawn', 'disc', 'cube', 'meeple', 'dragon', '__proto__', 'constructor']) {
        calls.length = 0;
        assert.doesNotThrow(() => Pieces.draw(ctx, kind, 50, 80, 40, '#c62828', 1), kind);
        assert.ok(calls.includes('fill'), `${kind} is filled in`);
    }
});

test('only pieces on visible tiles are drawn, a carried piece is left out and the selected one gets a ring', () => {
    const tiles = board();
    const strokes = [];
    const drawn = [];
    const ctx = new Proxy({}, {
        get: (target, name) => {
            if (name === 'createLinearGradient' || name === 'createRadialGradient') return () => ({ addColorStop() {} });
            if (name === 'stroke') return () => strokes.push('stroke');
            if (name === 'ellipse') return () => drawn.push('ellipse');
            return () => {};
        },
        set: () => true
    });
    const visible = { minX: -1e6, minY: -1e6, maxX: 1e6, maxY: 1e6 };
    const pieces = [piece('a', tiles[0].id), piece('b', tiles[1].id), piece('c', null)];
    const count = (hidden, selected) => {
        strokes.length = 0;
        Pieces.drawAll(ctx, tiles, pieces, 1, visible, hidden, selected);
        return strokes.length;
    };
    const both = count(null, null);
    assert.ok(both > 0);
    assert.ok(count(['a'], null) < both, 'a hidden piece is not drawn');
    assert.ok(count(['a', 'b'], null) === 0, 'neither is the other');
    assert.ok(count(null, 'a') > both, 'the selected piece adds a ring');
    const nowhere = { minX: 5000, minY: 5000, maxX: 6000, maxY: 6000 };
    strokes.length = 0;
    Pieces.drawAll(ctx, tiles, pieces, 1, nowhere, null, null);
    assert.equal(strokes.length, 0, 'off screen');
});
