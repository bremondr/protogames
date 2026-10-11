# Playtest mode: idea backlog

Parked ideas, not commitments. Written 2026-10-11. The first step, movable pieces, has its own plan: [PLAYTEST_PIECES_PLAN.md](PLAYTEST_PIECES_PLAN.md).

Where we start from: playtest today only locks editing ([js/playtest.js](../js/playtest.js)). Objects are decoration stamped on tiles. There is no Select tool, no movable piece, no dice, no game state.

Rough order is by value for a board-game prototyper. "Needs" lists what must exist first.

## 1. Measuring on the grid
Needs: nothing (works in a pure lock mode, so it is a good companion to pieces).
- Click two tiles and show the tile distance.
- Click a tile and highlight everything within N steps (movement or attack range). The geometry code already builds an adjacency graph lazily.
- Click a tile to highlight it for discussion (temporary, not saved).
- Open questions: distance for triangle grids (edge or vertex adjacency?), and whether diagonals count on square grids (a setting).

## 2. Dice and randomizers
First version is planned in [PLAYTEST_DICE_PLAN.md](PLAYTEST_DICE_PLAN.md): a standard d3 to d20 set saved with the design, rolled from each player's tray. The list below is what remains after that.
Needs: nothing.
- d4, d6, d8, d10, d12, d20, and custom face lists.
- Coin flip, random number in a range, random tile, random direction.
- Optional seed, so a roll sequence can be replayed (pairs with the log, item 5).
- Shown as a small overlay with a roll history of the last few results.

## 3. Counters and turn tracker
Needs: nothing for a global overlay; player identity if tied to pieces.
- Per-player score and resources, with plus and minus buttons.
- Current player, round counter, optional phase list.
- Start as an overlay that lives only in the session; saving it needs a format change.

## 4. Playtest undo for everything, and reset
Needs: pieces. Move undo and reset for pieces are part of the pieces plan. This item is the extension to counters and dice results once those exist.

## 5. Action log
Needs: pieces, and ideally dice and counters.
- A readable history: "Red pawn moved to (3, 4)", "Rolled d6: 5".
- Copy to clipboard for bug reports and playtest notes.
- Can be timestamped and attached to feedback notes (item 7).

## 6. Snapshots (saved setups)
Needs: pieces and a decision on what a "position" contains.
- Save and restore a mid-game position, named, several per project.
- Needs a format change (version bump, migration, fixture, tests, spec), and positions refer to tile ids, so the infinite-board question (keep tiles that hold pieces) comes back.
- Lowered in priority: fixed starting layouts are covered by start markers in the pieces plan, and the play state is kept in memory while the tab lives. Do this only if scenarios or "continue tomorrow" become a real need.
- Related extensions to start markers, all additive: a `count` (stacked starts) and a piece `kind` on the marker.

## 7. Feedback capture
Needs: action log.
- Flag a tile, piece or moment with a note ("too strong", "confusing rule"), with the position attached.
- Session summary: turns, duration, outcome. Export as text or JSON.
- Card or piece usage stats only matter once there are cards (see below).

## 8. Piece tray in playtest
Needs: pieces.
- Add and remove pieces while playing (spawning units, captures, a reserve pool).
- Decision to make first: do such changes count as setup changes? Probably not.

## 9. Edit while playing
- Fix a typo or tweak a value without leaving playtest, with each change marked as playtest-only or sent back to the design.
- Conflicts with the lock model; only worth it if users ask.

## 10. Seeded shuffles and hidden information
Needs: decks or hidden pieces, neither of which exists.
- Fog of war (tiles or pieces hidden per player) and a hot-seat screen cover.
- Seeded randomness so a game can be replayed or two strategies compared on the same order.

## 11. Solo seats and online sessions
- Solo: switch between player seats quickly.
- Online: a shared session link for remote playtesters. Large, needs a server or peer-to-peer, and sync of every state above. Keep for last.

## Out of scope unless the tool grows beyond boards
- Decks, hands, discard piles, draw and shuffle actions, card editing. This is a separate subsystem (a card model, art, layout, print), not an add-on to playtest.
- Rules enforcement or scripting.

## Related ideas from elsewhere in the repo
- Print pieces as cut-out tokens next to objects (extends `js/print.js` token pages).
- `V` is reserved for a Select tool; pieces may be its first user.
