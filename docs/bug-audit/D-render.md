# Audit D: rendering, textures/objects, export, print (main @ 39ead4a, branch docs-bug-audit)

Method: Node harnesses on the repo's vm loader with recording fake canvases (`render/harness.js`, `render/fakedom.js`), plus a **real Edge/Chromium 155** driven over CDP against a scratch copy of the app (`render/cdp.js`, `render/bt/*.js`, server `render/server.js`; the repo itself was not touched). PDFs were produced by the app's own `Print.toPdf` in the browser and checked with `qpdf --check` and PyMuPDF; SVGs were parsed with Python `xml.etree`.
All scripts and generated files are in `<scratch>/render/` (PDFs/PNGs in `render/out/`). Paths below are relative to that folder.

Totals: High 0, Medium 3, Low 6, Info 1 (a bundle of small points). Issue #20 verdict is below.

---

## Findings

### D1 (Medium) Legend printed on top of a board that does not fit the sheet
- Location: `js/print.js:226-234` (the `legendOnSheet && !layout.fits && layout.boardFits === false` branch, "keep the board warning below"); drawn in `sheetPage`, `js/print.js:356`.
- What happens: Sheet mode, legend "below the board", board larger than the chosen sheet. The planner keeps `legend.onSheet = true` with a `band` that cannot exist, so `drawLegend` paints the legend text straight over the bottom of the (cropped) board, with no background. Dark tiles make the names unreadable and the swatches sit on tiles.
- Repro (real browser): `node cdp.js leg` (script `bt/leg.js`). Default hex board at 40 mm tiles is 440 x 393 mm; `{mode:'sheet', sheet:'A3', tileMm:40, legend:true}` gives `onSheet:true, fits:false, boardFits:false, band:35`. The generated `out/legover.pdf` (preview `out/legover.png`) shows "Forest / Village / Mountain / Grassland / Water / Snow" overlapping the lower hex row, and the Desert/Volcanic names are invisible on the dark tiles. The only message shown is the "edges would be cut off" warning.
- Fix: when `!layout.fits` and a legend is requested, always move it to its own page (the `else if` branch already does this for `boardFits === true`); drop the special "keep the board warning" branch; add a test in `tests/print.test.js`.

### D2 (Medium) Printed legend names a terrain after the wrong palette (shared hex `#C62828`)
- Location: `js/print.js:86-91` (`terrainLabels`, first palette wins); the same first-wins pattern is in `js/textures.js:28-37` (`getLabel`).
- What happens: `dungeon/Trap` and `spaceship/Danger Zone` both use `#C62828`. The legend is built hex -> label over all palettes in order, so on a spaceship board every Danger Zone tile is listed as "Trap".
- Repro (node): `node t11.js` (paints every tile `#c62828` with `currentPaletteId = 'spaceship'`) prints `[{"kind":"terrain","key":"#c62828","name":"Trap","count":91}]`. `node t10.js` shows this is the only duplicated hex among the built-in palettes (imported themes are de-duplicated by `ThemeManager`, built-ins are not).
- Fix: prefer the palette active on the board (`AppState.currentPaletteId`) when resolving the label, and/or give one of the two tiles another hex (that changes saved data, so it needs the project-versioning procedure).

### D3 (Medium, visual) The board canvas ignores `devicePixelRatio`
- Location: `js/renderer.js:44-55` (`resizeCanvas` sets the backing size to CSS pixels) and `js/renderer.js:188-199` (export canvas has the same size). `devicePixelRatio` is read only in `js/print.js:512` (print preview).
- What happens: on any HiDPI display (Retina, Windows 125-200%) the bitmap is stretched by the browser, so the 1 px grid lines and textures are blurry, and PNG export is only CSS-pixel size.
- Repro (real browser): `DPR=2 node cdp.js dpr 1400 900` (script `bt/dpr.js`) returns `dpr:2, backing:[1100,844], css:[1100,844], deviceBacking:[2200,1688]`; the export canvas is also 1100 x 844.
- Fix: size the backing store by `devicePixelRatio` and apply the ratio in `paint` (view maths and pointer mapping already use `canvas.width / rect.width`, so most code is ratio-safe); give `createExportCanvas` its own scale.

