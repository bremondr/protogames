# Protogames specification

Reference for formats that other code (and other people's saved files) depend on. The long-form product document lives in `Protogames - Development Specification Document.md`.

## Project file format

Projects are saved as `<name>.protogames.json` and the editor also keeps one copy in `localStorage` (key `protogames_autosave`) as an autosave. Both are produced and read by `js/projectFormat.js`; nothing else should build or inspect these objects by hand.

### Version

Every file has a top-level integer `version`. The current version is **1**.

| `version` in the file | Meaning |
|---|---|
| missing, or the string `"1.0"` | **v0**: written before versioning existed. Migrated to v1 on load. |
| integer `1` | current format |
| integer greater than the app's current version | rejected: "saved by a newer version of Protogames, update to open it" |
| anything else (`1.5`, `-1`, `"abc"`, `null`, ...) | rejected as unreadable |

### Project file (v1)

```jsonc
{
  "version": 1,
  "projectName": "my board",
  "created": "2026-10-02T13:31:51.661Z",     // ISO time of the save
  "appState": {
    "boardConfig": {
      "gridType": "hexagon",                 // tile shape: hexagon | square | triangle
      "boardShape": "hexagon",               // hexagon | square | rectangle | triangle | circle
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
4. validates the result: board settings, palette and colour, and every tile (id, at least 3 finite vertices, centre, colour, optional object id; ids unique);
5. returns the project, or throws a `ProjectFormatError` whose `message` is meant for users and whose `code` is one of `not-json`, `not-a-project`, `bad-version`, `newer-version`, `invalid`.

Parsing never mutates its input. The editor shows these messages in a dialog when a file is opened, and when an autosave from a newer version (or a damaged one) cannot be restored.

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
