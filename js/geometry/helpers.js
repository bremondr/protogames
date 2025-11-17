/**
 * Shared geometry helpers: polygon creation, outline clipping, primitive vertex
 * builders, and hit-testing utilities.
 */
(function (global) {
    function createPolygon({ id, type, center, vertices, color, metadata = {} }) {
        const bounds = vertices.reduce(
            (acc, point) => ({
                minX: Math.min(acc.minX, point.x),
                maxX: Math.max(acc.maxX, point.x),
                minY: Math.min(acc.minY, point.y),
                maxY: Math.max(acc.maxY, point.y)
            }),
            { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
        );

        return {
            id,
            type,
            center,
            vertices,
            color: color || Config.DEFAULT_FILL,
            bounds,
            ...metadata
        };
    }

    function shouldIncludePolygon(center, boardMetrics) {
        if (!boardMetrics) return true;
        if (boardMetrics.circle) {
            return isPointInCircle(center, boardMetrics.circle);
        }
        if (boardMetrics.outline) {
            return isPointInPolygon(center, boardMetrics.outline);
        }
        return true;
    }

    function createBoardMetrics(offsetX, offsetY, width, height, config, orientationHint) {
        const bounds = { x: offsetX, y: offsetY, width, height };
        let outline = null;
        let circle = null;

        switch (config.boardShape) {
            case 'hexagon': {
                const orientation = orientationHint && orientationHint.includes('pointy') ? 'pointy-top' : 'flat-top';
                outline = createBoardHexOutline(bounds, orientation);
                break;
            }
            case 'triangle':
                outline = createBoardTriangleOutline(bounds, config.triangleOrientation || 'point-up');
                break;
            case 'circle':
                circle = {
                    cx: offsetX + width / 2,
                    cy: offsetY + height / 2,
                    radius: Math.min(width, height) / 2
                };
                break;
            default:
                break;
        }
        return { bounds, outline, circle };
    }

    function createBoardHexOutline(bounds, orientation) {
        const { x, y, width, height } = bounds;
        if (orientation === 'pointy-top') {
            return [
                { x: x + width / 2, y },
                { x: x + width, y: y + height * 0.25 },
                { x: x + width, y: y + height * 0.75 },
                { x: x + width / 2, y: y + height },
                { x: x, y: y + height * 0.75 },
                { x: x, y: y + height * 0.25 }
            ];
        }
        return [
            { x: x + width * 0.25, y },
            { x: x + width * 0.75, y },
            { x: x + width, y: y + height / 2 },
            { x: x + width * 0.75, y: y + height },
            { x: x + width * 0.25, y: y + height },
            { x: x, y: y + height / 2 }
        ];
    }

    function createBoardTriangleOutline(bounds, orientation) {
        const { x, y, width, height } = bounds;
        if (orientation === 'point-down') {
            return [
                { x: x, y },
                { x: x + width, y },
                { x: x + width / 2, y: y + height }
            ];
        }
        return [
            { x: x + width / 2, y },
            { x: x + width, y: y + height },
            { x: x, y: y + height }
        ];
    }

    function isPointInCircle(point, circle) {
        const dx = point.x - circle.cx;
        const dy = point.y - circle.cy;
        return dx * dx + dy * dy <= circle.radius * circle.radius;
    }

    function normalizeBoardDimensions(config) {
        const width = Math.max(1, Math.round(config.width));
        const height = Math.max(1, Math.round(config.height));
        const size = Math.max(1, Math.round(config.size || width));
        const radius = Math.max(0, Math.round(config.radius ?? 0));

        switch (config.boardShape) {
            case 'square':
                return { cols: size, rows: size };
            case 'triangle':
                return { cols: size, rows: size };
            case 'hexagon':
            case 'circle': {
                const diameter = radius * 2 + 1;
                return { cols: diameter, rows: diameter };
            }
            default:
                return { cols: width, rows: height };
        }
    }

    function createHexVertices(center, size, orientation) {
        const vertices = [];
        const rotation = orientation === 'pointy-top' ? Math.PI / 6 : 0;
        for (let i = 0; i < 6; i++) {
            const angle = rotation + (Math.PI / 3) * i;
            vertices.push({
                x: center.x + size * Math.cos(angle),
                y: center.y + size * Math.sin(angle)
            });
        }
        return vertices;
    }

    function createSquareVertices(center, size) {
        const half = size / 2;
        return [
            { x: center.x - half, y: center.y - half },
            { x: center.x + half, y: center.y - half },
            { x: center.x + half, y: center.y + half },
            { x: center.x - half, y: center.y + half }
        ];
    }

    function createDiamondVertices(center, size) {
        const half = size / 2;
        return [
            { x: center.x, y: center.y - half },
            { x: center.x + half, y: center.y },
            { x: center.x, y: center.y + half },
            { x: center.x - half, y: center.y }
        ];
    }

    function createTriangleVertices(origin, size, pointingUp) {
        const height = (Math.sqrt(3) / 2) * size;
        if (pointingUp) {
            return [
                { x: origin.x + size / 2, y: origin.y },
                { x: origin.x, y: origin.y + height },
                { x: origin.x + size, y: origin.y + height }
            ];
        }
        return [
            { x: origin.x + size / 2, y: origin.y + height },
            { x: origin.x, y: origin.y },
            { x: origin.x + size, y: origin.y }
        ];
    }

    function isPointInPolygon(point, vertices) {
        let inside = false;
        for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
            const xi = vertices[i].x;
            const yi = vertices[i].y;
            const xj = vertices[j].x;
            const yj = vertices[j].y;

            const intersect =
                yi > point.y !== yj > point.y &&
                point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

            if (intersect) {
                inside = !inside;
            }
        }
        return inside;
    }

    function findPolygonAtPoint(point, polygons) {
        let candidate = null;
        let smallestDistance = Infinity;

        for (const polygon of polygons) {
            const { bounds } = polygon;
            if (
                point.x < bounds.minX ||
                point.x > bounds.maxX ||
                point.y < bounds.minY ||
                point.y > bounds.maxY
            ) {
                continue;
            }
            if (isPointInPolygon(point, polygon.vertices)) {
                const distance = Math.hypot(point.x - polygon.center.x, point.y - polygon.center.y);
                if (distance < smallestDistance) {
                    smallestDistance = distance;
                    candidate = polygon;
                }
            }
        }
        return candidate;
    }

    global.GeometryHelpers = {
        createPolygon,
        shouldIncludePolygon,
        createBoardMetrics,
        createBoardHexOutline,
        createBoardTriangleOutline,
        isPointInCircle,
        normalizeBoardDimensions,
        createHexVertices,
        createSquareVertices,
        createDiamondVertices,
        createTriangleVertices,
        isPointInPolygon,
        findPolygonAtPoint
    };
})(typeof window !== 'undefined' ? window : globalThis);
