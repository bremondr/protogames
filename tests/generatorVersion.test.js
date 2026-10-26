'use strict';
/**
 * Generator versions: a board remembers which version of the tile generator made it (boardConfig.generator), so that
 * improving the generator never changes a saved board. Generator 1 is what the app generated before versions existed;
 * generator 2 adds the hexagon circle scan-window fix. See "Generator versions" in docs/SPECIFICATION.md.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadGeometry } = require('./support/load');

const env = loadGeometry();
const { Geometry, Config } = env;
const Triangle = env.context.GeometryTriangle;

const CANVAS = { width: 1000, height: 800 };
const hexCircle = (radius, center, orientation, generator) => ({
    gridType: 'hexagon', boardShape: 'circle', orientation, radius, center, generator, width: 1, height: 1
});
const triCircle = (radius, center, triangleOrientation, generator) => ({
    gridType: 'triangle', boardShape: 'circle', orientation: 'pointy-top', triangleOrientation, radius, center, generator, width: 1, height: 1
});
const tilesOf = (config, colors = null) => Geometry.generateGrid(config, CANVAS, colors);
const idsOf = (config) => tilesOf(config).map((p) => p.id);
const digest = (ids) => crypto.createHash('sha1').update(ids.join('|')).digest('hex').slice(0, 12);

// ---- The two numbers -------------------------------------------------------------------------------------------------

test('the current generator is 2, in Config and on Geometry, and new boards carry it', () => {
    assert.equal(Config.GENERATOR_VERSION, 2);
    assert.equal(Geometry.GENERATOR_VERSION, 2);
    assert.equal(Config.DEFAULT_BOARD_CONFIG.generator, 2);
});

test('settings without a generator (previews, tests) are built by the current one; an unknown one too', () => {
    for (const radius of [3, 23, 30]) {
        const current = idsOf(hexCircle(radius, 'tile', 'pointy-top', 2));
        assert.deepEqual(idsOf(hexCircle(radius, 'tile', 'pointy-top', undefined)), current);
        assert.deepEqual(idsOf(hexCircle(radius, 'tile', 'pointy-top', 99)), current);
        assert.deepEqual(idsOf(hexCircle(radius, 'tile', 'pointy-top', 0)), current);
    }
});

test('the generator version changes nothing for boards other than circles of hexagons', () => {
    const configs = [
        { gridType: 'hexagon', boardShape: 'hexagon', orientation: 'flat-top', radius: 25, center: 'point', width: 51, height: 51 },
        { gridType: 'hexagon', boardShape: 'rectangle', orientation: 'pointy-top', width: 9, height: 7 },
        { gridType: 'square', boardShape: 'rectangle', orientation: 'orthogonal', width: 6, height: 5 },
        { gridType: 'triangle', boardShape: 'triangle', size: 9, triangleOrientation: 'point-down', width: 9, height: 9 },
        { gridType: 'triangle', boardShape: 'hexagon', radius: 5, center: 'tile', triangleOrientation: 'point-up', orientation: 'pointy-top', width: 11, height: 11 },
        triCircle(10, 'point', 'point-up'),
        triCircle(10, 'tile', 'point-down')
    ];
    for (const config of configs) {
        assert.deepEqual(idsOf({ ...config, generator: 1 }), idsOf({ ...config, generator: 2 }), JSON.stringify(config));
    }
});

// ---- Generator 1 is frozen: golden values recorded from the app before generator versions existed -----------------------
// key: radius/centre/orientation; value: [tile count, first 12 hex digits of the sha1 of the ids joined with "|", in order]

const HEX_GOLDEN_1 = {
    '1/tile/pointy-top': [7, 'b5afa3be88c5'],
    '1/tile/flat-top': [7, 'b5afa3be88c5'],
    '1/point/pointy-top': [12, 'f8ad8820f30c'],
    '1/point/flat-top': [12, 'f8ad8820f30c'],
    '8/tile/pointy-top': [253, '13eab6873bc9'],
    '8/tile/flat-top': [253, '13eab6873bc9'],
    '8/point/pointy-top': [276, '062e65c264a4'],
    '8/point/flat-top': [276, '062e65c264a4'],
    '16/tile/pointy-top': [979, '5288efa7537f'],
    '16/tile/flat-top': [979, '5288efa7537f'],
    '16/point/pointy-top': [1011, 'ef8187586660'],
    '16/point/flat-top': [1011, 'ef8187586660'],
    '22/tile/pointy-top': [1813, '8a7634efacfa'],
    '22/tile/flat-top': [1813, '8a7634efacfa'],
    '22/point/pointy-top': [1846, 'e31d9138c687'],
    '22/point/flat-top': [1846, 'e31d9138c687'],
    '23/tile/pointy-top': [1977, '138457a65121'],
    '23/tile/flat-top': [1977, '138457a65121'],
    '23/point/pointy-top': [2018, 'fd0bdc73a3a8'],
    '23/point/flat-top': [2018, 'fd0bdc73a3a8'],
    '30/tile/pointy-top': [3283, '9203ea899c76'],
    '30/tile/flat-top': [3283, '9203ea899c76'],
    '30/point/pointy-top': [3318, '44434db2cc7d'],
    '30/point/flat-top': [3318, '44434db2cc7d'],
    '50/tile/pointy-top': [8731, '27e772a1e0d4'],
    '50/tile/flat-top': [8731, '27e772a1e0d4'],
    '50/point/pointy-top': [8772, '66bacebfb66d'],
    '50/point/flat-top': [8772, '66bacebfb66d']
};

const TRIANGLE_GOLDEN_1 = {
    '1/tile/point-up': [1, '4339b71e7e62'],
    '1/tile/point-down': [1, '1ce34ab92d4d'],
    '1/point/point-up': [6, 'cc127db54127'],
    '1/point/point-down': [6, 'cc127db54127'],
    '2/tile/point-up': [13, '4f9953aacdfe'],
    '2/tile/point-down': [13, '85f3cc4f41cf'],
    '2/point/point-up': [24, '088321ee376d'],
    '2/point/point-down': [24, '088321ee376d'],
    '3/tile/point-up': [37, 'a12da744fa1f'],
    '3/tile/point-down': [37, '792d92f61c80'],
    '3/point/point-up': [54, 'c7e353a157cc'],
    '3/point/point-down': [54, 'c7e353a157cc'],
    '4/tile/point-up': [82, '4ebf208fe50e'],
    '4/tile/point-down': [82, '5d37bfe9b755'],
    '4/point/point-up': [96, 'a8fd3646e65c'],
    '4/point/point-down': [96, 'a8fd3646e65c'],
    '5/tile/point-up': [136, '619d8dac5ce7'],
    '5/tile/point-down': [136, '5e33bde46340'],
    '5/point/point-up': [180, 'df5c997f5e8f'],
    '5/point/point-down': [180, 'df5c997f5e8f'],
    '6/tile/point-up': [202, '402a0ca54101'],
    '6/tile/point-down': [202, '87697186a1d3'],
    '6/point/point-up': [258, '58234574bd6f'],
    '6/point/point-down': [258, '58234574bd6f'],
    '7/tile/point-up': [301, '43224f98a5c3'],
    '7/tile/point-down': [301, 'ef28d50444be'],
    '7/point/point-up': [348, '0ee66afb0c0d'],
    '7/point/point-down': [348, '0ee66afb0c0d'],
    '8/tile/point-up': [397, 'a17d87b71d8d'],
    '8/tile/point-down': [397, 'f41603a59499'],
    '8/point/point-up': [450, '8987b0f130aa'],
    '8/point/point-down': [450, '8987b0f130aa'],
    '9/tile/point-up': [505, '0d3392ebdf1f'],
    '9/tile/point-down': [505, 'a49e5f526bc1'],
    '9/point/point-up': [564, 'f98ce7104526'],
    '9/point/point-down': [564, 'f98ce7104526'],
    '10/tile/point-up': [625, 'dad1b798c165'],
    '10/tile/point-down': [625, '125ad26b3416'],
    '10/point/point-up': [690, 'b2eb1d48853f'],
    '10/point/point-down': [690, 'b2eb1d48853f'],
    '11/tile/point-up': [778, 'aa07131144b4'],
    '11/tile/point-down': [778, '3826b60124b9'],
    '11/point/point-up': [846, '071012755153'],
    '11/point/point-down': [846, '071012755153'],
    '12/tile/point-up': [928, '8de9eb68ea6b'],
    '12/tile/point-down': [928, 'b026c3939409'],
    '12/point/point-up': [1032, 'b990d71be461'],
    '12/point/point-down': [1032, 'b990d71be461']
};

test('generator 1 reproduces what the app generated for circles of hexagons before generator versions', () => {
    for (const [key, [count, hash]] of Object.entries(HEX_GOLDEN_1)) {
        const [radius, center, orientation] = key.split('/');
        const ids = idsOf(hexCircle(Number(radius), center, orientation, 1));
        assert.equal(ids.length, count, `${key} tiles`);
        assert.equal(digest(ids), hash, `${key} ids`);
    }
});

test('generator 1 reproduces what the app generated for circles of triangles before generator versions', () => {
    for (const [key, [count, hash]] of Object.entries(TRIANGLE_GOLDEN_1)) {
        const [radius, center, triangleOrientation] = key.split('/');
        const ids = idsOf(triCircle(Number(radius), center, triangleOrientation, 1));
        assert.equal(ids.length, count, `${key} tiles`);
        assert.equal(digest(ids), hash, `${key} ids`);
    }
});

test('generator 1 loses tiles of big hexagon circles: that is what version 2 fixes, and why version 1 stays as it was', () => {
    assert.equal(idsOf(hexCircle(22, 'tile', 'pointy-top', 1)).length, 1813, 'complete up to radius 22');
    assert.equal(idsOf(hexCircle(23, 'tile', 'pointy-top', 1)).length, 1977, 'a tile-centred disc of radius 23 has 1993 tiles');
    assert.equal(idsOf(hexCircle(23, 'tile', 'pointy-top', 2)).length, 1993);
    assert.ok(idsOf(hexCircle(19, 'point', 'pointy-top', 1)).length < idsOf(hexCircle(19, 'point', 'pointy-top', 2)).length);
});

// ---- Generator 2: the full disc ----------------------------------------------------------------------------------------

/**
 * The disc written out directly (no scan window to get wrong): every axial tile whose centre is within the limit of the
 * middle, which is a tile (radius + 0.5 tile widths) or a corner (halfway between the two lattice distances around
 * radius + 0.72 tile widths).
 */
