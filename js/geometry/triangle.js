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
        createHexVertices,
        isPointInPolygon
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
                const insideHex =
                    boardMetrics && boardMetrics.outline
                        ? isPointInPolygon(center, boardMetrics.outline) &&
                          vertices.every((vertex) => isPointInPolygon(vertex, boardMetrics.outline))
                        : shouldIncludePolygon(center, boardMetrics);
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

    function buildHexagonTriangleGrid(config, canvas, colorMap, radius, orientation) {
        if (!canvas) return [];

        const rings = Math.max(
            1,
            Number.isFinite(radius) ? Math.floor(radius) : Config.DEFAULT_BOARD_CONFIG.radius
        );
        const hexOrientation = orientation === 'flat-top' ? 'flat-top' : 'pointy-top';

        const availableWidth = canvas.width - Config.CANVAS_PADDING * 2;
        const availableHeight = canvas.height - Config.CANVAS_PADDING * 2;

        const hexWidthUnit = hexOrientation === 'pointy-top' ? Math.sqrt(3) : 2;
        const hexHeightUnit = hexOrientation === 'pointy-top' ? 2 : Math.sqrt(3);

        const maxHexSize = Math.max(
            8,
            Math.floor(Math.min(availableWidth / hexWidthUnit, availableHeight / hexHeightUnit))
        );
        const triangleSize = Math.max(8, Math.floor(maxHexSize / rings));
        const size = triangleSize * rings; // actual hex radius after snapping to triangle grid
        const triangleHeight = (Math.sqrt(3) / 2) * triangleSize;

        const hexWidth = hexWidthUnit * size;
        const hexHeight = hexHeightUnit * size;
        const offsetX = (canvas.width - hexWidth) / 2;
        const offsetY = (canvas.height - hexHeight) / 2;
        const hexCenter = { x: offsetX + hexWidth / 2, y: offsetY + hexHeight / 2 };
        const hexOutline = createHexVertices(hexCenter, size, hexOrientation);

        const anchorX = hexCenter.x - triangleSize / 2;
        const anchorY = hexCenter.y;

        const minX = offsetX;
        const maxX = offsetX + hexWidth;
        const minY = offsetY;
        const maxY = offsetY + hexHeight;
        const bleed = 2;
        const rowStart = Math.floor((minY - anchorY) / triangleHeight) - bleed;
        const rowEnd = Math.ceil((maxY - anchorY) / triangleHeight) + bleed;
        const colStart = Math.floor(((minX - anchorX) * 2) / triangleSize) - bleed;
        const colEnd = Math.ceil(((maxX - anchorX) * 2) / triangleSize) + bleed;

        const polygons = [];

        for (let row = rowStart; row <= rowEnd; row++) {
            const originY = anchorY + row * triangleHeight;
            for (let col = colStart; col <= colEnd; col++) {
                const originX = anchorX + (col * triangleSize) / 2;
                const pointingUp = (row + col) % 2 === 0;
                const vertices = createTriangleVertices({ x: originX, y: originY }, triangleSize, pointingUp);
                const center = {
                    x: (vertices[0].x + vertices[1].x + vertices[2].x) / 3,
                    y: (vertices[0].y + vertices[1].y + vertices[2].y) / 3
                };

                const insideHex =
                    isPointInPolygon(center, hexOutline) && vertices.every((vertex) => isPointInPolygon(vertex, hexOutline));
                if (!insideHex) continue;

                const id = `triangle_hex_${row}_${col}`;
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
        buildTessellatedTriangle
    };
})(typeof window !== 'undefined' ? window : globalThis);
