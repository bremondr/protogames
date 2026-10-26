# Audit area A: board geometry (main, read-only)

Scripts: `<scratch>/geo/` (call it `$GEO`).
Run with: `export PATH="/c/Users/bremo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"; cd $GEO; node <script>`.
`h.js` loads the app through `tests/support/load.js`; `fixed.js` is the shared analyser (welded-vertex Euler characteristic, connectivity, independent adjacency).

Summary: 1 High, 2 Medium, 3 Low, 5 Info. All fixed-board checks (hex/square/triangle tiles x all 5 shapes) are otherwise clean.

---

## A1 (High, crafted input): infinite board hangs the tab when a tile id sits at the safe-integer limit

- Location: `js/infinite.js:97-111` (`cellsIn` loops), reached through `loadRect`/`sync` (`:134-170`) after `contentView` (`:173`); entry points `js/shareLink.js:329` + `:339` (`ViewControls.fit()`), `js/fileManager.js:423` (`resetView`). `fromId` (`:59-74`) only requires `Number.isSafeInteger`.
- What happens: `fromId('inf_s_9007199254740991_0')` is accepted. Opening a share link (or project file) with one painted tile like that calls `resetView` -> `contentView` frames the tile -> `sync` -> `cellsIn` iterates `for (let x = floor(minX/SQ); x <= floor(maxX/SQ); x++)`. Once the loop variable reaches 2^53 (world x about 5.044e17, i.e. any id within about 20 of MAX_SAFE_INTEGER, for all four families), `x++` no longer changes `x` and the loop never ends. The tab freezes while the link has already been removed from the address bar (`forgetHash`), so only a reload recovers. The spec's claim "a hostile link cannot hang the tab" does not hold for `i` ids.
- Repro: `node $GEO/hang.js inf_s inf_s_9007199254740991_0` (also `inf_hp inf_hp_9007199254740991_0`, `inf_t inf_t_9007199254740991_0_up`) -> prints "loaded" then never returns (exit 124 under `timeout 15`). Control `inf_s_5000000000000000_0` finishes in 9 ms. Direct: `node $GEO/hang2.js 5.0441e17` -> times out; `5.0440e17` -> 2 ms.
- Fix: bound ids in `fromId` to something the double lattice can represent (e.g. `|a|,|b| <= 1e9`; vertices already degenerate beyond ~1e14), and have `loadRect`/`cellsIn` bail out when `rect` values are not finite or exceed that bound (a `Infinity`/huge view would loop the same way). Add a test with `inf_s_9007199254740991_0`.

## A2 (Medium): circle board with hexagon tiles is truncated for radius >= 16 (not a disc any more)

- Location: `js/geometry/hex.js:120` (`const span = radius + 2;`) and the scan at `:125-126`.
- What happens: the disc test is Euclidean (`hypot <= (radius+0.5)*width`) but the scan window is hex-distance `radius+2`. A tile at Euclidean distance d can have hex distance up to d/(sqrt(3)/2), i.e. about 1.155*(radius+0.5), which exceeds `radius+2` once radius >= 16. The six tips of the disc are cut off, so the board becomes a rounded hexagon, loses tiles and the bounding box becomes taller than wide. Both orientations. UI allows radius up to 50, files/links up to 100.
- Numbers (tiles produced vs tiles inside the stated disc): R15 859/859; R16 971/979; R20 1479/1519; R30 3195/3367; R50 8563/9271 (708 missing, 7.6%); R100 33173/36601 (9.4%). 170 of 200 (orientation x radius 1..100) cases are wrong. Missing examples: `hex_9_-19`, `hex_10_-19`, `hex_19_-10` at R16. The existing test only checks radii 1..8 (`tests/geometry.test.js:239`).
- Repro: `node $GEO/circspan.js` (count differs for 170 cases) and `node $GEO/circspan2.js`.
- Fix: `const span = Math.ceil((radius + 0.5) * 2 / Math.sqrt(3)) + 1;`. Verified in a patched copy (`node $GEO/fixcheck.js`): 0 mismatching radii for 1..100, both orientations. Extend the circle test to radius 20/50. Note this changes ids/tile counts of existing circle boards with radius >= 16 (saved files hold their own polygons, but share links (`t` string length) and colour carry-over on resize will see different tile sets), so it needs the versioning/migration treatment from the project memory rule, or an explicit decision that old links break.

