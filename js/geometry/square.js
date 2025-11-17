/**
 * Square and diamond grid builders.
 */
(function (global) {
    const helpers = global.GeometryHelpers;
    const {
        createPolygon,
        shouldIncludePolygon,
        createBoardMetrics,
        normalizeBoardDimensions,
        createSquareVertices,
        createDiamondVertices
    } = helpers;

    function buildSquareGrid(config, canvas, colorMap) {
        if (!canvas) return [];
        const dims = normalizeBoardDimensions(config);
        const cols = dims.cols;
        const rows = dims.rows;
        const availableWidth = canvas.width - Config.CANVAS_PADDING * 2;
        const availableHeight = canvas.height - Config.CANVAS_PADDING * 2;
        const size = Math.max(12, Math.floor(Math.min(availableWidth / cols, availableHeight / rows)));
        const boardWidth = size * cols;
        const boardHeight = size * rows;
        const offsetX = (canvas.width - boardWidth) / 2;
        const offsetY = (canvas.height - boardHeight) / 2;
        const boardMetrics = createBoardMetrics(offsetX, offsetY, boardWidth, boardHeight, config);

        const polygons = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const center = {
                    x: offsetX + size / 2 + col * size,
                    y: offsetY + size / 2 + row * size
                };
                if (!shouldIncludePolygon(center, boardMetrics)) continue;
                const id = `square_${row}_${col}`;
                polygons.push(
                    createPolygon({
                        id,
                        type: 'square',
                        center,
                        vertices: createSquareVertices(center, size),
                        color: colorMap?.get(id)
                    })
                );
            }
        }
        return polygons;
    }

    function buildDiamondGrid(config, canvas, colorMap) {
        if (!canvas) return [];
        const dims = normalizeBoardDimensions(config);
        const cols = dims.cols;
        const rows = dims.rows;
        const availableWidth = canvas.width - Config.CANVAS_PADDING * 2;
        const availableHeight = canvas.height - Config.CANVAS_PADDING * 2;
        const size = Math.max(12, Math.floor(Math.min(availableWidth / cols, availableHeight / rows)));
        const boardWidth = size * cols;
        const boardHeight = size * rows;
        const offsetX = (canvas.width - boardWidth) / 2;
        const offsetY = (canvas.height - boardHeight) / 2;
        const boardMetrics = createBoardMetrics(offsetX, offsetY, boardWidth, boardHeight, config);

        const polygons = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const center = {
                    x: offsetX + size / 2 + col * size,
                    y: offsetY + size / 2 + row * size
                };
                if (!shouldIncludePolygon(center, boardMetrics)) continue;
                const id = `diamond_${row}_${col}`;
                polygons.push(
                    createPolygon({
                        id,
                        type: 'orthogonal-square',
                        center,
                        vertices: createDiamondVertices(center, size),
                        color: colorMap?.get(id)
                    })
                );
            }
        }
        return polygons;
    }

    global.GeometrySquare = {
        buildSquareGrid,
        buildDiamondGrid
    };
})(typeof window !== 'undefined' ? window : globalThis);
