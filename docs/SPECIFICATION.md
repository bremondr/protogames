# Protogames specification

Reference for formats that other code (and other people's saved files) depend on. The long-form product document lives in `Protogames - Development Specification Document.md`.

## Project file format

Projects are saved as `<name>.protogames.json` and the editor also keeps every project in `localStorage` (key `protogames_project:<id>`, see "Projects in the browser") as an autosave. Both are produced and read by `js/projectFormat.js`; nothing else should build or inspect these objects by hand.

### Version

Every file has a top-level integer `version`. The current version is **7**.

| `version` in the file | Meaning |
|---|---|
| missing, or the string `"1.0"` | **v0**: written before versioning existed. Migrated to v1 on load. |
| integer `1` | migrated to v2 on load (Space/Arctic colours, see below), then to v3 |
| integer `2` | migrated to v3, v4, v5, v6, then v7 on load (only the version number changes until v5) |
| integer `3` | migrated to v4, v5, v6, then v7 on load |
| integer `4` | migrated to v5 (a square board becomes a rectangle, see below), then v6 and v7 on load |
| integer `5` | migrated to v6 (no players and the standard dice, see "Playtest data"), then v7 on load |
| integer `6` | migrated to v7 on load: gets the centre its board always had written down, see "Boards built from the middle" |
| integer `7` | current format |
| integer greater than the app's current version | rejected: "saved by a newer version of Protogames, update to open it" |
| anything else (`1.5`, `-1`, `"abc"`, `null`, ...) | rejected as unreadable |

### Project file (v7)

```jsonc
{
  "version": 7,
  "projectName": "my board",
  "created": "2026-10-02T13:31:51.661Z",     // ISO time of the save
  "appState": {
    "boardConfig": {
      "gridType": "hexagon",                 // tile shape: hexagon | square | triangle
      "boardShape": "hexagon",               // hexagon | rectangle | triangle | circle | infinite | country
      "orientation": "pointy-top",           // pointy-top | flat-top (hexagon tiles / boards)
      "triangleOrientation": "point-up",     // point-up | point-down (triangle boards, or the triangle a board is built around)
      "center": "tile",                      // tile | point: what a hexagon or circle board is built around (see "Boards built from the middle")
      "width": 11, "height": 11,             // columns / rows (derived from radius or size for some shapes)
      "radius": 5, "size": 10
    },
    "currentColor": "#2D5016",               // selected swatch
    "paletteId": "landscape",                // selected palette
    "isEraserActive": false,
    "autoSaveEnabled": true,
    "players": [                             // playtest: who plays, see "Playtest data"
      { "color": "#c62828", "seat": "bottom", "pieces": [{ "kind": "pawn", "count": 4 }] }
    ],
    "dice": [{ "sides": 6 }],                // playtest: the dice of the design (the standard set d3 to d20 by default)
    "polygons": [                            // one entry per tile
      {
        "id": "hex_0_-5",                    // unique, stable for a given board layout
        "type": "hexagon",
        "center": { "x": 293.1, "y": 89 },
        "vertices": [{ "x": 321.7, "y": 72.5 } /* ... at least 3 */],
        "bounds": { "minX": 0, "maxX": 0, "minY": 0, "maxY": 0 },
        "color": "#7CB342",                  // tile colour (also identifies its texture)
        "object": "castle",                  // optional: placed object id
        "start": "#c62828"                   // optional: start marker, a player colour (see "Playtest data")
      }
    ]
  }
}
```

The autosave has the same shape except it carries `timestamp` (milliseconds since the epoch) instead of `created`.

### Loading

`ProjectFormat.parse(textOrObject)`:

1. parses JSON text (error: "not valid JSON");
2. detects the version (see above);
3. migrates one version at a time until it is current (`MIGRATIONS[n]` upgrades v*n* to v*n+1*);
4. fills in a tile's `bounds` from its vertices when an older file left them out, then validates the result: board settings (`width`/`height` 1 to 201, `radius`/`size` 0 to 100, `orientation` and `triangleOrientation` one of the known values when present) and every tile (id, 3 to 64 finite vertices, centre, finite `bounds`, colour as `#rgb` or `#rrggbb`, optional object id of 1 to 200 characters; ids unique; an infinite board has at least one tile);
5. returns the project, or throws a `ProjectFormatError` whose `message` is meant for users and whose `code` is one of `not-json`, `not-a-project`, `bad-version`, `newer-version`, `invalid`, `no-migration` or `bad-migration`. The last two are developer errors rather than file problems: `no-migration` means `MIGRATIONS` has no step for a version the file claims (a missing step after bumping `CURRENT_VERSION`), and `bad-migration` means a step ran but did not set `version` to the next number.

These limits only turn away files the app cannot have written (they would crash or hang it, or put markup into an exported SVG), so they changed no format version; `tests/projectFormat.test.js` checks that every fixture and showcase still loads and lists the hostile cases. Parsing never mutates its input. The editor shows these messages in a dialog when a file is opened, and when an autosave from a newer version (or a damaged one) cannot be restored.

### Changing the format

1. Bump `CURRENT_VERSION` in `js/projectFormat.js`.
2. Add `MIGRATIONS[oldVersion]`, a function that returns the upgraded project and sets `version`.
3. Extend `validate` for any new required fields.
4. Add a fixture from the **old** format to `tests/fixtures/` and a test for the new migration step in `tests/projectFormat.test.js`.
5. Update this document and the history below.

Migrations are frozen history: do not edit one after it has been released, and do not read live app configuration inside them.

### History

| Version | Change |
|---|---|
| 0 | Unversioned files (`version` absent or `"1.0"`). |
| 1 | Integer `version`. Migration fills `projectName`, `paletteId`, `isEraserActive`, `autoSaveEnabled`, tile `color` when missing and drops `object: null`. Validation became strict. |
| 2 | The Space and Arctic palettes were redesigned. The structure is unchanged; migration remaps tile colours (and the selected colour) that no longer exist, see "v1 to v2 colour map". |
| 3 | New board shape `infinite` (see "Infinite boards"). Nothing in existing projects changes; the bump makes an older app report "saved by a newer version" instead of an unknown board shape. |
| 4 | New board shape `country` (see "Country boards"). Same kind of bump: nothing in existing projects changes. |
| 5 | The board shapes `square` and `rectangle` were united: a square is a rectangle with equal sides. Migration turns `boardShape: "square"` into `"rectangle"` with `width` and `height` both set to the old `size`; the tiles are not touched. `square` is no longer a valid board shape (the **tile** shape `square` is unchanged). |
| 6 | Playtest: `appState.players` and `appState.dice`, and the optional tile field `start` (see "Playtest data"). Migration adds `players: []` and the standard dice (a frozen copy of d3, d4, d6, d8, d10, d12, d20). |
| 7 | The centre of hexagon and circle boards (`boardConfig.center`, see "Boards built from the middle"): a board is built around a tile or around the point where tiles meet, for every tile shape, and the size is counted in layers from the centre. Migration writes down the centre each board always had (triangles around a point, everything else around a tile); the tiles are not touched. |

### Playtest data

The design says *what* is played with and *where each player starts*; it never says where pieces are. Positions, rolls and the move history belong to the running game, which is never saved (see [PLAYTEST.md](PLAYTEST.md)).

**`appState.players`**: an array of at most 8 players.

| Field | Meaning |
|---|---|
| `color` | `#rgb` or `#rrggbb`; unique across players (compared without regard to case). The app offers the eight colours of `Config.PLAYER_COLORS`, but any hex colour is read. A player is identified by their colour, and start markers refer to it. |
| `seat` | The screen edge the player sits at in playtest: `bottom`, `top`, `left` or `right`. Several players may share a seat. |
| `pieces` | The player's piece set: at most four entries `{ kind, count }`, each kind (`pawn`, `disc`, `cube`, `meeple`) at most once, `count` a whole number from 1 to 500. Over all players there are at most 500 pieces. |

**`appState.dice`**: an array of at most 20 `{ sides }`, each a whole number from 2 to 1000, no two alike. An empty array means the design has no dice. Every new design starts with the standard set (3, 4, 6, 8, 10, 12 and 20 sides); there is no editor for it yet, so every file written today carries that set.

**Tile `start`** (optional): a `#rgb` or `#rrggbb` colour, normally a player's colour. One per tile; a tile may also have a terrain colour and an object. A start marker does not need a matching player (the Players panel only hints), and a tile that has one counts as drawn on an infinite board, so it is saved and kept when the view moves.

Unknown kinds or seats, repeated colours or kinds, counts outside the ranges, and anything that is not a colour are refused with a readable message. These limits cannot be exceeded by the app, so they only turn away hand-edited or hostile files.

### Country boards

`boardShape: "country"` is a rectangle of tiles cut to the outline of a real country (`js/countryBoard.js`). The outlines are Natural Earth data (public domain) from `data/countries-50m.json` (see `data/README.md`), which ships with the app. Its settings live in `boardConfig`:

| Setting | Meaning |
|---|---|
| `country` | Country name as in the outline file (for example `Czechia`), or the name of a **region** (a multi-country area such as `Balkans` or `Scandinavia`, defined in `js/countryRegions.js`); required, at most 100 characters |
| `width` | Tiles across (2 to 120); `height` is derived from the country's proportions and stored (at most 201) |
| `countryParts` | Which islands are on the board: `main` (the large ones), `nearby` (plus island chains close to the coast, the default) or `all` |
| `countryBorders` | Optional boolean for regions: `false` hides the white lines drawn on the tile edges between two countries (default: shown). Drawn on screen, in PNG exports and on printed pages; not stored per tile |
| `countryMain` | Older boolean form of `countryParts` (`true` = `nearby`, `false` = `all`); still read, not written |

Tiles keep the ids of the rectangle grid they are cut from, and a country board saves its tiles like any fixed board, so a file opens without the outlines. The outlines are only needed to *regenerate* the board (new size, window resize, share link), and are downloaded the first time that happens; until then the plain rectangle is shown and cut to shape when they arrive. Other settings of a board shape that has them (here `country`, `countryParts`, `countryBorders`, `countryMain`) are kept when a file or link is opened and dropped for boards of other shapes.

### Infinite boards

`boardShape: "infinite"` is an endless lattice of hexagon, square or triangle tiles in fixed world coordinates (`js/infinite.js`). `boardConfig.width`, `height`, `radius` and `size` are ignored. Tile ids encode the lattice position, so any tile can be rebuilt from its id alone:

| Id | Tile |
|---|---|
| `inf_hp_<q>_<r>` / `inf_hf_<q>_<r>` | hexagon, pointy-top / flat-top (axial coordinates) |
| `inf_s_<x>_<y>` | square |
| `inf_t_<i>_<j>_up` / `_down` | triangle |

Because of that, a saved file (and an autosave) of an infinite board contains **only the tiles that were drawn on** (a colour other than blank, or an object), and at least one tile so the board type survives. The blank tiles around the view are regenerated when the file is opened. Exports are framed on the drawn area, with a ring of blank tiles around it.

### v1 to v2 colour map

A tile's colour (`color`, a hex string) is its identity: it selects the texture and the label. When a palette loses a colour, tiles that used it would become flat and unlabeled, so the v1 to v2 migration maps each retired colour to its successor (case-insensitive). Colours that are still in a palette, and everything in the Landscape, Dungeon and Spaceship palettes, are untouched.

| Retired colour (palette, name) | Becomes |
|---|---|
| `#240046` (Space, Void) | `#05040A` Void |
| `#495057` (Space, Asteroid) | `#3A3530` Asteroid Belt |
| `#FFD60A` (Space, Star) | `#0D1B2A` Deep Space **plus** the object `star` (only if the tile has no object) |
| `#118AB2` (Space, Planet) | `#0D1B2A` Deep Space **plus** the object `planet` (Gas Giant; only if the tile has no object) |
| `#06FFA5` (Space, Ice), `#90E0EF` (Space, Energy) | `#7B2CBF` Nebula |
| `#B3E5FC` (Arctic, Ice) | `#D6E8F2` Frozen Ocean |
| `#0288D1` (Arctic, Deep Ice), `#01579B` (Arctic, Frozen Water) | `#1F5E86` Ocean |
| `#546E7A` (Arctic, Rock), `#37474F` (Arctic, Cave) | `#5E6B7A` Icy Peaks |
| `#BBDEFB` (Arctic, Glacier) | `#BFE3F2` Glacier |
| `#E0F7FA` (Arctic, Fresh Snow) | `#E4ECF5` Snow Hills |

`#FFFFFF` (the old Arctic "Snow") is **not** remapped: it is also the blank tile colour and the two cannot be told apart, so such tiles stay blank.

The same rule applies when a palette changes again: add a migration step that maps the retired colours, extend `tests/fixtures/` with a file in the previous format, and add the successor colours to this table. `tests/projectFormat.test.js` checks that every retired colour is really absent from the live palettes and every target colour is present.

## Projects in the browser

Every board is a **project** kept in the browser's `localStorage`, one entry per project: `protogames_project:<id>`. The value is the usual project object with a `timestamp` (see "Project file format"), so this needed no format version bump; only where it is stored changed. `<id>` is a random id (letters, digits, `-` and `_`, 6 to 64 characters; anything else is refused, so an address cannot reach other storage entries). The code is `app/js/projectLibrary.js`, a script without dependencies that the landing page loads too (both pages share one origin).

- **The editor** works on one project, named in the address: `app/?project=<id>`. Every change is saved into that entry (a stroke, a setting, every 30 s), and nothing else is touched, so any number of projects can be open in different tabs. A project open in two tabs at once is saved by whichever tab wrote last.
- **A new project must be named.** `app/` without a project (and without a share link or showcase) shows a blank board and asks for a name before anything is saved; "Back to home" leaves instead. The name is trimmed, whitespace is collapsed and it is cut to 80 characters. The Project panel in the editor renames the open project and starts another one.
- **Opening something else makes a new project and never replaces one.** A share link (`#b=`, also one pasted into an open tab), a project file and a showcase each open as a new project (named after the link, file or showcase), and the project that was open is saved first and stays as it was. So opening never asks "replace the board?" (generating a new grid over painted work still does).
- **Showcases** (`Config.SHOWCASES`, files in `app/showcases/`) are not in the editor's menu. The landing page links to one with `app/?showcase=<id>`, which opens it as a new project named after it and then replaces that address with `?project=<id>`, so a reload does not make another copy. The board-game showcases (chess, island settlers, triangle peg solitaire, Chinese checkers) are written by `node dev/build-showcases.js` from the app's own geometry, so rerun it after changing their palettes (`chess`, `island-settlers`, `classic-wood`) or layouts; `tests/showcases.test.js` checks their contents.
- **The editor's Project panel** has the name of the open project and three buttons. **Load…** opens a dialog listing the projects of the browser (the open one is marked; picking another opens it in this tab after saving the open one) and offering "Import a project file…", "New project" and a link to the home page. **Export…** opens the dialog with the tabs Print, PNG, SVG and Project file (the file download that "Save project" used to be; Ctrl+S still downloads it).
- **The landing page lists the projects** (name, board, tile count, time of the last edit, newest first). Each is a link to `app/?project=<id>`; "Delete" asks twice. A project that is missing or cannot be read opens a message in the editor and is never deleted by it; an unreadable one can be deleted from the landing page. A project from a newer version of the app is kept and reported as such.
- **Older autosaves become projects.** Versions before this kept one autosave per tab, `protogames_autosave:<tab id>`, and `protogames_autosave` before that. On start-up, in the editor and on the landing page, each readable one is copied into a project (id `recovered-<tab id>`, so doing it twice finds the project already there) and the old key is removed; an unreadable one is dropped.
- **Storage is limited** (about 5 MB per site, shared by all projects). When a save fails because it is full, the editor says so once and suggests deleting projects on the home page or saving a file.
- **Previews** (see docs/DEPLOYMENT.md) put their storage under their own prefix, on the landing page of the preview as well as in its editor, so a preview lists and saves its own projects only.

Tests: `tests/projectLibrary.test.js`, `tests/fileManager.test.js`, `tests/main.test.js` (the start-up order: share link, showcase, project, new project) and `tests/landing.test.js`.

## Share link format

A share link carries a whole board in the address hash (`#b=<payload>`), so nothing is uploaded. It is not a project file, but it holds saved data, so it is versioned too and goes through the same migrations.

The payload is JSON, deflate-compressed (`deflate-raw`) and written as base64url:

| Key | Meaning |
|---|---|
| `v` | Link version: **1** for fixed boards, **2** for infinite boards, **3** for country boards, **4** for any board with players or start markers (older apps can still open the links of the boards they know). A number higher than the app knows is rejected as "made by a newer version", and a link that describes a board shape newer than its version is refused. |
| `f` | **Project file format** the colours belong to. On opening, the link is turned into a project of this version and passed through `ProjectFormat.parse`, so a link made before a palette change migrates exactly like a saved file. |
| `n` | Project name |
| `c` | Board settings (`boardConfig`); every size must be an integer from 1 to 100 |
| `p` | Palette id |
| `k` | Distinct tile colours (`#rrggbb`) |
| `t` | One entry per tile, in generated-board order: index into `k`, base 36, dot separated |
| `ob` | Distinct object ids |
| `o` | Tiles that hold an object: `tileIndex:objectIndex` pairs (base 36), dot separated |
| `i` | Infinite boards only: the ids of the drawn tiles, dot separated, in the order of `t` and `o`. The tiles are rebuilt from the ids instead of regenerated from `c`. |
| `pl` | Only with players: `[colour, seat, [[kind, count], ...]]` per player (colour as `#rrggbb`, lower case) |
| `sc` | Only with start markers: the distinct start colours (`#rrggbb`) |
| `s` | Only with start markers: `tileIndex:colourIndex` pairs (base 36, dot separated, same tile order as `t` and `o`) |

The dice set is not in the link: every design has the standard set until it can be edited, so a link opens with it. When the dice become editable, add a key and bump `v`. A link with `pl`, `sc` or `s` but a `v` below 4 is refused, and the shapes of `pl`, `sc` and `s` are checked before the project format checks what they mean (unique colours, piece limits).

A country board link carries the country settings in `c` and regenerates the tiles from the outlines, so opening it downloads them first (an offline or failed download refuses the link with a message). Limits for `c`: width up to 120 and height up to 201 for country boards, up to 100 for others.

Tile geometry is not stored: the board is regenerated from `c`, which fixes the tile order, so `t` must have exactly one entry per generated tile (for an infinite board, per id in `i`). Anything unexpected (wrong version, bad colour, out-of-range index, size mismatch) is refused with a message instead of opening a damaged board. The payload is inflated through a reader that stops at 2 MB of output, the settings and tile count are checked before any tile is built, and the link is removed from the address before it is decoded, so a hostile link cannot hang the tab again after a reload.

Links are not capped, but the dialog warns about length: a note above 2,000 characters and a stronger one above 8,000 (rules of thumb for chat and email apps), always with a "Download project file instead" button. The link stays copyable at every size.

When the link format changes, bump `v` (and keep reading the old one), or, if only the project format changed, nothing is needed here: `f` already routes old links through the project migrations. `tests/shareLink.test.js` covers both.

## Boards built from the middle: centre and size

Hexagon and circle boards are built outwards from a centre, in **layers**. The board form asks for the tile shape first, then the board shape (a list with a small picture of every layout), then these:

- **Centre of the board** (`boardConfig.center`): `tile` builds the board around one tile, `point` around the point where tiles meet (the corner shared by three hexagons, six triangles or four squares). Only hexagon and circle boards have a centre; every other shape stores `tile`.
- **Size** (what people type) is the number of **layers from the centre**: layer 1 is the centre itself (one tile, or the tiles that meet at the middle point), and each next layer adds the tiles that share a corner with the previous one.
- **Orientation**: hexagon tiles are pointy-top or flat-top; triangles point up or down (`triangleOrientation`): the whole board for a triangle board, or the triangle a board is built around (hexagon and circle boards around a tile). Triangles built around a point are laid out as a pointy-top or flat-top hexagon (`orientation`).

| Tiles | Layer 1 (around a tile) | Layer 1 (around a point) | Layers 1, 2, 3, 4 add (around a tile) | Layers 1, 2, 3, 4 add (around a point) | Symmetry (tile / point) |
|---|---|---|---|---|---|
| Hexagons | 1 hexagon | 3 hexagons | 1, 6, 12, 18 | 3, 9, 15, 21 | 6-fold / 3-fold |
| Triangles | 1 triangle | 6 triangles | 1, 12, 24, 36 | 6, 18, 30, 42 | 3-fold / 6-fold |
| Squares | 1 square | 4 squares | a square, 2n - 1 across | a square, 2n across | 4-fold / 4-fold |

The hexagon board follows the layers exactly (a hexagon of tiles for hexagons and triangles, a square for squares clipped by the outline). The circle board keeps every tile whose centre lies within a distance of the middle, chosen so that no tile sits exactly on the edge and the board has the symmetry of the lattice at that point.

**Stored values.** The saved `radius` counts from the first ring for hexagon and square tiles (`radius` 0 is layer 1) and as the layer count for triangles (`radius` 1 is layer 1), exactly as before; the panel converts (hexagon and square tiles: layers = `radius` + 1, triangles: layers = `radius`). `width` and `height` of a hexagon or circle board are the diameter in tiles: `2 * radius + 1` around a tile, `2 * radius + 2` around a point.

**Older boards.** Before format 7 the centre was fixed by the tile shape: triangles were built around a point and everything else around a tile. The migration writes exactly that into `center`, so existing boards are unchanged. The generator also reads a missing `center` that way, so an old share link builds the same blank board before it is migrated.

## Square and rectangle boards

There is one fixed-size board shape, `rectangle` (`width` columns by `height` rows); a square board is the case where both are equal. Before project format 5 a square board was a separate shape of `size` x `size` tiles. Old files are migrated on load (see the history above). Old **share links** that name `square` still open: the generator keeps understanding the old name as a `size` x `size` rectangle, and the link then goes through the same migration (so new links and files always say `rectangle`; links of both kinds are link version 1 and older apps can open the new ones).
