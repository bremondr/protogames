# Protogames specification

Reference for formats that other code (and other people's saved files) depend on. The long-form product document lives in `Protogames - Development Specification Document.md`.

## Project file format

Projects are saved as `<name>.protogames.json` and the editor also keeps one copy per tab in `localStorage` (key `protogames_autosave:<tab id>`, see "Autosave storage") as an autosave. Both are produced and read by `js/projectFormat.js`; nothing else should build or inspect these objects by hand.

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
| integer `6` | migrated to v7 on load: gets coordinate labels switched off, see "Coordinate labels" |
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
      "triangleOrientation": "point-up",     // point-up | point-down (triangle boards)
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
    "labels": { "enabled": false, "onTiles": false, "scheme": "auto", "columns": { /* ... */ }, "rows": { /* ... */ }, "placement": "straight" },  // coordinate labels, see "Coordinate labels"
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
| 7 | Coordinate labels: `appState.labels` (see "Coordinate labels"): names around the board and on the tiles, the indexing per board, and the symbols of each axis. Migration adds the settings switched off (a frozen copy of the defaults). |

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

## Autosave storage

localStorage is shared by every tab of the site, so each tab keeps its own autosave in `protogames_autosave:<tab id>` and never writes another tab's slot. The stored payload is the usual project object (see "Project file format"); only the key differs, so this needed no format version bump.

- The tab id is kept in `sessionStorage` (it survives a reload, not a new tab) and the tab holds a Web Lock `protogames-tab:<id>` while it is open; that is how other tabs tell a live slot from an orphan.
- On start-up a tab offers its own slot (after a reload), otherwise the newest orphan: the slot of a tab that crashed or was closed. Adopting an orphan moves it into the tab's own slot. Slots of tabs that are still open are never offered or deleted.
- The single key older versions used (`protogames_autosave`) is treated as an orphan and adopted once.
- Orphans that are unreadable, older than 7 days or beyond the newest 5 are deleted.
- Without Web Locks (an insecure page, an old browser) other tabs' slots are all treated as live: they are left alone, but a crashed tab's work cannot be recovered.

The choice is the pure function `AutosaveSlots.choose` (`tests/autosaveSlots.test.js`).

## Share link format

A share link carries a whole board in the address hash (`#b=<payload>`), so nothing is uploaded. It is not a project file, but it holds saved data, so it is versioned too and goes through the same migrations.

The payload is JSON, deflate-compressed (`deflate-raw`) and written as base64url:

| Key | Meaning |
|---|---|
| `v` | Link version: **1** for fixed boards, **2** for infinite boards, **3** for country boards, **4** for any board with players or start markers, **5** for any board with coordinate labels switched on (older apps can still open the links of the boards they know). A number higher than the app knows is rejected as "made by a newer version", and a link that describes a board shape newer than its version is refused. |
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
| `lb` | Only with coordinate labels switched on (around the board or on the tiles): the settings object as saved in the project (see "Coordinate labels"). Anything missing or out of range is replaced by the default on opening; a `lb` that is not an object, or a `v` below 5, is refused. A link without `lb` opens with labels off. |

The dice set is not in the link: every design has the standard set until it can be edited, so a link opens with it. When the dice become editable, add a key and bump `v`. A link with `pl`, `sc` or `s` but a `v` below 4 is refused, and the shapes of `pl`, `sc` and `s` are checked before the project format checks what they mean (unique colours, piece limits).

A country board link carries the country settings in `c` and regenerates the tiles from the outlines, so opening it downloads them first (an offline or failed download refuses the link with a message). Limits for `c`: width up to 120 and height up to 201 for country boards, up to 100 for others.

Tile geometry is not stored: the board is regenerated from `c`, which fixes the tile order, so `t` must have exactly one entry per generated tile (for an infinite board, per id in `i`). Anything unexpected (wrong version, bad colour, out-of-range index, size mismatch) is refused with a message instead of opening a damaged board. The payload is inflated through a reader that stops at 2 MB of output, the settings and tile count are checked before any tile is built, and the link is removed from the address before it is decoded, so a hostile link cannot hang the tab again after a reload.

Links are not capped, but the dialog warns about length: a note above 2,000 characters and a stronger one above 8,000 (rules of thumb for chat and email apps), always with a "Download project file instead" button. The link stays copyable at every size.

When the link format changes, bump `v` (and keep reading the old one), or, if only the project format changed, nothing is needed here: `f` already routes old links through the project migrations. `tests/shareLink.test.js` covers both.

## Square and rectangle boards

There is one fixed-size board shape, `rectangle` (`width` columns by `height` rows); a square board is the case where both are equal. Before project format 5 a square board was a separate shape of `size` x `size` tiles. Old files are migrated on load (see the history above). Old **share links** that name `square` still open: the generator keeps understanding the old name as a `size` x `size` rectangle, and the link then goes through the same migration (so new links and files always say `rectangle`; links of both kinds are link version 1 and older apps can open the new ones).

## Coordinate labels

A design can name its columns and rows, drawn outside the board like the A to H and 1 to 8 of a chess diagram, and optionally in every tile. The settings are part of the design (saved in files, autosaves and links, not in the tile undo history); the names themselves are never stored, they are computed from the board.

Two things are chosen separately: the **indexing** (how tiles get a column and a row, picked from small pictures in the panel) and the **symbols** of each axis (letters, numbers, Roman numerals, Greek letters or the user's own list).

**`appState.labels`** (required from format 7, everything off by default):

| Field | Meaning |
|---|---|
| `enabled` | `true` draws the names around the board. Infinite boards have no outside, so they never show them (the setting is kept). |
| `onTiles` | `true` writes the name of every tile in the tile (dark text on light tiles, white on dark ones; skipped when it would be unreadably small). Independent of `enabled`. |
| `scheme` | The indexing: `auto` (the board decides: the first one offered below), `grid`, `triangles`, `offset`, `doubled` or `axial`. A choice that does not fit the current board (for example `axial` on a rectangle) is ignored, not lost: it applies again when the board changes back. |
| `columns`, `rows` | One object per axis, each with the fields below. Columns and rows are independent: a chess board uses letters for one and numbers for the other. |
| `placement` | `straight`: the names of a side sit on one straight line along the board's bounding box (a leaning line is carried on along its own direction to get there). `outline`: each name sits next to the outermost tile of its line, so it follows a hexagon, circle or triangle board; an axis that counts half steps always uses the straight line. |

Per axis:

| Field | Meaning |
|---|---|
| `symbols` | `letters` (A to Z, then AA, AB, ...), `numbers`, `roman` (I, II, ... up to 3999, then numbers), `greek` (α to ω), or `custom` (the list below). |
| `custom` | The user's own list for `symbols: "custom"`: entries separated by spaces or commas, at most 100 entries of at most 4 characters, at most 200 characters in all. When the list runs out it starts again with a number behind each symbol (`x`, `y`, `x2`, `y2`). An empty list falls back to numbers. |
| `skip` | Letters left out of `letters` (Go skips `I`), at most 26 characters, case does not matter. |
| `start` | Where counting starts, an integer from -100 to 1000. For `numbers` it is the first number; for every other set it is the 1-based position of the first symbol (`start: 3` makes `C` the first letter). |
| `reverse` | `false` counts from the left (columns) or top (rows); `true` from the right or bottom. The defaults are chess style: columns `A, B, C` from the left, rows `1, 2, 3` from the bottom. |
| `top`, `bottom` (columns) / `left`, `right` (rows) | Which sides the axis is drawn on. Chess style is bottom and left. |

### The indexings

Which indexings the panel offers depends on the tile shape and the board shape, because real games label rectangular and non-rectangular hexagon boards differently. Coordinates come from the tile geometry, never from the board shape or the tile ids.

| Tile and board | Indexings offered (the first is the default) |
|---|---|
| Square tiles, any board | `grid` |
| Triangle tiles, any board | `triangles` |
| Hexagon tiles on a rectangle or country board | `offset`, `doubled` |
| Hexagon tiles on a hexagon, circle or triangle board | `axial`, `doubled` |
| Infinite board | none (no labels) |

- **`grid`**: every column and row is a straight line.
- **`triangles`**: rows are the bands of triangles and every triangle is a column step (two per triangle side).
- **`offset`**: the shifted rows (pointy-top tiles) or columns (flat-top tiles) are counted like the others, so a shifted row starts at the same number as the rows around it. The other axis zigzags.
- **`doubled`**: one axis counts half steps, as on 18xx railway maps: pointy-top tiles keep straight rows and number the half-columns, flat-top tiles keep straight columns and number the half-rows, so the numbers of that axis skip by two (a column holds 1, 3, 5, its neighbour 2, 4, 6). Its names are shared between the two sides: the lines that reach the first column or row go on the first side, the others on the second (one side alone shows them all).
- **`axial`**: two families of straight lines, as on Abalone: pointy-top tiles have horizontal rows and diagonals leaning down to the right; flat-top tiles have vertical columns and leaning rows. A number is the index of a line, it does not restart on each line, so shorter lines start at higher numbers (on a hexagon board the top row holds the highest diagonals).

When lines are closer together than a name is tall, every n-th name is drawn so they never overlap.

The names are drawn by `Renderer.paint`, so they appear on screen, in PNG export (inside the margin around the board) and anywhere else that paints through it. They are not in SVG export and not yet in Print (the printed board is cut to the tiles). With labels on (around the board or on the tiles), playtest announces a position as `B7` instead of "column 2, row 7"; two numeric parts are joined with a comma (`3, 7`).

### Changing the labels

Validation lives in `ProjectFormat` (a file that breaks a limit is refused with a message); the panel and links go through `Labels.normalize`, which makes any input valid instead (an unknown symbol set or indexing falls back, numbers are clamped, lists are cut). `tests/labels.test.js` checks that the two agree. The migration default, `Config.DEFAULT_LABELS` and `Labels.defaults()` must stay the same; a test compares them.
