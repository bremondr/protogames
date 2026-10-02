/**
 * PROTOGAMES VIEW MATH
 * --------------------------------------------------------------
 * Pure functions for the pan/zoom view. A view is { scale, x, y }:
 *
 *     screen = world * scale + (x, y)
 *
 * "World" is the coordinate space tiles are generated in (the fitted board at
 * scale 1), "screen" is canvas pixels. Nothing here touches the DOM, so it is
 * unit-tested in Node.
 */
const ViewMath = (() => {
    const IDENTITY = Object.freeze({ scale: 1, x: 0, y: 0 });

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    function identity() {
        return { scale: 1, x: 0, y: 0 };
    }

    function toWorld(view, sx, sy) {
        return { x: (sx - view.x) / view.scale, y: (sy - view.y) / view.scale };
    }

    function toScreen(view, wx, wy) {
        return { x: wx * view.scale + view.x, y: wy * view.scale + view.y };
    }

    /** The world-space rectangle currently visible in a canvas of the given size. */
    function visibleWorldRect(view, width, height) {
        const topLeft = toWorld(view, 0, 0);
        const bottomRight = toWorld(view, width, height);
        return { minX: topLeft.x, minY: topLeft.y, maxX: bottomRight.x, maxY: bottomRight.y };
    }

    /**
     * Zooms by `factor` keeping the world point under screen position (sx, sy)
     * fixed, so zooming feels anchored to the pointer. The scale is clamped to
     * [minScale, maxScale].
     */
    function zoomAt(view, factor, sx, sy, minScale, maxScale) {
        const scale = clamp(view.scale * factor, minScale, maxScale);
        const ratio = scale / view.scale;
        return { scale, x: sx - (sx - view.x) * ratio, y: sy - (sy - view.y) * ratio };
    }

    /** Sets an absolute scale around a screen position. */
    function setScaleAt(view, scale, sx, sy, minScale, maxScale) {
        return zoomAt(view, scale / view.scale, sx, sy, minScale, maxScale);
    }

    function panBy(view, dx, dy) {
        return { scale: view.scale, x: view.x + dx, y: view.y + dy };
    }

    /**
     * Keeps the view usable: the middle of the visible area must stay over the
     * board's bounding box (so you can never lose the board off-screen).
     * `bounds` is { minX, minY, maxX, maxY } in world space.
     */
    function clampToBounds(view, width, height, bounds) {
        if (!bounds) return view;
        const centerWorld = toWorld(view, width / 2, height / 2);
        const cx = clamp(centerWorld.x, bounds.minX, bounds.maxX);
        const cy = clamp(centerWorld.y, bounds.minY, bounds.maxY);
        if (cx === centerWorld.x && cy === centerWorld.y) return view;
        return { scale: view.scale, x: width / 2 - cx * view.scale, y: height / 2 - cy * view.scale };
    }

    /** Re-centres the view so the given world point is in the middle of the canvas. */
    function centerOn(view, width, height, wx, wy) {
        return { scale: view.scale, x: width / 2 - wx * view.scale, y: height / 2 - wy * view.scale };
    }

    /** Scale at which a tile of `tileSize` fitted pixels shows as `targetSize` pixels. */
    function scaleForTileSize(tileSize, targetSize) {
        return tileSize > 0 ? targetSize / tileSize : 1;
    }

    /**
     * Pinch/two-finger gesture: given the two touch points at the start and now,
     * returns the view that scales by the change in finger distance and follows
     * the midpoint (so a two-finger drag pans and a pinch zooms around the fingers).
     */
    function gestureView(startView, startPoints, nowPoints, minScale, maxScale) {
        const mid = (p) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 });
        const dist = (p) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        const startMid = mid(startPoints);
        const nowMid = mid(nowPoints);
        const startDist = dist(startPoints) || 1;
        const factor = dist(nowPoints) / startDist;
        const scale = clamp(startView.scale * factor, minScale, maxScale);
        const ratio = scale / startView.scale;
        // World point that was under the starting midpoint must end under the current midpoint.
        return {
            scale,
            x: nowMid.x - (startMid.x - startView.x) * ratio,
            y: nowMid.y - (startMid.y - startView.y) * ratio
        };
    }

    /** Bounding box of a list of polygons ({ bounds }). */
    function boundsOf(polygons) {
        if (!polygons.length) return null;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const p of polygons) {
            minX = Math.min(minX, p.bounds.minX);
            minY = Math.min(minY, p.bounds.minY);
            maxX = Math.max(maxX, p.bounds.maxX);
            maxY = Math.max(maxY, p.bounds.maxY);
        }
        return { minX, minY, maxX, maxY };
    }

    /** Typical tile size (shorter side of the bounding box) from a sample of tiles. */
    function typicalTileSize(polygons) {
        if (!polygons.length) return 0;
        const sample = polygons.slice(0, 200);
        const total = sample.reduce((sum, p) => sum + Math.min(p.bounds.maxX - p.bounds.minX, p.bounds.maxY - p.bounds.minY), 0);
        return total / sample.length;
    }

    function rectsIntersect(a, b) {
        return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
    }

    return {
        IDENTITY,
        identity,
        clamp,
        toWorld,
        toScreen,
        visibleWorldRect,
        zoomAt,
        setScaleAt,
        panBy,
        clampToBounds,
        centerOn,
        scaleForTileSize,
        gestureView,
        boundsOf,
        typicalTileSize,
        rectsIntersect
    };
})();
