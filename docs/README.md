# Documentation index

Every document in `docs/`, what it is for, whether it can be trusted as current, and when that was last checked. Start from the group that matches your question.

| Group | Folder | Meaning |
|---|---|---|
| Reference | `docs/` | Describes what the app does **today**. Must agree with the code; a mismatch is a bug in the document. |
| Audits | `docs/audits/` | Reviews of the code and docs. |
| Research | `docs/research/` | Surveys, backlogs and reading lists that inform decisions. Not a specification. |
| Proposals | `docs/proposals/` | A feature that is **not built**, described well enough to decide on it. |
| Archive | `docs/archive/` | Documents kept for history. Not maintained; may be wrong about the present. |

## Reference (current)

| Document | Purpose | Status | Last verified |
|---|---|---|---|
| [SPECIFICATION.md](SPECIFICATION.md) | Formats other code and saved files depend on: project file, share link, versions, migrations. | Current | see the document |
| [DEPLOYMENT.md](DEPLOYMENT.md) | How the site is built, hosted and released; CI and checks. | Current | see the document |
| [PLAYTEST.md](PLAYTEST.md) | How playtest works: players, start markers, trays, pieces, dice; how it is built; known gaps. | Current | see the document |
| [TILE_GENERATION_EXPLANATION.md](TILE_GENERATION_EXPLANATION.md) | How tiles and maps are generated. | Current | see the document |

The project overview and file tree are in the root [README.md](../README.md).

## Audits (`audits/`)

| Document | Purpose | Status |
|---|---|---|
| [audits/README.md](audits/README.md) | How the audits folder is organised. | Current |
| [audits/register.md](audits/register.md) | The one living register: current state of every audit finding. | Current; read this first |
| `audits/<date>-<name>/` | A dated audit with its reports. | Frozen log of that day; the register supersedes it |

## Research (`research/`)

Index with trust notes: [research/README.md](research/README.md).

| Document | Purpose | Status | Last verified |
|---|---|---|---|
| [research/board-topologies/README.md](research/board-topologies/README.md) | Survey of the maps of 25 published games (photo, schematic, topology, rulebook) and how hard each would be to add. | Rulebook-checked facts; estimates are guesses | 2026-10-26 |
| [research/playtest-ideas.md](research/playtest-ideas.md) | Backlog of playtest ideas; marks what is built and which issue tracks which idea. | Backlog, not a plan | 2026-10-26 |
| [research/hex-maps-reading-list.md](research/hex-maps-reading-list.md) | Links on hex maps and procedural generation. | Reading list | 2026-10-26 |

## Proposals (`proposals/`)

Index: [proposals/README.md](proposals/README.md).

| Document | Purpose | Status | Last verified |
|---|---|---|---|
| [proposals/playtest-secret-screens.md](proposals/playtest-secret-screens.md) | Phones as secret screens in playtest, peer to peer (issue #116). | Not built | 2026-10-26 |

## Archive (`archive/`)

| Document | Purpose | Status | Last verified |
|---|---|---|---|
| [archive/original-prd.md](archive/original-prd.md) | The original product requirements document (November 2025). | Historical; the app has diverged. The current specification is [SPECIFICATION.md](SPECIFICATION.md) | 2026-10-26 (banner) |

## Where does a new document go?

- **It describes what the app does now** and would be wrong if the code changed: reference, in `docs/`. Keep it in step with the code, and add it to this index.
- **It is a survey, an idea backlog, a reading list or a comparison** that informs a decision but promises nothing: `docs/research/`. Put a status line and a "last verified" date at the top, and add it to [research/README.md](research/README.md).
- **It describes one feature that is not built** and is meant to become an issue: `docs/proposals/`, with the issue number and "not built" in its first lines.
- **It is finished with, superseded or only of historical interest:** `docs/archive/`, with a note at the top saying why and where the current description is. Do not edit archived documents beyond that note.
- **It is the result of a review:** `docs/audits/`, as a dated folder, and update the register instead of editing the old audit.

When a proposal is built, its content moves into the reference document it belongs to (for example playtest features into `PLAYTEST.md`), and the proposal is archived or deleted. Research that turns into a decision keeps its place; the decision goes into the proposal or the reference document.
