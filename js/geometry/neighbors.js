/**
 * Tile adjacency and grid-aware path helpers.
 *
 * Works for any tile shape: two tiles are neighbours when they share an edge,
 * found by welding coincident vertices and indexing edges. Everything here is
 * pure (no DOM), so it can be unit-tested in Node.
 *
 * An adjacency is { ids: string[], index: Map<id, number>, neighbors: number[][] }
 * where neighbors[i] lists the indices of tiles that share an edge with tile i.
 */
(function (global) {
    // Vertices closer than this (in canvas pixels) are treated as the same point.
    const WELD_EPSILON = 0.05;
    const WELD_CELL = 0.5;

    /** Gives every distinct vertex position a stable integer id. */
    function createVertexWelder() {
        const cells = new Map();
        let next = 0;
        return function weld(x, y) {
            const cx = Math.floor(x / WELD_CELL);
            const cy = Math.floor(y / WELD_CELL);
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const bucket = cells.get(`${cx + dx},${cy + dy}`);
                    if (!bucket) continue;
                    for (const v of bucket) {
                        if (Math.abs(v.x - x) <= WELD_EPSILON && Math.abs(v.y - y) <= WELD_EPSILON) return v.id;
                    }
                }
            }
            const key = `${cx},${cy}`;
            const vertex = { x, y, id: next++ };
            if (!cells.has(key)) cells.set(key, []);
            cells.get(key).push(vertex);
            return vertex.id;
        };
    }

    /**
     * Builds the adjacency graph for a list of polygons ({ id, vertices }).
     */
    function buildAdjacency(polygons) {
        const ids = polygons.map((p) => p.id);
        const index = new Map(ids.map((id, i) => [id, i]));
        const neighbors = ids.map(() => []);
        const weld = createVertexWelder();
        const edgeOwner = new Map();

        polygons.forEach((polygon, i) => {
            const welded = polygon.vertices.map((v) => weld(v.x, v.y));
            for (let k = 0; k < welded.length; k++) {
                const a = welded[k];
                const b = welded[(k + 1) % welded.length];
                if (a === b) continue;
                const key = a < b ? `${a}_${b}` : `${b}_${a}`;
                const owner = edgeOwner.get(key);
                if (owner === undefined) {
                    edgeOwner.set(key, i);
                } else if (owner !== i) {
                    if (!neighbors[owner].includes(i)) neighbors[owner].push(i);
                    if (!neighbors[i].includes(owner)) neighbors[i].push(owner);
                }
            }
        });

        return { ids, index, neighbors };
    }

    /**
     * Connected tiles reachable from `startId` through tiles for which
     * `matches(tileIndex)` is true (the start tile is always included).
     * Iterative, so it is safe on very large boards. Returns tile ids.
     */
    function floodFill(adjacency, startId, matches) {
        const start = adjacency.index.get(startId);
        if (start === undefined) return [];
        const visited = new Uint8Array(adjacency.ids.length);
        const queue = [start];
        visited[start] = 1;
        const region = [];
        for (let head = 0; head < queue.length; head++) {
            const current = queue[head];
            region.push(adjacency.ids[current]);
            for (const next of adjacency.neighbors[current]) {
                if (visited[next]) continue;
                visited[next] = 1;
                if (matches(next)) queue.push(next);
            }
        }
        return region;
    }

    /**
     * Tiles within `distance` steps of the start tile (distance 0 = just the tile).
     */
    function neighborhood(adjacency, startId, distance) {
        const start = adjacency.index.get(startId);
        if (start === undefined) return [];
        const depth = new Map([[start, 0]]);
        const queue = [start];
        for (let head = 0; head < queue.length; head++) {
            const current = queue[head];
            const d = depth.get(current);
            if (d >= distance) continue;
            for (const next of adjacency.neighbors[current]) {
                if (depth.has(next)) continue;
                depth.set(next, d + 1);
                queue.push(next);
            }
        }
        return queue.map((i) => adjacency.ids[i]);
    }

    /** Fewest-step path between two tiles through the adjacency graph (inclusive), or null. */
    function shortestPath(adjacency, fromId, toId) {
        const from = adjacency.index.get(fromId);
        const to = adjacency.index.get(toId);
        if (from === undefined || to === undefined) return null;
        if (from === to) return [fromId];
        const previous = new Int32Array(adjacency.ids.length).fill(-2);
        previous[from] = -1;
        const queue = [from];
        for (let head = 0; head < queue.length; head++) {
            const current = queue[head];
            for (const next of adjacency.neighbors[current]) {
                if (previous[next] !== -2) continue;
                previous[next] = current;
                if (next === to) {
                    const path = [];
                    for (let at = to; at !== -1; at = previous[at]) path.push(adjacency.ids[at]);
                    return path.reverse();
                }
                queue.push(next);
            }
        }
        return null;
    }

    /**
     * Gap-free tile path between two tiles that follows the straight line between
     * their centres: sample the segment, collect the tiles it passes through, and
     * bridge any step that is not edge-adjacent (e.g. passing exactly through a
     * corner) with the shortest connecting path.
     *
     * @param polygons  tiles ({ id, center, vertices, bounds })
     * @param adjacency result of buildAdjacency(polygons)
     * @param locate    (point) => polygon | null, hit-test for a point
     */
    function linePath(polygons, adjacency, fromId, toId, locate) {
        const byId = new Map(polygons.map((p) => [p.id, p]));
        const a = byId.get(fromId);
        const b = byId.get(toId);
        if (!a || !b) return [];
        if (fromId === toId) return [fromId];

        const size = Math.min(a.bounds.maxX - a.bounds.minX, a.bounds.maxY - a.bounds.minY) || 1;
        const length = Math.hypot(b.center.x - a.center.x, b.center.y - a.center.y);
        const steps = Math.max(2, Math.ceil(length / (size / 8)));
        const sequence = [fromId];
        for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            const hit = locate({
                x: a.center.x + (b.center.x - a.center.x) * t,
                y: a.center.y + (b.center.y - a.center.y) * t
            });
            if (hit && hit.id !== sequence[sequence.length - 1]) sequence.push(hit.id);
        }
        if (sequence[sequence.length - 1] !== toId) sequence.push(toId);

        const path = [fromId];
        const seen = new Set(path);
        for (let i = 1; i < sequence.length; i++) {
            const previousId = path[path.length - 1];
            const nextId = sequence[i];
            if (nextId === previousId) continue;
            const prevIndex = adjacency.index.get(previousId);
            const nextIndex = adjacency.index.get(nextId);
            const adjacent = adjacency.neighbors[prevIndex].includes(nextIndex);
            const bridge = adjacent ? [previousId, nextId] : shortestPath(adjacency, previousId, nextId) || [previousId, nextId];
            for (let k = 1; k < bridge.length; k++) {
                if (!seen.has(bridge[k])) {
                    seen.add(bridge[k]);
                    path.push(bridge[k]);
                }
            }
        }
        return path;
    }

    global.GeometryNeighbors = {
        buildAdjacency,
        floodFill,
        neighborhood,
        shortestPath,
        linePath
    };
})(typeof window !== 'undefined' ? window : globalThis);
