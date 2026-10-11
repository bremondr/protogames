# Playtest

Playtest turns a board design into something that can be played on: players sit around the screen, every player has a tray of pieces and dice, and pieces are moved onto and around the board. The design is never changed by playing. This page describes how it works and how it is built; the saved data is specified in [SPECIFICATION.md](SPECIFICATION.md#playtest-data).

## Using it

### Designing a game

1. **Players** (sidebar panel, **Add player**). Each player has
   - a **colour** (eight to choose from, each used by one player at most),
   - a **seat**: the screen edge they sit at (`Bottom`, `Top`, `Left`, `Right`; several players may share one), and
   - a **piece set**: how many pawns, discs, cubes and meeples they have. A design has at most 8 players and 500 pieces.
2. **Start markers** (tool bar, the square with a coloured frame; key **M**). Pick a player colour, click a tile to mark where that colour starts, click it again to clear it. A marker is drawn as a coloured outline on the tile, under objects and pieces. The eraser removes objects first, then start markers, then terrain. Painting, undo and redo treat markers like colours and objects.
3. The panel gives hints, never errors: start markers whose colour belongs to nobody, players without pieces, players without start markers (their pieces are placed by hand).

Players and start markers are saved in project files, autosaves and share links. Players are not part of the undo history (removing one is not undone with Ctrl+Z).

### Playing

Press the play button. Editing locks; the pill shows the number of moves and **Reset**.

- **Trays.** Each player has a tray at their seat, centred on that screen edge and turned to face outwards, as if the screen lay flat on a table (bottom upright, top turned 180°, left 90° clockwise, right 90° counter-clockwise). The board shrinks to leave room. Every piece starts in its tray, grouped by kind with a count. A tray folds to a title bar with the arrow button.
- **Click a piece in a tray** and it goes to the first free start marker of its colour ("free" = no piece of any colour on it; "first" = tile order of the board). With no free start the piece stays and the tray says so.
- **Drag a piece** from a tray or the board onto any tile and it stands there; onto its own tray and it returns; anywhere else (or **Esc** during the drag) it goes back to where it came from. Several pieces may share a tile; they spread out so all stay visible.
- **Several people at once.** Every finger that starts on a piece or a tray carries that piece, so two players can move pieces at the same moment. Pan and zoom still use two fingers that both start on empty board, Space + drag, middle button or the wheel.
- **Dice.** Each tray has the design's dice (the standard set d3, d4, d6, d8, d10, d12, d20). Click one to roll it; the result shows in that tray, turned with it. Rolls are not moves: **Ctrl+Z** never re-rolls.
- **Undo and redo.** **Ctrl+Z** / **Ctrl+Shift+Z** (or Ctrl+Y) step through piece moves while playtest is on.
- **Reset** puts every piece back in its tray and clears the move history and the rolls.
- **Leaving.** **Esc** or the play button returns to editing. The game is kept in memory, so entering playtest again resumes it. It starts over when the players' piece sets change or another design is opened; pieces standing on tiles that no longer exist go back to their trays.

### Keyboard and screen readers

- Tray pieces, dice and the fold buttons are real buttons: Tab to them, Enter or Space to use them (a piece goes to its start).
- Pieces on the board are in a list that only the keyboard and screen readers see: Tab to a piece (it gets a ring on the board), **arrow keys** move it to the neighbouring tile in that direction, **Delete** puts it back in its tray.
- A polite live region announces what happens ("Red pawn moved to column 4, row 3", "Blue rolled d6: 4", "No free start for Red"). Positions are read as "column c, row r": the place of the tile's centre among the board's centres, which works on every grid.
- Dice and the tumble animation respect the reduced-motion setting.

## How it is built

| Module | Role |
|---|---|
| `js/players.js` (`Players`) | Pure helpers for the design's player list: add, remove, seat, colour, counts (with the 500-piece and 8-player limits), and the panel's hints. |
| `js/play.js` (`Play`) | Pure game state: create from the players, send a piece to a free start, move, undo, redo, reset, roll a die, bring a running game up to date with the design. |
| `js/dice.js` (`Dice`) | Pure dice: a random 32-bit source (`crypto.getRandomValues` by default, replaceable in tests) and rejection sampling, so no face is favoured. |
| `js/pieces.js` (`Pieces`) | Piece drawing (pawn, disc, cube, meeple, in the style of the objects), layout of pieces sharing a tile, hit-testing, icons for trays and the drag ghost, arrow-key neighbours and tile labels. |
| `js/playersPanel.js` | The sidebar Players panel. |
| `js/playtest.js` | The mode itself: lock, pill, Reset, undo and redo of moves, announcements, building and keeping the game. |
| `js/playtestTray.js` | The trays: DOM buttons per player at their seat, dice, notes, fold buttons, click handling. |
| `js/playtestDrag.js` | Pointer drags (several at once), the ghost that follows the pointer, drops, Escape, and the keyboard list of pieces on the board. |
| `js/renderer.js` | Draws start markers (above terrain, below objects) and, in playtest, the pieces and the selection ring. |
| `js/toolbar.js`, `js/interactions.js`, `js/toolOps.js` | The Start tool: its popover, one marker per click, the eraser step. |

Design decisions worth knowing:

- **The design has no positions.** Players (colour, seat, pieces), the dice and tile start markers are saved; where pieces stand is play state (`AppState.play`), built from the players when playtest starts and never saved. That keeps the design about the board, and it means resizing, regenerating and infinite boards cannot invalidate anything saved.
- **A player is a colour.** Start markers and pieces refer to players by colour (compared without regard to case). There is no separate player id.
- **Trays are DOM, not canvas.** Click, keyboard and screen readers work for free, and rotation is plain CSS. The board gives up room with CSS variables on the workspace (`--tray-bottom` and so on), so the canvas is simply smaller and the board is laid out again by the normal resize path. Controls that sit at the screen edges (zoom, full screen, pill) move inwards by the same amount.
- **The carried piece is a ghost.** A small picture follows the pointer so a piece can cross from the board to a tray; the board hides the piece while it is carried.
- **Rolls are not moves.** Dice results live next to the move history in the game, but are never on the undo stack.
- **Players are not in the tile undo history.** The history snapshots tiles (colour, object, start marker). Keeping the players there too would have changed the shape of every snapshot for little gain.
- **Dice are saved, share links do not carry them.** The set cannot be edited yet, so every link opens with the standard set. When an editor arrives, add a key to the link and bump its version.

## Limits and known gaps

- No editor for the dice set (custom faces, other sizes), one die per roll, no modifiers or notation.
- One start marker per tile, one piece per marker; a stack of pieces on one start needs several markers or a drag. A marker cannot say which kind of piece starts there.
- Pieces are drawn upright; a piece with a "face" would look upside down to the player across the table.
- A neutral supply (a bank of grey cubes) is a player nobody sits at.
- The play state is not saved: reloading the page ends the game.
- Pieces are not in PNG or SVG exports or in the print dialog; start markers are in PNG exports and on printed boards.
- The trays are designed for tablets, laptops and larger; on a phone they are small. Collapse them to give the board room.

Ideas that are not built yet are collected in [PLAYTEST_IDEAS.md](PLAYTEST_IDEAS.md).

## Tests

`tests/dice.test.js`, `tests/players.test.js`, `tests/play.test.js` and `tests/pieces.test.js` cover the pure modules; `tests/projectFormat.test.js` the v6 migration and validation; `tests/shareLink.test.js` link version 4; `tests/interactions.test.js` and `tests/tools.test.js` the Start tool; `tests/renderer.test.js` the marker and piece layers; `tests/infinite.test.js` markers on infinite boards; `tests/shortcuts.test.js` the `M` key and undo/redo in playtest. The trays and drag handling need a browser and are checked by hand (mouse, touch with two fingers, keyboard, all four seats, shared seats).
