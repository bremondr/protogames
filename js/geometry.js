/**
 * PROTOGAMES GEOMETRY
 * --------------------------------------------------------------
 * Responsible for constructing polygon grids and providing hit
 * testing utilities. Rendering and interaction modules consume the
 * shapes generated here.
 */
const Geometry = (() => {
    function generateGrid(config, canvas, colorMap) {
        switch (config.gridType) {
            case 'triangle':
                return buildTriangleGrid(config, canvas, colorMap);
            case 'orthogonal-square':
                return buildDiamondGrid(config, canvas, colorMap);
            case 'square':
                return buildSquareGrid(config, canvas, colorMap);
            case 'hexagon':
            default:
                return buildHexGrid(config, canvas, colorMap);
        }
    }

    /**
     * Generates hexagon tiles arranged either in a rectangular footprint or a
     * true hexagon outline depending on the user's board shape selection.
     * When the user selects the hexagon outline the grid is sized by radius
     * (number of tiles from center to vertex) rather than width/height.
     *
     * @param {Object} config - Board configuration including orientation, outline and radius.
     * @param {HTMLCanvasElement} canvas - Canvas used to determine sizing.
     * @param {Map} colorMap - Map of previous polygon colors keyed by id.
     * @returns {Array<Object>} Collection of hexagon polygons.
     */
    function buildHexGrid(config, canvas, colorMap) {
        if (!canvas) return [];
        if (config.boardShape === 'hexagon') {
            return buildHexagonShapedGrid(config, canvas, colorMap);
        }

        const dims = normalizeBoardDimensions(config);
        const cols = dims.cols;
        const rows = dims.rows;
        const orientation = config.orientation === 'flat-top' ? 'flat-top' : 'pointy-top';

        const availableWidth = canvas.width - Config.CANVAS_PADDING * 2;
        const availableHeight = canvas.height - Config.CANVAS_PADDING * 2;

        const sizeFromWidth =
            orientation === 'pointy-top'
                ? availableWidth / (Math.sqrt(3) * Math.max(cols, 1))
                : availableWidth / (2 + 1.5 * Math.max(cols - 1, 0));
        const sizeFromHeight =
            orientation === 'pointy-top'
                ? availableHeight / (2 + 1.5 * Math.max(rows - 1, 0))
                : availableHeight / (Math.sqrt(3) * Math.max(rows, 1));

        const size = Math.max(8, Math.floor(Math.min(sizeFromWidth, sizeFromHeight)));
        const hexWidth = orientation === 'pointy-top' ? Math.sqrt(3) * size : 2 * size;
        const hexHeight = orientation === 'pointy-top' ? 2 * size : Math.sqrt(3) * size;
        const horizSpacing = orientation === 'pointy-top' ? hexWidth : 1.5 * size;
        const vertSpacing = orientation === 'pointy-top' ? 1.5 * size : hexHeight;

        const boardWidth =
            orientation === 'pointy-top'
                ? Math.sqrt(3) * size * cols
                : 2 * size + (cols - 1) * 1.5 * size;
        const boardHeight =
            orientation === 'pointy-top'
                ? 2 * size + (rows - 1) * 1.5 * size
                : Math.sqrt(3) * size * rows;

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
     * Builds a perfect hexagon footprint from a radius-driven row plan so the
     * outline always has single-hex tips and a widest center row.
     *
     * @param {Object} config - Board configuration including the radius parameter.
     * @param {HTMLCanvasElement} canvas - Canvas reference for sizing.
     * @param {Map} colorMap - Previous colors keyed by polygon id.
     * @returns {Array<Object>} Hexagon-shaped polygon list.
     */
    function buildHexagonShapedGrid(config, canvas, colorMap) {
        if (!canvas) return [];
        const radius = Math.max(0, Number.isFinite(config.radius) ? Math.floor(config.radius) : Config.DEFAULT_BOARD_CONFIG.radius);
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

    /**
     * Builds row descriptors for a radius-based hexagon where the first and
     * last rows contain a single tile and each intermediate row grows/shrinks
     * by one tile until reaching the center row (radius + 1 tiles).
     *
     * @param {number} radius - Number of hexes from the center to any vertex.
     * @returns {{rows:Array<{index:number,axialR:number,count:number,qStart:number,qEnd:number}>,totalRows:number}}
     */
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

    /**
     * Calculates how large each hex can be drawn and the offsets required to
     * keep the full footprint centered on the canvas while respecting padding.
     *
     * @param {{minX:number,maxX:number,minY:number,maxY:number}} layout - Bounding box in axial space.
     * @param {string} orientation - 'pointy-top' or 'flat-top'.
     * @param {HTMLCanvasElement} canvas - Canvas reference for sizing.
     * @returns {{size:number,offsetX:number,offsetY:number,hexWidthUnit:number,hexHeightUnit:number}}
     */
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

        const offsetX = (canvas.width - (widthCenters + hexWidthUnit) * size) / 2;
        const offsetY = (canvas.height - (heightCenters + hexHeightUnit) * size) / 2;

        return { size, offsetX, offsetY, hexWidthUnit, hexHeightUnit };
    }

    /**
     * Generates axial coordinates for every tile described in the row plan
     * so the grid can later be scaled and centered on the canvas.
     *
     * @param {Array<Object>} rowPlan - Output from createHexagonRowPlan.
     * @param {string} orientation - 'pointy-top' or 'flat-top'.
     * @returns {{coords:Array,minX:number,maxX:number,minY:number,maxY:number}}
     */
    function computeHexagonAxialLayout(rowPlan, orientation) {
        const coords = [];
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        for (const row of rowPlan) {
            for (let q = row.qStart; q <= row.qEnd; q++) {
                const { x, y } = axialToPixel(q, row.axialR, orientation, 1);
                coords.push({ q, r: row.axialR, x, y });
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
        }

        return { coords, minX, maxX, minY, maxY };
    }

    /**
     * Converts axial coordinates (q,r) to pixel space for the requested orientation.
     *
     * @param {number} q - Axial q coordinate.
     * @param {number} r - Axial r coordinate.
     * @param {string} orientation - 'pointy-top' or 'flat-top'.
     * @param {number} size - Hex radius in pixels.
     * @returns {{x:number,y:number}} Pixel location for the hex center.
     */
    function axialToPixel(q, r, orientation, size) {
        if (orientation === 'flat-top') {
            const x = size * (3 / 2) * q;
            const y = size * Math.sqrt(3) * (r + q / 2);
            return { x, y };
        }
        const x = size * Math.sqrt(3) * (q + r / 2);
        const y = size * (3 / 2) * r;
        return { x, y };
    }

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
                const vertices = createSquareVertices(center, size);
                polygons.push(
                    createPolygon({
                        id,
                        type: 'square',
                        center,
                        vertices,
                        color: colorMap?.get(id)
                    })
                );
            }
        }
        return polygons;
    }

    function buildTriangleGrid(config, canvas, colorMap) {
        if (!canvas) return [];
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
                if (!shouldIncludePolygon(center, boardMetrics)) continue;
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

    /**
     * Checks whether a polygon center lies inside the currently selected board
     * outline (hexagon, triangle, circle). Rectangular outlines simply allow all.
     *
     * @param {{x:number,y:number}} center - Polygon center in canvas space.
     * @param {Object|null} boardMetrics - Precomputed outline metadata.
     * @returns {boolean} True when the polygon should be included.
     */
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

    /**
     * Builds metadata describing the board outline (hex, triangle, circle, etc.)
     * so that rectangular grids can be clipped to the desired silhouette.
     *
     * @param {number} offsetX - Canvas X offset where the board starts.
     * @param {number} offsetY - Canvas Y offset where the board starts.
     * @param {number} width - Board width in pixels.
     * @param {number} height - Board height in pixels.
     * @param {Object} config - Board configuration indicating shape/orientation.
     * @param {string} [orientationHint] - Current grid orientation, if relevant.
     * @returns {{bounds:Object,outline:Array|null,circle:Object|null}} Shape metadata.
     */
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

    /**
     * Creates a triangular polygon outline used to clip triangle board shapes.
     *
     * @param {{x:number,y:number,width:number,height:number}} bounds - Canvas bounds of the board area.
     * @param {string} orientation - 'point-up' or 'point-down'.
     * @returns {Array<{x:number,y:number}>} Triangle outline vertices.
     */
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

    /**
     * Determines whether a point lies inside a circle.
     *
     * @param {{x:number,y:number}} point - Point to test.
     * @param {{cx:number,cy:number,radius:number}} circle - Circle descriptor.
     * @returns {boolean} True when inside or on the boundary.
     */
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

    /**
     * Ray casting algorithm to test whether a point lies inside a polygon.
     *
     * @param {{x:number,y:number}} point - Coordinate to test.
     * @param {Array<{x:number,y:number}>} vertices - Polygon vertices.
     * @returns {boolean} True when point resides inside the polygon.
     */
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

    /**
     * Finds the polygon containing the point or the closest one when
     * the pointer rests on a border.
     *
     * @param {{x:number,y:number}} point - Canvas coordinates.
     * @param {Array<Object>} polygons - Polygon list to test.
     * @returns {Object|null} Matching polygon.
     */
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

    return {
        generateGrid,
        isPointInPolygon,
        findPolygonAtPoint
    };
})();
