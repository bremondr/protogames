# Triangle Board Generation - How It Works

How the triangle tile grid is generated for the hexagon and circle board shapes (`js/geometry/triangle.js`, helpers in `js/geometry/helpers.js`, entry point `Geometry.generateGrid` in `js/geometry.js`).

## Entry point
`Geometry.generateGrid(config, canvas, colorMap)` builds the tiles for `config.gridType` and then fits them to the canvas:

```javascript
function generateGrid(config, canvas, colorMap) {
    return helpers.fitPolygonsToCanvas(buildGrid(config, canvas, colorMap), canvas);
}
```

For `gridType: 'triangle'`, `buildTriangleGrid` picks a builder by `config.boardShape`:

| Board shape | Builder | Tiles |
|---|---|---|
| `triangle` | `buildTessellatedTriangle` | `size * size` (row `r` has `2r + 1` triangles) |
| `hexagon` | `buildHexagonTriangleGrid(config, canvas, colorMap, radius, orientation)` | `6 * radius^2` |
| `circle` | `buildCircleTriangleGrid(config, canvas, colorMap, radius)` | see below |
| anything else | rectangular fallback, clipped by the board outline | - |

The hexagon and circle builders both use the shared `buildLatticeTriangles`.

## The shared lattice builder
`buildLatticeTriangles(canvas, colorMap, { span, accepts, rotate, idPrefix })` tiles a region with triangles of a lattice that has a **vertex at the board centre**, which gives the result the full 6-fold symmetry of the lattice.

1. Layout is done at a fixed scale (`side = 100`) around the canvas centre. The final size is not chosen here: `fitPolygonsToCanvas` scales and centres whatever survived (see "Fitting" below).
2. Lattice point `(i, j)` sits at `x = (i + j/2) * side`, `y = j * (sqrt(3)/2) * side`.
3. Every lattice cell `(i, j)` for `i, j` in `-span..span` holds two triangles:
   - `down`: points `(i, j)`, `(i+1, j)`, `(i, j+1)`
   - `up`: points `(i+1, j)`, `(i+1, j+1)`, `(i, j+1)`
4. A triangle is kept when `accepts(x, y)` is true for its **centroid**, given in triangle sides relative to the centre. The `accepts` predicate is the only thing that differs between board shapes.
5. With `rotate`, the finished layout is turned by 90 degrees about the centre.
6. Each kept triangle becomes a polygon with id `<idPrefix>_<j>_<i>_<kind>` and `type: 'triangle'`. The `pointingUp` flag is set only when the layout is not rotated; a rotated triangle points sideways, so it gets none.

`span` only has to be large enough to cover the board (`2 * radius + 1` for hexagons, `2 * radius + 2` for circles); the predicate does the real selection.

## Hexagon board
`radius` is the number of triangle sides from the centre to the edge (rings). The predicate describes a flat-top hexagon (corners left and right) whose edges follow lattice lines, so no centroid ever lies on the boundary:

```javascript
accepts: (x, y) => Math.abs(x) + Math.abs(y) / Math.sqrt(3) < rings
                && Math.abs(y) < rings * (Math.sqrt(3) / 2)
```

Pointy-top (the default) is the same layout with `rotate: true`; flat-top is not rotated. Ids use the prefix `triangle_hex`.

### Counting
Rings of triangles around the centre vertex hold `6 * (2k - 1)` triangles for ring `k`: 6, 18, 30, ... So a board of `N` rings has

`6 + 18 + ... + 6(2N - 1) = 6 * N^2`

triangles: 6 for `N = 1`, 24 for `N = 2`, 54 for `N = 3`, 96 for `N = 4`. Tests and `dev/geometry-checks.js` assert `6 * radius^2`.

## Circle board
Every triangle whose centroid lies within `radius` triangle sides of the centre vertex:

```javascript
const limitSquared = (Math.floor(3 * radius * radius) + 0.5) / 3;
accepts: (x, y) => x * x + y * y <= limitSquared
```

Squared centroid distances are multiples of 1/3, so the threshold sits halfway between two achievable values and no triangle can lie exactly on the boundary. Not rotated; ids use the prefix `triangle_disc`. The counts are 6, 24 and 60 for radius 1, 2 and 3 (there is no `6 * radius^2` rule here).

## Fitting to the canvas
`fitPolygonsToCanvas(polygons, canvas)` measures the bounding box of the tiles that remain, scales it to fit the drawable area (canvas minus `CANVAS_PADDING` on every side and `TOOLBAR_CLEARANCE` at the bottom) and centres it, updating each polygon's `vertices`, `center` and `bounds`. Builders may therefore lay tiles out at any scale, and nothing can overflow or sit off-centre.

## Triangle board (for comparison)
`buildTessellatedTriangle` does not use the lattice builder. It computes the size from the canvas up front (`Math.max(12, ...)`), then lays out `size` rows of `2 * row + 1` triangles, alternating up and down (reversed rows for `point-down`). Ids are `triangle_<row>_<col>`.

## Related
- `createTriangleVertices(origin, size, pointingUp)` in `helpers.js` builds one triangle from the top-left of its bounding box; the rectangular fallback and the triangle board use it, the lattice builder computes corners from lattice points instead.
- `boundsCenter(vertices)` and `shouldIncludePolygon` clip the rectangular fallback to a board outline; the lattice builders do not need clipping.
- Adjacency (for every tile shape) is computed by welding coincident vertices and matching shared edges in `js/geometry/neighbors.js`.
