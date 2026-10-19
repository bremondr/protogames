/**
 * Triangle grid builders (rectangular, triangle outline, hex outline).
 */
(function (global) {
    const helpers = global.GeometryHelpers;
    const {
        createPolygon,
        shouldIncludePolygon,
        createBoardMetrics,
        normalizeBoardDimensions,
        createTriangleVertices,
        boundsCenter,
        isPointInPolygon,
        resolveCenter,
        limitBetween
    } = helpers;

    function buildTriangleGrid(config, canvas, colorMap) {
        if (!canvas) return [];
        const baseSize = Math.max(
            1,
            Number.isFinite(config.size) ? Math.floor(config.size) : Config.DEFAULT_BOARD_CONFIG.size
        );
        const triangleOrientation = config.triangleOrientation === 'point-down' ? 'point-down' : 'point-up';

        if (config.boardShape === 'triangle') {
            return buildTessellatedTriangle(config, canvas, colorMap, baseSize, triangleOrientation);
        }

        if (config.boardShape === 'hexagon') {
            const radius = Math.max(
                0,
                Number.isFinite(config.radius) ? Math.floor(config.radius) : Config.DEFAULT_BOARD_CONFIG.radius
            );
            const hexOrientation = config.orientation === 'flat-top' ? 'flat-top' : 'pointy-top';
            return buildHexagonTriangleGrid(config, canvas, colorMap, radius, hexOrientation);
        }

        if (config.boardShape === 'circle') {
            const radius = Math.max(
                1,
                Number.isFinite(config.radius) ? Math.floor(config.radius) : Config.DEFAULT_BOARD_CONFIG.radius
            );
            return buildCircleTriangleGrid(config, canvas, colorMap, radius);
        }

        // Fallback: retain rectangular tiling when the board outline is not triangular.
        const dims = normalizeBoardDimensions(config);
        const cols = Math.max(2, dims.cols);
        const rows = Math.max(1, dims.rows);
        const availableWidth = canvas.width - Config.CANVAS_PADDING * 2;
        const availableHeight = canvas.height - Config.CANVAS_PADDING * 2;
        const sizeFromWidth = (availableWidth * 2) / (cols + 1);
        const sizeFromHeight = (availableHeight * 2) / (rows * Math.sqrt(3));
        const size = Math.max(12, Math.floor(Math.min(sizeFromWidth, sizeFromHeight)));
        const triangleHeight = (Math.sqrt(3) / 2) * size;
        const boardWidth = (cols * size) / 2 + size / 2;
        const boardHeight = rows * triangleHeight;
        const offsetX = (canvas.width - boardWidth) / 2;
        const offsetY = (canvas.height - boardHeight) / 2;
        const boardMetrics = createBoardMetrics(offsetX, offsetY, boardWidth, boardHeight, config);

        const polygons = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const origin = {
                    x: offsetX + (col * size) / 2,
                    y: offsetY + row * triangleHeight
                };
                const pointingUp = (row + col) % 2 === 0;
                const vertices = createTriangleVertices(origin, size, pointingUp);
                const center = {
                    x: (vertices[0].x + vertices[1].x + vertices[2].x) / 3,
                    y: (vertices[0].y + vertices[1].y + vertices[2].y) / 3
                };
                const insideHex = shouldIncludePolygon(boundsCenter(vertices), boardMetrics);
                if (!insideHex) continue;
                const id = `triangle_${row}_${col}`;
                polygons.push(
                    createPolygon({
                        id,
                        type: 'triangle',
                        center,
                        vertices,
                        color: colorMap?.get(id),
                        metadata: { pointingUp }
                    })
                );
            }
        }
        return polygons;
    }

    /**
     * Shared by the hexagon and circle boards: tiles a region with triangles from a
     * triangle lattice that has a vertex at the board centre.
     *
     * Lattice point (i, j) sits at x = i + j / 2, y = j * sqrt(3) / 2 (in triangle
     * sides). Each lattice cell holds one downward and one upward triangle. A
     * triangle belongs to the board when `accepts(x, y)` is true for its centroid
     * (also in triangle sides, relative to the centre). Layout is done at a fixed
     * scale around the canvas centre; Geometry.generateGrid then fits it to the canvas.
     *
     * @param {Object} options
     * @param {number} options.span       how many lattice steps to scan in each direction
     * @param {Function} options.accepts  (x, y, triangle) => boolean; x and y are the centroid relative to `origin`
     *                                    (in triangle sides), triangle is { i, j, kind }
     * @param {{x:number,y:number}} [options.origin] the middle of the board in lattice units (default: the vertex at 0, 0)
     * @param {boolean} [options.rotate]  rotate the finished layout by 90 degrees
     * @param {string} options.idPrefix
     */
    function buildLatticeTriangles(canvas, colorMap, options) {
        const { span, accepts, rotate = false, idPrefix, origin = { x: 0, y: 0 } } = options;
        const side = 100;
        const rowHeight = (Math.sqrt(3) / 2) * side;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const point = (i, j) => ({ x: (i + j / 2) * side - origin.x * side, y: j * rowHeight - origin.y * side });
        const place = (p) => (rotate ? { x: cx - p.y, y: cy + p.x } : { x: cx + p.x, y: cy + p.y });

        const polygons = [];
        for (let j = -span; j <= span; j++) {
            for (let i = -span; i <= span; i++) {
                // Two triangles per lattice cell: one pointing down, one pointing up.
                const cell = [
                    { kind: 'down', corners: [point(i, j), point(i + 1, j), point(i, j + 1)] },
                    { kind: 'up', corners: [point(i + 1, j), point(i + 1, j + 1), point(i, j + 1)] }
                ];
                for (const { kind, corners } of cell) {
                    const centroid = {
                        x: (corners[0].x + corners[1].x + corners[2].x) / 3,
                        y: (corners[0].y + corners[1].y + corners[2].y) / 3
                    };
                    if (!accepts(centroid.x / side - origin.x, centroid.y / side - origin.y, { i, j, kind })) continue;

                    const id = `${idPrefix}_${j}_${i}_${kind}`;
                    polygons.push(
                        createPolygon({
                            id,
                            type: 'triangle',
                            center: place(centroid),
                            vertices: corners.map(place),
                            color: colorMap?.get(id),
                            metadata: rotate ? {} : { pointingUp: kind === 'up' }
                        })
                    );
                }
            }
        }
        return polygons;
    }

    const ROW = Math.sqrt(3) / 2; // height of a triangle, in triangle sides

    /** The middle (centroid) of the lattice triangle { i: 0, j: 0, kind }, in triangle sides. */
    function seedOrigin(kind) {
        return kind === 'up' ? { x: 1, y: (2 * ROW) / 3 } : { x: 0.5, y: ROW / 3 };
    }

    /** The three lattice corners of a triangle (lattice points are integer pairs). */
    function cornersOf(i, j, kind) {
        return kind === 'down' ? [[i, j], [i + 1, j], [i, j + 1]] : [[i + 1, j], [i + 1, j + 1], [i, j + 1]];
    }

    const triangleKey = (i, j, kind) => `${j},${i},${kind}`;

    /**
     * The triangles within `layers` layers of a starting triangle: layer 1 is that triangle, every next layer adds the
     * triangles that share a corner with the previous one. Same rule that makes hexagons grow in rings.
     */
    function layersAroundTriangle(layers, kind) {
        const span = layers * 2 + 2;
        const atCorner = new Map();
        const all = [];
        for (let j = -span; j <= span; j++) {
            for (let i = -span; i <= span; i++) {
                for (const k of ['down', 'up']) {
                    const key = triangleKey(i, j, k);
                    all.push({ i, j, kind: k, key });
                    for (const [a, b] of cornersOf(i, j, k)) {
                        const corner = `${a},${b}`;
                        if (!atCorner.has(corner)) atCorner.set(corner, []);
                        atCorner.get(corner).push(key);
                    }
                }
            }
        }
        const cornersByKey = new Map(all.map((t) => [t.key, cornersOf(t.i, t.j, t.kind).map(([a, b]) => `${a},${b}`)]));
        const layerOf = new Map([[triangleKey(0, 0, kind), 1]]);
        let frontier = [triangleKey(0, 0, kind)];
        for (let layer = 2; layer <= layers; layer++) {
            const next = [];
            for (const key of frontier) {
                for (const corner of cornersByKey.get(key)) {
                    for (const other of atCorner.get(corner)) {
                        if (!layerOf.has(other)) { layerOf.set(other, layer); next.push(other); }
                    }
                }
            }
            frontier = next;
        }
        return new Set(layerOf.keys());
    }

    /** Squared distances (in triangle sides) of every triangle centroid near a middle, for picking a tie-free disc. */
    function centroidDistances(span, origin) {
        const list = [];
        for (let j = -span; j <= span; j++) {
            for (let i = -span; i <= span; i++) {
                for (const kind of ['down', 'up']) {
                    const [a, b, c] = cornersOf(i, j, kind).map(([p, q]) => ({ x: p + q / 2, y: q * ROW }));
                    const x = (a.x + b.x + c.x) / 3 - origin.x;
                    const y = (a.y + b.y + c.y) / 3 - origin.y;
                    list.push(x * x + y * y);
                }
            }
        }
        return list;
    }

    /**
     * Hexagon-shaped board tiled with triangles: exactly 6 * radius^2 tiles.
     *
     * A flat-top hexagon (vertices left/right) follows lattice lines exactly, so a
     * centroid test is never ambiguous; pointy-top is the same layout rotated 90 degrees.
     */
    function buildHexagonTriangleGrid(config, canvas, colorMap, radius, orientation) {
        if (!canvas) return [];
        const rings = Math.max(
            1,
            Number.isFinite(radius) ? Math.floor(radius) : Config.DEFAULT_BOARD_CONFIG.radius
        );
        if (resolveCenter(config) === 'tile') {
            // Around one triangle (pointing up or down): layer 1 is that triangle, each layer the triangles touching the last.
            const kind = config.triangleOrientation === 'point-down' ? 'down' : 'up';
            const keys = layersAroundTriangle(rings, kind);
            return buildLatticeTriangles(canvas, colorMap, {
                span: rings * 2 + 2,
                origin: seedOrigin(kind),
                idPrefix: 'triangle_hex',
                accepts: (x, y, t) => keys.has(triangleKey(t.i, t.j, t.kind))
            });
        }
        const half = Math.sqrt(3) / 2;
        return buildLatticeTriangles(canvas, colorMap, {
            span: rings * 2 + 1,
            rotate: orientation !== 'flat-top',
            idPrefix: 'triangle_hex',
            accepts: (x, y) => Math.abs(x) + Math.abs(y) / Math.sqrt(3) < rings && Math.abs(y) < rings * half
        });
    }

    /** The lattice cell of a generated triangle, read back from its id (`<prefix>_<row>_<column>_<up|down>`). */
    function latticeCellOf(polygon) {
        const match = /_(-?\d+)_(-?\d+)_(up|down)$/.exec(polygon.id);
        return match ? { j: Number(match[1]), i: Number(match[2]), kind: match[3] } : null;
    }

    /** The triangles that share an edge with a lattice triangle. */
    function edgeNeighbours({ i, j, kind }) {
        return kind === 'down'
            ? [[i, j - 1, 'up'], [i, j, 'up'], [i - 1, j, 'up']]
            : [[i, j + 1, 'down'], [i, j, 'down'], [i + 1, j, 'down']];
    }

    /**
     * Leaves out the tiles at the rim of a cut-out disc that touch only one other tile (or none): they stick out as
     * spikes. Removing one can leave another hanging by a single edge, so it repeats until every tile touches two.
     * A board of one tile is left alone. The rule looks at the tile and its neighbours only, so the symmetry of the
     * disc is kept.
     */
    function withoutSpikes(polygons) {
        if (polygons.length < 2) return polygons;
        const cells = new Map();
        polygons.forEach((polygon) => {
            const cell = latticeCellOf(polygon);
            if (cell) cells.set(triangleKey(cell.i, cell.j, cell.kind), polygon);
        });
        const touching = (polygon) => edgeNeighbours(latticeCellOf(polygon)).filter(([i, j, kind]) => cells.has(triangleKey(i, j, kind))).length;
        let spikes;
        do {
            spikes = [...cells].filter(([, polygon]) => touching(polygon) < 2);
            spikes.forEach(([key]) => cells.delete(key));
        } while (spikes.length && cells.size > 1);
        const kept = new Set(cells.keys());
        return polygons.filter((polygon) => {
            const { i, j, kind } = latticeCellOf(polygon);
            return kept.has(triangleKey(i, j, kind));
        });
    }

    /**
     * Circle-shaped board tiled with triangles: every triangle whose centroid lies
     * within `radius` triangle sides of the lattice vertex in the middle. Because the
     * disc is centred on a lattice vertex the result has the full 6-fold symmetry of
     * the lattice (cutting a circle out of an off-centre grid does not).
     *
     * Centroid distances squared are multiples of 1/3, so the threshold sits halfway
     * between two achievable values and no triangle can sit exactly on the boundary.
     */
    function buildCircleTriangleGrid(config, canvas, colorMap, radius) {
        if (!canvas) return [];
        if (resolveCenter(config) === 'tile') {
            // Around one triangle: every triangle whose centroid lies within (radius - 0.5) sides of its centroid, so
            // radius 1 is that triangle alone; no triangle can sit exactly on the edge.
            const kind = config.triangleOrientation === 'point-down' ? 'down' : 'up';
            const origin = seedOrigin(kind);
            const span = radius * 2 + 2;
            const wanted = Math.max(0, radius - 0.5);
            const limit2 = limitBetween(centroidDistances(span, origin), wanted * wanted);
            return withoutSpikes(buildLatticeTriangles(canvas, colorMap, {
                span,
                origin,
                idPrefix: 'triangle_disc',
                accepts: (x, y) => x * x + y * y <= limit2
            }));
        }
        const limitSquared = (Math.floor(3 * radius * radius) + 0.5) / 3;
        return withoutSpikes(buildLatticeTriangles(canvas, colorMap, {
            span: radius * 2 + 2,
            idPrefix: 'triangle_disc',
            accepts: (x, y) => x * x + y * y <= limitSquared
        }));
    }

    function buildTessellatedTriangle(config, canvas, colorMap, baseSize, triangleOrientation) {
        const availableWidth = canvas.width - Config.CANVAS_PADDING * 2;
        const availableHeight = canvas.height - Config.CANVAS_PADDING * 2;
        const sizeFromWidth = availableWidth / baseSize;
        const sizeFromHeight = (availableHeight * 2) / (Math.sqrt(3) * baseSize);
        const size = Math.max(12, Math.floor(Math.min(sizeFromWidth, sizeFromHeight)));
        const triangleHeight = (Math.sqrt(3) / 2) * size;
        const boardWidth = baseSize * size;
        const boardHeight = baseSize * triangleHeight;
        const offsetX = (canvas.width - boardWidth) / 2;
        const offsetY = (canvas.height - boardHeight) / 2;
        const polygons = [];

        for (let row = 0; row < baseSize; row++) {
            const logicalRow = triangleOrientation === 'point-up' ? row : baseSize - 1 - row;
            const trianglesInRow = 2 * logicalRow + 1;
            const rowWidthCenters = (trianglesInRow - 1) * (size / 2);
            const startX = offsetX + boardWidth / 2 - rowWidthCenters / 2;
            const originY = offsetY + row * triangleHeight;

            for (let col = 0; col < trianglesInRow; col++) {
                const centerX = startX + col * (size / 2);
                const origin = { x: centerX - size / 2, y: originY };
                const startWithUp = triangleOrientation === 'point-up';
                const pointingUp = startWithUp ? col % 2 === 0 : col % 2 !== 0;
                const vertices = createTriangleVertices(origin, size, pointingUp);
                const center = {
                    x: (vertices[0].x + vertices[1].x + vertices[2].x) / 3,
                    y: (vertices[0].y + vertices[1].y + vertices[2].y) / 3
                };
                const id = `triangle_${row}_${col}`;
                polygons.push(
                    createPolygon({
                        id,
                        type: 'triangle',
                        center,
                        vertices,
                        color: colorMap?.get(id),
                        metadata: { pointingUp }
                    })
                );
            }
        }

        return polygons;
    }

    global.GeometryTriangle = {
        buildTriangleGrid,
        buildHexagonTriangleGrid,
        buildCircleTriangleGrid,
        buildTessellatedTriangle,
        layersAroundTriangle
    };
})(typeof window !== 'undefined' ? window : globalThis);