function referenceDisc(radius, center, orientation) {
    const s3 = Math.sqrt(3);
    const at = (q, r) => (orientation === 'pointy-top' ? { x: s3 * (q + r / 2), y: 1.5 * r } : { x: 1.5 * q, y: s3 * (r + q / 2) });
    const seeds = [[0, 0], [1, 0], [0, 1]].map(([q, r]) => at(q, r));
    const middle = center === 'point'
        ? { x: (seeds[0].x + seeds[1].x + seeds[2].x) / 3, y: (seeds[0].y + seeds[1].y + seeds[2].y) / 3 }
        : { x: 0, y: 0 };
    const wanted2 = ((center === 'point' ? radius + 0.72 : radius + 0.5) * s3) ** 2;
    const reach = 2 * radius + 6;
    const all = [];
    let below = -1;
    let above = Infinity;
    for (let r = -reach; r <= reach; r++) {
        for (let q = -reach; q <= reach; q++) {
            const u = at(q, r);
            const d2 = (u.x - middle.x) ** 2 + (u.y - middle.y) ** 2;
            all.push([`hex_${q}_${r}`, d2]);
            if (d2 <= wanted2 && d2 > below) below = d2;
            if (d2 > wanted2 && d2 < above) above = d2;
        }
    }
    const limit = center === 'point' ? (below + above) / 2 : wanted2;
    assert.ok(limit - below > 1e-6 && above - limit > 1e-6, 'no tile sits on the edge');
    return new Set(all.filter(([, d2]) => d2 <= limit).map(([id]) => id));
}

