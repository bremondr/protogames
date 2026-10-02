'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGeometry, plain } = require('./support/load');

const { Geometry, Checks, Config, Helpers } = loadGeometry();

// A typical desktop canvas, and a small one that forces tiles to shrink.
const CANVAS = { width: 1200, height: 800 };
const SMALL_CANVAS = { width: 360, height: 420 };

const generate = (config, canvas = CANVAS) => Geometry.generateGrid(config, canvas, null);

// ---- Every combination ------------------------------------------------------

test('geometry matrix: every valid board x tile x orientation combination is healthy', async (t) => {
    const combinations = Checks.allCombinations();
    assert.ok(combinations.length >= 24, 'expected the full matrix of combinations');

    for (const combo of combinations) {
        if (!combo.valid) continue;
        await t.test(combo.key, () => {
            const polygons = generate(combo.config);
            const issues = Checks.checkPolygons(polygons, CANVAS, combo.config);
            assert.deepEqual(plain(issues), []);
        });
    }
});

test('geometry matrix: invalid combinations are flagged with a reason', () => {
    const invalid = Checks.allCombinations().filter((c) => !c.valid);
    assert.ok(invalid.length > 0);
    for (const combo of invalid) assert.ok(combo.reason.length > 0, combo.key);
});

test('geometry matrix: combinations stay healthy on a small canvas', async (t) => {
    for (const combo of Checks.allCombinations()) {
        if (!combo.valid) continue;
        await t.test(combo.key, () => {
            const issues = Checks.checkPolygons(generate(combo.config, SMALL_CANVAS), SMALL_CANVAS, combo.config);
            assert.deepEqual(plain(issues), []);
        });
    }
});

// ---- Tile counts ------------------------------------------------------------

test('hexagon board with hexagon tiles has 3R(R+1)+1 tiles', () => {
    for (const radius of [0, 1, 2, 3, 5, 8]) {
        for (const orientation of ['pointy-top', 'flat-top']) {
            const config = Checks.makeConfig('hexagon', 'hexagon', orientation, 'point-up', { radius });
            assert.equal(generate(config).length, 3 * radius * (radius + 1) + 1, `radius ${radius} ${orientation}`);
        }
    }
});

test('square and rectangle boards with square tiles have cols x rows tiles', () => {
    for (const size of [1, 2, 7, 12]) {
        assert.equal(generate(Checks.makeConfig('square', 'square', 'pointy-top', 'point-up', { size })).length, size * size);
    }
    for (const [width, height] of [[1, 1], [3, 5], [9, 2], [10, 10]]) {
        const config = Checks.makeConfig('rectangle', 'square', 'pointy-top', 'point-up', { width, height });
        assert.equal(generate(config).length, width * height);
    }
});

test('rectangle boards with hexagon tiles have cols x rows tiles in both orientations', () => {
    for (const orientation of ['pointy-top', 'flat-top']) {
        for (const [width, height] of [[1, 1], [4, 4], [9, 3], [3, 9]]) {
            const config = Checks.makeConfig('rectangle', 'hexagon', orientation, 'point-up', { width, height });
            assert.equal(generate(config).length, width * height, `${width}x${height} ${orientation}`);
        }
    }
});

test('triangle board with triangle tiles has size^2 tiles for both orientations', () => {
    for (const size of [1, 2, 5, 9]) {
        for (const triangleOrientation of ['point-up', 'point-down']) {
            const config = Checks.makeConfig('triangle', 'triangle', 'pointy-top', triangleOrientation, { size });
            assert.equal(generate(config).length, size * size);
        }
    }
});

test('hexagon board with triangle tiles has 6R^2 tiles (regression for #8, #9)', () => {
    for (const radius of [1, 2, 3, 4, 6, 9]) {
        for (const orientation of ['pointy-top', 'flat-top']) {
            const config = Checks.makeConfig('hexagon', 'triangle', orientation, 'point-up', { radius });
            assert.equal(generate(config).length, 6 * radius * radius, `radius ${radius} ${orientation}`);
        }
    }
});

