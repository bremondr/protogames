# Playtest ideas (backlog)

> **Status: research backlog, not a plan.** Nothing here is a commitment. What exists today is described in [../PLAYTEST.md](../PLAYTEST.md); this file only lists what could come next. Last checked against `PLAYTEST.md` and the code: 2026-10-26.

**Already built** (so no longer an idea): piece trays at each seat, movable pieces, the standard dice set d3 to d20 rolled from the trays (the first part of item 2), and undo and redo of piece moves (the first part of item 4; item 8 is built only as "tap or drag a piece between tray and board"). Keyboard moves of pieces and the screen-reader announcements are built too (see `PLAYTEST.md`, "Keyboard and screen readers").

**Which item is tracked where** (GitHub issues of `bremondr/protogames`; all are still open, #51 is the umbrella):

| Item in this file | Issue |
|---|---|
| 1 Measuring on the grid | [#88](https://github.com/bremondr/protogames/issues/88) measure distance and highlight range |
| 2 Dice (what remains), 3 Counters and turn tracker | [#51](https://github.com/bremondr/protogames/issues/51) playtest mode: tokens, dice and turn tracker (no separate issue yet) |
| 5 Action log, 6 Snapshots, 7 Feedback capture | [#89](https://github.com/bremondr/protogames/issues/89) action log, saved positions and feedback notes |
| 8 Piece tray in playtest | [#85](https://github.com/bremondr/protogames/issues/85) trays and moving pieces (the built part) |
| 10 Hidden information, 11 Solo and online | [#116](https://github.com/bremondr/protogames/issues/116) phones as secret screens, proposal in [../proposals/playtest-secret-screens.md](../proposals/playtest-secret-screens.md) |
| Items 4, 9 and "Related ideas": share links, keyboard and screen-reader support | [#86](https://github.com/bremondr/protogames/issues/86) (share links of positions are not built) |
| Related ideas: print pieces as tokens | [#87](https://github.com/bremondr/protogames/issues/87) |

Items 4 (beyond piece moves), 9 and the "out of scope" list have no issue.

---

Parked ideas, not commitments. Written 2026-10-11 and updated when the first playtest step shipped.

Where we start from: playtest now has players, piece sets, start markers, trays at each seat, movable pieces and a standard set of dice; see [PLAYTEST.md](../PLAYTEST.md) for what exists. There is still no Select tool, no counters or turn tracker, no log, and the dice set has no editor.

Rough order is by value for a board-game prototyper. "Needs" lists what must exist first.

## 1. Measuring on the grid
Needs: nothing (works in a pure lock mode; pieces now exist, so ranges can start from a piece).
- Click two tiles and show the tile distance.
- Click a tile and highlight everything within N steps (movement or attack range). The geometry code already builds an adjacency graph lazily.
- Click a tile to highlight it for discussion (temporary, not saved).
- Open questions: distance for triangle grids (edge or vertex adjacency?), and whether diagonals count on square grids (a setting).

## 2. Dice and randomizers
Built: the standard d3 to d20 set, saved with the design and rolled from each player's tray (see [PLAYTEST.md](../PLAYTEST.md)). What remains:
- An editor for the design's dice set, with custom face lists and colours (additive format bump, plus a share-link key).
- Several dice per roll, modifiers, `2d6+1` notation.
- Coin flip, random number in a range, random tile, random direction.
- A shared roller for designs without players (today dice live in the trays).
- Optional seed, so a roll sequence can be replayed (pairs with the log, item 5).
- Shown as a small overlay with a roll history of the last few results.

## 3. Counters and turn tracker
Needs: nothing for a global overlay; player identity if tied to pieces.
- Per-player score and resources, with plus and minus buttons.
- Current player, round counter, optional phase list.
- Start as an overlay that lives only in the session; saving it needs a format change.

## 4. Undo for everything
Built for piece moves (Ctrl+Z, Reset). This item is the extension to counters once they exist; dice rolls stay out of the undo stack on purpose.

## 5. Action log
Needs: pieces, and ideally dice and counters.
- A readable history: "Red pawn moved to (3, 4)", "Rolled d6: 5".
- Copy to clipboard for bug reports and playtest notes.
- Can be timestamped and attached to feedback notes (item 7).

## 6. Snapshots (saved setups)
Needs: pieces and a decision on what a "position" contains.
- Save and restore a mid-game position, named, several per project.
- Needs a format change (version bump, migration, fixture, tests, spec), and positions refer to tile ids, so the infinite-board question (keep tiles that hold pieces) comes back.
- Lowered in priority: fixed starting layouts are covered by start markers, and the play state is kept in memory while the tab lives. Do this only if scenarios or "continue tomorrow" become a real need.
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
- Secret cards per player on their own phone, over a direct browser-to-browser connection with no server: proposed in [playtest-secret-screens.md](../proposals/playtest-secret-screens.md).
- Seeded randomness so a game can be replayed or two strategies compared on the same order.

## 11. Solo seats and online sessions
- Solo: switch between player seats quickly.
- Online: a shared session link for remote playtesters. Large, needs a server or peer-to-peer, and sync of every state above. Keep for last. (The connection layer of [playtest-secret-screens.md](../proposals/playtest-secret-screens.md) is the first step towards it.)

## Out of scope unless the tool grows beyond boards
- Decks, hands, discard piles, draw and shuffle actions, card editing. This is a separate subsystem (a card model, art, layout, print), not an add-on to playtest.
- Rules enforcement or scripting.

## Related ideas from elsewhere in the repo
- Print pieces as cut-out tokens next to objects (extends `js/print.js` token pages).
- `V` is reserved for a Select tool; pieces may be its first user.