// Every radius up to 30 (the first gaps of generator 1 are at 19 and 23), then a few big ones up to the largest board.
const RADII = [...Array.from({ length: 31 }, (_, i) => i), 50, 100];

test('generator 2 builds the whole disc of hexagons, for both centres and orientations, up to radius 100', () => {
    for (const radius of RADII) {
        for (const center of ['tile', 'point']) {
            for (const orientation of ['pointy-top', 'flat-top']) {
                const ids = idsOf(hexCircle(radius, center, orientation, 2));
                const wanted = referenceDisc(radius, center, orientation);
                const label = `${radius}/${center}/${orientation}`;
                assert.equal(ids.length, wanted.size, `${label} tiles`);
                assert.equal(new Set(ids).size, ids.length, `${label} ids are unique`);
                assert.ok(ids.every((id) => wanted.has(id)), `${label} nothing extra`);
            }
        }
    }
});

test('generator 2 is generator 1 plus the missing tiles: same ids, so colours carry over', () => {
    let differing = 0;
    for (const radius of RADII.filter((r) => r < 100)) {
        for (const center of ['tile', 'point']) {
            for (const orientation of ['pointy-top', 'flat-top']) {
                const one = new Set(idsOf(hexCircle(radius, center, orientation, 1)));
                const two = new Set(idsOf(hexCircle(radius, center, orientation, 2)));
                assert.ok([...one].every((id) => two.has(id)), `${radius}/${center}/${orientation}: every tile of generator 1 is in generator 2`);
                if (two.size > one.size) differing += 1;
            }
        }
    }
    assert.ok(differing > 0);
    // Radius 22 around a tile and 18 around a corner are the last complete ones in generator 1.
    for (const orientation of ['pointy-top', 'flat-top']) {
        assert.deepEqual(idsOf(hexCircle(22, 'tile', orientation, 1)), idsOf(hexCircle(22, 'tile', orientation, 2)));
        assert.deepEqual(idsOf(hexCircle(18, 'point', orientation, 1)), idsOf(hexCircle(18, 'point', orientation, 2)));
        assert.notDeepEqual(idsOf(hexCircle(23, 'tile', orientation, 1)), idsOf(hexCircle(23, 'tile', orientation, 2)));
        assert.notDeepEqual(idsOf(hexCircle(19, 'point', orientation, 1)), idsOf(hexCircle(19, 'point', orientation, 2)));
    }
});

