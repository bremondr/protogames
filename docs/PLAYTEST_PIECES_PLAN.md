# Plan: players, piece sets, start markers and trays

Status: **proposal, nothing built yet.** Rewritten 2026-10-11 against `main` at 39ead4a.
The other playtest ideas live in [PLAYTEST_IDEAS.md](PLAYTEST_IDEAS.md).

## Why this first

Playtest mode today ([js/playtest.js](../js/playtest.js)) only locks editing. Nothing in it can be played, because the one thing on a board that looks like a game piece, an *object* (castle, tower, ...), is decoration stamped onto a tile (`polygon.object`). It cannot be moved and it is not a piece.

This plan adds four connected things:

- **Players** saved with the board design: a colour, a seat (which side of the screen they sit at) and a piece set ("4 pawns, 2 cubes"). Never *where* the pieces are.
- **Start markers**: tiles outlined in a player colour, painted on the map. They say where that colour's pieces begin.
- **Trays** in playtest, one per player, centred on that player's side of the canvas and rotated to face outwards, as if the screen lay flat on a table. Every piece starts in its player's tray.
- **Moving pieces**: clicking a tray piece sends it to a free start of its colour; otherwise (or any time) the player drags it wherever they like.

Dice, counters, range highlights, logs and snapshots all need either pieces or a playtest state to hang on, so this is the foundation.

## Decisions (and the reason for each)

| Question | Decision | Why |
|---|---|---|
| What does the design save? | A list of players (`color`, `seat`, `pieces`) and start markers on tiles. **No piece positions.** | The design stays about the board. Nothing in the players list refers to a tile id, so resizing, regeneration and infinite boards cannot invalidate it. |
| What is a "player"? | A colour with a seat. Colours are unique, at most 8 players. | Keeps the model small, and the colour is what start markers refer to. If turns or scores arrive later, they attach to the player (see risks). |
| How are fixed starting layouts expressed? | Start markers: a tile property holding a player colour, drawn as a coloured tile outline. | A marker is tile data like colour and object, so it survives regeneration by tile id, undoes with everything else, and is saved with the painted tile. No second reference model. |
| Where do pieces exist during play? | In a **play state** created from the players when playtest starts and never saved. Each piece instance is in its tray (`tileId: null`) or on a tile. | Playtesting must never damage the design, and trays make "reset" obvious: everything back to the trays. |
| Where is a player's tray? | Centred on the player's seat edge (`bottom`, `top`, `left`, `right`) and rotated so the content faces the person sitting there: the bottom tray upright, the top one turned 180°, the left one 90° clockwise, the right one 90° counter-clockwise. | Matches how people sit around a flat screen or table. Two players across from each other can both read their own tray. |
| How do pieces get out of the tray? | Click: goes to the first free start marker of its colour. Drag: dropped on any tile, snapping to the tile under the pointer. | Click is the fast path for the usual setup; drag is the escape hatch for anything else, including when no start is free. |
| How do pieces get back? | Drag onto any tray of that colour. | One gesture for undoing a placement. |
| Where is it edited? | In edit mode, in a players panel (add a player, pick colour and seat, add pieces). Start markers are placed with a Start tool on the map. | There is no Piece tool on the board: pieces never live on the board in the design. |
| Is the tray canvas or DOM? | DOM (buttons), rotated with CSS. | Click and keyboard work for free, screen readers get real controls, and it avoids hit-testing a second canvas layer. |
| Undo | Edit mode: start markers and players join the existing undo stack. Playtest: a separate move stack on Ctrl+Z / Ctrl+Shift+Z while playtest is on. | Editing and playing are different activities and must not undo each other. |
| Do play positions persist? | Not saved. The play state is kept in memory while the tab lives, so leaving and re-entering playtest resumes it. It is rebuilt (pieces on vanished tiles go back to their trays) if the players or the board's tiles changed. **Reset** is explicit. | Escape leaves playtest, so a confirmation on exit would be annoying and losing a game on a stray Escape would be worse. Saved positions are the snapshots idea. |

## Data model

### Players (saved)

```js
// appState.players
[ { color: '#c62828', seat: 'bottom', pieces: [ { kind: 'pawn', count: 4 }, { kind: 'cube', count: 2 } ] },
  { color: '#1565c0', seat: 'top',    pieces: [ { kind: 'pawn', count: 4 } ] } ]
```

