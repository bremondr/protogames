# Playtesting on the tactile table (TMB): integration notes

Status: **research notes, nothing here is implemented.** Written 2026-10-06 from the Tactile Matrix Box (TMB) material of the ggLab at FIT CTU. Nothing described below was run on the physical table; "verified" means read in the source code, not observed on hardware.

Goal: in a future version, a board made in Protogames can be played on the TMB table for playtesting, with physical tokens and other physical game elements being tracked, and the projected board reacting to them.

## 1. Sources and where to find them

| Source | What it gives | Where |
|---|---|---|
| Šebele, *Tactile Matrix Box*, master thesis, FIT CTU 2022 (supervisor R. Richtr) | Hardware, geometry, tracker/SDK design, TUIO choice, Hydropolis lessons | [DSpace](https://dspace.cvut.cz/handle/10467/101139), open access |
| `tmb-city` (student project "Cityscape") | Working Python TUIO consumer, two builds of Šebele's C++ tracker, setup guide | `gitlab.fit.cvut.cz/gglab/tmb-city` (login needed) |
| `tmb-pipes` (student project "Pipes") | Unity game consuming tracker data over TCP, InTab-based top-camera variant | `gitlab.fit.cvut.cz/gglab/tmb-pipes` (login needed) |
| [InTab](https://github.com/dodolab/InTab) (A. Vesecký, 2012) | Marker-free contour recognition, used by the Pipes variant | GitHub, MIT |
| Radek Richtr (ggLab contact) | The archive the notes below were extracted from | local copy only, not part of this repository |

Šebele's original SDK (`sdk/src`, Unity plugin) exists only on the medium attached to the thesis; the two student projects contain tracker builds derived from it. Anything quoted below as "the tracker" is the `thesis-tracker` build from `tmb-city`.

## 2. The physical table (from the thesis, design values)

| Item | Value |
|---|---|
| Projection surface | 100 × 62.5 cm (16:10), 6 mm tempered glass; height 85 cm |
| Projector | Optoma ML1050ST+, 1280 × 800 @ 60 Hz, short throw, mounted on the table's removable top frame ("hat") |
| Tracking camera | OV2710-based USB camera under the glass, IR-pass filter (about 850 nm) plus IR illumination; tracks markers on the **underside** of objects |
| Computer | Raspberry Pi 4 or Intel NUC inside the table; table has a gigabit switch for daisy-chaining up to 4 neighbours |
| Marker type | ArUco 4×4 (OpenCV) |
| Other | Optional removable tabletop above the projection surface to keep untracked objects; wheels |

Caveats: these are the 2022 design values, not an inventory of today's table. The Cityscape setup actually drives the projector over HDMI as a second screen with a 1280 × 800 window, with the tracker on the same PC. The current table may also have a top camera (the Pipes variant uses one); camera models and today's calibration are unknown and must be measured.

Physical lessons from the Hydropolis installation (thesis ch. 9): glass plus short-throw projector gives chromatic dispersion; large surfaces need several cameras; a RealSense could not focus on the markers and sharpening amplified noise (jitter); transparent cards with markers in the corners allow projecting underneath them; burrs on cards scratch the projection film.

## 3. Data path today

```
IR camera ──> tracker (C++/OpenCV, ArUco) ──UDP, TUIO 1.1 / OSC──> consumer (Python, Unity, ...)
                      │ -c corners.json: 4-point rectification of the image
                      └ ArUco DICT_4X4_100
```

### 3.1 Tracker interface (`thesis-tracker`)

- Command line: `-v` camera index, `-w`/`-h` capture size (default 640 × 480), `-c` JSON with the four image corners of the table (made with the `cropper` tool), `-a`/`-p` destination (default `127.0.0.1:3333`), `-s` surface name (default: hostname).
- Structure: `Capture` → `Driver` → `Sender` classes composed in `src/tracker/main.cpp`; extra drivers/senders are cheap to add.
- Also built: `generator` (ArUco PNGs, **dictionary 4×4_50**) and `cropper`.
- Linux only as shipped (POSIX socket headers, fixed OpenCV path in CMake).

### 3.2 What is actually sent

Standard TUIO 1.1 `/tuio/2Dobj` bundles over UDP, one bundle per frame: `source` (surface name), `alive` (session ids), one `set` per object, `fseq`.

`set` fields: `sessionId, classId, x, y, a, 0, 0, 0, 0, 0` (velocities and accelerations are always 0).

| Field | Meaning in this tracker |
|---|---|
| `classId` | ArUco marker id |
| `sessionId` | counter assigned when the marker first appears |
| `x`, `y` | marker centre (mean of the 4 corners), **normalised to 0..1 of the rectified image**, origin top-left, y down |
| `a` | `atan2(dx, dy) − π/4` from corner 0 to the centre, radians. Non-standard argument order: check the sign and zero direction on the real table before trusting it |

The second build, `thesis-tracker-lukas-rotation`, is **not compatible**: dictionary `DICT_4X4_250`, `x,y` = first corner instead of the centre, `a` always 0, and the second corner is smuggled into the velocity fields. A consumer must know which build it talks to (config flag), and the marker sheet must match the dictionary.

### 3.3 Behaviour that matters for a game

- Identity is the marker id: two markers with the same id share one object; there is no per-instance identity.
- A marker missed in **one** frame is removed; when it returns it gets a new session id. There is no occlusion tolerance in the tracker.
- No explicit add/remove events in TUIO: consumers infer them from `alive`.
- UDP: packets can be lost; `fseq` lets a consumer detect that.
- Several cameras: the build deletes objects per camera, so multi-camera needs merging before removal.

## 4. What the existing consumers teach us (problems to design out)

Read in the code of `tmb-city` and `tmb-pipes`; none of this was run.

1. **Raw position drives rules immediately.** Cityscape moves/erases a tile's state the moment a marker crosses a cell border or vanishes, so jitter and a hand covering the marker rewrite the game. Needs a "stable placement" state machine (section 6.3).
2. **Cell lookup without bounds checks.** Index `floor(x / tile)` straight into an array; a value just outside the board gives a negative index, which Python silently wraps to the last row. Always test the board polygon first.
3. **Hand-tuned projector calibration.** Two scale coefficients and two offsets (`x_coef`, `y_coef`, `x_offset`, `y_offset`) hard-coded in the server. A perspective error cannot be fixed by that; use a proper homography with measured error.
4. **Fixed ids decide the type.** Cityscape divides marker ids into groups, anything above the range becomes a house. Use an explicit registry (section 6.2).
5. **TCP without framing (Pipes).** The Unity client treats each `Read` as one whole message and merges the last five messages into the current state, so a moved piece can occupy its old and new cell for several frames. Never reuse this transport; keep per-instance state.
6. **Rule data that is not enforced.** Cityscape reads `upperLimit` from its JSON and never checks it. Whatever rule schema we invent needs a validator and tests.
7. **Rotation was the untested part.** The Pipes admin guide says the simulator cannot rotate pipes. Our simulator must cover position, rotation, occlusion, loss and return.
8. **Archives were not buildable as shipped**: absolute paths in `CMakeCache.txt`, an incomplete Unity project (no scenes), an EXE whose settings point to `D:\Sp2\...`. Pin versions and keep a clean build recipe.

## 5. How this maps onto Protogames

What the app already has and can reuse (see `docs/SPECIFICATION.md`):

| Need | Existing piece |
|---|---|
| Board geometry | project file v3: each tile `polygon` has `id`, `center`, `vertices`, `bounds`, `color`, optional `object` |
| Point → tile | `GeometryNeighbors.buildLocator(polygons).locate({x, y})` in `js/geometry/neighbors.js` (grid-agnostic, handles infinite boards) |
| Adjacency / distance / paths | `buildAdjacency`, `neighborhood`, `shortestPath` in the same module |
| Board pixels → millimetres | `mmPerWorld = tileMm / tileMeasure(tile)` in `js/print.js`; the Print dialog's real tile size (default 25 mm) is already the physical scale the table needs |
| Locked play mode | `Playtest` (`js/playtest.js`), `pg:playtest` event on `window` |
| Printable tokens | Print can already output objects as cut-out tokens at real size |

What is missing: any notion of physical tokens, a transport from the tracker into the browser, a table (projector) output mode, calibration, and game rules/state. Protogames today is a drawing tool; "playing" currently only means editing is locked.

Hard constraint: a browser page cannot receive UDP, so TUIO cannot be consumed directly.

## 6. Proposed architecture

### 6.1 Components

```
tracker (existing) ─UDP/TUIO─> bridge (small local process) ─WebSocket, JSON─> Protogames "table mode" (browser, fullscreen on projector)
                                   │                                              ├ calibration (camera→table→projector)
                                   │ records/replays sessions                     ├ token registry + stable-placement filter
                                   └ also accepts a simulator                     └ game state / rules → renderer
```

- **Bridge:** reads TUIO (UDP 3333), adds `source`/`fseq` handling and timestamps, publishes JSON over a local WebSocket. This is the only part that must be native; it can be Node (the repo already uses Node for tests and builds) or Python. It is also where record/replay lives.
- **Browser:** keeps the deployment model (static page). Table mode shows only the board fullscreen, in table millimetres, on the projector display.
- **Simulator:** a bridge-compatible source driven by mouse/keyboard (drag a token, rotate, hide, drop out, bring back). Development and tests must not need the table. The first deliverable should be this simulator plus the filter below, before any hardware.

### 6.2 Token registry

A project (or sidecar file) maps `markerId → { name, kind, objectId?, unique }`. Distinguish three things the old code merges: the **physical token** (a marker id on a piece), the **game type** (what it is in the rules), and the **tracking session** (temporary). Start with unique marker ids per piece; identical pieces sharing one printed id cannot be told apart after occlusion. This is a **project format change**, so per the repo rule it needs a version bump, migration, fixture, tests and a spec update. Prefer a separate file until the shape is settled.

Marker plan: pin one dictionary for generator, tracker and registry (today 4×4_50 for printing, 4×4_100 in `thesis-tracker`, 4×4_250 in the other build; ids must stay inside the smallest). Print markers through Protogames' existing print path. Marker size versus token size is not stated in the thesis; it must be measured with the real camera (the thesis only notes marker footprint and accuracy as design concerns).

### 6.3 Observation → game input

Per tracked instance, a state machine: `candidate → placed → moving → lost → removed`.

- Rules react to **placed** and **removed**, never to raw frames. `moving` can drive a live preview only.
- `lost` keeps the last known position, flagged as not measured, and freezes any action that depends on it.
- Starting values to tune on the table (not established constants): confirm placement after about 150–250 ms of stability, tolerate occlusion about 0.5–1 s, hysteresis at tile borders and for rotation.
- Reject positions outside the board polygon before any tile lookup; two tokens in one tile is an explicit conflict state, not "last one wins".
- Board orientation: apply the table's orientation offset (needs the angle convention check in 3.2) before using `a`.

### 6.4 Calibration (two separate mappings)

1. **Camera → table (mm):** known fixed reference markers, more than the minimum four, spread over the surface; homography; reject degenerate sets. The existing `cropper` only does a manual four-point rectification of the image, not lens calibration and not projector alignment.
2. **Table → projector:** project a known pattern, measure it with a visible-light camera. Important: the tracker camera has an IR-pass filter and does **not** see the projector image, so it cannot calibrate the projection. Either use a second RGB camera or a manual/assisted step.
3. Save a profile (camera, resolution, rectification, orientation, dictionary, mm size, measured error) per setup; separate profiles for "glass, markers underneath" and "board on the table, camera on top" if both are used.
4. Verify with points that were not used for fitting and report the error in mm, including corners. Proposed targets for a first pilot (not measured): 95 % of check points within 5 mm, max 10 mm; a resting token within 2 mm of its mean.

### 6.5 Rendering

The renderer in table mode must draw in mm with the calibration transform applied. The tile size in mm comes from the same setting as printing, so a printed board and a projected board match physically. Textured/colour view and objects already exist; what is new is the transform and hiding the editing UI.

### 6.6 Other physical game elements

Dice, cards, cubes and fingers are different tracking problems. Markers cover pieces and cards (the Hydropolis cards are an example). Dice values, hidden information and touch need other sensors or manual input. Plan for "token events" first, and for a manual entry fallback (a click in the browser) for anything not tracked. A shared projection cannot hold private information per player; such rules need an explicit choice.

## 7. Staged plan

| Stage | Result | Needs the table |
|---|---|---|
| 0 | Ask the lab: current camera(s), whether an RGB top camera exists, tracker build in use, who maintains the table, permission to copy their code | no |
| 1 | Bridge with TUIO input, WebSocket JSON out, record/replay; tracker run on a laptop webcam with printed markers (the tracker needs Linux, WSL may do) | no |
| 2 | Simulator and stable-placement filter with tests (position, rotation, occlusion, loss, return, conflict) | no |
| 3 | Table mode in the browser: fullscreen, mm space, board visible, tokens shown as overlays; tile lookup by the existing locator | no |
| 4 | Calibration on the real table, profile saved, measured error | yes |
| 5 | One small playable ruleset on one board with a few unique tokens; playtest with real players, log losses and confusions | yes |
| 6 | Rules data format (and project/registry format change with migration), more element types | partly |

## 8. Open questions

- What exactly is installed now (cameras, IR, RGB, projector, PC OS/CPU)? Is the Pi still used?
- Which tracker build is the "current" one, and where is the maintained source? Is Šebele's SDK medium still available?
- Does the angle formula in the tracker match the table's orientation, and how large is the repeatable error?
- Real marker size that still tracks reliably in the corners, under glass, with the real lens and IR.
- Licence and permission for using or copying the ggLab/GitLab code (the archive itself is not in this repository).
- Whether to target one fixed table (100 × 62.5 cm) or any surface with configurable size.

## 9. Reference snippets and artefacts worth keeping (names only, in the archive)

`sources/trackers/thesis-tracker/.../src/common/{TUIOSender,ArUcoDriver,CameraCapture}.cpp`, `.../src/tracker/main.cpp`; `sources/tmb-city-main/.../server/PyServer_GridVisualization.py` and `helper_files/config.json`; `sources/sp1/.../Scripts/Runtime/TCP_Client.cs`; thesis chapters 4 (TUIO, NDI), 5 (hardware), 6 (construction), 7 (SDK), 9 (Hydropolis). TUIO 1.1 specification: https://www.tuio.org/?specification