## A3 (Medium-Low): export of an empty infinite board throws on large canvases (triangle tiles)

- Location: `js/infinite.js:214-219` (`exportScene`). Callers: `js/exporter.js:58` (SVG), `js/renderer.js:194` (PNG/PDF), `js/print.js:49`.
- What happens: with nothing painted, `painted` is `[]`. When `estimateCells(...) > EXPORT_MAX_TILES` the code returns `painted` (empty) instead of the loaded tiles, then `ViewMath.boundsOf([])` returns `null` and `bounds.maxX` throws `TypeError: Cannot read properties of null (reading 'maxX')`. The estimate exceeds 30000 for the loaded area when the canvas is large and the view is zoomed out (the 0.4 minimum zoom): triangle tiles at 3000x1700 and up (3440x1440 ultrawide, 3840x2160, 5120x1440). Hex and square tiles stay just below the cap at 3840x2160/zoom 0.4 (28116 and 23160 loaded tiles) but have the same latent path.
- Repro: `node $GEO/exp.js` (3840x2160, zoom 0.4, triangle: `THROW TypeError ... 'maxX'`) and `node $GEO/exp2.js` (grid of canvases/zooms).
- Fix: when `painted` is empty fall back to the loaded tiles (`s.polygons`) or at least a cut-down rectangle; guard `bounds === null`.

## A4 (Low): `buildLocator` allocates buckets proportional to the largest tile's bounds; imported tiles can crash/hang on first hover