### D4 (Low) Empty infinite board: PNG, SVG and Print all throw on a very large window
- Location: `js/infinite.js:205-219` (`exportScene`), reached from `js/renderer.js:194`, `js/exporter.js:58`, `js/print.js:49` and `js/printDialog.js:102`.
- What happens: with nothing painted, `exportScene` uses the whole loaded area; when `estimateCells(...) > EXPORT_MAX_TILES` (30 000) it takes `painted`, which is `[]`, so `ViewMath.boundsOf([])` is `null` and `bounds.maxX` throws (line 219). This is the new estimate-before-build code from PR #76 (the old order had the same hole). The Print button does nothing at all: `PrintDialog.open` throws inside `sync()` before the dialog is unhidden. No message is shown.
- Repro (node): `node t4.js` (zoom 0.4, empty board): triangles from 3440 x 1440, hexagons and squares at 5120 x 2880 print `THROWS Cannot read properties of null (reading 'maxX')`. Real browser (canvas 3540 x 2104 on a 4K window, triangle board, zoomed out): `node cdp.js infexp 3840 2160` (script `bt/infexp.js`) shows three uncaught TypeErrors (`exportToPNG`, `exportToSVG`, `PrintDialog.open`) and `dialogOpen:false`.
- Fix: in `exportScene`, when `painted` is empty fall back to the loaded polygons (or the first tile) instead of `[]`; show a notification when the export scene is empty. Add a test "empty infinite board, large canvas".

### D5 (Low) Float noise adds a whole extra page when the board is exactly one page wide
- Location: `js/print.js:127-130` (`pagesAlong`, strict `length <= printable`); the sheet layout already tolerates this with `+ 0.01` (`js/print.js:172`).
- What happens: `wMm = worldWidth * (tileMm / tileMeasure)` carries about 3e-14 mm of noise, so a board that fits a page exactly gets 2 columns (the second page holds only the 5 mm overlap strip).
- Repro (node): `node t2.js` (96 hits over square boards and paper/margin/overlap combinations). Default settings: 2 x 2 square board, 95 mm tiles, A4 (portrait or auto), margin 10, overlap 5 gives `w = 190.00000000000003`, `cols = 2` instead of 1. `node t12.js` shows it is the only default-margin hit, so it is rare.
- Fix: `if (length <= printable + 0.01) return 1;`.

### D6 (Low) The 16 MP page cap is exceeded by rounding for some sheet sizes
- Location: `js/print.js:189-193` (`pageDpi` limits the exact area to 2^24) versus `js/print.js:270-273` (`createSurface` rounds each side).
- What happens: when the area cap is the active one, `round(w*k) * round(h*k)` can be above 16 777 216; in about 45% of sampled sizes it is (up to +5 247 px, e.g. 2139.6 x 444.3 mm gives 16 782 463). On iOS Safari that canvas is refused and the user gets the "could not allocate a drawing surface" error the cap was meant to prevent. Standard A0/A1 stay under (A0: -66 px).
- Repro (node): `node t7.js` prints `over: 39852` of `tot: 88759` and the A0/A1 margins. Not reproducible in desktop Chromium (its limit is far higher), so this is arithmetic only.
- Fix: use `Math.floor` for the surface size, or shave 1% off the dpi in the area branch.

