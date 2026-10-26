# Triangle Board Generation - How It Works

Purpose: how the tile grid is generated, in detail for triangle tiles on hexagon and circle boards (`app/js/geometry/triangle.js`, helpers in `app/js/geometry/helpers.js`, entry point `Geometry.generateGrid` in `app/js/geometry.js`), with the tile counts of every generator version.

**Status:** current reference. **Last verified:** 2026-10-26 against `d6ca3be` (`main`); every count in this page was measured with `loadApp` (`tests/support/load.js`) on a 1600 x 1000 canvas. Part of the [documentation index](README.md). The rules that tie a saved board to its generator version are in [SPECIFICATION.md](SPECIFICATION.md#generator-versions).

## Entry point
`Geometry.generateGrid(config, canvas, colorMap)` builds the tiles for `config.gridType` (`hexagon` in `geometry/hex.js`, `square` in `geometry/square.js`, `triangle` in `geometry/triangle.js`) and then fits them to the canvas:

```javascript
function generateGrid(config, canvas, colorMap) {
    return helpers.fitPolygonsToCanvas(buildGrid(config, canvas, colorMap), canvas);
}
```

For `gridType: 'triangle'`, `buildTriangleGrid` picks a builder by `config.boardShape`:

| Board shape | Builder | Tiles |
|---|---|---|
| `triangle` | `buildTessellatedTriangle` | `size * size` (row `r` has `2r + 1` triangles) |
| `hexagon` | `buildHexagonTriangleGrid(config, canvas, colorMap, radius, orientation)` | around a point (`center: 'point'`): `6 * radius^2`; around a triangle (`center: 'tile'`): `6 * radius * (radius - 1) + 1`, see "Around a triangle" |
| `circle` | `buildCircleTriangleGrid(config, canvas, colorMap, radius)` | see below |
| anything else | rectangular fallback, clipped by the board outline | - |

The hexagon and circle builders both use the shared `buildLatticeTriangles`.

## The shared lattice builder
`buildLatticeTriangles(canvas, colorMap, { span, accepts, origin, rotate, idPrefix })` tiles a region with triangles of a lattice that has a **vertex at the board centre**, which gives the result the full 6-fold symmetry of the lattice.

1. Layout is done at a fixed scale (`side = 100`) around the canvas centre. The final size is not chosen here: `fitPolygonsToCanvas` scales and centres whatever survived (see "Fitting" below).
2. Lattice point `(i, j)` sits at `x = (i + j/2) * side`, `y = j * (sqrt(3)/2) * side`.
3. Every lattice cell `(i, j)` for `i, j` in `-span..span` holds two triangles:
   - `down`: points `(i, j)`, `(i+1, j)`, `(i, j+1)`
   - `up`: points `(i+1, j)`, `(i+1, j+1)`, `(i, j+1)`
4. A triangle is kept when `accepts(x, y, triangle)` is true for its **centroid**, given in triangle sides relative to `origin` (the middle of the board in lattice units; the vertex at 0, 0 unless a board is built around a triangle), with `triangle` = `{ i, j, kind }`. The `accepts` predicate is the only thing that differs between board shapes.
5. With `rotate`, the finished layout is turned by 90 degrees about the centre.
6. Each kept triangle becomes a polygon with id `<idPrefix>_<j>_<i>_<kind>` and `type: 'triangle'`. The `pointingUp` flag is set only when the layout is not rotated; a rotated triangle points sideways, so it gets none.

`span` only has to be large enough to cover the board: `2 * radius + 1` for hexagons around a point, `2 * radius + 2` for hexagons around a triangle and for circles; the predicate does the real selection.

## Hexagon board
This section is about the board around a lattice vertex (`center: 'point'`, the only way triangle boards were built before generator versions and centres). `radius` is the number of triangle sides from the centre to the edge (rings). The predicate describes a flat-top hexagon (corners left and right) whose edges follow lattice lines, so no centroid ever lies on the boundary:

```javascript
accepts: (x, y) => Math.abs(x) + Math.abs(y) / Math.sqrt(3) < rings
                && Math.abs(y) < rings * (Math.sqrt(3) / 2)
```

Pointy-top (the default) is the same layout with `rotate: true`; flat-top is not rotated. Ids use the prefix `triangle_hex`.

### Counting
Rings of triangles around the centre vertex hold `6 * (2k - 1)` triangles for ring `k`: 6, 18, 30, ... So a board of `N` rings has

`6 + 18 + ... + 6(2N - 1) = 6 * N^2`

triangles: 6 for `N = 1`, 24 for `N = 2`, 54 for `N = 3`, 96 for `N = 4`. Tests and `dev/geometry-checks.js` assert `6 * radius^2` for this centre.

### Around a triangle
With `center: 'tile'` the board is built around one triangle (`triangleOrientation` says whether it points up or down) by `layersAroundTriangle` in `triangle.js`: layer 1 is that triangle and every next layer adds the triangles that share a corner with the previous one, the same rule that makes hexagons grow in rings. A board of `N` layers has `6 * N * (N - 1) + 1` triangles: 1, 13, 37, 73 for `N = 1` to 4 (layers add 12, 24, 36, ...). `6 * radius^2` does not apply to it. The `orientation` (pointy or flat) has no effect here: the shape follows `triangleOrientation` and the lattice.

## Circle board
Around a lattice vertex (`center: 'point'`), every triangle whose centroid lies within `radius` triangle sides of the vertex:

```javascript
const limitSquared = (Math.floor(3 * radius * radius) + 0.5) / 3;
accepts: (x, y) => x * x + y * y <= limitSquared
```

Squared centroid distances are multiples of 1/3, so the threshold sits halfway between two achievable values and no triangle can lie exactly on the boundary. Around a single triangle (`center: 'tile'`, `triangleOrientation` says whether it points up or down) the same is done from that triangle's centroid with a limit of `radius - 0.5` sides, halfway between two achievable distances (`limitBetween`), so radius 1 is that triangle alone. Not rotated; ids use the prefix `triangle_disc`.

**Spikes.** The cut-out rim can leave a triangle that touches only one other triangle (or none). `withoutSpikes` removes those and repeats until every triangle touches at least two others, because removing one can leave its neighbour hanging by a single edge. A board of one triangle is left alone. The rule looks at a triangle and its neighbours only, so the symmetry of the disc is kept.

Counts after the spikes are removed (there is no `6 * radius^2` rule here):

| radius | 1 | 2 | 3 | 4 | 5 | 10 | 20 |
|---|---|---|---|---|---|---|---|
| around a vertex | 6 | 24 | 54 | 96 | 180 | 690 | 2874 |
| around a triangle | 1 | 13 | 37 | 82 | 136 | 625 | 2737 |

Circles of triangles are identical in generator 1 and generator 2 (see "Generator versions" below); the counts above were re-measured for both generators and are asserted for generator 1 in `tests/generatorVersion.test.js`.

## Generator versions
`Geometry.generateGrid` reads `config.generator` (an integer from 1; `Config.GENERATOR_VERSION` is the current one, 2; missing means current). A board stores the version it was made with so that regenerating it (resize, opening a file) never changes its tiles; see "Generator versions" in [SPECIFICATION.md](SPECIFICATION.md#generator-versions) for the rule (*a change to the tiles generated for existing settings is a new generator version; an old version is never edited*) and the format.

The two versions differ only in the **circle of hexagon tiles** (`buildCircleHexGrid` in `app/js/geometry/hex.js`), which scans a window of axial coordinates `(q, r)` around the middle and keeps the tiles within the disc:

| | scan window (`span`) | tiles of a disc of radius 30 around a tile | complete up to |
|---|---|---|---|
| generator 1 | `radius + 3` | 3283 | radius 22 (tile), 18 (point) |
| generator 2 | `ceil((radius + 0.72) * 2 / sqrt(3)) + 2` | 3367 | every radius |

The disc of radius `radius + 0.72` tile widths reaches `2 / sqrt(3)` times as many axial steps as its radius, so a window that grows one step per radius runs out of tiles to scan. Generator 2 contains every tile of generator 1 with the same id. Circles of triangles are not affected: their window (`2 * radius + 2`) was always large enough. The full table of circle-of-hexagon counts (radius 1 to 100, both centres, both generators) is in [SPECIFICATION.md](SPECIFICATION.md#generator-versions).

## Hexagon and square tiles at a glance
Measured with the same script (hexagon, circle and square tiles share the layers rule of [SPECIFICATION.md](SPECIFICATION.md#boards-built-from-the-middle-centre-and-size); pointy-top and flat-top give equal counts; the two generators agree except for the circle of hexagons above):

| Tiles and board | Layers (stored `radius` + 1 for hexagon and square tiles) 1, 2, 3, 4 around a tile | around a point |
|---|---|---|
| hexagons, hexagon board | 1, 7, 19, 37 | 3, 12, 27, 48 |
| squares, hexagon board (clipped to the outline) | 1, 7, 19, 37 | 4, 12, 28, 48 |
| squares, circle board | 1, 9, 21, 37 | 4, 12, 32, 52 |
| triangles, hexagon board | 1, 13, 37, 73 | 6, 24, 54, 96 |

The square-tile hexagon board is only reachable from old links or code: the sidebar switches it off. A rectangle of hexagons or squares is `width * height` tiles (`hex_<row>_<col>`, `square` ids likewise); a hexagon or circle board is `2 * radius + 1` (around a tile) or `2 * radius + 2` (around a point) tiles across.

## Fitting to the canvas
`fitPolygonsToCanvas(polygons, canvas)` measures the bounding box of the tiles that remain, scales it to fit the drawable area (canvas minus `CANVAS_PADDING`, 48 px, on every side and `TOOLBAR_CLEARANCE`, 56 px, at the bottom) and centres it, updating each polygon's `vertices`, `center` and `bounds`. Builders may therefore lay tiles out at any scale, and nothing can overflow or sit off-centre.

## Triangle board (for comparison)
`buildTessellatedTriangle` does not use the lattice builder. It computes the size from the canvas up front (`Math.max(12, ...)`), then lays out `size` rows of `2 * row + 1` triangles, alternating up and down (reversed rows for `point-down`). Ids are `triangle_<row>_<col>`.

## Related
- `createTriangleVertices(origin, size, pointingUp)` in `helpers.js` builds one triangle from the top-left of its bounding box; the rectangular fallback and the triangle board use it, the lattice builder computes corners from lattice points instead.
- `boundsCenter(vertices)` and `shouldIncludePolygon` clip the rectangular fallback to a board outline; the lattice builders do not need clipping.
- Adjacency (for every tile shape) is computed by welding coincident vertices and matching shared edges in `app/js/geometry/neighbors.js`.
