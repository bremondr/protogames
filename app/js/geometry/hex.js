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
        createHexVertices
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

    /**
     * Circle-shaped board of hexagons: every tile whose centre lies within
     * (radius + 0.5) tile widths of the middle tile. Centring the disc on a tile (not
     * on the corner of a staggered grid) gives the full 6-fold symmetry of the hex
     * lattice, so the board is round instead of lopsided. Laid out at a fixed scale
     * around the canvas centre; Geometry.generateGrid fits it to the canvas.
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
        // (radius + 0.5) * width squared is never a lattice distance squared, so no tile sits on the edge.
        const limit = (radius + 0.5) * width;
        const span = radius + 2;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        const polygons = [];
        for (let r = -span; r <= span; r++) {
            for (let q = -span; q <= span; q++) {
                const x = orientation === 'pointy-top' ? width * (q + r / 2) : 1.5 * size * q;
                const y = orientation === 'pointy-top' ? 1.5 * size * r : width * (r + q / 2);
                if (Math.hypot(x, y) > limit) continue;
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
        }
        return polygons;
    }

    function buildHexagonShapedGrid(config, canvas, colorMap) {
        if (!canvas) return [];
        const radius = Math.max(
            0,
            Number.isFinite(config.radius) ? Math.floor(config.radius) : Config.DEFAULT_BOARD_CONFIG.radius
        );
        const orientation = config.orientation === 'flat-top' ? 'flat-top' : 'pointy-top';
        const rowPlan = createHexagonRowPlan(radius);
        const layout = computeHexagonAxialLayout(rowPlan.rows, orientation);
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
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        const widthUnit = orientation === 'pointy-top' ? Math.sqrt(3) : 1.5;
        const heightUnit = orientation === 'pointy-top' ? 1.5 : Math.sqrt(3);

        for (const row of rows) {
            const r = row.axialR;
            for (let q = row.qStart; q <= row.qEnd; q++) {
                const x = orientation === 'pointy-top' ? widthUnit * (q + r / 2) : widthUnit * q;
                const y = orientation === 'pointy-top' ? heightUnit * r : heightUnit * (r + q / 2);
                coords.push({ q, r, x, y });
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
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
        computeHexagonAxialLayout,
        calculateHexagonCentering
    };
})(typeof window !== 'undefined' ? window : globalThis);
