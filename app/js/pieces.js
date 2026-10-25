/**
 * PROTOGAMES PIECES
 * --------------------------------------------------------------
 * Drawing and hit-testing of the pieces that stand on the board during playtest. The state
 * (which piece is where) lives in Play; this module only turns it into pictures and pointer hits.
 *
 * Pieces are drawn straight onto the board canvas in world coordinates, in the same side-on
 * illustration style as the objects: soft ground shadow, upper-left light, thin outline.
 * Several pieces on one tile are spread out (see `offsets`).
 *
 * The layout and hit-testing functions are pure and unit-tested in Node; the drawing needs a canvas.
 */
const Pieces = (() => {
    const LINE = 'rgba(20,16,12,0.65)';
    /** A piece is this fraction of the tile's smaller side across. */
    const SIZE_FACTOR = 0.5;

    // ---- Layout (pure) ----------------------------------------------------------------------

    /** The smaller side of a tile's bounding box: what a piece is sized from. */
    function tileSize(polygon) {
        const b = polygon.bounds;
        return Math.min(b.maxX - b.minX, b.maxY - b.minY);
    }

    /** Across-size of a piece standing on this tile. */
    function pieceSize(polygon) {
        return tileSize(polygon) * SIZE_FACTOR;
    }

    /**
     * Where each of `count` pieces on one tile stands, as offsets from the tile centre in units of
     * the piece size. One piece is in the middle; more are spread so that all stay visible, and
     * beyond four they pile up with a small lift.
     */
    function offsets(count) {
        const spread = {
            1: [[0, 0]],
            2: [[-0.45, 0.1], [0.45, -0.1]],
            3: [[0, -0.5], [-0.55, 0.35], [0.55, 0.35]],
            4: [[-0.5, -0.4], [0.5, -0.4], [-0.5, 0.45], [0.5, 0.45]]
        };
        if (count <= 4) return spread[Math.max(1, count)];
        const out = spread[4].slice();
        for (let i = 4; i < count; i++) out.push([0, -0.2 - 0.12 * Math.min(i - 4, 6)]);
        return out;
    }

    /**
     * World positions of the pieces on tiles: [{ piece, x, y, size, polygon }], one entry per piece that
     * stands on a tile that exists. `polygonById` maps tile ids to tiles.
     */
    function placements(pieces, polygonById) {
        const byTile = new Map();
        for (const piece of pieces) {
            if (piece.tileId === null || piece.tileId === undefined || !polygonById.has(piece.tileId)) continue;
            if (!byTile.has(piece.tileId)) byTile.set(piece.tileId, []);
            byTile.get(piece.tileId).push(piece);
        }
        const out = [];
        for (const [tileId, list] of byTile) {
            const polygon = polygonById.get(tileId);
            const size = pieceSize(polygon);
            const spots = offsets(list.length);
            list.forEach((piece, i) => {
                out.push({ piece, polygon, size, x: polygon.center.x + spots[i][0] * size, y: polygon.center.y + spots[i][1] * size });
            });
        }
        return out;
    }

    /**
     * The piece under a world point: the one drawn last (on top) wins. Hit areas are the drawn size
     * plus `margin` world units (a finger needs more than a mouse).
     */
    function hitTest(list, point, margin = 0) {
        const ordered = sorted(list);
        for (let i = ordered.length - 1; i >= 0; i--) {
            const entry = ordered[i];
            const half = entry.size / 2 + margin;
            // A piece stands on its base, so it reaches up from its position.
            const inside = Math.abs(point.x - entry.x) <= half
                && point.y >= entry.y - entry.size * 1.05 - margin
                && point.y <= entry.y + entry.size * 0.35 + margin;
            if (inside) return entry.piece;
        }
        return null;
    }

    /** Placements sorted back to front, with a stable order number so ties are decided consistently. */
    function sorted(list) {
        list.forEach((entry, i) => { entry.order = i; });
        return list.slice().sort((a, b) => (a.y === b.y ? a.order - b.order : a.y - b.y));
    }

    // ---- Colours (pure) ---------------------------------------------------------------------

    function parseHex(hex) {
        let h = String(hex).replace('#', '');
        if (h.length === 3) h = h.split('').map((c) => c + c).join('');
        const n = parseInt(h, 16);
        return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [128, 128, 128];
    }

    /** A lighter (amount > 0) or darker (amount < 0) version of a colour. */
    function shade(hex, amount) {
        const [r, g, b] = parseHex(hex);
        const mix = (c) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
        return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
    }

    // ---- Drawing ----------------------------------------------------------------------------

    function outline(ctx, scale) {
        ctx.strokeStyle = LINE;
        ctx.lineWidth = 1.3 / scale;
        ctx.lineJoin = 'round';
        ctx.stroke();
    }

    function shadow(ctx, x, y, w) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(x + w * 0.12, y + w * 0.04, w * 0.5, w * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    /** Shared light: the left side catches it, the right side is in shade. */
    function body(ctx, color, x0, x1, y0, y1) {
        const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
        gradient.addColorStop(0, shade(color, 0.35));
        gradient.addColorStop(0.45, color);
        gradient.addColorStop(1, shade(color, -0.35));
        ctx.fillStyle = gradient;
    }

    const SHAPES = {
        pawn(ctx, x, y, s, color, scale) {
            shadow(ctx, x, y, s);
            // Base, tapering body, round head.
            ctx.beginPath();
            ctx.ellipse(x, y - s * 0.04, s * 0.4, s * 0.13, 0, 0, Math.PI * 2);
            body(ctx, color, x - s * 0.4, x + s * 0.4, y, y);
            ctx.fill();
            outline(ctx, scale);
            ctx.beginPath();
            ctx.moveTo(x - s * 0.34, y - s * 0.06);
            ctx.quadraticCurveTo(x - s * 0.08, y - s * 0.3, x - s * 0.13, y - s * 0.62);
            ctx.lineTo(x + s * 0.13, y - s * 0.62);
            ctx.quadraticCurveTo(x + s * 0.08, y - s * 0.3, x + s * 0.34, y - s * 0.06);
            ctx.closePath();
            body(ctx, color, x - s * 0.34, x + s * 0.34, y, y);
            ctx.fill();
            outline(ctx, scale);
            ctx.beginPath();
            ctx.arc(x, y - s * 0.76, s * 0.19, 0, Math.PI * 2);
            ctx.fillStyle = color;
            const head = ctx.createRadialGradient(x - s * 0.07, y - s * 0.83, s * 0.02, x, y - s * 0.76, s * 0.22);
            head.addColorStop(0, shade(color, 0.5));
            head.addColorStop(1, shade(color, -0.25));
            ctx.fillStyle = head;
            ctx.fill();
            outline(ctx, scale);
        },
        disc(ctx, x, y, s, color, scale) {
            shadow(ctx, x, y, s);
            const w = s * 0.5;
            const h = s * 0.17;
            const t = s * 0.16;
            // Side wall, then the top face.
            ctx.beginPath();
            ctx.moveTo(x - w, y - t);
            ctx.lineTo(x - w, y - t + t);
            ctx.ellipse(x, y, w, h, 0, Math.PI, 0, true);
            ctx.lineTo(x + w, y - t);
            ctx.ellipse(x, y - t, w, h, 0, 0, Math.PI, false);
            ctx.closePath();
            body(ctx, color, x - w, x + w, y, y);
            ctx.fill();
            outline(ctx, scale);
            ctx.beginPath();
            ctx.ellipse(x, y - t, w, h, 0, 0, Math.PI * 2);
            ctx.fillStyle = shade(color, 0.28);
            ctx.fill();
            outline(ctx, scale);
        },
        cube(ctx, x, y, s, color, scale) {
            shadow(ctx, x, y, s * 0.9);
            const w = s * 0.34;
            const d = s * 0.16;
            const h = s * 0.44;
            // Front face, right face (in shade), top face (lit).
            ctx.beginPath();
            ctx.rect(x - w, y - h, w * 2 - d, h);
            ctx.fillStyle = color;
            ctx.fill();
            outline(ctx, scale);
            ctx.beginPath();
            ctx.moveTo(x + w - d, y - h);
            ctx.lineTo(x + w, y - h - d);
            ctx.lineTo(x + w, y - d);
            ctx.lineTo(x + w - d, y);
            ctx.closePath();
            ctx.fillStyle = shade(color, -0.35);
            ctx.fill();
            outline(ctx, scale);
            ctx.beginPath();
            ctx.moveTo(x - w, y - h);
            ctx.lineTo(x - w + d, y - h - d);
            ctx.lineTo(x + w, y - h - d);
            ctx.lineTo(x + w - d, y - h);
            ctx.closePath();
            ctx.fillStyle = shade(color, 0.4);
            ctx.fill();
            outline(ctx, scale);
        },
        meeple(ctx, x, y, s, color, scale) {
            shadow(ctx, x, y, s);
            const u = s / 100;
            // The classic meeple silhouette: round head, arms out, legs apart.
            ctx.beginPath();
            ctx.moveTo(x - 14 * u, y);
            ctx.lineTo(x - 8 * u, y - 30 * u);
            ctx.lineTo(x - 44 * u, y - 30 * u);
            ctx.quadraticCurveTo(x - 48 * u, y - 44 * u, x - 30 * u, y - 52 * u);
            ctx.lineTo(x - 14 * u, y - 56 * u);
            ctx.arc(x, y - 72 * u, 17 * u, Math.PI * 0.95, Math.PI * 2.05, false);
            ctx.lineTo(x + 14 * u, y - 56 * u);
            ctx.lineTo(x + 30 * u, y - 52 * u);
            ctx.quadraticCurveTo(x + 48 * u, y - 44 * u, x + 44 * u, y - 30 * u);
            ctx.lineTo(x + 8 * u, y - 30 * u);
            ctx.lineTo(x + 14 * u, y);
            ctx.lineTo(x, y - 10 * u);
            ctx.closePath();
            body(ctx, color, x - 44 * u, x + 44 * u, y - 70 * u, y);
            ctx.fill();
            outline(ctx, scale);
        }
    };

    /** Draws one piece standing with its base at (x, y). */
    function draw(ctx, kind, x, y, size, color, scale = 1) {
        const shape = Object.prototype.hasOwnProperty.call(SHAPES, kind) ? SHAPES[kind] : SHAPES.pawn;
        shape(ctx, x, y, size, color, scale);
    }

    // The tile lookup is per tile array, which stays the same until the board is rebuilt.
    const lookups = new WeakMap();
    function polygonMap(polygons) {
        let map = lookups.get(polygons);
        if (!map) {
            map = new Map(polygons.map((p) => [p.id, p]));
            lookups.set(polygons, map);
        }
        return map;
    }

    /**
     * Draws every piece that stands on a visible tile, back to front. Pieces being carried are left out
     * (`hiddenIds`: each is shown as a ghost that follows its pointer) and the selected one gets a ring on the ground.
     */
    function drawAll(ctx, polygons, pieces, scale, visible, hiddenIds, selectedId) {
        const byId = polygonMap(polygons);
        const list = sorted(placements(pieces, byId)).filter((entry) => {
            const b = entry.polygon.bounds;
            return b.maxX >= visible.minX - entry.size && b.minX <= visible.maxX + entry.size && b.maxY >= visible.minY - entry.size * 2 && b.minY <= visible.maxY + entry.size;
        });
        for (const entry of list) {
            if (hiddenIds && hiddenIds.includes(entry.piece.id)) continue;
            if (entry.piece.id === selectedId) ring(ctx, entry, scale);
            draw(ctx, entry.piece.kind, entry.x, entry.y, entry.size, entry.piece.color, scale);
        }
    }

    /** A ring on the ground around a piece: the keyboard focus and selection mark. */
    function ring(ctx, entry, scale) {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(entry.x, entry.y, entry.size * 0.62, entry.size * 0.24, 0, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 5 / scale;
        ctx.stroke();
        ctx.strokeStyle = '#2f6fed';
        ctx.lineWidth = 2.5 / scale;
        ctx.stroke();
        ctx.restore();
    }

    // ---- Icons (browser) --------------------------------------------------------------------

    const icons = new Map();

    /** A small picture of a piece (data URL), for the trays and the ghost that follows the pointer. */
    function iconUrl(kind, color) {
        const key = `${kind}|${String(color).toLowerCase()}`;
        if (icons.has(key)) return icons.get(key);
        let url = '';
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 96;
            canvas.height = 96;
            draw(canvas.getContext('2d'), kind, 48, 86, 72, color, 1);
            url = canvas.toDataURL('image/png');
        } catch (error) { /* no canvas: the tray shows the kind's name only */ }
        icons.set(key, url);
        return url;
    }

    // ---- Keyboard moves and labels (pure) ---------------------------------------------------

    /**
     * The neighbouring tile that lies most in the direction (dx, dy) from a tile, or null when none
     * lies within about 70 degrees of it. `adjacency` is the geometry neighbour graph of `polygons`.
     */
    function neighborInDirection(polygons, adjacency, tileId, dx, dy) {
        const index = adjacency.index.get(tileId);
        if (index === undefined) return null;
        const from = polygons[index].center;
        const length = Math.hypot(dx, dy) || 1;
        let best = null;
        let bestScore = 0.34; // cos(70 degrees)
        for (const neighbour of adjacency.neighbors[index]) {
            const to = polygons[neighbour].center;
            const dist = Math.hypot(to.x - from.x, to.y - from.y) || 1;
            const score = ((to.x - from.x) * dx + (to.y - from.y) * dy) / (dist * length);
            if (score > bestScore) {
                bestScore = score;
                best = polygons[neighbour].id;
            }
        }
        return best;
    }

    const labelCache = new WeakMap();

    /**
     * Column and row of a tile of an infinite board, counted from its origin tile, read from the tile id
     * (inf_hp_q_r, inf_hf_q_r, inf_s_x_y, inf_t_i_j_up|down) so it does not depend on which tiles are loaded.
     * Columns follow the tile centres left to right (hex rows and triangle rows are offset half a step),
     * rows top to bottom. Null for any other id.
     */
    function latticeCell(id) {
        const m = /^inf_(hp|hf|s|t)_(-?\d+)_(-?\d+)(?:_(up|down))?$/.exec(String(id));
        if (!m || (m[1] === 't') !== Boolean(m[4])) return null;
        const a = Number(m[2]);
        const b = Number(m[3]);
        switch (m[1]) {
            case 'hp': return { column: Math.floor(a + b / 2), row: b };
            case 'hf': return { column: a, row: Math.floor(b + a / 2) };
            case 's': return { column: a, row: b };
            default: return { column: 2 * a + b + (m[4] === 'up' ? 1 : 0), row: b };
        }
    }

    /**
     * "column 4, row 3" for a tile: its place among the distinct centre positions of the board, which
     * reads naturally on every grid and is what a screen reader announces after a move. On an infinite
     * board the loaded tiles come and go while panning, so the place is the tile's lattice position
     * counted from the origin tile instead ("column -2, row 5"); it never changes.
     */
    function tileLabel(polygons, polygon) {
        const cell = latticeCell(polygon.id);
        if (cell) return `column ${cell.column}, row ${cell.row}`;
        let axes = labelCache.get(polygons);
        if (!axes) {
            const unique = (values) => [...new Set(values.map((v) => Math.round(v * 2) / 2))].sort((a, b) => a - b);
            axes = { xs: unique(polygons.map((p) => p.center.x)), ys: unique(polygons.map((p) => p.center.y)) };
            labelCache.set(polygons, axes);
        }
        const nearest = (list, value) => {
            const target = Math.round(value * 2) / 2;
            const at = list.indexOf(target);
            return at < 0 ? 0 : at;
        };
        return `column ${nearest(axes.xs, polygon.center.x) + 1}, row ${nearest(axes.ys, polygon.center.y) + 1}`;
    }

    /** The label of a tile by id, also for a tile of an infinite board that is not loaded right now; null when unknown. */
    function tileLabelById(polygons, id) {
        const polygon = polygonMap(polygons).get(id);
        if (polygon) return tileLabel(polygons, polygon);
        const cell = latticeCell(id);
        return cell ? `column ${cell.column}, row ${cell.row}` : null;
    }

    return { SIZE_FACTOR, tileSize, pieceSize, offsets, placements, hitTest, sorted, shade, draw, drawAll, iconUrl, neighborInDirection, tileLabel, tileLabelById, latticeCell, polygonMap };
})();