- Location: `js/geometry/neighbors.js:226-236` (cell size from the first 200 tiles, then one bucket per cell a tile's bounds touch); `ProjectFormat.validatePolygon` (`js/projectFormat.js:226-245`) only checks that bounds are finite numbers and does not tie them to `vertices` or limit them.
- What happens: a project file whose polygon list has 200 normal tiles followed by one with bounds/vertices of +-16000 passes validation and, as soon as the mouse moves over the board (`AppState.getTopology().locate`), `buildLocator` tries to create about 1e9 buckets: `RangeError: Map maximum size exceeded` (4000 -> 3.2 s, 16000 -> crash). Not reachable from the UI-generated boards.
- Repro: `node $GEO/hostile.js`.
- Fix: validator: require `bounds` to equal the vertices' bounds (it is cheap) and cap coordinates (e.g. |v| <= 1e6); locator: clamp the bucket loop (fall back to a "large tiles" list tested linearly when a tile would touch more than N cells).

## A5 (Low): fractional `radius`/`size`/`width` are rounded differently per tile type

- Location: `js/geometry/helpers.js:158-161` (`Math.round`) vs `js/geometry/hex.js:109-111,150`, `js/geometry/triangle.js:19-35` (`Math.floor`, clamps).
- What happens: `ProjectFormat` accepts any finite `radius`/`size` in 0..100 (not necessarily integer). Circle board, radius 1.9: hexagon tiles 7, triangle tiles 6 (floor 1), square tiles 21 (round 2). radius 0.5: hexagon 1, square 9. radius 0: hexagon 1, square 1, triangle circle 6 (clamped to 1). Share links require integers so only files are affected.
- Repro: loop in `node $GEO/circ2.js` last block.
- Fix: validate `radius`, `size`, `width`, `height` as integers in `validateBoardConfig`, or use the same rounding everywhere.

## A6 (Low / Info): rectangle board with triangle tiles: width 1 and width 2 give the same board

- Location: `js/geometry/triangle.js:47` (`Math.max(2, dims.cols)`). Width 1 -> 2 columns per row (402 tiles for 1x201); width 2 -> same 402 tiles; width 201 x height 1 -> 201 tiles. The tile count is `max(2,width) * height`, undocumented. Verified in `counts.js` (5040 count checks, all match this rule). No fix needed beyond documenting, or accept width 1 as one column.

## A7 (Info): Issue #4 "triangles in circle look strange" - what it looks like now

Triangle tiles, circle board (script `$GEO/circ.js`, `$GEO/circ2.js`; tile counts; D6 symmetric (60 degree rotation and both mirrors hold for every radius 1..10, also 1..30 spot checks); centred on a lattice vertex; both orientations give identical tile sets; no gaps/holes/overlaps, Euler characteristic 1, single component):

| R | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| tiles | 6 | 24 | 60 | 108 | 180 | 258 | 348 | 450 | 576 | 708 |
| regular hexagon 6R^2 | 6 | 24 | 54 | 96 | 150 | 216 | 294 | 384 | 486 | 600 |
| boundary radius min..max (in triangle sides) | 0.87..1.00 | 1.73..2.00 | 2.65..3.46 | 3.46..4.36 | 4.58..5.29 | 5.57..6.24 | 6.56..7.21 | 7.55..8.19 | 8.54..9.54 | 9.54..10.44 |

- R1 and R2 are exactly the regular hexagons (6 and 24 tiles), so they are not round at all. From R5 the outline is reasonably round (max/min boundary radius about 1.15 and falling).
- Remaining defect beyond coarseness: dangling "spike" triangles that touch the rest of the board by a single edge (degree 1). R3: 6, R4: 12, R9: 12, R10: 18, R11: 24, R12: 12, ... up to 72 at R30 (list: R3,4,9,10,11,12,13,14,16,17,18,19,20,22,23,24,25,26,27,28,29,30). These look like thorns on the outline. The threshold in `buildCircleTriangleGrid` (`js/geometry/triangle.js:180-190`, centroid within radius) admits tiles whose only contact is one edge. Hex/square tile discs have no tiles with <=1 neighbour (hex min degree 2 at R3, otherwise 3+).
- Fix idea: after selecting tiles, drop tiles with fewer than 2 in-board neighbours (iterate once; keeps symmetry because it is symmetric by construction), or include their missing neighbour. Changes ids/tile counts for the affected radii, so same versioning caveat as A2.
- Odd detail: R3 (60 tiles) is not monotone-nicer than R2: it has more tiles than hexagon R3 (54) but a visibly spiky edge (bbox w/h ratio 0.87 vs 1.15 at R2).

## A8 (Info): sub-pixel tiles break adjacency (vertex weld epsilon 0.05 px)

- `js/geometry/neighbors.js:12-13` welds vertices within 0.05 px. `fitPolygonsToCanvas` shrinks without limit, so a 100x100 board on a canvas of height 153..160 px (drawable height <= 8 px) has tiles under 0.05 px and the graph degenerates (`node $GEO/weld.js`: avg degree 0.67 instead of 3.96 at h 153; fine from h >= 160 for squares, h >= 170 for hexagons). Unreachable in practice; no fix needed beyond maybe a minimum scale.

## A9 (Info): non-finite / non-positive canvas

- `fitPolygonsToCanvas` (`js/geometry/helpers.js:51-60`): canvas 0x0, negative or tiny sizes return the unfitted layout (finite, ids unchanged). A NaN/undefined width or height passes the `<= 0` guard (NaN comparisons are false) and produces NaN vertices (22 of 30 board shapes), and some builders produce no tiles. `resizeCanvas` uses `Math.floor(rect.width)` so NaN is unlikely; a one-line `Number.isFinite` guard would make it safe. `node $GEO/fit.js`.
- `Infinite.exportScene` (`js/infinite.js:219`): width/height below 48 gives a negative scale (mirrored export). Unreachable with real canvases.

## A10 (Info): other small things

- `ViewMath.setScaleAt(view, 1, ...)` returns a scale like 0.9999999999999999 in about 15% of cases (`scale * (1/scale)`), harmless today because nothing compares scale to 1 (`viewControls.js:98`). Script `$GEO/vm.js`.
- `Config.COLOR_PALETTES`: `#C62828` is used by both dungeon "Trap" and spaceship "Danger Zone"; anything that maps hex -> label/texture (themes) cannot tell them apart.
- Points that lie exactly on a shared slanted edge can be claimed by no tile because of float rounding in `isPointInPolygon` (about 2.5% of edge midpoints of hex/triangle boards, 0 on axis-aligned square edges at integer pixel positions across 900k pixel samples). Measure-zero for a mouse; no action.

---

## Checked and fine (all with scripts in `$GEO`)

- Tile counts vs formulas: hexagon/hexagon 3R(R+1)+1, hexagon/triangle 6R^2, triangle/triangle n^2, square and rectangle products, rectangle/triangle max(2,w)*h, for R/n 1..30, widths 1..30, heights 1..12, both orientations, both triangle orientations: 5040 checks, 0 mismatches (`counts.js`). Triangle disc count equals an independent brute-force lattice count for R 1..100.
- Per-tile invariants on 1920 fixed-board cases (5 shapes x 3 tiles x 2 orientations x 2 triangle orientations x 24 sizes incl. 1x1, 1xN, Nx1, odd/even, x 2 canvases) plus 150 big cases (radius 20/50/100, sizes 41/100, 201x201, 1x201, 201x1, 201x2; up to 72492 tiles): unique ids, finite vertices, bounds equal vertices' bounds, centre inside polygon, no edge shared by more than 2 tiles, Euler characteristic V-E+F = 1 and one connected component (no holes, no gaps, no disconnected islands) for every case, non-empty for every case (`fixed.js`, `big.js`).
- `buildAdjacency` equals an independent shared-edge computation, is symmetric and irreflexive, for the same cases; max time 0.35 s for 72k tiles.
- `buildLocator` vs `findPolygonAtPoint`: 72000 random points incl. outside the board, 240 boards, 0 differences (`loc.js`). Every integer pixel inside a square board resolves to a tile (0 dead points in 900k).
- `linePath`: 13500 random pairs + 48089 exhaustive pairs on 24 boards: always starts/ends at the endpoints, no duplicates, always edge-connected, never longer than the shortest path (`line.js`, `line2.js`).
- Determinism: 28800 generations on random canvases 200..3000 x 200..2000 (all shapes x tiles x orientations x sizes 1..40) and 1200 more specifically for the outline-clipped combinations (hexagon/square, triangle/hexagon, triangle/square, circle/square, canvases 300..2400 x 250..1500, R up to 9): identical id lists every time (`det.js`, `det3.js`). `generateGrid` returns `[]` for a null canvas on every fixed combination.
- Infinite board: `cellsIn` for 4 families x 300 random rectangles (sizes 10..20000, centres up to +-5e6): no duplicate ids, 12000 random points all covered, `fromId(id)` reproduces id/centre/vertices bit for bit (40563 tiles); interior tiles have exactly 6/6/4/3 neighbours; coordinates from 1e3 up to 1e14 still tile without gaps, wrong degrees or degenerate polygons (`inf1.js`). `sync()` is idempotent (returns false, same array), `sync(true)` keeps the id set, painted tiles keep object identity across a far pan and return, erased tiles far away are dropped, view is always covered after a pan, zoom limit is restored when switching to a fixed board (`inf2.js`). Estimation `estimateCells` is within 0.24x..3.8x of `cellsIn`, only under-estimating thin rectangles, so the export cap overshoots by at most about 1.4x (not a defect).
- `ViewMath`: 100000 random cases each for zoomAt anchoring, clampToBounds idempotence and containment, gestureView midpoint anchoring, toScreen/toWorld round trip: 0 failures (`vm.js`).
- `Config`: palette ids unique, no duplicate hex or label inside a palette, all hex valid.
- `state.js` topology cache: polygons array is never mutated in place anywhere in `js/` (grep for push/splice/assignments); only `setPolygons`, `sync` and the `restoreSnapshot` hook replace the array, so the WeakMap cache cannot go stale.

## Not covered

- Rendering, textures, print layout, exporter output (other areas); I only called `Infinite.exportScene`.
- Browser/DOM behaviour (real canvas sizes, devicePixelRatio, event handlers); sizes were taken from `Renderer.resizeCanvas` (CSS px).
- `shareLink` encoding beyond the infinite id path, `ProjectFormat` migrations.
- Winding/orientation consistency of polygons (not needed by the renderer) and exact overlap by area (overlap was excluded through edge-sharing, Euler characteristic and no duplicate positions, plus the existing SAT test).
- Performance beyond the timings listed (no profiling of the render loop).
