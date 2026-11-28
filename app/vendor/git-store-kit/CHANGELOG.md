# Changes to git-store-kit

Each version is released as the tag `git-store-kit-vX.Y.Z`. A new major version (the first number) means a project using the kit may need changes; the notes say which.

## 1.2.0 (2026-11-27)

Reading public repos with no API requests, and default sources. Nothing to change in a project: without the new options a store works as before, and `index: 'auto'` only changes what happens when a repo has an index.

- **The index.** A data repo can carry `git-store-index.json`, a list of its item files with their git blob sha. Without a token a store reads it, and the files, from `raw.githubusercontent.com`: no API requests at all, so a whole Wi-Fi of readers no longer shares 60 an hour. It falls back to listing the folder through the API when the index is missing, isn't valid, or doesn't list the store's folder. A file that raw serves older than the index is kept as it was (or left out, when new) until a later load, without an API request. With a token, nothing changes. The option `index: false` turns it off.
- `index/build-index.mjs` and `index/update-index.yml`: what a data repo copies (to `.github/`) to rebuild the index on every push. Not for apps; see "Setting up the index in a data repo" in the README.
- **Default sources:** `defaults: ['owner/repo']` follows repos on a first visit. A default the person removes stays removed; a default added later reaches existing users once.
- Each source says `fromIndex` (the last load read the index) and `outdated` (files raw didn't serve in the index's version yet).
- **Fix (README):** without a token a `304` counts against GitHub's limit; only requests with a token get it free. The Limits section says so now.
- `createFakeGitHub()`: like GitHub, a `304` without a token counts against the limit, and conditional requests are refused too when it is used up. `fake.requests` counts requests by host (`{api, raw}`). `addRepo(name, {index: true})` keeps the repo's index up to date after every change; `fake.writeIndex(name)` writes it once. `fake.staleRaw` also takes a list of paths. With `staleRaw`, raw now serves a file's previous content, not the file as it was one commit earlier (which was often the same).

## 1.1.0 (2026-11-22)

Additions found while setting the kit up in Protogames (working folder mode). Nothing to change in a project; working folder apps should pass `base` to the history (see the fix below).

- `panel.showHistory(repo, id, {onRestore})`: called with `{id, item, sha, commit, kept}` after a Restore saved something, also after the conflict question. An app in working folder mode can put the restored version on its board.
- `store.restore(repo, id, commit, {base})` and `panel.showHistory(repo, id, {base})`: a restore saves on top of the version the app has open. **Fix:** without it, Restore saved on top of the version the store last loaded, so it could overwrite a newer save on GitHub without the conflict question. The panel moves `base` on after each restore.
- `panel.showHistory(repo, id, {restore: false})` leaves out the Restore buttons, for an app with its own.
- The `newId` option gets the item being copied: `newId(item)`, so a copy can be named after it. The default still makes a random id.
- `createFakeGitHub()`: `fake.export()` gives its state (repos, files, commits, tokens, the limit) as plain JSON-safe data; `fake.import(state)` and `createFakeGitHub({state})` put it back.
- `package.json` with only `{"type": "module"}`, so Node treats the kit's files as ES modules: a project's tests that import them no longer get the `MODULE_TYPELESS_PACKAGE_JSON` warning. Not a dependency; browsers ignore it.
- The panel keeps the focus after a restore, so Esc still closes it.

## 1.0.0 (2026-11-22)

- First release.
- `createGitStore`: an app's items as JSON files in GitHub repos, one file per item (`<folder>/<id>.json`), every save a commit.
  - Sources followed from links (`#param=short-name` or `owner/repo`), several at once, checked against GitHub's name rules.
  - Public repos read without a token; private repos with one. Only changed files are fetched. Without a token they come from `raw.githubusercontent.com`, checked against git's hash.
  - The last good copy of each source is kept in IndexedDB and shown offline or when GitHub's limit is used up.
  - `save`, `remove` and `open`, with conflicts when the file changed meanwhile (`GitStoreConflict`, settled with `resolve`: overwrite, keep theirs, or save a copy).
  - History: `history`, `version`, `restore`.
  - Tokens per repo in local storage, sent only in the `Authorization` header to `api.github.com`.
- `tokenNeed(source)`: whether a source needs a token, or a new one, and one sentence saying why.
- `createPanel`: the sources and their tokens, the conflict question, and an item's history. Themed with `--gs-*` custom properties.
  - `panel.open({token: repo})` opens straight at that source's token field, focused.
  - A source that needs a token says why and shows "Add a token" or "Replace the token". After saving, the panel says what the token changed.
  - "How do I make a token?": numbered steps for a fine-grained token on GitHub, folded under the token field.
- `createFakeGitHub`: a GitHub in memory, for tests and demos.
