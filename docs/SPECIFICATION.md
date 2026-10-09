# Protogames specification

Reference for formats that other code (and other people's saved files) depend on. The long-form product document lives in `Protogames - Development Specification Document.md`.

## Project file format

Projects are saved as `<name>.protogames.json` and the editor also keeps one copy in `localStorage` (key `protogames_autosave`) as an autosave. Both are produced and read by `js/projectFormat.js`; nothing else should build or inspect these objects by hand.

### Version

Every file has a top-level integer `version`. The current version is **3**.

| `version` in the file | Meaning |
|---|---|
| missing, or the string `"1.0"` | **v0**: written before versioning existed. Migrated to v1 on load. |
| integer `1` | migrated to v2 on load (Space/Arctic colours, see below), then to v3 |
| integer `2` | migrated to v3 on load (only the version number changes) |
| integer `3` | current format |
| integer greater than the app's current version | rejected: "saved by a newer version of Protogames, update to open it" |
| anything else (`1.5`, `-1`, `"abc"`, `null`, ...) | rejected as unreadable |

### Project file (v3)

```jsonc
{
  "version": 3,
  "projectName": "my board",
  "created": "2026-10-02T13:31:51.661Z",     // ISO time of the save
  "appState": {
    "boardConfig": {
      "gridType": "hexagon",                 // tile shape: hexagon | square | triangle
      "boardShape": "hexagon",               // hexagon | square | rectangle | triangle | circle | infinite
      "orientation": "pointy-top",           // pointy-top | flat-top (hexagon tiles / boards)
      "triangleOrientation": "point-up",     // point-up | point-down (triangle boards)
      "width": 11, "height": 11,             // columns / rows (derived from radius or size for some shapes)
      "radius": 5, "size": 10
    },
    "currentColor": "#2D5016",               // selected swatch
    "paletteId": "landscape",                // selected palette
    "isEraserActive": false,
    "autoSaveEnabled": true,
    "polygons": [                            // one entry per tile
      {
        "id": "hex_0_-5",                    // unique, stable for a given board layout
        "type": "hexagon",
        "center": { "x": 293.1, "y": 89 },
        "vertices": [{ "x": 321.7, "y": 72.5 } /* ... at least 3 */],
        "bounds": { "minX": 0, "maxX": 0, "minY": 0, "maxY": 0 },
        "color": "#7CB342",                  // tile colour (also identifies its texture)
        "object": "castle"                   // optional: placed object id
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
5. returns the project, or throws a `ProjectFormatError` whose `message` is meant for users and whose `code` is one of `not-json`, `not-a-project`, `bad-version`, `newer-version`, `invalid`.

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
| `v` | Link version: **1** for fixed boards, **2** when the board is infinite (older apps can still open version 1 links). A number higher than the app knows is rejected as "made by a newer version". |
| `f` | **Project file format** the colours belong to. On opening, the link is turned into a project of this version and passed through `ProjectFormat.parse`, so a link made before a palette change migrates exactly like a saved file. |
| `n` | Project name |
| `c` | Board settings (`boardConfig`); every size must be an integer from 1 to 100 |
| `p` | Palette id |
| `k` | Distinct tile colours (`#rrggbb`) |
| `t` | One entry per tile, in generated-board order: index into `k`, base 36, dot separated |
| `ob` | Distinct object ids |
| `o` | Tiles that hold an object: `tileIndex:objectIndex` pairs (base 36), dot separated |
| `i` | Infinite boards only: the ids of the drawn tiles, dot separated, in the order of `t` and `o`. The tiles are rebuilt from the ids instead of regenerated from `c`. |

Tile geometry is not stored: the board is regenerated from `c`, which fixes the tile order, so `t` must have exactly one entry per generated tile (for an infinite board, per id in `i`). Anything unexpected (wrong version, bad colour, out-of-range index, size mismatch) is refused with a message instead of opening a damaged board. The payload is inflated through a reader that stops at 2 MB of output, the settings and tile count are checked before any tile is built, and the link is removed from the address before it is decoded, so a hostile link cannot hang the tab again after a reload.

Links are not capped, but the dialog warns about length: a note above 2,000 characters and a stronger one above 8,000 (rules of thumb for chat and email apps), always with a "Download project file instead" button. The link stays copyable at every size.

When the link format changes, bump `v` (and keep reading the old one), or, if only the project format changed, nothing is needed here: `f` already routes old links through the project migrations. `tests/shareLink.test.js` covers both.
