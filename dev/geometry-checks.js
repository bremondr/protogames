/**
 * Geometry sanity checks and the board-combination matrix.
 *
 * Shared by the unit tests (Node) and the dev gallery page (browser), so a
 * combination is judged by the same rules in both places. Dev tooling only:
 * the app itself does not load this file.
 */
(function (global) {
    const EPSILON = 1e-6;

    const BOARD_SHAPES = ['hexagon', 'square', 'rectangle', 'triangle', 'circle'];
    const TILE_SHAPES = ['hexagon', 'square', 'triangle'];

    /** Small default sizes so galleries and tests stay fast. */
    const DEFAULT_SIZES = { radius: 3, size: 5, width: 6, height: 4 };

    /**
     * Builds the config the UI would build for a board shape (see UI.getBoardConfig).
     */
    function makeConfig(boardShape, gridType, orientation, triangleOrientation, sizes) {
        const s = { ...DEFAULT_SIZES, ...(sizes || {}) };
        const config = {
            gridType,
            orientation: orientation || 'pointy-top',
            boardShape,
            radius: s.radius,
            size: s.size,
            width: s.width,
            height: s.height,
            triangleOrientation: triangleOrientation || 'point-up'
        };
        if (boardShape === 'square' || boardShape === 'triangle') {
            config.width = s.size;
            config.height = s.size;
        } else if (boardShape === 'hexagon' || boardShape === 'circle') {
            config.width = s.radius * 2 + 1;
            config.height = s.radius * 2 + 1;
        }
        return config;
    }

    /**
     * Every board shape x tile shape x orientation combination, each flagged valid
     * or invalid (with the reason) so galleries can show unsupported ones explicitly.
     */
    function allCombinations(sizes) {
        const list = [];
        for (const boardShape of BOARD_SHAPES) {
            for (const gridType of TILE_SHAPES) {
                const orientations = gridType === 'hexagon' || boardShape === 'hexagon' ? ['pointy-top', 'flat-top'] : ['pointy-top'];
                const triangleOrientations = boardShape === 'triangle' ? ['point-up', 'point-down'] : ['point-up'];
                for (const orientation of orientations) {
                    for (const triangleOrientation of triangleOrientations) {
                        const config = makeConfig(boardShape, gridType, orientation, triangleOrientation, sizes);
                        const parts = [boardShape + ' board', gridType + ' tiles'];
                        if (orientations.length > 1) parts.push(orientation);
                        if (triangleOrientations.length > 1) parts.push(triangleOrientation);
                        let valid = true;
                        let reason = '';
                        // The sidebar disables square tiles on hexagon boards (UI.applyGridTypeRestrictions).
                        if (boardShape === 'hexagon' && gridType === 'square') {
                            valid = false;
                            reason = 'Square tiles cannot fill a hexagon outline; the sidebar blocks this combination.';
                        }
                        list.push({ key: parts.join(' / '), config, valid, reason });
                    }
                }
            }
        }
        return list;
    }

    /**
     * Tile counts we can state exactly from the board definition, or null when the
     * count depends on how the outline clips the tiles.
     */
    function expectedCount(config) {
        const { boardShape, gridType, radius, size, width, height } = config;
        if (boardShape === 'hexagon' && gridType === 'hexagon') return 3 * radius * (radius + 1) + 1;
        if (boardShape === 'hexagon' && gridType === 'triangle') return 6 * radius * radius;
        if (boardShape === 'triangle' && gridType === 'triangle') return size * size;
        if (boardShape === 'square' && (gridType === 'square' || gridType === 'hexagon')) return size * size;
        if (boardShape === 'rectangle' && (gridType === 'square' || gridType === 'hexagon')) return width * height;
        return null;
    }

    // ---- Geometry primitives ------------------------------------------------

    function projectOnto(vertices, axis) {
        let min = Infinity;
        let max = -Infinity;
        for (const v of vertices) {
            const d = v.x * axis.x + v.y * axis.y;
            if (d < min) min = d;
            if (d > max) max = d;
        }
        return { min, max };
    }

    /**
     * Do two convex polygons overlap by more than `tolerance`? Polygons that only
     * touch along an edge or at a corner do not count as overlapping.
     */
    function polygonsOverlap(a, b, tolerance) {
        const tol = tolerance === undefined ? 1e-3 : tolerance;
        for (const shape of [a, b]) {
            for (let i = 0; i < shape.length; i++) {
                const p = shape[i];
                const q = shape[(i + 1) % shape.length];
                const length = Math.hypot(q.x - p.x, q.y - p.y) || 1;
                const axis = { x: -(q.y - p.y) / length, y: (q.x - p.x) / length };
                const pa = projectOnto(a, axis);
                const pb = projectOnto(b, axis);
                if (pa.max <= pb.min + tol || pb.max <= pa.min + tol) return false;
            }
        }
        return true;
    }

    function verticesBounds(vertices) {
        const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
        for (const v of vertices) {
            bounds.minX = Math.min(bounds.minX, v.x);
            bounds.maxX = Math.max(bounds.maxX, v.x);
            bounds.minY = Math.min(bounds.minY, v.y);
            bounds.maxY = Math.max(bounds.maxY, v.y);
        }
        return bounds;
    }

    function centroidOfCentres(polygons) {
        const n = polygons.length;
        return {
            x: polygons.reduce((sum, p) => sum + p.center.x, 0) / n,
            y: polygons.reduce((sum, p) => sum + p.center.y, 0) / n
        };
    }

    /**
     * The n-fold rotational symmetry a board should have, or null when none is expected.
     * Circle and hexagon boards are centred on a tile (or lattice vertex), so hexagon and
     * triangle tiles repeat every 60 degrees and square tiles every 90. A square board of
     * square tiles repeats every 90 degrees.
     */
    function expectedSymmetry(config) {
        const { boardShape, gridType } = config;
        if (boardShape === 'circle' || boardShape === 'hexagon') return gridType === 'square' ? 4 : 6;
        if (boardShape === 'square' && gridType === 'square') return 4;
        return null;
    }

    /**
     * Whether a board should be mirror-symmetric about its vertical axis. Triangle boards
     * should be, with one known exception: flat-top hexagon columns are staggered, so with an
     * even number of columns the axis falls between two columns at different heights and the
     * layout cannot mirror.
     */
    function expectedMirror(config) {
        if (config.boardShape !== 'triangle') return false;
        if (config.gridType === 'hexagon' && config.orientation === 'flat-top' && config.size % 2 === 0) return false;
        return true;
    }

    /**
     * How many tiles have no partner when the layout is rotated 360/order degrees about
     * its centre (0 = perfectly symmetric). Compares tile centres.
     */
    function rotationMisses(polygons, order, tolerance) {
        const tol = tolerance === undefined ? 1.5 : tolerance;
        const c = centroidOfCentres(polygons);
        const angle = (2 * Math.PI) / order;
        let misses = 0;
        for (const p of polygons) {
            const dx = p.center.x - c.x;
            const dy = p.center.y - c.y;
            const x = c.x + dx * Math.cos(angle) - dy * Math.sin(angle);
            const y = c.y + dx * Math.sin(angle) + dy * Math.cos(angle);
            if (!polygons.some((q) => Math.hypot(q.center.x - x, q.center.y - y) < tol)) misses++;
        }
        return misses;
    }

    /** How many tiles have no left-right mirror partner (0 = symmetric about the vertical axis). */
    function mirrorMisses(polygons, tolerance) {
        const tol = tolerance === undefined ? 1.5 : tolerance;
        const c = centroidOfCentres(polygons);
        return polygons.filter((p) => !polygons.some((q) => Math.hypot(q.center.x - (2 * c.x - p.center.x), q.center.y - p.center.y) < tol)).length;
    }

    /**
     * Roundness of a board: farthest tile centre divided by the nearest *boundary* tile
     * centre (a boundary tile has fewer neighbours than an interior one). 1 is a perfect
     * disc; a hexagon is about 1.15, a lopsided blob is much larger.
     */
    function roundness(polygons, adjacency) {
        const c = centroidOfCentres(polygons);
        const maxNeighbours = Math.max(...adjacency.neighbors.map((list) => list.length));
        let far = 0;
        let nearBoundary = Infinity;
        polygons.forEach((p, i) => {
            const d = Math.hypot(p.center.x - c.x, p.center.y - c.y);
            far = Math.max(far, d);
            if (adjacency.neighbors[i].length < maxNeighbours) nearBoundary = Math.min(nearBoundary, d);
        });
        return nearBoundary === Infinity || nearBoundary === 0 ? 1 : far / nearBoundary;
    }

    function findOverlaps(polygons) {
        const overlaps = [];
        for (let i = 0; i < polygons.length; i++) {
            const a = polygons[i];
            for (let j = i + 1; j < polygons.length; j++) {
                const b = polygons[j];
                if (
                    a.bounds.maxX < b.bounds.minX || b.bounds.maxX < a.bounds.minX ||
                    a.bounds.maxY < b.bounds.minY || b.bounds.maxY < a.bounds.minY
                ) continue;
                if (polygonsOverlap(a.vertices, b.vertices)) overlaps.push([a.id, b.id]);
            }
        }
        return overlaps;
    }

    /**
     * Runs every structural check on a generated tile set and returns a list of
     * human-readable problems (empty list = healthy).
     */
    function checkPolygons(polygons, canvas, config) {
        const issues = [];
        if (!polygons.length) return ['no tiles were generated'];

        const ids = new Set(polygons.map((p) => p.id));
        if (ids.size !== polygons.length) issues.push(`${polygons.length - ids.size} duplicate tile id(s)`);

        const boundsOff = polygons.filter((p) => {
            const real = verticesBounds(p.vertices);
            return (
                Math.abs(real.minX - p.bounds.minX) > EPSILON || Math.abs(real.maxX - p.bounds.maxX) > EPSILON ||
                Math.abs(real.minY - p.bounds.minY) > EPSILON || Math.abs(real.maxY - p.bounds.maxY) > EPSILON
            );
        });
        if (boundsOff.length) issues.push(`${boundsOff.length} tile(s) have wrong bounds`);

        const outsideCenter = polygons.filter((p) => {
            const b = p.bounds;
            return p.center.x < b.minX - EPSILON || p.center.x > b.maxX + EPSILON || p.center.y < b.minY - EPSILON || p.center.y > b.maxY + EPSILON;
        });
        if (outsideCenter.length) issues.push(`${outsideCenter.length} tile(s) have a centre outside their bounds`);

        // `Config` is a script-scope const (not a property of the global object).
        if (canvas && typeof Config !== 'undefined') {
            const pad = Config.CANVAS_PADDING;
            const bottom = canvas.height - pad - Config.TOOLBAR_CLEARANCE;
            const all = verticesBounds(polygons.flatMap((p) => p.vertices));
            const slack = 0.5;
            if (all.minX < pad - slack || all.maxX > canvas.width - pad + slack || all.minY < pad - slack || all.maxY > bottom + slack) {
                issues.push('tiles extend outside the drawable area');
            }
            if (Math.abs((all.minX + all.maxX) / 2 - canvas.width / 2) > 1) issues.push('board is not horizontally centred');
        }

        const overlaps = findOverlaps(polygons);
        if (overlaps.length) issues.push(`${overlaps.length} overlapping tile pair(s), e.g. ${overlaps[0].join(' / ')}`);

        if (config) {
            const expected = expectedCount(config);
            if (expected !== null && expected !== polygons.length) issues.push(`expected ${expected} tiles but got ${polygons.length}`);

            const order = expectedSymmetry(config);
            if (order) {
                const misses = rotationMisses(polygons, order);
                if (misses) issues.push(`not ${order}-fold rotationally symmetric (${misses} tile(s) have no partner)`);
            }
            if (expectedMirror(config)) {
                const misses = mirrorMisses(polygons);
                if (misses) issues.push(`not left-right symmetric (${misses} tile(s) have no mirror partner)`);
            }
        }
        return issues;
    }

    const api = {
        BOARD_SHAPES,
        TILE_SHAPES,
        DEFAULT_SIZES,
        makeConfig,
        allCombinations,
        expectedCount,
        expectedSymmetry,
        expectedMirror,
        rotationMisses,
        mirrorMisses,
        roundness,
        polygonsOverlap,
        findOverlaps,
        verticesBounds,
        checkPolygons
    };

    global.GeometryChecks = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
