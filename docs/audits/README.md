# Audits

This folder holds every audit of Protogames. It is organised so that one thing is **current** and everything else is a **log of the past**.

| | What | Changes? |
|---|---|---|
| **[register.md](register.md)** | The one living file: every finding still open and every finding fixed since the last audit, with its status | **Yes, whenever a finding is fixed, accepted or found** |
| `YYYY-MM-DD-<kind>-audit/report.md` | The report of one audit, exactly as written on its date | **No** (frozen after it is merged) |
| `YYYY-MM-DD-<kind>-audit/area-reports/` | The detailed per-area reports behind that audit (repro commands, what was checked, what was not) | **No** |

If you want to know "where do we stand?", read **register.md**. If you want to know "why do we believe that?" or "what did we know on that day?", read the dated report.

## Audits so far

| Date | Folder | Kind | Revision audited | Result |
|---|---|---|---|---|
| 2026-10-05 | [2026-10-05-code-audit](2026-10-05-code-audit/report.md) | Whole-repository code review | `cdf317e` | 6 High, 17 Medium and ~30 Low findings; led to PR #76 |
| 2026-10-11 | [2026-10-11-bug-audit](2026-10-11-bug-audit/report.md) | Bugs found by running the app, plus the open GitHub bug issues | `39ead4a` | 1 High, 17 Medium, 31 Low; the issues #4, #19 and #20 verified |
| 2026-10-25 | [2026-10-25-re-audit](2026-10-25-re-audit/report.md) | Re-check of both earlier audits against the current code, plus new findings, plus the fix plan | `78aa7ef` | 1 High, 18 Medium, 47 Low; fixed in PR #126 except nine |

## Rules

### 1. One living file, everything else is frozen
- **Status lives only in `register.md`.** Never track "is it fixed?" in a dated report.
- A dated report is frozen once it is merged. It starts with an **Archived** banner (see below) and is never edited afterwards except to fix a broken link or a typo; say so in the commit message.
- Do not copy status into issues or PR descriptions without the finding ID; the ID is the join key.

### 2. Folder and file names
- `docs/audits/YYYY-MM-DD-<kind>-audit/` with `<kind>` one of `code` (read the code), `bug` (run the app, hunt bugs), `re` (re-check an earlier audit and extend it), `security`, or another short word if none fits. The date is the day the audit's report was written.
- Inside: `report.md` (the main document) and `area-reports/` (one file per area, named `<letter-or-number>-<area>.md`).
- Scratch material (throwaway scripts, generated PDFs, browser profiles) is **not** committed. Record the command and the observed output in the area report instead; if a script is worth keeping, put it under `dev/` with a README line and cite it.

### 3. Finding IDs and severity
- Every finding gets an ID of the form **`A<n>-<S><k>`**: `A<n>` is the audit number in the table above (`A1` = 2026-10-05, `A2` = 2026-10-11, `A3` = 2026-10-25, the next audit is `A4`), `<S>` is the severity letter, `<k>` a running number within that audit and severity. Examples: `A3-H1`, `A3-M7`, `A3-L12`.
- IDs are permanent. They are never renumbered or reused, even if the finding is fixed, merged into another or dropped. A finding that survives into a re-audit keeps its original ID; the re-audit's report records the link ("`A2-M4` = `A3-M1`") if it renumbered locally.
- The three audits so far predate this scheme: their reports use local IDs (`H1`, `M3`, ...). The register prefixes the findings of audit A3 with `A3-`; the *Source* column cites findings of the earlier audits as `AUDIT-xx` (A1) and `BUG-xx` (A2), as the A3 report does.
- Severity: **H** High = crash or hang on reachable input, data loss, or a broken release or deploy. **M** Medium = a user-visible bug or a real hardening gap. **L** Low = minor bugs, polish, robustness. **I** Info = notes (not tracked individually; listed in the report).
- Every finding needs **evidence** at one of three levels, stated in the report: *browser* (reproduced in a real browser), *script* (reproduced with the real modules in node), *code* (cited from the code only). A finding without a repro or a precise code argument does not go in.

