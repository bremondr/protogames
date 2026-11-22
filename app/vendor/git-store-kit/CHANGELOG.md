# Changes to git-store-kit

Each version is released as the tag `git-store-kit-vX.Y.Z`. A new major version (the first number) means a project using the kit may need changes; the notes say which.

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