### D7 (Low) Crop marks reach the page edge for small margins and use the horizontal margin for vertical marks
- Location: `js/print.js:334-346` (`cropMarks`), called at `js/print.js:355` with `mg - page.x0` for both axes.
- What happens: the mark extent is `gap + len = 1.5 + min(6, margin - 1) = margin + 0.5` mm, so for a margin of 3-6 mm a mark crosses the sheet edge by 0.5 mm. Because the x free space is used for the y marks too, a board that is tight vertically on a wider sheet gets vertical marks that run off the top/bottom edge.
- Repro (real browser): `out/sheetfit.pdf` (`sheet:'fit', marginMm:5`): the pixel row at y = 5 mm has dark pixels from x = 0.0 mm to 3.4 mm (mark touches the page edge).
- Fix: compute `len` per axis from the real free space and cap with `margin - gap`.

### D8 (Low, visual) Hover / line-preview redraw hides the top of a neighbouring tile's object
- Location: `js/renderer.js:114-140` (hovered/preview tiles are re-filled and stroked after the object layer; only their own object is redrawn).
- What happens: objects are drawn up to 0.55 x tile above their tile centre, so they overhang the tile above. When that upper tile is hovered, its opaque re-fill covers the overhang while the pointer is over it, and the flag/roof of the object below flickers away.
- Repro (real browser): `node cdp.js hover` (script `bt/hover.js`): castle on a tile, flat view, 4x zoom; hovering the tile above hides 117 of the 117 object pixels that lie inside it (`hidden:117, objPix:117`).
- Fix: draw hover/preview as an outline and tint over the finished object layer instead of re-filling, or redraw the neighbours' objects too.

### D9 (Low) "Fit to board" sheet can exceed the usual PDF page-size limit without a warning
- Location: `js/print.js:157-175` (sheet 'fit'), `js/print.js:253-256` (only a dpi warning exists).
- What happens: a 30 x 30 square board with 200 mm tiles gives a 6020 mm sheet = 17 065 pt. The PDF 1.4 implementation limit for many viewers (Acrobat, Preview) is 14 400 pt (5080 mm); qpdf and PDFium accept it, others may refuse or clip. The only note is "made at about 17 dpi".
- Repro (node): `node t13.js` prints `6020 mm = 17064.6 pt; blocked false`.
- Fix: add a warning (or block) above 5080 mm.

### D10 (Info) Smaller points
- Export and print canvases do not get `lineJoin/lineCap = 'round'` (`applyContextDefaults` runs only on the on-screen context, `js/renderer.js:18-22`); real browser: `exportLineJoin:'miter'` (`bt/dpr.js`). Sub-pixel difference at 60 degree triangle corners.
- At print scale the 128 px terrain textures and 256 px object rasters are enlarged about 3.6x (25 mm tiles) to 20x (200 mm tiles), so big-tile prints are soft.
- Infinite board at 4K and zoom 0.4 keeps 45 618 tiles loaded and one frame costs 160-250 ms here (`bt/perf.js`, headless software rendering, so an upper bound). The minimap hashes every tile on every frame (`js/viewControls.js` `contentSignature`).
- `PrintDialog` cannot cancel a running export (`close()` returns while `busy`, Escape is ignored); up to 300 pages can take a while. In sheet mode, legend and token page paper comes from the "Paper" select that is hidden (`printTiledOnly`), so the page size follows an earlier, invisible choice.

---

## Issue #20 verdict ("SVG export ignores textures and placed objects")

**Still true on main; not fixed.** `Exporter.buildSvg` (`js/exporter.js:34-45`) emits one flat `<path fill=hex stroke=GRID_STROKE>` per tile; `Textures`/`Objects` are never consulted, and `tests/exporter.test.js` covers only escaping. What the user is told: the notification after export is only `SVG exported` (`js/exporter.js:68`); the button is a plain `SVG` with no title or tooltip (`index.html:136`); the limitation is documented only in `README.md:19,25` ("SVG is a flat-colour outline of the tiles: no textures or objects"). So even the issue's "at minimum, show a notification" option is not done, and its "limitation is clearly stated in the UI" alternative is met only in the README. The SVG itself is valid: fixed hex, fixed square, empty infinite and painted infinite boards (`out/*.svg`, `t5.js`) all parse with `xml.etree`; viewBox/width/height are consistent (fixed board = canvas rectangle, infinite = ceil'd drawn bounds); colours are attribute-escaped and the project name is never written to the SVG. (Exception: D4 when the board is empty on a very large window.)

