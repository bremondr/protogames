# Table demo (local only)

Starting point for playtesting on the tactile table: the board generator's hex board is
shown fullscreen, a camera watches the table, and every hex with something on it lights up.
No markers yet, no rules: it answers only "is there something on this cell?".

This lives on the `table-demo` branch and is not part of the published site (`scripts/build-site.js`
only copies the editor). It runs from a local server on the table machine.

## Run

```
python3 table/server.py            # tracking camera = the "USB 2.0 Camera" (up-looking, IR)
```

Open <http://localhost:8000/table/> on the display that stands in for the projector and press **F**
for fullscreen. Needs only `python3-opencv` (already installed by `scripts/setup-table-machine.sh`).
Options: `--camera /dev/videoN` (for example the BRIO), `--port`, `--host`, `--no-camera`.
The server listens on 127.0.0.1 unless `--host` is given.

## First use

1. **C**: calibrate. White numbered discs appear in the display corners and the camera picture shows
   up in a panel. Click disc 1 to 4 (top-left, top-right, bottom-right, bottom-left) in the camera
   picture. The cells are then drawn onto the picture so you can check the alignment.
   Saved to `table/data/calibration.json` (not committed, it belongs to this physical setup).
2. **B**: with the table empty, capture the baseline. The display goes dark, then fully lit, for
   about 5 seconds.
3. Put something on a cell: it lights up after about a quarter of a second and goes out when removed.

**S** switches to a simulator (click cells), so the page can be developed without the table.
`?board=<url of a project .json>` plays a board saved from the editor, for example
`/table/?board=/tests/fixtures/v2-space-arctic.protogames.json`.

## How it works

```
camera --> tracker.py: warp to display space, compare each cell with the empty-table baseline
                |  (server.py, standard library HTTP)
                +--> /api/events (server-sent events) --> table.js lights the cells
page   --> /api/cells (the board polygons), /api/calibration, /api/baseline
```

- Two baselines (all dark, all lit) because the display is lit by the tracker's own answer. A camera
  that sees the display must compare an occupied cell with the lit picture and a free one with the dark
  picture; otherwise the highlight would keep itself on. With an IR-only camera both are equal.
- A cell changes state only after 4 (on) or 6 (off) consistent frames and is then frozen for 0.7 s.
  Thresholds (`on_frac`, `off_frac`, `diff_thr`) can be changed with `POST /api/settings`.
- The object must cover about 18 % of the cell to count; tune on the real table.

## Tests

```
python3 -m unittest discover -s table
```
