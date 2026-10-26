/**
 * Hexagon grid builders.
 */
(function (global) {
    const helpers = global.GeometryHelpers;
    const {
        createPolygon,
        shouldIncludePolygon,
        createBoardMetrics,
        normalizeBoardDimensions,
        createHexVertices,
        resolveCenter,
        generatorOf,
        limitBetween
    } = helpers;

    function buildHexGrid(config, canvas, colorMap) {
        if (!canvas) return [];
        if (config.boardShape === 'hexagon') {
            return buildHexagonShapedGrid(config, canvas, colorMap);
        }
        if (config.boardShape === 'circle') {
            return buildCircleHexGrid(config, canvas, colorMap);
        }

        const dims = normalizeBoardDimensions(config);
        const cols = dims.cols;
        const rows = dims.rows;
        const orientation = config.orientation === 'flat-top' ? 'flat-top' : 'pointy-top';

        const availableWidth = canvas.width - Config.CANVAS_PADDING * 2;
        const availableHeight = canvas.height - Config.CANVAS_PADDING * 2;

        // Alternate rows (pointy-top) or columns (flat-top) are shifted by half a tile,
        // which widens/heightens the board by half a tile once there is more than one.
        const rowShift = orientation === 'pointy-top' && rows > 1 ? 0.5 : 0;
        const colShift = orientation === 'flat-top' && cols > 1 ? 0.5 : 0;
        const sizeFromWidth =
            orientation === 'pointy-top'
                ? availableWidth / (Math.sqrt(3) * (Math.max(cols, 1) + rowShift))
                : availableWidth / (2 + 1.5 * Math.max(cols - 1, 0));
        const sizeFromHeight =
            orientation === 'pointy-top'
                ? availableHeight / (2 + 1.5 * Math.max(rows - 1, 0))
                : availableHeight / (Math.sqrt(3) * (Math.max(rows, 1) + colShift));

        const size = Math.max(8, Math.floor(Math.min(sizeFromWidth, sizeFromHeight)));
        const hexWidth = orientation === 'pointy-top' ? Math.sqrt(3) * size : 2 * size;
        const hexHeight = orientation === 'pointy-top' ? 2 * size : Math.sqrt(3) * size;
        const horizSpacing = orientation === 'pointy-top' ? hexWidth : 1.5 * size;
        const vertSpacing = orientation === 'pointy-top' ? 1.5 * size : hexHeight;

        const boardWidth =
            orientation === 'pointy-top'
                ? Math.sqrt(3) * size * (cols + rowShift)
                : 2 * size + (cols - 1) * 1.5 * size;
        const boardHeight =
            orientation === 'pointy-top'
                ? 2 * size + (rows - 1) * 1.5 * size
                : Math.sqrt(3) * size * (rows + colShift);

        const offsetX = (canvas.width - boardWidth) / 2;
        const offsetY = (canvas.height - boardHeight) / 2;
        const boardMetrics = createBoardMetrics(offsetX, offsetY, boardWidth, boardHeight, config, orientation);

        const polygons = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                let centerX;
                let centerY;

                if (orientation === 'flat-top') {
                    centerX = offsetX + size + col * horizSpacing;
                    centerY = offsetY + hexHeight / 2 + row * vertSpacing;
                    if (col % 2 !== 0) {
                        centerY += vertSpacing / 2;
                    }
                } else {
                    centerX = offsetX + hexWidth / 2 + col * horizSpacing;
                    if (row % 2 !== 0) {
                        centerX += horizSpacing / 2;
                    }
                    centerY = offsetY + size + row * vertSpacing;
                }

                const center = { x: centerX, y: centerY };
                if (!shouldIncludePolygon(center, boardMetrics)) continue;

                const id = `hex_${row}_${col}`;
                const vertices = createHexVertices(center, size, orientation);
                polygons.push(
                    createPolygon({
                        id,
                        type: 'hexagon',
                        center,
                        vertices,
                        color: colorMap?.get(id)
                    })
                );
            }
        }
        return polygons;
    }

    /** Axial offsets (q, r) of the three hexagons that meet at one corner; neighbours of each other. */
    const CORNER_SEEDS = [[0, 0], [1, 0], [0, 1]];
    const hexDistance = (dq, dr) => Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));

    /** Position of an axial tile in units of the tile size. */
    function axialUnits(q, r, orientation) {
        const width = Math.sqrt(3);
        return orientation === 'pointy-top' ? { x: width * (q + r / 2), y: 1.5 * r } : { x: 1.5 * q, y: width * (r + q / 2) };
    }

    /**
     * Circle-shaped board of hexagons: every tile whose centre lies within a limit of the middle, which is a tile
     * (limit radius + 0.5 tile widths) or the corner shared by three tiles (limit radius + 0.72 tile widths, so radius 0
     * is those three). Centring the disc like that gives the full symmetry of the lattice around that point (6-fold
     * around a tile, 3-fold around a corner), so the board is round instead of lopsided. Laid out at a fixed scale
     * around the canvas centre; Geometry.generateGrid fits it to the canvas. Generator 1 (config.generator) is the
     * original, which loses tiles of big discs; it is kept so that boards saved with it keep their tiles.
     */
    function buildCircleHexGrid(config, canvas, colorMap) {
        if (!canvas) return [];
        const radius = Math.max(
            0,
            Number.isFinite(config.radius) ? Math.floor(config.radius) : Config.DEFAULT_BOARD_CONFIG.radius
        );
        const orientation = config.orientation === 'flat-top' ? 'flat-top' : 'pointy-top';
        const size = 40;
        const width = Math.sqrt(3) * size; // distance between neighbouring tile centres
        // Generator 1 scanned radius + 3 tiles in each axial direction, which stops covering the disc at radius 23 (tile centre)
        // or 19 (point centre). The disc reaches radius + 0.72 tile widths, which is 2 / sqrt(3) times as many axial steps.
        const span = generatorOf(config) >= 2 ? Math.ceil(((radius + 0.72) * 2) / Math.sqrt(3)) + 2 : radius + 3;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        // The middle of the disc in tile-size units: a tile centre, or the corner of the three seed tiles.
        const seeds = CORNER_SEEDS.map(([q, r]) => axialUnits(q, r, orientation));
        const around = resolveCenter(config) === 'point'
            ? { x: (seeds[0].x + seeds[1].x + seeds[2].x) / 3, y: (seeds[0].y + seeds[1].y + seeds[2].y) / 3 }
            : { x: 0, y: 0 };

        const candidates = [];
        for (let r = -span; r <= span; r++) {
            for (let q = -span; q <= span; q++) {
                const u = axialUnits(q, r, orientation);
                const x = (u.x - around.x) * size;
                const y = (u.y - around.y) * size;
                candidates.push({ q, r, x, y, d2: x * x + y * y });
            }
        }
        // A tile-centred disc keeps its own limit; either way no tile can sit exactly on the edge.
        const wanted = resolveCenter(config) === 'point' ? (radius + 0.72) * width : (radius + 0.5) * width;
        const limit2 = resolveCenter(config) === 'point' ? limitBetween(candidates.map((c) => c.d2), wanted * wanted) : wanted * wanted;

        const polygons = [];
        for (const { q, r, x, y, d2 } of candidates) {
            if (d2 > limit2) continue;
            const id = `hex_${q}_${r}`;
            const center = { x: cx + x, y: cy + y };
            polygons.push(
                createPolygon({
                    id,
                    type: 'hexagon',
                    center,
                    vertices: createHexVertices(center, size, orientation),
                    color: colorMap?.get(id)
                })
            );
        }
        return polygons;
    }

    /**
     * Hexagon-shaped board of hexagons: `radius` rings around a tile, or around the corner shared by three tiles
     * (rings of layers counted by shared edges from those three).
     */
    function buildHexagonShapedGrid(config, canvas, colorMap) {
        if (!canvas) return [];
        const radius = Math.max(
            0,
            Number.isFinite(config.radius) ? Math.floor(config.radius) : Config.DEFAULT_BOARD_CONFIG.radius
        );
        const orientation = config.orientation === 'flat-top' ? 'flat-top' : 'pointy-top';
        const layout = resolveCenter(config) === 'point'
            ? layoutOfCoords(hexagonAroundCorner(radius), orientation)
            : computeHexagonAxialLayout(createHexagonRowPlan(radius).rows, orientation);
        const placement = calculateHexagonCentering(layout, orientation, canvas);

        return layout.coords.map((coord) => {
            const polygonId = `hex_${coord.q}_${coord.r}`;
            const center = {
                x: (coord.x - layout.minX + placement.hexWidthUnit / 2) * placement.size + placement.offsetX,
                y: (coord.y - layout.minY + placement.hexHeightUnit / 2) * placement.size + placement.offsetY
            };
            return createPolygon({
                id: polygonId,
                type: 'hexagon',
                center,
                vertices: createHexVertices(center, placement.size, orientation),
                color: colorMap?.get(polygonId)
            });
        });
    }

    /** The axial coordinates of every tile within `radius` steps of the nearest of the three tiles around a corner. */
    function hexagonAroundCorner(radius) {
        const coords = [];
        for (let r = -radius - 1; r <= radius + 2; r++) {
            for (let q = -radius - 1; q <= radius + 2; q++) {
                const nearest = Math.min(...CORNER_SEEDS.map(([sq, sr]) => hexDistance(q - sq, r - sr)));
                if (nearest <= radius) coords.push({ q, r });
            }
        }
        return coords;
    }

    function createHexagonRowPlan(radius) {
        const safeRadius = Math.max(0, radius);
        const totalRows = safeRadius * 2 + 1;
        const rows = [];

        for (let index = 0; index < totalRows; index++) {
            const axialR = index - safeRadius;
            const count = index <= safeRadius ? index + 1 : totalRows - index;
            const qStart = Math.max(-safeRadius, -axialR - safeRadius);
            const qEnd = Math.min(safeRadius, -axialR + safeRadius);
            rows.push({
                index,
                axialR,
                count,
                qStart,
                qEnd
            });
        }

        return { rows, totalRows };
    }

    function computeHexagonAxialLayout(rows, orientation) {
        const coords = [];
        for (const row of rows) {
            for (let q = row.qStart; q <= row.qEnd; q++) coords.push({ q, r: row.axialR });
        }
        return layoutOfCoords(coords, orientation);
    }

    /** Positions (in units of the tile size) and extent of a list of axial coordinates [{ q, r }]. */
    function layoutOfCoords(list, orientation) {
        const coords = [];
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        const widthUnit = orientation === 'pointy-top' ? Math.sqrt(3) : 1.5;
        const heightUnit = orientation === 'pointy-top' ? 1.5 : Math.sqrt(3);

        for (const { q, r } of list) {
            const x = orientation === 'pointy-top' ? widthUnit * (q + r / 2) : widthUnit * q;
            const y = orientation === 'pointy-top' ? heightUnit * r : heightUnit * (r + q / 2);
            coords.push({ q, r, x, y });
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }

        return { coords, minX, maxX, minY, maxY };
    }

    function calculateHexagonCentering(layout, orientation, canvas) {
        const hexWidthUnit = orientation === 'pointy-top' ? Math.sqrt(3) : 2;
        const hexHeightUnit = orientation === 'pointy-top' ? 2 : Math.sqrt(3);
        const widthCenters = layout.maxX - layout.minX;
        const heightCenters = layout.maxY - layout.minY;
        const availableWidth = canvas.width - Config.CANVAS_PADDING * 2;
        const availableHeight = canvas.height - Config.CANVAS_PADDING * 2;

        const size = Math.max(
            8,
            Math.floor(
                Math.min(
                    availableWidth / (widthCenters + hexWidthUnit),
                    availableHeight / (heightCenters + hexHeightUnit)
                )
            )
        );

        const boardWidth = (widthCenters + hexWidthUnit) * size;
        const boardHeight = (heightCenters + hexHeightUnit) * size;
        const offsetX = (canvas.width - boardWidth) / 2;
        const offsetY = (canvas.height - boardHeight) / 2;

        return { size, offsetX, offsetY, hexWidthUnit, hexHeightUnit };
    }

    global.GeometryHex = {
        buildHexGrid,
        buildHexagonShapedGrid,
        buildCircleHexGrid,
        createHexagonRowPlan,
        hexagonAroundCorner,
        layoutOfCoords,
        computeHexagonAxialLayout,
        calculateHexagonCentering
    };
})(typeof window !== 'undefined' ? window : globalThis);
