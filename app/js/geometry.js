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

    function buildGrid(config, canvas, colorMap) {
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

    /** Builds the tiles, then fits whatever survived clipping into the drawable area. */
    function generateGrid(config, canvas, colorMap) {
        return helpers.fitPolygonsToCanvas(buildGrid(config, canvas, colorMap), canvas);
    }

    const neighbors = global.GeometryNeighbors;

    const Geometry = {
        generateGrid,
        isPointInPolygon: helpers.isPointInPolygon,
        findPolygonAtPoint: helpers.findPolygonAtPoint,
        buildAdjacency: neighbors.buildAdjacency,
        buildLocator: neighbors.buildLocator,
        floodFill: neighbors.floodFill,
        neighborhood: neighbors.neighborhood,
        shortestPath: neighbors.shortestPath,
        linePath: neighbors.linePath
    };

    global.Geometry = Geometry;
})(typeof window !== 'undefined' ? window : globalThis);
