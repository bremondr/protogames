/**
 * PROTOGAMES GEOMETRY
 * --------------------------------------------------------------
 * Aggregates grid builders from geometry submodules (hex, triangle, square)
 * and exposes the public API consumed by the renderer/interaction layers.
 */
(function (global) {
    const helpers = global.GeometryHelpers;
    const hex = global.GeometryHex;
    const tri = global.GeometryTriangle;
    const square = global.GeometrySquare;

    function generateGrid(config, canvas, colorMap) {
        switch (config.gridType) {
            case 'triangle':
                return tri.buildTriangleGrid(config, canvas, colorMap);
            case 'orthogonal-square':
                return square.buildDiamondGrid(config, canvas, colorMap);
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