---

## Checked and fine (about 30 checks)

- PDF structure: 3 PDFs from fake canvases plus 7 from the real browser (tiled, sheet fit, A2/A3/A0 sheets, an 8-page tiled 100 x 100 board, a 2520 mm fit sheet): all `qpdf --check` clean; MediaBox equals the plan's paper size on every page; xref offsets, stream `/Length`, `/Size` and page `Kids` order correct; images open in PyMuPDF at the expected pixel size (e.g. 3445 x 4870 for A0).
- Print scale: measured from recorded transforms for hex/square/triangle x tiled/fit/A2 sheet: a tile of N mm renders as N mm +- 0.007 mm (<= 0.03%, from canvas-size rounding); `tileMeasure` right for all three shapes.
- Page seams: next page starts exactly `printW - overlap` later; overlap strips of pages A1/A2 compare equal to within 1 px (0.13 mm) in the PDF raster; no gaps; board centred (`offX >= 0`); `rowName`, labels, margin/overlap "no room" block, token capacity maths and blocking warning; the structured `{text, blocking}` warnings drive the Download button correctly.
- Inputs: empty/NaN/Infinity/negative/huge/non-numeric/garbage saved values are normalised and the dialog shows the clamped value; the 300-page cap blocks without a hang even for a 47 000-page plan; persisted settings round-trip (`bt/dlg.js`; textures intentionally not persisted).
- Real browser, 100 x 100 square board (10 000 tiles + objects): tiled 8 pages in 0.47 s, A0 sheet 0.31 s, 2520 mm fit sheet 0.35 s, no exceptions.
- `escapeAttribute`/`buildSvg`: all five characters, numeric attributes, hostile colours.
- Infinite export: painted tiles far apart fall back to painted-only (cap works, no blanks allocated); the estimate runs up to about 10% below the real cell count (hex 3840 x 2160 builds 30 340), so the cap is soft but harmless.
- Textures: every palette tile and object (35 + 19) renders without exceptions in real Chromium (only `Void` is near-flat, by design); label misses are no longer cached as `null`; `drop`/`removeSet` revoke only URLs they handed out; `Objects.urlFor` re-resolves a custom id registered after a miss; the own-key check blocks `__proto__`.
- Renderer: `save/restore` balanced; the path survives `drawFeature`'s save/restore so the overlay fill works; culling uses bounds + 4 px slack and one tile of reach for objects; `lineJoin/lineCap` are re-applied after `resizeCanvas` (verified in the browser); exports skip hover/preview.
- Object placement (`drawOnPolygon`): centred on the vertex mean, `0.85 * min(w,h)` for pointy/flat hexes, squares and up/down triangles; tall objects overhang by design.
- Legend/token pages: columns, rows per page, counts, truncation, ordering, texture on/off swatches; the PDF page count equals `plan.pageCount`.

## Not covered (needs a person, a real printer or other environments)

- Actual paper output, printer margins and dimensional accuracy on paper (only PDF geometry was verified); Acrobat/Preview above 14 400 pt; PDF viewers other than PyMuPDF/PDFium/qpdf.
- iOS Safari canvas limits (D6 is arithmetic, not observed); Safari/Firefox download and blob-URL behaviour; the visual look of D3 on a real HiDPI screen (only the numbers were checked).
- GPU rendering performance (headless Edge used software rasterisation); real memory use of 300-page PDFs.
- Seamless texture quality (M15 from the first audit, not re-checked), taste of the procedural art, touch/pen input.
- The preview badge/runtime was not touched (not related to rendering here).
