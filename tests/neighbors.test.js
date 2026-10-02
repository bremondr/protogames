'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGeometry, plain } = require('./support/load');

const { Geometry, Checks } = loadGeometry();
const CANVAS = { width: 1200, height: 800 };
const generate = (config) => Geometry.generateGrid(config, CANVAS, null);
const valid = () => Checks.allCombinations().filter((c) => c.valid);

const degreeHistogram = (adjacency) => {
    const histogram = {};
    for (const list of adjacency.neighbors) histogram[list.length] = (histogram[list.length] || 0) + 1;
    return histogram;
};

test('adjacency is symmetric: A neighbours B if and only if B neighbours A', () => {
    for (const combo of valid()) {
        const adjacency = Geometry.buildAdjacency(generate(combo.config));
        adjacency.neighbors.forEach((list, a) => {
            for (const b of list) assert.ok(adjacency.neighbors[b].includes(a), `${combo.key}: ${adjacency.ids[a]} -> ${adjacency.ids[b]}`);
        });
    }
});

test('a tile is never its own neighbour and neighbour lists have no duplicates', () => {
    for (const combo of valid()) {
        const adjacency = Geometry.buildAdjacency(generate(combo.config));
        adjacency.neighbors.forEach((list, a) => {
            assert.ok(!list.includes(a), `${combo.key}: self neighbour`);
            assert.equal(new Set(list).size, list.length, `${combo.key}: duplicate neighbour`);
        });
    }
});

test('interior tiles have the right number of neighbours: hex 6, square 4, triangle 3', () => {
    const cases = [
        ['hexagon', 'hexagon', 6],
        ['rectangle', 'square', 4],
        ['hexagon', 'triangle', 3]
    ];
    for (const [boardShape, gridType, expected] of cases) {
        for (const orientation of ['pointy-top', 'flat-top']) {
            const config = Checks.makeConfig(boardShape, gridType, orientation, 'point-up', { radius: 5, width: 9, height: 9 });
            const adjacency = Geometry.buildAdjacency(generate(config));
            const max = Math.max(...adjacency.neighbors.map((n) => n.length));
            assert.equal(max, expected, `${boardShape}/${gridType}/${orientation}`);
            assert.ok(degreeHistogram(adjacency)[expected] > 0, `${boardShape}/${gridType}/${orientation}: no interior tiles`);
        }
    }
});

test('hexagon board with hexagon tiles: radius R has 6R boundary tiles with fewer than 6 neighbours', () => {
    for (const radius of [2, 3, 5]) {
        const config = Checks.makeConfig('hexagon', 'hexagon', 'pointy-top', 'point-up', { radius });
        const adjacency = Geometry.buildAdjacency(generate(config));
        const boundary = adjacency.neighbors.filter((n) => n.length < 6).length;
        assert.equal(boundary, 6 * radius);
    }
});

test('adjacency is independent of canvas size (a pure function of the grid)', () => {
    const config = Checks.makeConfig('hexagon', 'triangle', 'flat-top', 'point-up', { radius: 3 });
    const a = Geometry.buildAdjacency(Geometry.generateGrid(config, { width: 1200, height: 800 }, null));
    const b = Geometry.buildAdjacency(Geometry.generateGrid(config, { width: 333, height: 777 }, null));
    const edges = (adj) => adj.neighbors.flatMap((list, i) => list.map((j) => `${adj.ids[i]}>${adj.ids[j]}`)).sort();
    assert.deepEqual(edges(a), edges(b));
});

test('every board is one connected piece except where the outline pinches tiles apart', () => {
    for (const combo of valid()) {
        const polygons = generate(combo.config);
        const adjacency = Geometry.buildAdjacency(polygons);
        const reached = Geometry.floodFill(adjacency, polygons[0].id, () => true);
        // Hexagon, square, rectangle and triangle boards must be a single component.
        if (combo.config.boardShape !== 'circle' && combo.config.boardShape !== 'triangle') {
            assert.equal(reached.length, polygons.length, combo.key);
        }
    }
});

test('floodFill follows matching tiles only and stops at non-matching tiles', () => {
    const config = Checks.makeConfig('rectangle', 'square', 'pointy-top', 'point-up', { width: 6, height: 6 });
    const polygons = generate(config);
    const adjacency = Geometry.buildAdjacency(polygons);
    // Build a wall: column 3 is a different colour.
    const colors = polygons.map((p) => (p.id.endsWith('_3') ? 'wall' : 'open'));
    const region = Geometry.floodFill(adjacency, 'square_0_0', (i) => colors[i] === 'open');
    assert.equal(region.length, 6 * 3, 'only columns 0-2 are reachable');
    assert.ok(region.every((id) => Number(id.split('_')[2]) < 3));
});

test('floodFill on an unknown tile returns nothing', () => {
    const polygons = generate(Checks.makeConfig('square', 'square', 'pointy-top', 'point-up', { size: 3 }));
    assert.deepEqual(plain(Geometry.floodFill(Geometry.buildAdjacency(polygons), 'nope', () => true)), []);
});

test('neighborhood(distance) grows ring by ring', () => {
    const config = Checks.makeConfig('hexagon', 'hexagon', 'pointy-top', 'point-up', { radius: 6 });
    const polygons = generate(config);
    const adjacency = Geometry.buildAdjacency(polygons);
    const center = polygons.reduce((best, p) => (Math.hypot(p.center.x - 600, p.center.y - 400) < Math.hypot(best.center.x - 600, best.center.y - 400) ? p : best));
    assert.equal(Geometry.neighborhood(adjacency, center.id, 0).length, 1);
    assert.equal(Geometry.neighborhood(adjacency, center.id, 1).length, 7);
    assert.equal(Geometry.neighborhood(adjacency, center.id, 2).length, 19);
    assert.equal(Geometry.neighborhood(adjacency, center.id, 3).length, 37);
});

test('shortestPath returns a connected path with the expected length', () => {
    const polygons = generate(Checks.makeConfig('rectangle', 'square', 'pointy-top', 'point-up', { width: 8, height: 5 }));
    const adjacency = Geometry.buildAdjacency(polygons);
    const path = Geometry.shortestPath(adjacency, 'square_0_0', 'square_4_7');
    assert.equal(path.length, 4 + 7 + 1);
    assert.equal(path[0], 'square_0_0');
    assert.equal(path[path.length - 1], 'square_4_7');
    assert.equal(Geometry.shortestPath(adjacency, 'square_0_0', 'missing'), null);
    assert.deepEqual(plain(Geometry.shortestPath(adjacency, 'square_2_2', 'square_2_2')), ['square_2_2']);
});