test('regenerating a generator 1 board with generator 2 keeps every colour by id', () => {
    const board = tilesOf(hexCircle(30, 'tile', 'pointy-top', 1));
    const colors = new Map(board.map((p, i) => [p.id, i % 2 ? '#2D5016' : '#1F5E86']));
    const regenerated = tilesOf(hexCircle(30, 'tile', 'pointy-top', 2), colors);
    const byId = new Map(regenerated.map((p) => [p.id, p]));
    for (const [id, color] of colors) assert.equal(byId.get(id).color, color, id);
    assert.ok(regenerated.length > board.length);
});

test('generator 2 discs have the full symmetry of the lattice around their middle', () => {
    for (const radius of [1, 5, 12, 23, 30, 45]) {
        for (const center of ['tile', 'point']) {
            for (const orientation of ['pointy-top', 'flat-top']) {
                const tiles = tilesOf(hexCircle(radius, center, orientation, 2));
                const mean = tiles.reduce((m, p) => ({ x: m.x + p.center.x / tiles.length, y: m.y + p.center.y / tiles.length }), { x: 0, y: 0 });
                const keys = new Map(tiles.map((p) => [`${Math.round(p.center.x)},${Math.round(p.center.y)}`, p]));
                const turn = center === 'tile' ? Math.PI / 3 : (2 * Math.PI) / 3; // 6-fold around a tile, 3-fold around a corner
                const label = `${radius}/${center}/${orientation}`;
                for (const p of tiles) {
                    const dx = p.center.x - mean.x;
                    const dy = p.center.y - mean.y;
                    const x = mean.x + dx * Math.cos(turn) - dy * Math.sin(turn);
                    const y = mean.y + dx * Math.sin(turn) + dy * Math.cos(turn);
                    // The tile centres are at least a few pixels apart, so the nearest cell neighbourhood holds the one it must land on.
                    let found = null;
                    for (let ox = -1; ox <= 1; ox++) {
                        for (let oy = -1; oy <= 1; oy++) {
                            const candidate = keys.get(`${Math.round(x) + ox},${Math.round(y) + oy}`);
                            if (candidate && Math.hypot(candidate.center.x - x, candidate.center.y - y) < 0.01) found = candidate;
                        }
                    }
                    assert.ok(found, `${label}: ${p.id} turns onto a tile`);
                }
            }
        }
    }
});

test('generator 2 counts: radius 0, 1 and a few big ones', () => {
    const count = (radius, center, generator = 2) => idsOf(hexCircle(radius, center, 'pointy-top', generator)).length;
    assert.equal(count(0, 'tile'), 1);
    assert.equal(count(0, 'point'), 3);
    assert.equal(count(1, 'tile'), 7);
    assert.equal(count(1, 'point'), 12);
    assert.equal(count(23, 'tile'), 1993);
    assert.equal(count(30, 'tile'), 3367);
    assert.equal(count(50, 'tile'), 9271);
    assert.equal(count(100, 'tile'), 36601);
    assert.equal(count(30, 'point'), 3426);
    assert.equal(count(100, 'point'), 36786);
});