// ---- Regressions for fixed shape bugs ----------------------------------------

test('hexagon board with triangle tiles is a true hexagon (no star points, no ragged edge)', () => {
    for (const orientation of ['pointy-top', 'flat-top']) {
        const radius = 4;
        const polygons = generate(Checks.makeConfig('hexagon', 'triangle', orientation, 'point-up', { radius }));
        const all = polygons.flatMap((p) => p.vertices);
        const cx = all.reduce((s, v) => s + v.x, 0) / all.length;
        const cy = all.reduce((s, v) => s + v.y, 0) / all.length;
        const circumradius = Math.max(...all.map((v) => Math.hypot(v.x - cx, v.y - cy)));
        // Every vertex lies inside the regular hexagon with that circumradius.
        const apothem = (circumradius * Math.sqrt(3)) / 2;
        // Corners of a pointy-top hexagon sit at -90deg + k*60deg, flat-top at 0deg + k*60deg;
        // edge normals point halfway between neighbouring corners.
        const firstCorner = orientation === 'pointy-top' ? -Math.PI / 2 : 0;
        for (const v of all) {
            for (let k = 0; k < 6; k++) {
                const normalAngle = firstCorner + Math.PI / 6 + (k * Math.PI) / 3;
                const distance = (v.x - cx) * Math.cos(normalAngle) + (v.y - cy) * Math.sin(normalAngle);
                assert.ok(distance <= apothem + 0.01, `${orientation}: vertex outside hexagon edge ${k}`);
            }
        }
        // The outline has exactly six corner vertices at the circumradius.
        const corners = new Set(all.filter((v) => Math.abs(Math.hypot(v.x - cx, v.y - cy) - circumradius) < 0.01).map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)}`));
        assert.equal(corners.size, 6, `${orientation}: expected six outline corners`);
    }
});

test('triangle tiles in a circle are symmetric left to right (regression for #4 symmetry)', () => {
    const polygons = generate(Checks.makeConfig('circle', 'triangle', 'pointy-top', 'point-up', { radius: 4 }));
    const key = (p) => `${Math.round(p.center.y)}`;
    const rows = new Map();
    for (const p of polygons) rows.set(key(p), (rows.get(key(p)) || 0) + 1);
    const cx = CANVAS.width / 2;
    for (const p of polygons) {
        const mirrored = polygons.some((q) => Math.abs(q.center.y - p.center.y) < 0.5 && Math.abs(q.center.x - (2 * cx - p.center.x)) < 0.5);
        assert.ok(mirrored, `tile ${p.id} has no mirror image`);
    }
});

test('rectangular hex layouts no longer overflow the canvas by the half-tile row shift', () => {
    for (const orientation of ['pointy-top', 'flat-top']) {
        const config = Checks.makeConfig('square', 'hexagon', orientation, 'point-up', { size: 8 });
        const polygons = generate(config);
        const bounds = Checks.verticesBounds(polygons.flatMap((p) => p.vertices));
        assert.ok(bounds.minX >= Config.CANVAS_PADDING - 0.5, `${orientation} left`);
        assert.ok(bounds.maxX <= CANVAS.width - Config.CANVAS_PADDING + 0.5, `${orientation} right`);
    }
});

test('boards keep clear of the floating toolbar along the bottom edge', () => {
    const limit = CANVAS.height - Config.CANVAS_PADDING - Config.TOOLBAR_CLEARANCE;
    for (const combo of Checks.allCombinations().filter((c) => c.valid)) {
        const bounds = Checks.verticesBounds(generate(combo.config).flatMap((p) => p.vertices));
        assert.ok(bounds.maxY <= limit + 0.5, combo.key);
    }
});

// ---- Structure ----------------------------------------------------------------

test('tile ids are unique and bounds match the vertices', () => {
    for (const combo of Checks.allCombinations().filter((c) => c.valid)) {
        const polygons = generate(combo.config);
        assert.equal(new Set(polygons.map((p) => p.id)).size, polygons.length, combo.key);
        for (const p of polygons) {
            const real = Checks.verticesBounds(p.vertices);
            assert.ok(Math.abs(real.minX - p.bounds.minX) < 1e-6 && Math.abs(real.maxY - p.bounds.maxY) < 1e-6, `${combo.key} ${p.id}`);
        }
    }
});

test('no two tiles overlap in any combination', () => {
    for (const combo of Checks.allCombinations().filter((c) => c.valid)) {
        assert.deepEqual(plain(Checks.findOverlaps(generate(combo.config))), [], combo.key);
    }
});

test('hit-testing a tile centre returns that tile', () => {
    for (const combo of Checks.allCombinations().filter((c) => c.valid)) {
        const polygons = generate(combo.config);
        for (const p of polygons) {
            const hit = Helpers.findPolygonAtPoint(p.center, polygons);
            assert.ok(hit && hit.id === p.id, `${combo.key}: ${p.id}`);
        }
    }
});

test('colours are carried over by tile id when regenerating', () => {
    const config = Checks.makeConfig('hexagon', 'hexagon', 'pointy-top', 'point-up', { radius: 3 });
    const first = generate(config);
    const colors = new Map(first.map((p, i) => [p.id, i % 2 ? '#123456' : '#abcdef']));
    const second = Geometry.generateGrid(config, SMALL_CANVAS, colors);
    for (const p of second) assert.equal(p.color, colors.get(p.id));
});

test('the SAT overlap helper treats touching tiles as non-overlapping and shifted copies as overlapping', () => {
    const square = (x, y) => [{ x, y }, { x: x + 10, y }, { x: x + 10, y: y + 10 }, { x, y: y + 10 }];
    assert.equal(Checks.polygonsOverlap(square(0, 0), square(10, 0)), false);
    assert.equal(Checks.polygonsOverlap(square(0, 0), square(10, 10)), false);
    assert.equal(Checks.polygonsOverlap(square(0, 0), square(5, 5)), true);
});

// ---- Symmetry and roundness (regression: circle boards used to be lopsided) ----------------

test('boards that should be rotationally symmetric are, on every combination and several sizes', () => {
    for (const radius of [1, 2, 3, 4, 5, 6, 8]) {
        for (const combo of Checks.allCombinations({ radius, size: radius + 2, width: radius + 3, height: radius + 1 })) {
            if (!combo.valid) continue;
            const order = Checks.expectedSymmetry(combo.config);
            if (!order) continue;
            const polygons = generate(combo.config);
            assert.equal(Checks.rotationMisses(polygons, order), 0, `${combo.key} radius ${radius} should be ${order}-fold symmetric`);
        }
    }
});

test('triangle boards are left-right symmetric for every tile shape', () => {
    for (const size of [2, 3, 4, 5, 6, 7, 8, 9]) {
        for (const combo of Checks.allCombinations({ size })) {
            if (!combo.valid || combo.config.boardShape !== 'triangle') continue;
            if (!Checks.expectedMirror(combo.config)) continue;
            assert.equal(Checks.mirrorMisses(generate(combo.config)), 0, `${combo.key} size ${size}`);
        }
    }
});

test('known limitation: flat-top hexagons on an even-sized triangle board cannot mirror', () => {
    // Documented in expectedMirror(); this test fails if that ever changes, so the exception can be removed.
    for (const size of [2, 4, 6]) {
        const config = Checks.makeConfig('triangle', 'hexagon', 'flat-top', 'point-up', { size });
        assert.equal(Checks.expectedMirror(config), false);
        assert.ok(Checks.mirrorMisses(generate(config)) > 0, `size ${size} unexpectedly mirrors`);
    }
    const odd = Checks.makeConfig('triangle', 'hexagon', 'flat-top', 'point-up', { size: 5 });
    assert.equal(Checks.expectedMirror(odd), true);
    assert.equal(Checks.mirrorMisses(generate(odd)), 0);
});

test('the symmetry check really detects a lopsided layout', () => {
    const polygons = generate(Checks.makeConfig('circle', 'hexagon', 'pointy-top', 'point-up', { radius: 4 }));
    const lopsided = polygons.filter((p, i) => !(i % 7 === 0 && p.center.x < 600));
    assert.ok(Checks.rotationMisses(lopsided, 6) > 0);
    assert.ok(Checks.rotationMisses(polygons.slice(0, polygons.length - 3), 6) > 0);
});

test('circle boards with hexagon tiles contain every tile within (radius + 0.5) tile widths of the middle tile', () => {
    const counts = { 1: 7, 2: 19, 3: 43, 4: 73, 5: 109, 6: 151, 8: 253 };
    for (const orientation of ['pointy-top', 'flat-top']) {
        for (const [radius, expected] of Object.entries(counts)) {
            const polygons = generate(Checks.makeConfig('circle', 'hexagon', orientation, 'point-up', { radius: Number(radius) }));
            assert.equal(polygons.length, expected, `${orientation} radius ${radius}`);
            // The disc includes the whole hexagon of the same radius.
            assert.ok(polygons.length >= 3 * radius * (Number(radius) + 1) + 1);
        }
    }
});

test('circle boards with hexagon tiles are centred on a tile, so the middle of the board is a tile', () => {
    for (const orientation of ['pointy-top', 'flat-top']) {
        const polygons = generate(Checks.makeConfig('circle', 'hexagon', orientation, 'point-up', { radius: 4 }));
        const near = polygons.filter((p) => Math.hypot(p.center.x - CANVAS.width / 2, p.center.y - (CANVAS.height - Config.CANVAS_PADDING * 2 - Config.TOOLBAR_CLEARANCE) / 2 - Config.CANVAS_PADDING) < 1);
        assert.equal(near.length, 1, `${orientation}: exactly one tile in the middle`);
    }
});

test('circle boards with triangle tiles contain at least the hexagon of the same radius and are centred on a vertex', () => {
    for (const radius of [1, 2, 3, 4, 5, 8]) {
        const disc = generate(Checks.makeConfig('circle', 'triangle', 'pointy-top', 'point-up', { radius }));
        assert.ok(disc.length >= 6 * radius * radius, `radius ${radius}: ${disc.length} tiles`);
        // Six triangles meet at the centre vertex, so a vertex of every central tile is the middle of the board.
        const middle = { x: CANVAS.width / 2, y: Config.CANVAS_PADDING + (CANVAS.height - Config.CANVAS_PADDING * 2 - Config.TOOLBAR_CLEARANCE) / 2 };
        const touching = disc.filter((p) => p.vertices.some((v) => Math.hypot(v.x - middle.x, v.y - middle.y) < 1));
        assert.equal(touching.length, 6, `radius ${radius}`);
    }
});

test('circle boards are round: no tile is far beyond the edge reached by the boundary tiles', () => {
    for (const gridType of ['hexagon', 'triangle', 'square']) {
        for (const radius of [4, 6, 8]) {
            const polygons = generate(Checks.makeConfig('circle', gridType, 'pointy-top', 'point-up', { radius }));
            const adjacency = Geometry.buildAdjacency(polygons);
            const ratio = Checks.roundness(polygons, adjacency);
            assert.ok(ratio < 1.32, `${gridType} radius ${radius}: roundness ${ratio.toFixed(3)}`);
        }
    }
});

test('circle ids are stable for a given layout, so colours survive regeneration', () => {
    const config = Checks.makeConfig('circle', 'hexagon', 'pointy-top', 'point-up', { radius: 3 });
    const first = generate(config);
    const colors = new Map(first.map((p, i) => [p.id, `#00${(i + 10).toString(16).padStart(2, '0')}ff`]));
    const second = Geometry.generateGrid(config, SMALL_CANVAS, colors);
    assert.deepEqual(plain(second.map((p) => p.id)), plain(first.map((p) => p.id)));
    for (const p of second) assert.equal(p.color, colors.get(p.id));
});