### 4. Statuses in the register
Use exactly these words:

| Status | Meaning |
|---|---|
| **Open** | Not fixed, and not decided against |
| **In progress (#N)** | A pull request exists but is not merged |
| **Fixed (#N, YYYY-MM-DD)** | Merged in pull request #N on that date |
| **Partly fixed (#N, YYYY-MM-DD): what remains** | Merged, but part of the problem is still there |
| **Accepted: reason** | Deliberately left as it is (say why, and who decided) |
| **Won't fix: reason** | The behaviour is intended or not worth the cost |
| **Superseded by `<ID>`** | Covered by another finding |
| **Moved to #N** | Tracked as a GitHub issue because it needs discussion or design |

### 5. Life of a finding
1. **Found** in an audit: it gets an ID in that audit's report and a row in `register.md` with status *Open*. The register row and the report are added in the same pull request.
2. **Fixed**: the fixing pull request names the IDs in its description ("Audit: A3-M3, A3-M4") and ends its commit messages with an `Audit: <ID>` line. **The fixing pull request also updates the register row** (to *In progress (#N)* when opened, to *Fixed (#N, date)* before merge), so `main` is never out of date after a merge.
3. **Decided against**: set *Accepted* or *Won't fix* with the reason, in a pull request.
4. **Needs discussion**: open a GitHub issue, put its number in the register as *Moved to #N*, and let the issue carry the discussion.

### 6. Running a new audit
1. Start from **`register.md`**: every *Open*, *In progress* and *Partly fixed* row must be re-checked against the current code (re-run the repro; do not trust the old verdict).
2. Fix the audited **revision** (a commit on `main`). Work in a read-only checkout; do not change the repository while auditing.
3. Write the report in a new dated folder: `report.md` with the header block below, a **status table of every earlier finding** (Fixed / Still open / Changed / Cannot verify, with evidence), the **new findings**, **Checked and fine**, **Not covered**, and the **plan** if there is one.
4. Merge into the register in the same pull request: update the rows of earlier findings (set the status that the re-check found), add the new findings with the new `A<n>-` prefix, and bump the "last audit" line.
5. The previous audit's report is **not** touched. The new report supersedes it and says so in its header.
6. Put the area reports in `area-reports/`. Name the tools and versions used (browser, Node), because "not covered" depends on them.

**Header block of a report** (copy it):

```
# Protogames — <title>
> **Archived log.** ... (added when the report is frozen; see the template at the end)
**Date:** YYYY-MM-DD · **Audit ID:** A<n> · **Revision audited:** `<short sha>` (main, <n> tests green) · **Scope:** ... · **Supersedes:** A<n-1> (link)
```

**Archived banner** (added to the top of the report when the audit is finished and its fixes are done or planned; the register link is the point):

```
> **Archived log (frozen YYYY-MM-DD).** This is the report of audit A<n> as written on its date. Current status of every finding: [register.md](../register.md).
```

### 7. Running audits with agents (what we learned)
- Give every reviewer **its own area, a read-only checkout and its own scratch folder**. Findings come back as a file, not as chat.
- Fix work: **one worktree and one branch per package**, based on current `main`; no two packages own the same file; packages that touch the same files run in sequence (for example the generator version after the validators and share links). Name branches `fix/<audit-folder-date>-<package>` and open them as **draft pull requests**; one combined pull request carries everything to try.
- **Never change shared git config** (for example `core.autocrlf`): it applies to every worktree of the repository.
- **Never kill browsers by image name**; stop only the process IDs you started. Headless browser profiles are large (about 5 GB each in the last audit, 190 GB in total, which filled the disk): use one profile folder per run and delete it when the run ends. Check the free space before and after a long run.
- Merges happen only when the owner names the pull request. A reviewer's "done" is not a merge instruction.

### 8. Where else this is referenced
- `README.md` (project tree) points here.
- Claude Code's project memory has a short note with the same rules, so future sessions follow them.
