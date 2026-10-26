# Area F audit: build/deploy/CI, preview runtime, security, docs-vs-code (main 39ead4a)

Method: read docs/AUDIT.md first; ran the real build in a scratch clone (7 fake previews: far-behind branch `experimental`, `protogames-2.0`, `add-favicon`, a ref lacking js/ and images/, a ref without index.html, a ref with no <head>, a missing ref; hostile title and --repo) and checked every script/link/img ref of every built page (<scratch>/build/check.js); ran the dev gallery logic in a vm (24 valid combos, 0 failures); read GitHub run history and PR comments via gh (GET only). No browser was available (Browser pane tool disabled), so nothing was verified in a real browser.

## Findings

### F1 (Medium) Slow or unreachable remote theme image blocks app start-up
Location: js/main.js:40-44 (ThemeManager.init awaited before AutosaveSlots.claim and startBoard), js/themeManager.js:30-32 (loadImage has no timeout), :71-74 and :99-100 (sequential awaits).
What happens: `init()` does `for (t of store.tiles) await applyTileTheme(t)` and for each tile with an image `await loadImage(t.image)`. A theme imported with `https://` image URLs is persisted with those URLs and re-fetched sequentially on EVERY page load. `startBoard()` (board generation, autosave offer, share link opening) only runs in `.finally` of that chain. If a host stalls (blackholed, slow, tarpit) the `Image` neither loads nor errors until the browser's network timeout (tens of seconds up to minutes); N remote images cost N sequential round trips. Result: blank canvas, no autosave prompt, share link not opened.
Evidence: code citation above; no Promise.race/timeout anywhere in loadImage.
Fix: start the board first and apply themes afterwards (or Promise.allSettled in parallel), and add a timeout (e.g. 5 s) to loadImage. Persist theme images as data URLs at import time instead of re-fetching URLs.

