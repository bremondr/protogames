/**
 * Radial board builder: concentric rings around a centre, every ring cut into spaces by radial dividers.
 *
 * Settings (boardConfig):
 *   rings         number of rings
 *   sectors       spaces in the first (innermost) ring
 *   hole          width of the empty middle, in rings (0 = the first ring reaches the centre as pie slices)
 *   sectorsGrow   true: outer rings get more spaces, so the spaces stay about the same size; false: every ring has `sectors`
 *
 * A space is the polygon of an annular wedge, its arcs drawn as short straight edges. Both rings that meet at a
 * circle use the very same points on it (the dividers of both, plus evenly spaced ones), so two spaces that touch
 * share whole edges and the shared-edge adjacency (geometry/neighbors.js) works without any special case.
 *
 * Tile ids are `radial_<ring>_<space>`, ring 0 being the innermost; space 0 starts at the 3 o'clock direction and
 * the spaces run anticlockwise, like the degrees of a protractor.
 */
(function (global) {
    const { createPolygon } = global.GeometryHelpers;

    const LIMITS = {
        rings: { min: 1, max: 24, fallback: 4 },
        sectors: { min: 3, max: 48, fallback: 12 },
        hole: { min: 0, max: 4, fallback: 1 }
    };
    // Largest angle one straight edge of an arc may span; smaller makes rounder rings.
    const MAX_ARC_STEP = (7.5 * Math.PI) / 180;
    // The same ceiling as share links and the rest of the app put on the number of tiles.
    const MAX_TILES = 20000;
    const FRACTION_KEY = 1e9;

    const clampInt = (value, { min, max, fallback }) => {
        const n = Math.round(Number(value));
        return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    };

    /** The settings of a config, each inside its limits (missing ones take the defaults). */
    function normalize(config) {
        return {
            rings: clampInt(config.rings, LIMITS.rings),
            sectors: clampInt(config.sectors, LIMITS.sectors),
            hole: clampInt(config.hole === undefined ? LIMITS.hole.fallback : config.hole, LIMITS.hole),
            grow: config.sectorsGrow !== false
        };
    }

    /**
     * Spaces per ring. When they grow, a ring has as many as keeps its spaces as wide as the first ring's, measured
     * at the middle of the ring. Rings beyond the tile limit are left off, so a huge setting still builds.
     */
    function sectorCounts({ rings, sectors, hole, grow }) {
        const counts = [];
        let total = 0;
        for (let ring = 0; ring < rings; ring++) {
            const n = grow ? Math.max(sectors, Math.round((sectors * (hole + ring + 0.5)) / (hole + 0.5))) : sectors;
            if (total + n > MAX_TILES) break;
            counts.push(n);
            total += n;
        }
        return counts;
    }

    /**
     * Where the dividers meet the circle between ring b - 1 and ring b (b = 0 is the inside of the first ring), as
     * fractions of a full turn in [0, 1): the dividers of the rings on either side, with each gap between them cut
     * into pieces short enough to look round.
     */
    function circleFractions(counts, b) {
        const marks = new Map();
        const add = (f) => marks.set(Math.round(f * FRACTION_KEY) % FRACTION_KEY, f);
        for (const ring of [b - 1, b]) {
            if (ring < 0 || ring >= counts.length) continue;
            for (let i = 0; i < counts[ring]; i++) add(i / counts[ring]);
        }
        const sorted = [...marks.values()].sort((a, c) => a - c);
        const out = [];
        sorted.forEach((f, i) => {
            const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 1;
            const pieces = Math.max(1, Math.ceil(((next - f) * 2 * Math.PI) / MAX_ARC_STEP - 1e-9));
            for (let k = 0; k < pieces; k++) out.push(f + ((next - f) * k) / pieces);
        });
        return out;
    }

    /** The fractions of a circle that lie from `from` to `to` (inclusive), ascending; `to` may exceed 1 for the last space. */
    function between(fractions, from, to) {
        const eps = 1e-9;
        const out = [];
        for (const f of fractions) {
            if (f >= from - eps && f <= to + eps) out.push(f);
            if (f + 1 >= from - eps && f + 1 <= to + eps) out.push(f + 1);
        }
        return out.sort((a, b) => a - b);
    }

    /**
     * Builds the spaces of a radial board centred on the canvas, as large as fits.
     */
    function buildRadialGrid(config, canvas, colorMap) {
        if (!canvas) return [];
        const settings = normalize(config);
        const counts = sectorCounts(settings);
        const { hole } = settings;
        const availableWidth = canvas.width - Config.CANVAS_PADDING * 2;
        const availableHeight = canvas.height - Config.CANVAS_PADDING * 2;
        const radiusOf = (b) => (Math.min(availableWidth, availableHeight) / 2 / (hole + counts.length)) * (hole + b);
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const at = (r, f) => ({ x: cx + r * Math.cos(2 * Math.PI * f), y: cy - r * Math.sin(2 * Math.PI * f) });

        const circles = [];
        for (let b = 0; b <= counts.length; b++) circles.push(circleFractions(counts, b));

        const polygons = [];
        counts.forEach((n, ring) => {
            const rInner = radiusOf(ring);
            const rOuter = radiusOf(ring + 1);
            for (let i = 0; i < n; i++) {
                const from = i / n;
                const to = (i + 1) / n;
                const outer = between(circles[ring + 1], from, to).map((f) => at(rOuter, f));
                // Pie slices of a first ring without a hole meet in the centre point.
                const inner = rInner > 0 ? between(circles[ring], from, to).reverse().map((f) => at(rInner, f)) : [at(0, from)];
                const id = `radial_${ring}_${i}`;
                polygons.push(
                    createPolygon({
                        id,
                        type: 'radial',
                        center: at((rInner + rOuter) / 2, (from + to) / 2),
                        vertices: outer.concat(inner),
                        color: colorMap?.get(id)
                    })
                );
            }
        });
        return polygons;
    }

    global.GeometryRadial = {
        LIMITS,
        MAX_TILES,
        normalize,
        sectorCounts,
        buildRadialGrid
    };
})(typeof window !== 'undefined' ? window : globalThis);