- `color`: a hex from the fixed `PLAYER_COLORS` palette. Validated as `#rgb` / `#rrggbb` with the existing `HEX_COLOR` rule, so a later custom colour needs no migration. Unique across players.
- `seat`: `bottom`, `top`, `left` or `right`. New players get the first unused seat in the order bottom, top, left, right, and the player can change it. Two players may share a seat: their trays sit side by side, centred as a group.
- `pieces[].kind`: one of `PIECE_KINDS` in `config.js`: `pawn`, `disc`, `cube`, `meeple`. Each kind appears at most once per player.
- `pieces[].count`: integer from 1 to 500. The total over all players is at most 500.

### Start marker (saved, on the tile)

```js
polygon.start = '#c62828'   // optional, absent when there is none
```

- Same hex rule as player colours. One start per tile; a tile may also have terrain colour and an object.
- A start marker never requires its colour to belong to a player. The players panel shows a hint when it does not, and when a player has no markers, but neither blocks saving.
- `Infinite.isPainted` ([js/infinite.js:123](../js/infinite.js:123)) must also count a tile with `start`, otherwise a marker on an unpainted tile of an infinite board is dropped on save. This is a one-line change plus a test.

### Play state (not saved)

```js
state.play = {
  pieces: [ { id: 'pc_1', kind: 'pawn', color: '#c62828', tileId: null /* or a tile id */ } ],
  undo: [], redo: []
}
```

- Created from the players when playtest starts (`count` instances per entry, ids `pc_<n>`).
- `tileId: null` means "in the tray".
- Order in the array is draw order within a tile (later = on top). Several pieces may share a tile; they are drawn with a small offset, and no rule is enforced.

### Rules when tiles change

