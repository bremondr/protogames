# Playtest

Purpose: how playtest works for the people using it and for the people changing it. Playtest turns a board design into something that can be played on: players sit around the screen, every player has a tray of pieces and dice, and pieces are moved onto and around the board. The design is never changed by playing.

**Status:** current reference. **Last verified:** 2026-10-26 against `d6ca3be` (`main`). The saved data is specified in [SPECIFICATION.md](SPECIFICATION.md#playtest-data); ideas that are not built are in [research/playtest-ideas.md](research/playtest-ideas.md) and the proposal for secret screens in [proposals/playtest-secret-screens.md](proposals/playtest-secret-screens.md). Part of the [documentation index](README.md).

## Using it

### Designing a game

1. **Players** (sidebar panel, **Add player**). Each player has
   - a **colour** (eight to choose from, each used by one player at most),
   - a **seat**: the screen edge they sit at (`Bottom`, `Top`, `Left`, `Right`; several players may share one), and
   - a **piece set**: how many pawns, discs, cubes and meeples they have. A design has at most 8 players and 500 pieces.

   A new player gets the first free colour, the first free seat (seats are handed out again in turn once all four are taken) and four pawns. A kind set to 0 is removed from the set.
2. **Start markers** (tool bar, the square with a coloured frame; key **M**). Pick a player colour, click a tile to mark where that colour starts, click it again to clear it. A marker is drawn as a coloured outline on the tile, under objects and pieces. The eraser removes objects first, then start markers, then terrain. Painting, undo and redo treat markers like colours and objects.
3. The panel gives hints, never errors: start markers whose colour belongs to nobody, players without pieces, players without start markers (their pieces are placed by hand).

Players and start markers are saved in project files, stored projects and share links. Players are not part of the undo history (removing one is not undone with Ctrl+Z).

### Playing

Press the play button. Editing locks; the pill shows the number of moves (or "Editing is locked" while there is no game) and **Reset**. Without a running game the pill fades after ten seconds; with one it stays. While locked, the editing keys and Ctrl+S do nothing; zoom, pan, undo and redo (of piece moves), the help overlay and the playtest keys work.

- **Trays.** Each player has a tray at their seat, centred on that screen edge and turned to face outwards, as if the screen lay flat on a table (bottom upright, top turned 180°, left 90° clockwise, right 90° counter-clockwise). The board shrinks to leave room. Several trays on one edge sit side by side, the group centred on the edge. Every piece starts in its tray, grouped by kind with a count. The arrow button folds a tray to a strip that keeps the name, the dice and the last result (the pieces are hidden); the dice stay usable. On a small screen trays fold by themselves, side trays first, until the board is at least about 260 px wide and high (a phone in portrait with trays on both sides folds both); unfolding a tray yourself keeps it open and folds the others around it.
- **Tap or click a piece in a tray** and it goes to the first free start marker of its colour ("free" = no piece of any colour on it; "first" = tile order of the board). With no free start the piece stays and the tray says so. Pieces, dice and the fold buttons act when the finger or mouse button is released, so two people tapping at the same moment both get their action; Enter and Space on a focused button do the same.
- **Drag a piece** from a tray or the board onto any tile and it stands there; onto its own tray and it returns; anywhere else it goes back to where it came from (and a screen reader is told). **Esc** during a drag cancels it completely: nothing moves, and releasing the button or finger afterwards does nothing, not even a click on the tray piece. Several pieces may share a tile; they spread out so all stay visible.
- **Several people at once.** Every finger that starts on a piece or a tray carries that piece, so two players can move pieces at the same moment. Pan and zoom still use two fingers that both start on empty board, Space + drag, middle button or the wheel.
- **Dice.** Each tray has the design's dice (the standard set d3, d4, d6, d8, d10, d12, d20). Click one to roll it; the result shows in that tray, turned with it, also when the tray is folded. On a small screen the dice are one row that scrolls sideways. Rolls are not moves: **Ctrl+Z** never re-rolls. Dice are drawn from the browser's secure random source, with no face favoured.
- **Undo and redo.** **Ctrl+Z** / **Ctrl+Shift+Z** (or Ctrl+Y) step through piece moves while playtest is on; the history keeps the last 200 moves.
- **Reset** puts every piece back in its tray and clears the move history and the rolls.
- **Leaving.** **Esc** or the play button returns to editing (a drag in progress is cancelled first). The game is kept in memory, so entering playtest again resumes it. It starts over when the players' colours or piece sets change, or when another design is opened (a file, link, showcase or project); a change of seat does not restart it, and pieces standing on tiles that no longer exist go back to their trays.

### Keyboard and screen readers

- Tray pieces, dice and the fold buttons are real buttons: Tab to them, Enter or Space to use them (a piece goes to its start).
- Pieces on the board are in a list that only the keyboard and screen readers see: Tab to a piece (it gets a ring on the board), **arrow keys** move it to the neighbouring tile in that direction, **Delete** or **Backspace** puts it back in its tray. On an infinite board the list also holds pieces whose tile is not loaded at the moment (panned out of view); it follows the view when a pan or zoom ends. Such a piece cannot be moved with the arrows until it is back in view; Delete or Backspace still works.
- A polite live region announces what happens ("Red pawn moved to column 4, row 3", "Blue rolled d6: 4", "No free start for Red", "Red pawn was put back where it was" after a drop that changed nothing, "Move undone", "Game reset"). Positions are read as "column c, row r": the place of the tile's centre among the board's centres, which works on every grid. On an infinite board the position is the tile's lattice position counted from the origin tile (column 0, row 0, negative to the left and above), read from the tile's id, so it does not change when the board is panned.
- Dice and the tumble animation respect the reduced-motion setting.
- The app never takes Tab; see "Keyboard and focus rules" in [SPECIFICATION.md](SPECIFICATION.md#keyboard-and-focus-rules).

## How it is built

| Module | Role |
|---|---|
| `app/js/players.js` (`Players`) | Pure helpers for the design's player list: add, remove, seat, colour, counts (with the 500-piece and 8-player limits), and the panel's hints. |
| `app/js/play.js` (`Play`) | Pure game state: create from the players, send a piece to a free start, move, undo, redo, reset, roll a die, bring a running game up to date with the design. |
| `app/js/dice.js` (`Dice`) | Pure dice: a random 32-bit source (`crypto.getRandomValues` by default, replaceable in tests) and rejection sampling, so no face is favoured. |
| `app/js/pieces.js` (`Pieces`) | Piece drawing (pawn, disc, cube, meeple, in the style of the objects), layout of pieces sharing a tile, hit-testing, icons for trays and the drag ghost, arrow-key neighbours and tile labels. |
| `app/js/playersPanel.js` | The sidebar Players panel. |
| `app/js/playtest.js` | The mode itself: lock, pill, Reset, undo and redo of moves, announcements, building and keeping the game. |
| `app/js/playtestTray.js` | The trays: DOM buttons per player at their seat, dice, notes, fold buttons, click handling. |
| `app/js/playtestDrag.js` | Pointer drags (several at once), the ghost that follows the pointer, drops, Escape, and the keyboard list of pieces on the board. |
| `app/js/renderer.js` | Draws start markers (above terrain, below objects) and, in playtest, the pieces and the selection ring. |
| `app/js/toolbar.js`, `app/js/interactions.js`, `app/js/toolOps.js` | The Start tool: its popover, one marker per click, the eraser step. |

Design decisions worth knowing:

- **The design has no positions.** Players (colour, seat, pieces), the dice and tile start markers are saved; where pieces stand is play state (`AppState.play`), built from the players when playtest starts and never saved. That keeps the design about the board, and it means resizing, regenerating and infinite boards cannot invalidate anything saved.
- **A player is a colour.** Start markers and pieces refer to players by colour (compared without regard to case). There is no separate player id.
- **Actions run on pointer release.** A click is not produced when two fingers lift together, so tray buttons act on `pointerup` (the control the pointer went down on, found again by its key if another tray was redrawn meanwhile) and the click that follows within a second is ignored. A click with nothing before it (Enter, Space, a screen reader) acts. A drag cancelled with Esc remembers its pointer and swallows the release and its click, because the captured tray button would otherwise still receive it.
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
- Pieces are not in PNG or SVG exports or in the print dialog; start markers are (PNG and SVG with "Objects and start markers", print with "Start outlines").
- No Select tool, counters, turn tracker or action log.
- The trays are designed for tablets, laptops and larger. On a phone they fold themselves to keep a board of about 260 px, which a landscape phone (about 270 px of height) cannot always give (register: A3-L47).

## Tests

`tests/dice.test.js`, `tests/players.test.js`, `tests/play.test.js` and `tests/pieces.test.js` cover the pure modules; `tests/projectFormat.test.js` the v6 migration and validation; `tests/shareLink.test.js` link version 4; `tests/interactions.test.js` and `tests/tools.test.js` the Start tool; `tests/renderer.test.js` the marker and piece layers; `tests/infinite.test.js` markers on infinite boards; `tests/shortcuts.test.js` the `M` key and undo/redo in playtest. `tests/playtestUi.test.js` covers the labels on infinite boards, the rule that folds trays on a small screen and the drag handling (Escape, taps, announced drops) against a stub DOM. Real pointer behaviour (pointer capture, two fingers, layout at phone sizes, folded strips) needs a browser and is checked by hand (mouse, touch with two fingers, keyboard, all four seats, shared seats, 390x844 and 844x390).
