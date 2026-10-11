# Plan: dice in the player trays

Status: **proposal, nothing built yet.** Written 2026-10-11.
Builds on [PLAYTEST_PIECES_PLAN.md](PLAYTEST_PIECES_PLAN.md) (players, seats and trays). Other ideas: [PLAYTEST_IDEAS.md](PLAYTEST_IDEAS.md).

## Scope: keep it simple

- The board design gets a **dice set** section. For now it always holds the standard set, **d3, d4, d6, d8, d10, d12 and d20**, and there is no editor for it. A designer UI comes later.
- In playtest, every player's tray has a row of those dice. The player taps a die and it rolls. The result shows in that player's tray.
- Nothing about a roll is saved or undoable.

Not in this plan: custom faces or colours, several dice per roll, modifiers, `2d6+1` notation, a shared roll history, seeded rolls, advantage or exploding dice. They are listed under "Later".

## Decisions

| Question | Decision | Why |
|---|---|---|
| Is the dice set part of the design? | Yes: `appState.dice`, a list of `{ sides }`. | The user asked for it, and the later editor and custom faces need a place to live. Adding the field now costs nothing extra because the format is already changing to v4 for players. |
| Is it filled in automatically? | Yes. The v3 → v4 migration writes the standard set, and a new board starts with it. | Every design has dice without any UI, and old files behave the same as new ones. |
| Share links | **No change for now.** A link opens with the standard set. | The set cannot be edited yet, so every link would carry the same value. When the editor arrives, add a key and bump the link version then, as with other additions. Note this in the spec so it is a known limit, not a surprise. |
| Where do dice appear? | In each player's tray, rotated to face their seat like the rest of the tray. | Follows the table-top model of the pieces plan. |
| How does a roll work? | One tap on a die picks it and rolls it. The tray shows the die and the result ("d6: 4"). The latest roll replaces the previous one. | Fastest possible, and matches "pick a die and roll it". If a separate Roll button turns out to be wanted, it is a small change. |
| What if the design has no players? | No trays, so no dice. | Dice live in trays. If this proves limiting, a single shared roller in the pill can be added later. |
| Randomness | `crypto.getRandomValues` with rejection sampling, behind an injectable random source. | No modulo bias on d3 or d20, and tests (and later seeded replays) can pass a fixed source. |
| Undo | Rolls are not on the undo stack. | Ctrl+Z must never allow a re-roll. |
| Persistence | Results live in the play state only: cleared by Reset, kept while the tab lives, never saved. | Same rule as piece positions. |

## Data model

### Saved (design)

```js
// appState.dice, standard set
[ { sides: 3 }, { sides: 4 }, { sides: 6 }, { sides: 8 }, { sides: 10 }, { sides: 12 }, { sides: 20 } ]
```

- `sides`: integer from 2 to 1000. Unique within the list. At most 20 entries.
- The list is always present in a v4 project. An empty list is valid and means "no dice" (for when the editor exists).
- A custom-faces die would later add an optional `faces` array. Old files never contain it, so that needs only an additive bump.

### Play state (not saved)

```js
state.play.rolls = { '#c62828': { sides: 6, value: 4 } }   // latest roll per player colour
```

## Behaviour in the tray

- A dice row sits in the tray next to the pieces: one compact button per die in the design's set, labelled "d6" and so on. The row wraps on narrow screens. When the tray is collapsed, the dice row is hidden with it.
- Tapping a die rolls it. The result is shown large in the tray, rotated with it, with the die type ("d6") and the value.
- A short tumble animation plays on the result. It is skipped when the user has `prefers-reduced-motion` set.
- A polite live region announces it: "Red rolled d6: 4".
- Two players can roll at the same time (each tray handles its own touch, in line with the multi-touch rule of the pieces plan).
- Reset clears all results.

## Code changes

| File | Change |
|---|---|
| `js/config.js` | `STANDARD_DICE` (the seven dice above), limits for validation. |
| `js/dice.js` (new) | Pure: `roll(sides, rng)` with rejection sampling, `secureRandom` default, validation helper for a dice set. Loadable in Node for tests. |
| `js/state.js` | `state.dice` (the set), `state.play.rolls`, setters. A new board starts with `STANDARD_DICE`. |
| `js/projectFormat.js`, `js/fileManager.js` | `serializeAppState` writes `dice`. v3 → v4 migration adds the standard set (frozen copy of the list, not read from live config). `validate` checks the rules above. Shipped with the players change, so one version bump covers both. |
| `js/playtestTray.js` | Dice row, roll handler, result display, live region, reduced-motion handling. |
| `styles.css` | Dice row, result display, tumble animation, rotation by seat. |
| `docs/SPECIFICATION.md` | `dice` in the format and the history row for v4; note that share links use the standard set. |

## Rollout

Two small steps that ride on the pieces plan, so they add no extra format bump:

1. **With the format PR (#84):** `STANDARD_DICE`, `state.dice`, the `dice` field with migration and validation, fixture and tests, spec update. No UI.
2. **With or after the trays PR (#85):** `dice.js`, the dice row and result display, announcements, Reset clearing rolls.

The second step needs players and trays to exist, so it cannot ship before them.

## Tests

- `dice.js`: result always between 1 and `sides`; with a fixed random source, every face is reachable; rejection sampling gives no bias at the edge (a source returning the last value below the limit is rejected and redrawn); `sides` below 2 or non-integer is refused.
- Format: v3 migrates and gets the standard set; v4 round-trips; every validation rule (duplicates, out of range, too many entries, non-array); an empty list is accepted; every fixture and showcase still loads.
- State: a new board starts with the standard set; rolls are not part of snapshots and are cleared by Reset.
- Tray: tapping a die shows the result and announces it; two trays roll independently; reduced motion skips the animation; Ctrl+Z does not touch rolls.
- Manual in the preview: all four seats, a collapsed tray, phone width, touch from two people at once.

## Later

- A dice set editor in the design (add, remove, custom faces or labels, colour). Adds an additive format bump and a share-link key.
- Several dice per roll, modifiers and `2d6+1` notation, then advantage and exploding dice.
- A shared roll history panel naming who rolled, feeding the action log (#89).
- A shared roller for designs with no players.
- Seeded rolls for replay (the random source is already injectable).
