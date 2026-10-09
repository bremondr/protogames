/**
 * PROTOGAMES TOOL OPERATIONS
 * --------------------------------------------------------------
 * Pure planning/applying logic for the fill and line tools, kept apart from
 * pointer handling so it can be unit-tested in Node.
 *
 * A "source" says what is being painted:
 *   { kind: 'color',  color }          paint terrain
 *   { kind: 'eraser', defaultColor }   reset terrain to blank and remove objects
 *   { kind: 'object', object }         place an object
 */
const ToolOps = (() => {
    const norm = (value) => String(value || '').toLowerCase();

    /** What a tile must look like to belong to the same fill region. */
    function regionKey(source, polygon) {
        return source.kind === 'object' ? polygon.object || '' : norm(polygon.color);
    }

    /** Would painting `source` onto this tile change anything? */
    function wouldChange(source, polygon) {
        if (source.kind === 'color') return norm(polygon.color) !== norm(source.color);
        if (source.kind === 'object') return (polygon.object || '') !== source.object;
        return norm(polygon.color) !== norm(source.defaultColor) || Boolean(polygon.object);
    }

    /**
     * Tiles a fill started on `startId` would change: every tile connected to it
     * that shares its colour (or, for objects, its object). Uses the grid's
     * adjacency, so it works for hexagon, square and triangle tiles and stops at
     * board edges. Returns ids; empty when nothing would change.
     *
     * @param polygons  tiles in the same order the adjacency was built from
     * @param adjacency GeometryNeighbors adjacency of those tiles
     */
    function planFill(polygons, adjacency, startId, source) {
        const startIndex = adjacency.index.get(startId);
        if (startIndex === undefined) return [];
        const start = polygons[startIndex];
        if (source.kind !== 'eraser' && !wouldChange(source, start)) return [];

        const startKey = regionKey(source, start);
        const region = Geometry.floodFill(adjacency, startId, (i) => regionKey(source, polygons[i]) === startKey);
        return source.kind === 'eraser'
            ? region.filter((id) => wouldChange(source, polygons[adjacency.index.get(id)]))
            : region;
    }

    /**
     * Tiles a line from `fromId` to `toId` would change (gap-free path, see
     * GeometryNeighbors.linePath), skipping tiles that already look right.
     */
    function planLine(polygons, adjacency, locate, fromId, toId, source) {
        const path = Geometry.linePath(polygons, adjacency, fromId, toId, locate);
        return path.filter((id) => wouldChange(source, polygons[adjacency.index.get(id)]));
    }

    /** Paints `source` onto the tiles with these ids. Returns how many tiles changed. */
    function applyToTiles(polygons, adjacency, ids, source) {
        let changed = 0;
        for (const id of ids) {
            const polygon = polygons[adjacency.index.get(id)];
            if (!polygon || !wouldChange(source, polygon)) continue;
            if (source.kind === 'color') {
                polygon.color = source.color;
            } else if (source.kind === 'object') {
                polygon.object = source.object;
            } else {
                polygon.color = source.defaultColor;
                delete polygon.object;
            }
            changed++;
        }
        return changed;
    }

    /**
     * Tiles covered by a brush of `size` centred on `centerId`: the tile itself plus
     * everything within size - 1 steps (size 1 = just the tile).
     */
    function brushTiles(adjacency, centerId, size) {
        if (!(size > 1)) return adjacency.index.has(centerId) ? [centerId] : [];
        return Geometry.neighborhood(adjacency, centerId, size - 1);
    }

    /** Builds the paint source from the editor state. */
    function sourceFromState(state, defaultColor) {
        if (state.isObjectToolActive) return { kind: 'object', object: state.currentObject };
        if (state.isEraserActive) return { kind: 'eraser', defaultColor };
        return { kind: 'color', color: state.currentColor };
    }

    /**
     * Which tool is active: 'object', 'eraser' or 'brush' (painting with a colour).
     * Object wins, as in sourceFromState.
     */
    function activeTool(state) {
        if (state.isObjectToolActive) return 'object';
        if (state.isEraserActive) return 'eraser';
        return 'brush';
    }

    /**
     * The draw mode that actually applies. Fill and line only make sense for colours:
     * the eraser always works as a sized brush and an object is placed one click at a time.
     */
    function effectiveMode(state) {
        return activeTool(state) === 'brush' ? state.drawMode : 'brush';
    }

    /** Brush size that applies: the eraser has its own size, an object is always one tile. */
    function effectiveSize(state, eraserSize) {
        const tool = activeTool(state);
        if (tool === 'object') return 1;
        return tool === 'eraser' ? eraserSize : state.brushSize;
    }

    /**
     * Points to probe for a brush drag that moved from `from` through `targets` (the pointer
     * positions since the last probe, oldest first). Consecutive positions further than `step`
     * apart get evenly spaced points in between, so a fast drag cannot skip over tiles.
     * `from` itself is not repeated; the last target is always the last point.
     */
    function strokePoints(from, targets, step) {
        const MAX_PER_SEGMENT = 200;
        const out = [];
        let prev = from;
        for (const target of targets) {
            const distance = prev ? Math.hypot(target.x - prev.x, target.y - prev.y) : 0;
            const parts = step > 0 ? Math.min(MAX_PER_SEGMENT, Math.ceil(distance / step)) : 1;
            for (let i = 1; i < parts; i++) {
                const k = i / parts;
                out.push({ x: prev.x + (target.x - prev.x) * k, y: prev.y + (target.y - prev.y) * k });
            }
            out.push({ x: target.x, y: target.y });
            prev = target;
        }
        return out;
    }

    return { planFill, planLine, applyToTiles, brushTiles, sourceFromState, activeTool, effectiveMode, effectiveSize, wouldChange, strokePoints };
})();