- **Resize, regenerate, shape change:** `Interactions.generateBoard` already carries colours and objects across by tile id. Carry `start` the same way. Markers on tiles that no longer exist disappear with them (they are tile data, so this is the same as losing the tile's colour today).
- **Play state:** pieces standing on tiles that no longer exist go back to their trays.
- **Editing is locked in playtest,** so the board cannot change under a running game. Playtest is never saved, so a tab restored from autosave starts in edit mode.

## Playtest behaviour in detail

### Trays

- One tray per player, centred on that player's seat edge and rotated to face outwards (see the decisions table). The pieces in the tray and its labels rotate with it; pieces on the canvas stay upright, since the board is shared.
- Pieces of the same kind in a tray are grouped with a count badge, so twelve cubes are one button, not twelve. A tray with nothing left shows an empty state ("All out") so it does not look broken.
- **Room for the trays.** Trays overlay the canvas, and the fit-to-screen view reserves a margin on every seat edge in use, so a fitted board is not hidden. Zoomed in, a tray covers part of the board, so a tray can be collapsed to a small tab showing its piece count. **Check this before building:** the tool column is hidden in playtest, but the playtest button, the zoom cluster (bottom-right) and the minimap stay, and the pill sits top-centre where a top tray would sit. The pill moves to a corner, and on phone widths the zoom cluster may need to shift when a tray is open.
- **Multi-touch.** Several players may touch at once. Today two fingers mean pan and pinch zoom. In playtest a finger that starts on a piece or a tray belongs to that drag, and only two fingers that both start on empty board pan or zoom. A second finger landing on an empty board while one is dragging a piece is ignored, so one player's drag is never cancelled by another's touch.

### Moving pieces

- **Click a tray piece:** takes one from that group and puts it on the first free start of its colour.
  - *Free* means no piece of any colour is on that tile.
  - *First* means tile order of the generated board, so the result is predictable. (Alternative if that feels arbitrary: nearest to the previous placement. Decide after trying it.)
  - If there is no free start, the piece stays in the tray and the tray reports "No free start for red" (a short message and a status for screen readers). The player then drags it.
- **Drag a piece** (from a tray or from the board) and release on a tile: it snaps to that tile. Release off the board or on a tile that does not exist (infinite boards only generate near the view): it returns to where it started. Escape during a drag cancels it.
- **Drag back to a tray** of that colour: returns the piece to its tray group. Dropping on another colour's tray returns it to where it started.
- **Reset:** all pieces back to their trays and the move history cleared. Lives in the playtest pill.
- **Pill:** shows the move count and a Reset button next to the existing "Back to editing".
- **Hit-testing:** pieces first, then tiles. A piece's hit area is its drawn bounds, at least 44 px on touch. Top piece wins on overlap.
- **Keyboard:**
  - Tray pieces are buttons: Tab to one, Enter sends it to its start. Tab order follows DOM order, which can run visually backwards in a rotated tray; check how it feels.
  - Pieces on the board are reachable with Tab, show a focus ring, and arrow keys move them to the neighbouring tile in that direction (the lazily built adjacency graph in the geometry code gives the neighbours).
  - A polite live region announces results ("Red pawn moved to row 3, column 4", "No free start for red"). The audit flagged accessibility as a weak area, so this ships with the feature.

## Edit mode behaviour

- **Players panel:** add a player (colour and seat), change them, remove one, and add or remove piece kinds with counts. Shows the total against the cap of 500, and the start-marker hints above. Lives in the side panel next to the other settings. A small diagram of the four seats makes the seat choice clear.
- **Start tool:** clicking a tile sets its start marker to the current player colour; clicking a tile that already has that colour removes it; clicking one with another colour replaces it. One click per tile, ignoring brush mode and size, exactly like the object tool. The colour comes from the players' colours.
- **Eraser:** clears the object first, then the start marker, then the terrain colour (extending the current two-step rule). Decide whether the extra step is annoying in practice; the fallback is a separate toggle on the Start tool.
- **Drawing:** the start marker is an inset coloured outline on the tile, drawn above terrain and below objects and pieces. It uses the player colour, with a thin light inner line so it stays visible on dark and on same-coloured terrain. It is visible in edit mode and in playtest.
- **Undo:** snapshots carry `start`, so painting and removing markers undo like colours and objects.

## File format change

Per the project's versioning rule this needs a bump in the same change.

1. `ProjectFormat.CURRENT_VERSION` 3 → **4**.
2. `MIGRATIONS[3]` sets `appState.players = []` when absent. Tiles need nothing: `start` is optional. Frozen history, reads no live config.
3. `validate`:
   - `appState.players`: array of at most 8; each has a valid hex `color` (unique across players), a `seat` in the whitelist, and a `pieces` array whose entries have a `kind` in the whitelist (unique per player) and an integer `count` from 1 to 500; total count at most 500.
   - Tile `start`: when present, a valid hex string.
   - Hostile input (non-array, huge counts, unknown kind or seat, markup in strings) gets a readable `ProjectFormatError`.
4. Fixture `tests/fixtures/v3-no-players.protogames.json` (a real v3 project), plus a v4 showcase in `showcases/` with players and start markers.
5. Tests in `tests/projectFormat.test.js`: v3 migrates and gets `players: []`; v4 round-trips; every validation rule above; a v4 file in an older app is rejected as "saved by a newer version" (the existing mechanism); every fixture and showcase still loads.
6. `docs/SPECIFICATION.md`: add `players` and tile `start` to the format description and a row to the history table. Mention the format change in the PR description either way.

**Autosave** uses the same payload, so no separate change.

**Share links** are a separate format. Add `pc` (distinct player colours), `pp` (players as `colorIndex:seat`, seat 0 to 3, base 36), `pk` (distinct kinds) and `ps` (pieces as `playerIndex:kindIndex:count`, base 36), plus `sc` (distinct start colours) and `s` (start markers as `tileIndex:colorIndex` pairs, base 36, same indexing as `t` and `o`, so infinite boards work through `i`). Bump the link version `v` to **3**, keep reading 1 and 2, bound counts and indices in the decoder, and add tests in `tests/shareLink.test.js`.

## Code changes by file

| File | Change |
|---|---|
| `js/config.js` | `PIECE_KINDS`, `PLAYER_COLORS`, `SEATS`, `MAX_PIECES`, `MAX_PLAYERS`. |
| `js/pieces.js` (new) | Drawing per kind (cached like `Objects`, using `TextureUtils`), piece hit-testing, offsets for shared tiles, and pure helpers testable in Node: build the play state from the players, first free start, move, return to tray, reset, sanitise against a tile-id set, default seat for a new player. |
| `js/state.js` | `state.players`, `state.play`, setters. `recordHistory` and `restoreSnapshot` carry `start`; the players list joins the snapshot (see "History"). |
| `js/renderer.js` | Start-outline layer between terrain and objects; piece layer after objects and before the line preview. Sorted by tile y, then array order. Culled to the visible area like objects. The piece being dragged is drawn last with a lift shadow. |
| `js/interactions.js` | Start tool click handling; the eraser's extra step; `generateBoard` carries `start`; playtest pointer handlers currently return early on `state.playtest`, and change to "pieces only" (hit-test, drag, snap, cancel) with the multi-touch rule above. |
| `js/viewControls.js`, `js/viewMath.js` | Fit-to-screen takes a margin per seat edge in use, so a fitted board clears the trays. Pure maths goes in `viewMath.js` and gets tests. |
| `js/infinite.js` | `isPainted` also true for a tile with `start`. |
| `js/playtest.js` | Build or resume the play state, Reset, pill additions and its new position, tray open and close. |
| `js/playtestTray.js` (new) | The DOM trays: one per player, placement and rotation by seat, groups with count badges, collapse, click and drag from a tray, drop back, live region. |
| `js/toolbar.js`, `index.html`, `styles.css` | Start tool button, players panel with the seat diagram, tray styles (rotations, safe areas, small screens). Follows how the object tool and side panel are wired. |
| `js/shortcuts.js` | Start tool key; Ctrl+Z / Ctrl+Shift+Z for moves while playtest is on (currently off); help overlay entries. |
| `js/projectFormat.js`, `js/fileManager.js`, `js/shareLink.js` | As in the format section. `serializeAppState` writes `players`. |
| `js/print.js` | Later: pieces as cut-out tokens next to objects, start outlines on the printed board. Not part of this plan. |

### History

`recordHistory` stores an array of `{ id, color, object }` per tile. Two things join it: tile `start`, and the players list.

- **A (recommended):** the snapshot becomes `{ tiles: [...], players: [...] }`, with a small `normalizeSnapshot` accepting the old array shape. `remapColors` and `discardLastStep` are adjusted. Touches `tests/state.test.js`.
- B: a parallel history kept in step. Less invasive but easy to desynchronise, which is the class of bug the audit found (H2).

The players list is at most a few dozen entries, so copying it per step is fine.

## Rollout in five pull requests

Each is small enough to review and leaves `main` working.

1. **Data and format.** Config, `pieces.js` pure helpers, `state.js` and history shape, `Infinite.isPainted`, format v4 with migration, validation, fixture, tests, spec. No UI; players and markers can only come from a file.
2. **Edit mode.** Start tool and eraser step, start outlines in the renderer, players panel with seat diagram and hints, carry-over in `generateBoard`, autosave round trip, showcase file.
3. **Play.** Play state, seat-based trays with rotation and collapse, fit margins, click-to-start, drag, drop back, piece layer, multi-touch rule, move undo/redo, Reset, pill additions.
4. **Share and accessibility.** Share-link keys (link v3) with tests, keyboard moves on the board, live region polish, help overlay and README updates.
5. **Print (optional).** Start outlines on the printed board and pieces as token pages.

## Tests

- Pure helpers (`tests/pieces.test.js`): build play state from players, first free start (none, one, several, occupied by another colour), move, return to tray, reset, sanitise after tiles vanish, cap at 500, default seat assignment.
- View maths: fit-to-screen with margins on one, two and all four edges.
- Format: as above.
- State: history with `start` and players (undo restores both), play state independent of the design, reset puts everything back in the trays.
- Interactions: the Start tool sets, replaces and removes; the eraser order; regenerate keeps markers on surviving tiles; playtest drag moves only the play state; off-board drop returns the piece; Escape cancels the drag; click with no free start leaves the piece in the tray and says so; a second touch does not cancel a drag.
- Infinite: a start marker on an unpainted tile survives save and reload.
- Share link: round trip with players and markers; hostile payloads (bad index, huge count, bad seat).
- Renderer: outline layer under objects, piece layer above them (follow `tests/renderer.test.js`).
- Manual in the preview: mouse, touch with two people at once (two simultaneous drags), stylus, keyboard only, each grid type, a country board, an infinite board, all four seats, two players on one seat, and phone width with trays open and collapsed.

## Risks and open questions

- **Screen space:** four trays plus the board on a phone is tight. Collapsible trays and fit margins are the plan; if that is not enough, show only the trays of seats in use (already the rule) and let the player tap a tab to open one.
- **Neutral pieces** (a shared bank of grey cubes) do not have a player. For now they would be a player with a seat nobody sits at. If that feels wrong, add a `neutral` seat that puts the tray in a corner. Decide when someone needs it.
- **Orientation of pieces on the canvas** is fixed. A pawn is a pawn from any side, but a meeple or a future piece with a face would look upside down to the far player. Left upright for now.
- **"First free start"** may feel arbitrary on large boards. Easy to change later because it is one pure function.
- **History shape change** is the most invasive part. Doing it in PR 1 with tests limits the blast radius.
- **Share-link length:** each marker adds a few characters. The existing length warnings apply.
- **Stacked starts** (three soldiers on one tile) are not expressible with one marker per tile. Possible later with a `count` on the marker, which is an additive field and another version bump. For now, place several markers or drag.
- **Piece kind on the marker** (the king starts here, pawns there) is also later and also additive: `start` would become `{ color, kind }`, and a migration would wrap the existing strings.
- **Several scenarios** per project are not supported: one starting layout per board. Use separate project files, or the saved-positions idea if it becomes a real need.
- **Objects as pieces:** it may be natural to let a piece use an object drawing (a castle that moves). Left out; the `kind` whitelist can grow without a migration, because old files never contain new kinds.
- **Turns and scores:** they would attach to the player, as additive fields with a version bump (see the ideas file).