test('a hexagon circle older than the generator fix (before layers and corners, #103) is a subset of both generators', () => {
    // The tile-centred disc as the app built it before #103 (git 39ead4a js/geometry/hex.js): same limit, a scan window of radius + 2.
    const old = (radius, orientation) => {
        const width = Math.sqrt(3) * 40;
        const limit = (radius + 0.5) * width;
        const span = radius + 2;
        const ids = [];
        for (let r = -span; r <= span; r++) {
            for (let q = -span; q <= span; q++) {
                const x = orientation === 'pointy-top' ? width * (q + r / 2) : 1.5 * 40 * q;
                const y = orientation === 'pointy-top' ? 1.5 * 40 * r : width * (r + q / 2);
                if (Math.hypot(x, y) <= limit) ids.push(`hex_${q}_${r}`);
            }
        }
        return ids;
    };
    for (let radius = 0; radius <= 30; radius++) {
        for (const orientation of ['pointy-top', 'flat-top']) {
            const one = new Set(idsOf(hexCircle(radius, 'tile', orientation, 1)));
            const two = new Set(idsOf(hexCircle(radius, 'tile', orientation, 2)));
            for (const id of old(radius, orientation)) {
                assert.ok(one.has(id) && two.has(id), `${radius}/${orientation}: ${id}`);
            }
        }
    }
});

// ---- Circles of triangles: no spikes ------------------------------------------------------------------------------------

const cellOf = (id) => {
    const match = /_(-?\d+)_(-?\d+)_(up|down)$/.exec(id);
    return { j: Number(match[1]), i: Number(match[2]), kind: match[3] };
};
const neighboursOf = ({ i, j, kind }) => (kind === 'down'
    ? [[i, j - 1, 'up'], [i, j, 'up'], [i - 1, j, 'up']]
    : [[i, j + 1, 'down'], [i, j, 'down'], [i + 1, j, 'down']]);
const cellId = (prefix, i, j, kind) => `${prefix}_${j}_${i}_${kind}`;

test('a circle of triangles has no tile that touches fewer than two others, in both generators', () => {
    for (const radius of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 20, 33]) {
        for (const center of ['tile', 'point']) {
            for (const triangleOrientation of ['point-up', 'point-down']) {
                for (const generator of [1, 2]) {
                    const ids = idsOf(triCircle(radius, center, triangleOrientation, generator));
                    const present = new Set(ids);
                    for (const id of ids) {
                        const touching = neighboursOf(cellOf(id)).filter(([i, j, kind]) => present.has(cellId('triangle_disc', i, j, kind))).length;
                        assert.ok(ids.length < 2 || touching >= 2, `${radius}/${center}/${triangleOrientation}/g${generator}: ${id} touches ${touching}`);
                    }
                }
            }
        }
    }
});

test('removing spikes repeats until none is left: a tail comes off tile by tile', () => {
    const polygon = ([i, j, kind]) => ({ id: cellId('triangle_disc', i, j, kind) });
    const ring = [[0, 0, 'down'], [-1, 0, 'up'], [-1, 0, 'down'], [-1, -1, 'up'], [0, -1, 'down'], [0, -1, 'up']].map(polygon);
    const tail = [[0, 0, 'up'], [1, 0, 'down']].map(polygon);
    // The end of the tail is a spike; once it is gone the next tile hangs by one edge and goes too.
    assert.deepEqual(Triangle.withoutSpikes([...ring, ...tail]).map((p) => p.id), ring.map((p) => p.id));
    // A chain of four loses both ends, then the two that are left; a chain of three is left with its middle tile.
    const chain = [[0, 0, 'down'], [0, 0, 'up'], [1, 0, 'down'], [1, 0, 'up']].map(polygon);
    assert.deepEqual(Triangle.withoutSpikes(chain), []);
    assert.equal(Triangle.withoutSpikes(chain.slice(0, 3)).length, 1);
    const single = [polygon([0, 0, 'up'])];
    assert.deepEqual(Triangle.withoutSpikes(single), single, 'a board of one tile is left alone');
});
