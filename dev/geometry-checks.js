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
        polygonsOverlap,
        findOverlaps,
        verticesBounds,
        checkPolygons
    };

    global.GeometryChecks = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
