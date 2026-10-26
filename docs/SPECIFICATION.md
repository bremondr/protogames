# Protogames specification

Purpose: the reference for every format and rule that other code, and other people's saved files, depend on: project files, browser storage, share links, board generation rules, theme files, export settings.

**Status:** current reference. **Last verified:** 2026-10-26 against `d6ca3be` (`main`). Part of the [documentation index](README.md). The original product requirements document is kept only as history in [archive/original-prd.md](archive/original-prd.md); where it differs from this page, this page is right. File paths below are written in full (`app/js/...`).

## Contents

1. [Project file format](#project-file-format): version, fields, loading, changing the format, history, playtest data
2. [Country boards](#country-boards) and [Infinite boards](#infinite-boards)
3. [The v1 to v2 colour map](#v1-to-v2-colour-map)
4. [Projects in the browser](#projects-in-the-browser) and [what is stored where](#what-is-stored-in-the-browser)
5. [Share link format](#share-link-format)
6. [Boards built from the middle: centre and size](#boards-built-from-the-middle-centre-and-size)
7. [Generator versions](#generator-versions) and [Square and rectangle boards](#square-and-rectangle-boards)
8. [Themes and item sets](#themes-and-item-sets)
9. [Export and print settings](#export-and-print-settings)
10. [Keyboard and focus rules](#keyboard-and-focus-rules)

## Project file format

Projects are saved as `<name>.protogames.json`, and the editor also keeps every project in `localStorage` (key `protogames_project:<id>`, see "Projects in the browser") as an autosave. Both are produced and read by `app/js/projectFormat.js`; nothing else should build or inspect these objects by hand.

### Version

Every file has a top-level integer `version`. The current version is **8** (`ProjectFormat.CURRENT_VERSION`).

| `version` in the file | Meaning |
|---|---|
| missing, or the string `"1.0"` | **v0**: written before versioning existed. Migrated to v1 on load. |
| integer `0` to `7` | older format: migrated one step at a time up to v8 on load (what each step does: see "History") |
| integer `8` | current format |
| integer greater than the app's current version | rejected: "saved by a newer version of Protogames, update to open it" |
| anything else (`1.5`, `-1`, `"abc"`, `null`, ...) | rejected as unreadable |

(An integer `0` is read as v0 as well.)

### Project file (v8)

```jsonc
{
  "version": 8,
  "projectName": "my board",
  "created": "2026-10-02T13:31:51.661Z",     // ISO time of the save
  "appState": {
    "boardConfig": {
      "gridType": "hexagon",                 // tile shape: hexagon | square | triangle
      "boardShape": "hexagon",               // hexagon | rectangle | triangle | circle | infinite | country
      "orientation": "pointy-top",           // pointy-top | flat-top (hexagon tiles / boards); the validator also reads orthogonal and diagonal, which the app has no control for (the shipped chess showcase carries orthogonal)
      "triangleOrientation": "point-up",     // point-up | point-down (triangle boards, or the triangle a board is built around)
      "center": "tile",                      // tile | point: what a hexagon or circle board is built around (see "Boards built from the middle")
      "width": 11, "height": 11,             // columns / rows (derived from radius or size for some shapes)
      "radius": 5, "size": 10,
      "generator": 2,                        // version of the tile generator that made the board (see "Generator versions")
      "country": "Czechia", "countryParts": "nearby", "countryBorders": true   // country boards only, see "Country boards"
    },
    "currentColor": "#2D5016",               // selected swatch
    "paletteId": "landscape",                // selected palette
    "isEraserActive": false,
    "autoSaveEnabled": true,                 // legacy: always written as true; its value is ignored when a file is opened
    "players": [                             // playtest: who plays, see "Playtest data"
      { "color": "#c62828", "seat": "bottom", "pieces": [{ "kind": "pawn", "count": 4 }] }
    ],
    "dice": [{ "sides": 6 }],                // playtest: the dice of the design (the standard set d3 to d20 by default)
    "polygons": [                            // one entry per tile
      {
        "id": "hex_0_-5",                    // unique, stable for a given board layout
        "type": "hexagon",
        "center": { "x": 293.1, "y": 89 },
        "vertices": [{ "x": 321.7, "y": 72.5 } /* ... 3 to 64 */],
        "bounds": { "minX": 0, "maxX": 0, "minY": 0, "maxY": 0 },
        "color": "#7CB342",                  // tile colour (also identifies its texture)
        "object": "castle",                  // optional: placed object id
        "start": "#c62828"                   // optional: start marker, a player colour (see "Playtest data")
      }
    ]
  }
}
```

`autoSaveEnabled` is a remnant of an auto-save switch that no longer exists in the editor: it is still required (a boolean) so that older apps can read newer files, new files always say `true`, and opening a file never applies it (a file that said `false` must not leave the next board unsaved).

The autosave in `localStorage` has the same shape except it carries `timestamp` (milliseconds since the epoch) instead of `created` (`ProjectFormat.createAutosave`).

### Loading

`ProjectFormat.parse(textOrObject)`:

1. parses JSON text (error: "not valid JSON");
2. detects the version (see above);
3. migrates one version at a time until it is current (`MIGRATIONS[n]` upgrades v*n* to v*n+1*);
4. fills in a tile's `bounds` from its vertices when an older file left them out or they disagree with the vertices, then validates the result: board settings (`gridType` and `boardShape` one of the known values, `center` `tile` or `point`, `width`/`height` 1 to 201 (`MAX_BOARD_SPAN`), `radius`/`size` 0 to 100 (`MAX_BOARD_DIMENSION`) when present, `orientation` one of `pointy-top`, `flat-top`, `orthogonal` or `diagonal` and `triangleOrientation` `point-up` or `point-down` when present, `generator` a whole number from 1 up to the generator this app knows: a higher one is rejected with the `newer-version` code; a country board also needs a valid `country` (non-empty, at most 100 characters), and `countryParts`, `countryBorders` and `countryMain` are checked when present), the selected colour (a string), the players (at most 8: unique colours, a seat, a piece set within its limits) and the dice (at most 20, each 2 to 1000 sides, no repeats), and every tile (id, 3 to 64 finite vertices, centre, finite `bounds` that match the vertices, colour as `#rgb` or `#rrggbb`, optional object id of 1 to 200 characters, optional `start` marker colour as `#rgb` or `#rrggbb`; ids unique; no coordinate beyond 1e7 pixels from the origin, or 1e11 on an infinite board; an infinite board has at least one tile and tile positions within its lattice bound of 1e9);
5. returns the project, or throws a `ProjectFormatError` whose `message` is meant for users and whose `code` is one of `not-json`, `not-a-project`, `bad-version`, `newer-version`, `invalid`, `no-migration` or `bad-migration`. The last two are developer errors rather than file problems: `no-migration` means `MIGRATIONS` has no step for a version the file claims (a missing step after bumping `CURRENT_VERSION`), and `bad-migration` means a step ran but did not set `version` to the next number.

These limits only turn away files the app cannot have written (they would crash or hang it, or put markup into an exported SVG), so they changed no format version; `tests/projectFormat.test.js` checks that every fixture and showcase still loads and lists the hostile cases. Parsing never mutates its input. The editor shows these messages in a dialog when a file is opened, and when a stored project from a newer version (or a damaged one) cannot be opened.

### Changing the format

1. Bump `CURRENT_VERSION` in `app/js/projectFormat.js`.
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
| 8 | The generator version (`boardConfig.generator`, see "Generator versions"): a board remembers which version of the tile generator made it and is regenerated by that version, so improving the generator never changes a saved board. Migration writes `generator: 1` (what every earlier board was made with) into every project, whatever its board shape; the tiles are not touched. |

The showcase files in `app/showcases/` are older files too (some are still version 7); they are migrated when opened, like any other file.

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

## Country boards

`boardShape: "country"` is a rectangle of tiles cut to the outline of a real country (`app/js/countryBoard.js`). The outlines are Natural Earth data (public domain) from `app/data/countries-50m.json` (see `app/data/README.md`), which ships with the app. Its settings live in `boardConfig`:

| Setting | Meaning |
|---|---|
| `country` | Country name as in the outline file (for example `Czechia`), or the name of a **region** (a multi-country area, defined in `app/js/countryRegions.js`: Europe, Scandinavia, Nordic countries, Baltic states, Benelux, British Isles, Iberian Peninsula, DACH, Visegrád Group, Balkans, Western Balkans, European Union, Caucasus, Central America, Southeast Asia, Maghreb); required, at most 100 characters |
| `width` | Tiles across: the board form takes 2 to 120 (default 24); `height` is derived from the country's proportions and stored (at most 201). A share link allows the same 120 and 201; a project file only checks 1 to 201 like any other board |
| `countryParts` | Which islands are on the board: `main` (the large ones), `nearby` (plus island chains close to the coast, the default) or `all` |
| `countryBorders` | Optional boolean for regions: `false` hides the white lines drawn on the tile edges between two countries (default: shown). Drawn on screen, in PNG and SVG exports and on printed pages; not stored per tile |
| `countryMain` | Older boolean form of `countryParts` (`true` = `nearby`, `false` = `all`); still read, not written |

Tiles keep the ids of the rectangle grid they are cut from, and a country board saves its tiles like any fixed board, so a file opens without the outlines. The outlines are only needed to *regenerate* the board (new size, window resize, share link), and are downloaded the first time that happens; until then the plain rectangle is shown and cut to shape when they arrive. Other settings of a board shape that has them (here `country`, `countryParts`, `countryBorders`, `countryMain`) are kept when a file or link is opened and dropped for boards of other shapes. A country 120 tiles across takes seconds to generate (register: A3-M18).

## Infinite boards

`boardShape: "infinite"` is an endless lattice of hexagon, square or triangle tiles in fixed world coordinates (`app/js/infinite.js`). `boardConfig.width`, `height`, `radius` and `size` are ignored. Tile ids encode the lattice position, so any tile can be rebuilt from its id alone:

| Id | Tile |
|---|---|
| `inf_hp_<q>_<r>` / `inf_hf_<q>_<r>` | hexagon, pointy-top / flat-top (axial coordinates) |
| `inf_s_<x>_<y>` | square |
| `inf_t_<i>_<j>_up` / `_down` | triangle |

Because of that, a saved file (and a stored project) of an infinite board contains **only the tiles that were drawn on** (a colour other than blank, an object or a start marker), and at least one tile so the board type survives. The blank tiles around the view are regenerated when the file is opened. Exports are framed on the drawn area, with a margin of blank tiles around it (when that area holds more than 30,000 tiles, only the drawn tiles are exported).

## v1 to v2 colour map

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

The built-in palettes today (`Config.COLOR_PALETTES`): `landscape`, `simple-nordic`, `space`, `dungeon`, `spaceship`, `arctic`, and the board-game palettes `chess`, `island-settlers` and `classic-wood`. The built-in item sets (`app/js/objects.js`): `medieval`, `space` and `simple-nordic`.

## Projects in the browser

Every board is a **project** kept in the browser's `localStorage`, one entry per project: `protogames_project:<id>`. The value is the usual project object with a `timestamp` (see "Project file format"), so this needed no format version bump; only where it is stored changed. `<id>` is a random id (letters, digits, `-` and `_`, 6 to 64 characters; anything else is refused, so an address cannot reach other storage entries). The code is `app/js/projectLibrary.js`, a script without dependencies that the landing page loads too (both pages share one origin).

- **The editor** works on one project, named in the address: `app/?project=<id>`. Every change is saved into that entry (a stroke, a setting, a player edit, a theme recolouring, and every 30 s while there are unsaved changes), and nothing else is touched, so any number of projects can be open in different tabs. Nothing is saved before the project has a name and at least one tile.
- **The same project in two tabs.** Each tab remembers the text it last read or wrote. If the stored text differs when it is about to save (another tab saved), or when the browser reports a change to that entry, the tab stops saving and asks: "Keep this tab's version" or "Load the other version". If the project was deleted elsewhere, the tab says so and offers "Save as a new project" or "Keep it unsaved".
- **A failed save is reported once** (storage full, or blocked), is retried by every stroke and the 30 s timer, and while the last save has failed, replacing the board with a file, link, showcase or another project asks for confirmation first.
- **A new project must be named.** `app/` without a project (and without a share link or showcase) shows a blank board and asks for a name before anything is saved; "Back to home" leaves instead. The name is trimmed, whitespace is collapsed and it is cut to 80 characters. The Project panel in the editor renames the open project and starts another one.
- **A board is laid out for the canvas it is opened on.** Saved tiles carry the pixel coordinates of the canvas they were drawn on, so after opening a project (from the browser, a file, a stored project or a link) the grid is generated again for the current canvas and the colours, objects and start markers are carried over by tile id; the view is reset to show the whole board. Not regenerated: an infinite board (its tiles do not depend on the canvas) and a board whose painted tiles would not all be found again by id (boards saved by older versions have other ids; they keep their saved geometry so no colour is lost; register: A3-M11). A country board is regenerated once its outlines have downloaded.
- **Opening something else makes a new project and never replaces one.** A share link (`#b=`, also one pasted into an open tab), a project file and a showcase each open as a new project (named after the link, file or showcase), and the project that was open is saved first and stays as it was. So opening never asks "replace the board?" (generating a new grid over painted work still does).
- **Start-up order** (`app/js/main.js`): a share link in the address wins; then `?showcase=<id>`; then `?project=<id>`; otherwise a new project is started and named.
- **Showcases** (`Config.SHOWCASES`, files in `app/showcases/`) are not in the editor's menu. The landing page links to one with `app/?showcase=<id>`, which opens it as a new project named after it and then replaces that address with `?project=<id>`, so a reload does not make another copy. The board-game showcases (chess, island settlers, triangle peg solitaire, Chinese checkers) are written by `node dev/build-showcases.js` from the app's own geometry, so rerun it after changing their palettes (`chess`, `island-settlers`, `classic-wood`) or layouts; `tests/showcases.test.js` checks their contents.
- **The editor's Project panel** has the name of the open project and three buttons. **Load…** opens a dialog listing the projects of the browser (the open one is marked; picking another opens it in this tab after saving the open one) and offering "Import a project file…", "New project" and a link to the home page. **Export…** opens the dialog with the tabs Print, PNG, SVG and Project file (see "Export and print settings"). **Share Link** is described below. Ctrl+S asks for a name and downloads the project file.
- **The landing page lists the projects** (name, board, tile count, time of the last edit, newest first). Each is a link to `app/?project=<id>`; "Delete" asks twice. A project that is missing or cannot be read opens a message in the editor and is never deleted by it; an unreadable one can be deleted from the landing page. A project from a newer version of the app is kept and reported as such. The list follows changes made in other tabs.
- **Older autosaves become projects.** Versions before this kept one autosave per tab, `protogames_autosave:<tab id>`, and `protogames_autosave` before that. On start-up, in the editor and on the landing page, each readable one is copied into a project (id `recovered-<tab id>`, or `recovered-legacy`, so doing it twice finds the project already there; a newer autosave replaces an older project of that id) and the old key is removed; an unreadable one is dropped, and one that could not be copied (storage full) is left where it is. The editor says how many were recovered.
- **Storage is limited** (about 5 MB per site, shared by all projects, themes and settings). A project stores the full geometry of every tile, so the biggest boards do not fit (register: A3-L4). When a save fails because it is full, the editor says so once and suggests deleting projects on the home page or saving a file.
- **Previews** (see [DEPLOYMENT.md](DEPLOYMENT.md)) put their storage under their own prefix, on the landing page of the preview as well as in its editor, so a preview lists and saves its own projects only.

Tests: `tests/projectLibrary.test.js`, `tests/fileManager.test.js`, `tests/main.test.js` (the start-up order: share link, showcase, project, new project) and `tests/landing.test.js`.

### What is stored in the browser

Everything the app keeps is in `localStorage` (no cookies, no `sessionStorage`, no IndexedDB). Every access is wrapped so that blocked storage never stops the app.

| Key | Holds | Code |
|---|---|---|
| `protogames_project:<id>` | one project (see above) | `app/js/projectLibrary.js` |
| `protogames_autosave`, `protogames_autosave:<tab id>` | legacy autosaves of older versions: read once, copied into projects and removed | `app/js/projectLibrary.js` (`importLegacy`) |
| `protogames_custom_themes` | imported and edited tile themes and item sets (see "Themes and item sets") | `app/js/themeManager.js` |
| `protogames_export` | the Export dialog's last tab and the PNG and SVG options | `app/js/exportDialog.js` |
| `protogames_print` | the print settings | `app/js/exportDialog.js` |
| `protogames_panels` | JSON array of the ids of the sidebar panels that are folded | `app/js/panels.js` |
| `protogames_minimap` | `on` or `off`; absent: on, except on windows narrower than 700 px | `app/js/viewControls.js` |
| `protogames_color_view` | `on` for the colours-only view, `off` for textures | `app/js/viewControls.js` |
| `protogames_eraser_size` | the eraser's own size, 1 to 7 | `app/js/interactions.js` |

Selected tool, palette and brush size are not remembered between sessions, except through the open project (`currentColor`, `paletteId`, `isEraserActive`). A preview prefixes every key with `preview:pr-<n>:`.

## Share link format

A share link carries a whole board in the address hash (`#b=<payload>`), so nothing is uploaded. It is not a project file, but it holds saved data, so it is versioned too and goes through the same migrations. The link is the page address (origin and path, without the sender's query such as `?project=<id>`) plus the hash, so a link made on a preview opens on that preview.

The payload is JSON, deflate-compressed (`deflate-raw`) and written as base64url:

| Key | Meaning |
|---|---|
| `v` | Link version: **1** for fixed boards, **2** for infinite boards, **3** for country boards, **4** for any board with players or start markers, **5** for circle boards (they carry `g`); a link takes the highest version its board needs (`LINK_VERSION` is 5), and older apps can still open the links of the boards they know. A number higher than the app knows is rejected as "made by a newer version", and a link that describes a board shape newer than its version is refused. |
| `f` | **Project file format** the colours belong to. On opening, the link is turned into a project of this version and passed through `ProjectFormat.parse`, so a link made before a palette change migrates exactly like a saved file. |
| `n` | Project name |
| `c` | Board settings (`boardConfig`) without the generator, which travels as `g`; `radius`, `size`, `width` and `height` must be integers from 1 up to 100 (`ProjectFormat.MAX_BOARD_DIMENSION`) for `radius` and `size`, and up to 201 (`MAX_BOARD_SPAN`) for `width` and `height`, because a hexagon board of radius 100 is 201 tiles wide (a radius of 0, which a file accepts, is not accepted in a link) |
| `p` | Palette id |
| `k` | Distinct tile colours (`#rrggbb`; `#rgb` is accepted on the way in) |
| `t` | One entry per tile, in generated-board order: index into `k`, base 36, dot separated |
| `ob` | Distinct object ids |
| `o` | Tiles that hold an object: `tileIndex:objectIndex` pairs (base 36), dot separated |
| `i` | Infinite boards only: the ids of the drawn tiles, dot separated, in the order of `t` and `o`. The tiles are rebuilt from the ids instead of regenerated from `c`. |
| `g` | Circle boards only: the **board generator** version that made the board (an integer from 1 to the app's current generator; see "Generator versions"). A circle link without `g` was made before generator versions and is read as generator 1. Other boards carry none (their tiles do not depend on it), so their links stay readable by older apps. A `g` that is not a whole number from 1 up, or a link below version 5 that has one, is refused as unrecognised; a `g` above the app's generator is refused as "made by a newer version". |
| `pl` | Only with players: `[colour, seat, [[kind, count], ...]]` per player (colour as `#rrggbb`, lower case) |
| `sc` | Only with start markers: the distinct start colours (`#rrggbb`) |
| `s` | Only with start markers: `tileIndex:colourIndex` pairs (base 36, dot separated, same tile order as `t` and `o`) |

The dice set is not in the link: every design has the standard set until it can be edited, so a link opens with it. When the dice become editable, add a key and bump `v`. A link with `pl`, `sc` or `s` but a `v` below 4 is refused, and the shapes of `pl`, `sc` and `s` are checked before the project format checks what they mean (unique colours, piece limits). The link also does not carry custom themes or item sets: the colours and object ids travel, but the pictures do not, so the dialog notes that others will see flat colours or missing items unless they import the same theme.

A country board link carries the country settings in `c` and regenerates the tiles from the outlines, so opening it downloads them first (an offline or failed download, or one that takes more than 8 s, refuses the link with a message). Limits for `c`: width up to 120 and height up to 201 for country boards, up to 201 for others.

Tile geometry is not stored: the board is regenerated from `c`, which fixes the tile order, so `t` must have exactly one entry per generated tile (for an infinite board, per id in `i`). A circle link whose tile count does not match the board this version generates (it was made with a different generator) is refused with "This link does not match the board this version of Protogames generates (it was made with a different board generator)"; other boards say "Board size mismatch". Anything unexpected (wrong version, bad colour, out-of-range index, size mismatch) is refused with a message instead of opening a damaged board. A link is also refused when its board would have more than **20,000 tiles** (the settings are estimated first, so the grid is never built for a huge one); the Share dialog says "too many tiles for a link" instead of making one, and offers the project file. The payload is inflated through a reader that stops at 2 MB of output, the settings and tile count are checked before any tile is built, and the link is removed from the address before it is decoded, so a hostile link cannot hang the tab again after a reload.

A link in the address when the editor starts, or pasted into an already open tab (only the hash changes), opens as a new project. A link pasted on the landing page (root address with `#b=`) is forwarded to `app/` with the same query and hash.

Links are not capped in length, but the dialog warns: a note above 2,000 characters and a stronger one above 8,000 (rules of thumb for chat and email apps), always with a "Download project file instead" button. The link stays copyable at every size.

When the link format changes, bump `v` (and keep reading the old one), or, if only the project format changed, nothing is needed here: `f` already routes old links through the project migrations. `tests/shareLink.test.js` covers both.

## Boards built from the middle: centre and size

Hexagon and circle boards are built outwards from a centre, in **layers**. The board form asks for the tile shape first, then the board shape (a list with a small picture of every layout), then these:

- **Centre of the board** (`boardConfig.center`): `tile` builds the board around one tile, `point` around the point where tiles meet (the corner shared by three hexagons, six triangles or four squares). Only hexagon and circle boards have a centre; every other shape stores `tile`.
- **Size** (what people type) is the number of **layers from the centre**: layer 1 is the centre itself (one tile, or the tiles that meet at the middle point), and each next layer adds the tiles that share a corner with the previous one.
- **Orientation**: hexagon tiles are pointy-top or flat-top; triangles point up or down (`triangleOrientation`): the whole board for a triangle board, or the triangle a board is built around (hexagon and circle boards around a tile). Triangles built around a point are laid out as a pointy-top or flat-top hexagon (`orientation`; the circle of triangles is not rotated by it, so the control is not shown for it).

| Tiles | Layer 1 (around a tile) | Layer 1 (around a point) | Layers 1, 2, 3, 4 add (around a tile) | Layers 1, 2, 3, 4 add (around a point) | Symmetry (tile / point) |
|---|---|---|---|---|---|
| Hexagons | 1 hexagon | 3 hexagons | 1, 6, 12, 18 | 3, 9, 15, 21 | 6-fold / 3-fold |
| Triangles | 1 triangle | 6 triangles | 1, 12, 24, 36 | 6, 18, 30, 42 | 3-fold / 6-fold |
| Squares | 1 square | 4 squares | not offered: the sidebar blocks square tiles on a hexagon board (see below) | not offered | 4-fold / 4-fold |

The hexagon board follows the layers exactly: a hexagon of tiles for hexagons and triangles. Squares cannot fill a hexagon, so the sidebar switches the hexagon board shape off for square tiles (a board that had it falls back to a rectangle). Asked directly, the generator clips the squares to the hexagon outline: layers 1 to 4 hold 1, 7, 19 and 37 tiles around a tile and 4, 12, 28 and 48 around a point (not "a square, 2n - 1 across", which is what a rectangle of squares would give). The circle board keeps every tile whose centre lies within a distance of the middle, chosen so that no tile sits exactly on the edge and the board has the symmetry of the lattice at that point. With triangle tiles, a tile at the rim that would touch only one other tile (or none) sticks out as a spike and is left out; this repeats until every tile touches at least two others (a board of one triangle excepted). Ids are not changed, only fewer tiles exist: a board saved earlier keeps its tiles, and when its grid is regenerated (a window resize) the colours of the spikes that are no longer there go with them. For the exact counts of every combination see [TILE_GENERATION_EXPLANATION.md](TILE_GENERATION_EXPLANATION.md).

**Stored values.** The saved `radius` counts from the first ring for hexagon and square tiles (`radius` 0 is layer 1) and as the layer count for triangles (`radius` 1 is layer 1), exactly as before; the panel converts (hexagon and square tiles: layers = `radius` + 1, triangles: layers = `radius`). `width` and `height` of a hexagon or circle board are the diameter in tiles: `2 * radius + 1` around a tile, `2 * radius + 2` around a point.

**Older boards.** Before format 7 the centre was fixed by the tile shape: triangles were built around a point and everything else around a tile. The migration writes exactly that into `center`, so existing boards are unchanged. The generator also reads a missing `center` that way, so an old share link builds the same blank board before it is migrated.

## Generator versions

The tiles of a board come from a generator (`Geometry.generateGrid`) that turns the board settings into tiles with ids. A saved board is not stored only as settings: its colours, objects and start markers belong to tile **ids**, and the grid is generated again whenever the window is resized or a project is opened on another canvas. If a later release generated other tiles for the same settings, saved boards would silently lose painting. So the generator has a version, and a board remembers it.

- `boardConfig.generator` is a whole number from 1 up. `Config.GENERATOR_VERSION` (also `Geometry.GENERATOR_VERSION`) is the current one, **2**. New boards (the board controls, a new project) get the current version; `Geometry.generateGrid` reads `config.generator`, and settings without one (previews, tests) are built by the current generator. Regenerating a board (a window resize, opening a project, a showcase) passes the board's own stored settings, so an old board keeps its own generator and its tiles.
- **The rule: any change to the tiles a generator produces for existing settings is a new generator version. An old version is never edited.** Add the new behaviour under `generator >= n`, bump `Config.GENERATOR_VERSION` and extend `tests/generatorVersion.test.js` (the golden values of the old versions must keep passing). The field is already stored, so no new project format version is needed: an older app refuses a board of a generator it does not know as saved by a newer version. A change that does not alter the tiles of existing settings (speed, code structure) needs no new version.
- A project whose `generator` is above the app's is refused as saved by a newer version; `0`, negative, fractional or non-numeric values are invalid.

| Generator | What it builds |
|---|---|
| 1 | Everything the app generated before generator versions existed. Circles of hexagons scan a window of `radius + 3` tiles around the middle, which stops covering the disc at radius 23 around a tile and radius 19 around a point: from there tiles at the rim are missing. Circles of triangles drop spikes (tiles that touch fewer than two others, repeated until none is left). |
| 2 | Generator 1 plus the circle-of-hexagons fix: the scan window is `ceil((radius + 0.72) * 2 / sqrt(3)) + 2` tiles, which always covers the disc. Nothing else differs. |

Generator 2 is a superset of generator 1 with the same ids, so colours, objects and start markers carry over by id. Tile counts of a circle of hexagons (pointy-top and flat-top are equal; measured with `loadApp` on `d6ca3be`), `radius` as stored:

| Radius | Around a tile, gen 1 / gen 2 | Around a point, gen 1 / gen 2 |
|---|---|---|
| 1 | 7 / 7 | 12 / 12 |
| 5 | 109 / 109 | 120 / 120 |
| 18 | 1237 / 1237 | 1272 / 1272 |
| 19 | 1381 / 1381 | 1407 / 1413 |
| 22 | 1813 / 1813 | 1846 / 1866 |
| 23 | 1977 / 1993 | 2018 / 2046 |
| 30 | 3283 / 3367 | 3318 / 3426 |
| 50 | 8731 / 9271 | 8772 / 9336 |
| 100 | 33541 / 36601 | 33626 / 36786 |

Other board shapes and circles of triangles are the same in both versions today. Files saved by older apps than this one regenerate with generator 1 too (the pre-layers circle of hexagons, around a tile with a scan window of `radius + 2`, is a subset of generator 1, so their colours are found again by id).

**Migration.** Format 8 adds the field. `MIGRATIONS[7]` sets `boardConfig.generator = 1` on every older project (for boards other than circles of hexagons it makes no difference); fixtures `tests/fixtures/v7-circle-hexagon.protogames.json` (radius 20 around a point, where generator 2 differs) and `v7-circle-triangle.protogames.json` show it.

**Share links.** A circle link is link version 5 and carries `g` (see "Share link format"); no other board does. Old circle links without `g` open as generator 1.

## Square and rectangle boards

There is one fixed-size board shape, `rectangle` (`width` columns by `height` rows); a square board is the case where both are equal. Before project format 5 a square board was a separate shape of `size` x `size` tiles. Old files are migrated on load (see the history above). Old **share links** that name `square` still open: the generator keeps understanding the old name as a `size` x `size` rectangle, and the link then goes through the same migration (so new links and files always say `rectangle`; links of both kinds are link version 1 and older apps can open the new ones).

## Themes and item sets

A **tile theme** is a palette of terrains (a label, a colour and an optional texture picture); an **item set** is a set of placeable objects (a label and a picture). Both can be imported as files in the Themes panel, built and edited in the theme editor, and exported again. The code is `app/js/themeManager.js` (import, storage, export) and `app/js/themeEditor.js` (the dialog).

**Import.** Choose one `.json` file, or any number of pictures. The template buttons download a ready-made file; Export writes any palette or item set, built-in or custom, in the same format (`<name>.tile-theme.json`, `<name>.item-set.json`):

```jsonc
// tile theme
{ "type": "protogames-tile-theme", "name": "Swamp",
  "tiles": [ { "label": "Bog", "hex": "#4b5d3a", "image": "data:image/png;base64,... | https://..." } ] }
// item set
{ "type": "protogames-item-set", "name": "Sci-fi",
  "items": [ { "label": "Outpost", "image": "data:image/png;base64,... | https://..." } ] }
```

- `type` is written by the templates and the export but is not checked on import; the Themes panel decides which kind the file is. `name` falls back to the file name. A tile theme may call its list `colors` instead of `tiles`.
- A tile needs a `hex` colour (`#rgb` or `#rrggbb`; missing means `#cccccc`; anything else is refused with a message). `label` defaults to "Tile n", `image` is optional (without it the tile is a flat colour or the generated texture). Items need an `image`; one without a picture is dropped.
- Pictures: one or more image files become tiles or items named after the file (a tile's colour is the average colour of its picture). In JSON a picture is a `data:` URL or a web address; web addresses are fetched when the app starts and given up after 5 s (the tile keeps its flat colour, the item is skipped). The page's Content-Security-Policy allows `https:` images (see [DEPLOYMENT.md](DEPLOYMENT.md)); the fetch on every start is a known privacy limit (register: A3-L26).
- A tile's colour is its identity (see "v1 to v2 colour map"), so every colour must be unique across all palettes (and not the blank colour `#ffffff`): a colour already taken is moved to the next free one (`#4b5d3a` to `#4b5d3b`). Editing a theme recolours the painted tiles from each row's old colour to its new one.
- Ids: a tile theme becomes the palette `custom-<name>`; an item set `custom-<name>` with items `custom-<name>:<label>`, so a placed custom object id contains a colon.

**Stored** in `localStorage` key `protogames_custom_themes` as `{ "tiles": [ { id, name, tiles: [{ label, hex, image }] } ], "items": [ { id, name, items: [{ id, label, image }] } ] }`. Anything unreadable in it is ignored; a stored colour that is not a hex colour becomes grey.

**Not carried by projects or links.** A project file keeps only the colours and object ids of its tiles and the palette id. A person who opens it without the theme sees the palette missing, flat colours and absent objects, until they import the theme.

## Export and print settings

**Export…** (Project panel) opens one dialog with four tabs: Print (PDF), PNG, SVG and Project file (`app/js/exportDialog.js`; the picture and PDF code is in `app/js/exporter.js` and `app/js/print.js`). Every tab shows what the file will be before it is downloaded. The dialog opens on the tab used last. Settings are remembered per browser (`protogames_export`, `protogames_print`, see "What is stored in the browser"); textures start from the board's current view (colours only means no textures), so they are not stored. An exported picture never depends on the current zoom and pan.

| Tab | Options (default) | Limits |
|---|---|---|
| PNG | size 1x to 4x the size on screen (1x); textures (on); objects and start markers (on); grid lines (on); background transparent or white (transparent) | the scale is lowered until the longest side is at most 16,000 px |
| SVG | textures embedded as pictures (off: flat colours); objects, with start markers (off); grid lines (on); background transparent or white (transparent) | the borders between countries of a region board are always drawn |
| Project file | the `.protogames.json` file (also Ctrl+S) | |
| Print | see below | see below |

**Print** (`Print.DEFAULTS`): a PDF at a real-world tile size, one JPEG image per page, made in the browser.

| Setting | Values (default) |
|---|---|
| `mode` | `tiled`: pages for a home printer; `sheet`: one large sheet (`tiled`) |
| `tileMm` | tile size, 5 to 200 mm (25) |
| `paper` | `A4`, `Letter` or `A3`, also used for token pages (A4) |
| `orientation` | tiled pages: `auto`, `portrait`, `landscape` (auto) |
| `marginMm`, `overlapMm` | 0 to 30 mm each (10, 5) |
| `sheet` | `fit` (board plus margin), `A3`, `A2`, `A1` or `A0` (fit) |
| `cropMarks` | crop marks on a sheet (on) |
| `objects` | `board` (on their tiles), `tokens` (as cut-out tokens on separate pages) or `both` (board) |
| `textures` | print textures (on, follows the board view) |
| `labels` | page labels and assembly hints (on) |
| `startOutlines` | the coloured outline of a start tile, in every mode (on) |
| `legend`, `legendPlace` | a legend of the terrains and objects used; on a single sheet `sheet` (below the board) or `page` (separate page) (off, `sheet`) |

Print limits: at most 300 pages; a page is drawn at up to 200 dpi, lowered so that one canvas stays within 9,000 px a side and 16 million pixels (a big sheet such as A0 prints at roughly 100 dpi, and the preview warns: register: A3-L23); a sheet longer than 5,080 mm (14,400 pt) on one side warns that some PDF viewers cannot open it. Pieces from playtest are not printed; start markers are.

## Keyboard and focus rules

The shortcut list is in the app (press **?**) and in the README; these are the rules behind it (`app/js/shortcuts.js`, `app/js/focusUtils.js`, `tests/shortcuts.test.js`):

- **The app never takes Tab or Shift+Tab**, so the board is not a keyboard trap. The board canvas has `tabindex="-1"`: a click can focus it, but it is not a Tab stop.
- Shortcuts are paused while a text field, select or text area has focus, while a dialog is open, and while an input method is composing. **Ctrl/Cmd+S is the one exception** (it works in a text field, so the permanent "Project name" field does not open the browser's Save Page dialog); it does nothing during playtest. Ctrl+Z and Ctrl+Y stay with a text field.
- **Space pans** only when the key target is the page or the canvas; buttons, checkboxes, links, inputs, tabs and other widgets keep Space, as do open dialogs.
- **Esc closes one layer at a time**, topmost first: a drag or line in progress, a dialog or the help overlay, a popover or full screen, then playtest.
- Modal dialogs trap Tab inside themselves, move focus in when they open and give it back to the opener when they close.
- During playtest the editing keys are claimed and ignored; only the View and Help groups, undo and redo (which step through piece moves) and the playtest keys work (see [PLAYTEST.md](PLAYTEST.md)). Shortcuts with a modifier key never fall through to the browser.
- `V` is reserved for a Select tool that does not exist yet.