### F2 (Medium) Preview link comment is silently lost whenever a run is cancelled or fails
Location: .github/workflows/pages.yml:26-30 (job concurrency cancel-in-progress) and the last step (comment) of the same job.
What happens: the comment for PR N is posted only by the run triggered by PR N's own event, after a successful deploy. A run is cancelled by any newer event (another PR, a push to main); a failed `npm test` also skips it. The preview is still published by the later run, but the PR never gets the comment and nothing re-posts it.
Evidence: `gh api repos/bremondr/protogames/issues/77/comments` returns [] although #77 is open with a live preview; its run 37996543872 (pull_request_target, head 3eadc09) was `cancelled`. Likewise merged #74 (runs 37994035425, 37996444352 cancelled) and #71 have no comments; only #80 (run succeeded) has one. Many pull_request_target runs in `gh run list --workflow "Deploy site"` are cancelled whenever several PRs are pushed together.
Fix: move the comment to a separate job/workflow not subject to cancel-in-progress (e.g. workflow_run), or post it first using the deterministic URL (https://<owner>.github.io/<repo>/preview/pr-N/) without needing the deploy output.

### F3 (Low) PR beyond the 20-preview cap, or an unbuildable PR, still gets a comment pointing to a 404
Location: pages.yml (`--limit 30`) vs scripts/build-site.js:21,106-108 (MAX_PREVIEWS=20, slice before building), :138-157 (skips); comment step is unconditional.
What happens: with more than 20 open same-repo PRs, `gh pr list` (newest first) drops the oldest silently; when such a PR gets a commit, the bot comments a preview URL that was not built (404). Same for a PR skipped as unbuildable (no index.html / <head> / unfetchable ref). Skipped PRs also use up a slot (cap applied before skipping), and `--limit 30` counts fork PRs that are filtered later, so fewer than 20 may remain.
Evidence: in my local build with 7 previews (3 skipped) the index lists only built ones; the comment text has no knowledge of that.
Fix: have build-site.js write a built/skipped summary and make the comment conditional; filter fork PRs before limiting and apply the cap after skipping.

### F4 (Low) localStorage of closed PR previews is never cleaned and shares the origin quota with production
Location: scripts/preview-runtime.js (prefix `preview:pr-N:`), js/autosaveSlots.js:139-170 (cleanup only sees its own prefix).
What happens: every preview a developer opens writes up to 5 orphan autosave slots plus themes/settings under `preview:pr-N:`. After the PR closes nobody revisits the URL, so the cleanup never runs for it; production ignores `preview:` keys. They stay forever in the single 5 MB origin quota (the showcase alone is 83 KB per board); enough of them make production autosave fail.
Fix: let production start-up drop `preview:*` keys not touched for N days (or for previews no longer in /preview/), or document it.

### F5 (Info) preview-runtime only wraps Storage; Web Locks, IndexedDB, caches, BroadcastChannel are not covered
Location: scripts/preview-runtime.js; docs/DEPLOYMENT.md "Separate saved data" says every storage key is prefixed.
Current code uses only localStorage, sessionStorage and navigator.locks (grep of js/*.js; no indexedDB/caches/BroadcastChannel/cookies). The lock name `protogames-tab:<uuid>` is unprefixed but ids are random UUIDs held in the (prefixed) sessionStorage, so no preview can touch production data today; `navigator.locks.query()` just also lists production tabs. A future PR using IndexedDB/Cache API/BroadcastChannel would bypass isolation silently; document the limit or add a test that greps js/ for those APIs.

### F6 (Low) Theme image URLs: tracking requests on every start; CSP allows any https image
Location: index.html:10 (`img-src ... https:`), js/themeManager.js:71-78, 99-100; js/themeEditor.js:204.
An imported theme/item set with `"image": "https://tracker/x.png"` triggers a request at import and on every later start (see F1), leaking IP, User-Agent and origin to the theme author. DEPLOYMENT.md calls https images accepted but not the persistent re-fetch. `crossOrigin='anonymous'` means hosts without CORS headers fail (silently flat colour), also undocumented. themeEditor.js:204 builds `url("${row.image}")` from unescaped data; a `"` only invalidates the declaration (not exploitable).
Fix: convert URL images to data URLs at import; mention the CORS requirement.

### F7 (Low) Preview of a PR whose head lacks app files is published as a broken page
Location: scripts/build-site.js:138-150.
Only a missing index.html or <head> skips a preview. A head without js/ or images/ is published: in my build preview/pr-4 had 36 unresolved refs (every script, icon, logo), blank page, and the comment still announces it. Suggest checking that every local script/link/img of index.html exists in the exported file list and skipping with the warning otherwise (also useful as a guard for main).

### F8 (Low) Documentation drift
- README "Pick swatch 1-9, or Tab / Shift+Tab to cycle": Tab only cycles when the canvas has focus (js/shortcuts.js binding `when: 'focus-neutral'`, isFocusNeutral at ~:251); README and help overlay do not say so.
- README project tree omits js/focusUtils.js (loaded at index.html:517), docs/AUDIT.md, docs/notes.md.
- README "Notable Recent Changes" lists only Nov 2025 items.
- docs/SPECIFICATION.md says `orientation` is pointy-top | flat-top; ProjectFormat.ORIENTATIONS (js/projectFormat.js:24) also accepts `orthogonal` and `diagonal` (UI options commented out, index.html:86-87).
- js/shortcuts.js help footer: the "shortcuts are paused while you type" note shows only on non-Mac (ternary near the end of showHelp), Mac users get only the Command-key note.
- build-site.js leaves the `<!-- 100% privacy-first analytics -->` comment in previews (cosmetic).

### F9 (Info) Workflow notes (no bug)
- `pull_request_target` types omit `edited` and `converted_to_draft`: a title change does not refresh the /preview/ index until another run.
- The comment's short sha comes from the event payload while the build uses `pull/N/head` at job time; can differ only if a push arrives without cancelling.
- Actions are tag-pinned first-party actions only; package.json has no dependencies; the only third-party script is the analytics one (no SRI, documented).

## Checked and fine
- Build output: all `<script src>`, `<link href>`, `<img src>` in production, pr-1 (far behind main), pr-2, pr-3 resolve to built files; relative links `../` and `../../` correct; favicon .ico (16/32/48 entries valid) and 192px PNG exist; showcase path resolves; `noindex` meta and `preview-runtime.js` inserted first; analytics script removed in every preview (also the old `experimental` branch); production keeps analytics and has no preview-runtime.
- Escaping in /preview/index.html: hostile PR title and `--repo` (`"><x`) escaped; badge uses textContent; runtime info is JSON.stringify of build-controlled values.
- Missing ref, ref without index.html, ref without <head>: skipped with warning, production and other previews unaffected, not listed in the index.
- Storage prefixing: getItem/setItem/removeItem/key/length/clear patched on Storage.prototype; `pr-1` vs `pr-10` do not collide (trailing colon); production's autosave scan ignores `preview:` keys.
- Workflow: job-level concurrency fixes audit H1/fork-skip problem; tests run on every run; merge (push + closed events) leaves the closed run, which builds main (#78/#79: push runs cancelled, PR run success); permissions minimal for what is used; test.yml has contents: read; fork PRs skipped by `if` and filtered in `gh pr list`; checkout is main so PR code is never executed. Failed runs 37996454942, 37996546435, 37997436552 were the CI-only git-identity test failure fixed by #78.
- Node 22: no post-22 APIs found in scripts/tests/js; CI (Node 22) green on last main run.
- Injection: every innerHTML use is static markup except fileManager.js:214 `${timestamp}`, which is Date.toLocaleString() output (safe); SVG export escapes every attribute; no eval/Function/document.write/postMessage/window.open; JSON.parse of storage guarded; share-link `{...raw}` cannot pollute prototypes.
- CSP: no inline scripts, no eval, no fetch/worker outside 'self'/analytics; blob:/data: cover textures/print; object-src/base-uri/form-action restricted; nothing in the app broken by it (static check). Known gaps documented (style 'unsafe-inline', img https:, no frame-ancestors).
- Documented commands (build-site, tests glob, python http.server gallery URL) work; dev/geometry-gallery.html script list complete and its logic passes all 24 combos.
- SPECIFICATION.md limits (width/height 201, radius/size 0-100, 64 vertices, 200-char object ids, 2 MB inflate, link warnings 2000/8000) match code; TILE_GENERATION_EXPLANATION matches triangle.js.

## Not covered
- Real-browser behaviour (no browser available): whether opening index.html via file:// still works with CSP `script-src 'self'` (README Usage step 1 says to open index.html directly; unverified), the Storage prototype patch in actual browsers, Pages cache headers, deploy-pages behaviour when cancelled mid-deploy.
- App logic outside area F (state, geometry, rendering, print) and share-link internals beyond security/doc checks.
