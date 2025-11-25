/**
 * PROTOGAMES GEOMETRY
 * --------------------------------------------------------------
 * Aggregates grid builders from geometry submodules (hex, triangle, square)
 * and exposes the public API consumed by the renderer/interaction layers.
 * Supports hex, triangular, square grids plus alternate outlines (hex, triangle,
 * circle, rectangle) with optional color-map reuse when regenerating boards.
 */
(function (global) {
    const helpers = global.GeometryHelpers;
    const hex = global.GeometryHex;
    const tri = global.GeometryTriangle;
    const square = global.GeometrySquare;

    /**
     * Builds a grid based on config and forwards a color map to preserve fills.
     *
     * @param {Object} config - Board/grid configuration.
     * @param {HTMLCanvasElement} canvas - Target canvas.
     * @param {Map<string,string>} [colorMap] - Previous colors keyed by polygon id.
     */
    function generateGrid(config, canvas, colorMap) {
        switch (config.gridType) {
            case 'triangle':
                return tri.buildTriangleGrid(config, canvas, colorMap);
            case 'square':
                return square.buildSquareGrid(config, canvas, colorMap);
            case 'hexagon':
            default:
                return hex.buildHexGrid(config, canvas, colorMap);
        }
    }

    const Geometry = {
        generateGrid,
        isPointInPolygon: helpers.isPointInPolygon,
        findPolygonAtPoint: helpers.findPolygonAtPoint
    };

    global.Geometry = Geometry;
})(typeof window !== 'undefined' ? window : globalThis);
