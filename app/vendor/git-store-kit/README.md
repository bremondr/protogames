# Git store kit

An app's items (a drill, a game board, a note) kept as JSON files in GitHub repos, with no server. Each item is one file, `<folder>/<id>.json`, and every save is a commit, so git keeps the history of every item. Anyone reads a public repo; a private repo, and every save, needs a GitHub token pasted once per device. Plain ES modules and one stylesheet, with no dependencies and no build step.

The module knows nothing about the items: the project says how to read and write them. Nothing in this folder imports from outside it (`tools/check-modules.mjs` checks that). Changes are listed in `CHANGELOG.md`.

## What it does

- **Sources.** A source is a repo the viewer follows, several at once, remembered on the device. A link adds one: `#team=sunset` (a short name the project turns into `owner/repo`) or `#team=owner/repo`. Every name is checked against GitHub's rules before it becomes part of a URL.
- **Reading.**
  - The folder is listed through GitHub's API, and only files whose content changed since the last load are fetched.
  - Without a token, file contents come from `raw.githubusercontent.com`, which has no rate limit. Each file is checked against git's hash for that version, because that host can serve a copy a few minutes old.
  - With a token, everything goes through the API.
  - Every item goes through the project's `read`, which drops anything it can't use.
- **Offline.** The last good copy of each source is kept on the device (IndexedDB), and shown when GitHub can't be reached or its limit is used up, with the reason.
- **Saving.** One item, one commit, with a message from the project (a note the person typed, or "Update Angel drill").
  - Files are written as indented JSON, one property per line, so GitHub's history shows what changed.
  - **Conflicts:** if the file changed since it was loaded (another device, someone on GitHub), the save is refused. The person chooses: replace what is on GitHub with their version, keep what is on GitHub, or save their version as a copy. Nothing is lost either way, because the other version stays in git's history.
- **History.** An item's versions (date, note, author), one opened read-only, or restored as a new save. A restore in working folder mode saves on top of the version the app has open, so a newer save on GitHub brings up the conflict question.
- **Two ways to use it**, with the same calls:
  - *Publish:* work stays in the browser as before, and "Publish" writes one item to a repo. Readers see the newest published version. (Ultimate Playbook's team drills.)
  - *Working folder:* open an item from the repo (`open`), edit it, and save it back with the version it was opened at (`base`). (Protogames' boards.)
- **The panel** (optional): the followed sources with their state, a token to paste, replace or remove for each, the conflict question, and an item's history.

## Files

| File | What it does |
|---|---|
| `store.js` | `createGitStore(options)`: sources, loading, the saved copy, save, remove, conflicts, history, tokens |
| `panel.js` | `createPanel(store, options)`: the sources and tokens, the conflict question, an item's history |
| `github.js` | the GitHub requests, UTF-8 base64, git's blob hash, and `GitHubError`. No DOM |
| `sources.js` | link values, repo names, folders and item files. No DOM |
| `cache.js` | the saved copy of each source in IndexedDB, or in memory where there is none |
| `fake-github.js` | `createFakeGitHub()`: a small GitHub in memory, for a project's tests and for the demo. Its state can be exported and imported |
| `package.json` | only `{"type": "module"}`: tells Node the `.js` files are ES modules, so a project's Node tests import them without a warning. Not a dependency; browsers ignore it |
| `git-store-kit.css` | the panel; themed with `--gs-*` custom properties |

## Using it

```html
<link rel="stylesheet" href="js/vendor/git-store-kit/git-store-kit.css">
```

```js
import { createGitStore } from './vendor/git-store-kit/store.js';
import { createPanel } from './vendor/git-store-kit/panel.js';

const store = createGitStore({
  app: 'ultimate-playbook',                   // names the device's storage keys and saved copies: one per app
  folder: 'drills',                           // the items are drills/<id>.json in each repo
  param: 'team',                              // the link parameter: #team=…
  shortName: n => `bremondr/ultimate-playbook-${n}`,   // optional: #team=sunset → that repo
  read: json => readRaw(json),                // a file's JSON → the item, or null to leave it out
  write: item => serialize(item),             // the item → the file's JSON
  id: item => item.id,                        // default: item.id. Ids are letters, digits, '-' and '_', up to 64
  name: item => item.name,                    // default: item.name. For commit messages and the panel
  setId: (item, id) => ({...item, id}),       // default as shown: a copy of the item under a new id
  newId: item => `${slug(item.name)}-copy`,   // optional: the id of a copy, given the item being copied. Default: random
  commitMessage: ({op, name, note}) => note || `${op} ${name}`,   // op: add, update, remove, copy, restore
});
const panel = createPanel(store, {title: 'Teams', noun: 'drill', sourceLabel: 'team'});

store.followFromHash(location.hash);          // follows the repo in #team=…, if there is one
store.subscribe(sources => redrawLists(sources));
await store.load();
```

### Reading

`store.sources()` (and what `load()` resolves to, and what `subscribe` listeners get) is a list, one entry per followed repo:

| Field | What it is |
|---|---|
| `repo` | `"owner/repo"` |
| `items` | `[{id, name, item, sha}]`: the items `read` accepted. `sha` is the version of the file |
| `loadedAt` | when it was last loaded from GitHub (ms), or 0 |
| `error` | `null`, or `{code, message, resetAt}` from the last load. `message` is a sentence to show people |
| `stale` | the items are the copy saved on the device, because the last load failed |
| `private`, `canWrite`, `hasToken` | what the repo is, and what this device can do there |
| `dropped` | how many `.json` files `read` refused |
| `loading` | a load is under way |

Also: `store.items()` (every item of every source, each with its `repo`), `store.source(repo)`, `store.following()`, `store.follow(value)` (returns the repo, or null for a bad value), `store.unfollow(repo)` (also forgets its token and saved copy), `store.load(repo)` for one source.

### Saving

```js
// publish: the store knows the version it last loaded, and uses it
const result = await panel.save(repo, drill, {note: 'Tighter cuts'});   // null if the person cancelled
// working folder: open the newest version, edit, save with the version it was opened at
const {item, sha} = await store.open(repo, id);
const saved = await panel.save(repo, edited, {base: sha});
await panel.remove(repo, id);
```

`panel.save` and `panel.remove` ask the conflict question when there is one. Without the panel, `store.save` and `store.remove` throw a `GitStoreConflict` instead (with `theirs`: `{item, sha}`, or null when it was removed), which `store.resolve(conflict, 'overwrite' | 'theirs' | 'copy')` settles. A save resolves to `{id, sha, commit, item, kept}`; `kept` is `'mine'`, `'theirs'` or `'copy'` after a conflict. After `'copy'`, `item` and `id` are the copy's.

Other options of `save`: `overwrite: true` (replace whatever is there), `asCopy: true` (a new id, from the `newId` option, which gets the item being copied), `base: null` (it must be a new file).

### History

```js
panel.showHistory(repo, id, {onOpen: ({item, commit, date}) => showReadOnly(item)});
// working folder: restore on top of the version the app has open, and put what was restored on the board
panel.showHistory(repo, id, {base: opened.sha, onRestore: ({id, item, sha}) => { opened = {id, sha}; showOnBoard(item); }});
// or without the panel:
const versions = await store.history(repo, id);          // [{commit, date, author, message}], newest first
const {item} = await store.version(repo, id, versions[2].commit);
await store.restore(repo, id, versions[2].commit);       // that version becomes the newest
await store.restore(repo, id, versions[2].commit, {base: opened.sha, note: 'Back to the first plan'});
```

`store.restore(repo, id, commit, {base, note})` resolves to what `save` resolves to. With `base`, it saves on top of that version, and throws a `GitStoreConflict` (`op: 'restore'`) when the file changed since, which `store.resolve` settles as for a save. Without `base`, it saves on top of the version the store last loaded: fine in publish mode, but in working folder mode pass the version the app opened, or a newer save on GitHub can be overwritten without the question.

Options of `panel.showHistory(repo, id, options)`:

| Option | What it does |
|---|---|
| `onOpen({item, sha, commit, date})` | adds an "Open" button to each version: the panel closes and gives the app that version, read-only |
| `onRestore({id, item, sha, commit, kept})` | called after a Restore saved something, also after the conflict question. `sha` is the file's new version and `commit` the new commit; `kept` is `null`, `'mine'` (after "Overwrite with mine") or `'copy'` (saved as a copy: `id` is the copy's). Not called when the restore was cancelled or the version on GitHub was kept |
| `base` | the version the app has open (working folder). Restore saves on top of it, asking the conflict question when GitHub has a newer one; after a restore the panel moves it on to the restored version |
| `restore: false` | leaves out the Restore buttons, for an app that offers its own |
| `name` | the item's name in the heading, when the store doesn't know it |

### Tokens

`store.setToken(repo, token)` (throws if it doesn't look like a GitHub token), `store.removeToken(repo)`, `store.hasToken(repo)`. The panel does this for people.

`tokenNeed(source, {label})` (exported from `store.js`) says whether a source needs a token, or a new one, before it works: `null`, or `{action, code, reason}`. `action` is `'add'` or `'replace'`, and `reason` is one sentence to show next to the button (`label` names a source in it: `'repo'` unless given). It comes from the source's error: `no-token`, `not-found` (a private repo without a token, or a token for another repo), `auth` (the token expired or was deleted) and `forbidden` (the token lacks a permission). A token that can only read is not a need. Use it to put an "Add a token" button where the app shows a source, opening the panel there:

```js
for (const s of store.sources()) {
  const need = tokenNeed(s, {label: 'team'});
  if (need) showButton(s.repo, need.action === 'replace' ? 'Replace the token' : 'Add a token', need.reason, () => panel.open({token: s.repo}));
}
```

### Errors

Every failure is a `GitHubError` (exported from `store.js`) with a `code` and a `message` to show people:

| `code` | When |
|---|---|
| `no-token` | a save, or a private repo, without a token |
| `auth` | GitHub doesn't accept the token (expired, or deleted) |
| `forbidden` | the token is valid but can't do that in this repo |
| `not-found` | no such repo, or a private one without a token for it |
| `rate-limit` | the 60 reads an hour without a token are used up; `resetAt` says when they come back |
| `offline` | GitHub can't be reached |
| `conflict` | the file changed meanwhile (a `GitStoreConflict`) |
| `too-big` | the item is bigger than `maxBytes` (1 MB unless set) |
| `invalid`, `server` | GitHub refused it, or had a problem |

### The panel

`createPanel(store, {title, noun, nouns, sourceLabel, heading, tokenHelp, parent})`:

- `panel.open()` shows the sources. A source that needs a token says why, with an "Add a token" (or "Replace the token") button. After a token is saved, the panel says what it changed ("Token saved. owner/repo: 3 drills, you can edit.");
- `panel.open({token: repo})` shows them with that source's token field open and focused, ready to paste in. Under the field, "How do I make a token?" folds out the steps for making one on GitHub (`tokenHelp` replaces them with the project's own text);
- `panel.save` and `panel.remove` ask about conflicts;
- `panel.showHistory(repo, id, {onOpen, onRestore, base, restore, name})` shows an item's versions (see History above);
- `panel.askConflict(conflict)` asks without saving, and resolves to the choice or null;
- `panel.close()`.

Esc closes it. Set these on `:root` or `.gs`; the defaults are neutral greys and green:

`--gs-surface` `--gs-ink` `--gs-muted` `--gs-rule` `--gs-accent` `--gs-on-accent` `--gs-warn` `--gs-danger` `--gs-font` `--gs-display` `--gs-z`

### Testing a project's adapter

`createFakeGitHub()` from `fake-github.js` answers the store's requests in memory: give its `fetch` to `createGitStore`, and `memoryCache()` from `cache.js` as `cache`, and the adapter's tests run in plain Node. See this folder's `store.test.mjs`.

The kit's files are ES modules. Its own `package.json` (`{"type": "module"}`) tells Node so, whatever the project's `package.json` says, so importing them in the project's tests gives no `MODULE_TYPELESS_PACKAGE_JSON` warning. Keep that file when the kit is vendored (`update-vendor.mjs` copies it).

The fake's state can be kept and put back, for example so a practice mode survives a reload:

```js
sessionStorage.setItem('practice', JSON.stringify(fake.export()));   // repos, files, commits, tokens, the limit
const again = createFakeGitHub({state: JSON.parse(sessionStorage.getItem('practice'))});
fake.import(state);                                                   // the same, into an existing fake
```

`export()` gives plain data that survives `JSON.stringify`; `import()` replaces everything the fake keeps (not its request log, `offline` or `staleRaw`), and throws for anything that isn't such a state.

## Setting it up in a project

With the kit copied into the project (see [web-kit's setup guide](../docs/setup-project.md)), usually at `js/vendor/git-store-kit/`:

1. **A data repo.** On GitHub, make a repo for the items, for example `ultimate-playbook-sunset`. It holds only data, never the app. Pick public (anyone with the name can read it, with no token) or private (every reader needs a token).
   - Add the folder with one item, or a `README.md` in it, so the folder exists.
   - It doesn't need GitHub Pages.
   - The app writes files to the default branch. To keep a repo for each team, class or project, make one repo each: tokens are limited to whole repos.
2. **A token for each editor and each repo.** The same steps are in the panel, under "How do I make a token?":
   1. On GitHub: Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token ([direct link](https://github.com/settings/personal-access-tokens/new)).
   2. **Resource owner:** the account or organisation that owns the data repo.
   3. **Expiration:** a date, for example in a year.
   4. **Repository access:** Only select repositories, then only the data repo.
   5. **Repository permissions** → Contents: **Read and write** to save. GitHub adds *Metadata: Read-only* itself. Nothing else.
   6. Generate the token and copy it: it starts with `github_pat_`. GitHub shows it only once.
   7. In the app, tap "Add a token" next to the repo (or open the panel and choose the repo's token button), paste it and save. The panel says what changed: the repo's items, and "you can edit".

   Do this on each device that edits. The token stays in that browser and is sent only to GitHub. For readers of a private repo, the same steps with Contents: **Read-only** give a token that can only read; hand it to them. The app then shows the repo as "Read only".
3. **The adapter.** Write one project file, for example `js/features/team.js`, that calls `createGitStore` and `createPanel` with the project's `app`, `folder`, `param`, `shortName`, and `read` and `write` for its items. `read` must check every field, because data in a repo was written by someone else. It draws the items into the app's lists and adds the buttons ("Publish to team", "Save to repo", "History"). Keep this file out of the vendored folder.
4. **The styles.** Link `git-store-kit.css` and set the `--gs-*` properties to the project's colours and fonts.
5. **Content-Security-Policy.** If the page has one, its `connect-src` must allow `https://api.github.com https://raw.githubusercontent.com`. Those two hosts serve every repo of every owner.
6. **Service worker.** The module never reads from the app's own site, so a service worker doesn't get in the way. Still, it must not cache requests to `api.github.com` or `raw.githubusercontent.com`: the module keeps its own copy, and a cached answer would hide changes. A worker that handles only its own site's files is fine. If it keeps a list of files, add the kit's files (`store.js`, `panel.js`, `github.js`, `sources.js`, `cache.js`, `git-store-kit.css`). `fake-github.js` is only for tests.
7. **Previews.** If pull request previews give local storage a prefix per preview, as both of bremondr's apps do, a token pasted on the live app isn't seen in a preview. That stops a preview from writing to the real data by accident. Paste a token in the preview only to try saving on purpose.
8. **Links.** A link to a source is the app's address with `#<param>=<short name or owner/repo>`. `store.followFromHash()` follows it; `hashWithout(hash, param)` from `sources.js` tidies the address afterwards, if wanted.

[web-kit's demo](https://github.com/bremondr/web-kit/blob/main/demo/git-store-kit.js) is a short, complete example of both modes.

## Limits

- **Public repos are public.** Anyone with the repo's name can read every item and its whole history. Use a private repo for anything else.
- **Tokens are as safe as the site.** A token is kept in the browser's local storage, where every page of the same site can read it. On `<owner>.github.io` that is every app and preview of that owner. So give each token one repo, only *Contents*, and an expiry date: if one leaks, the worst case is changes to that one repo, which git's history can undo. The module sends a token only in the `Authorization` header to `api.github.com`, never in a URL, an error, the saved copy or a log.
- **The saved copy of a private repo** is kept in IndexedDB, also readable by every page of the same site, and also by previews, which don't prefix IndexedDB.
- **Rate limits.** Without a token, GitHub allows 60 API requests an hour for each IP address: a team on one Wi-Fi shares them. One load costs one request for the folder (none when nothing changed: a `304` doesn't count), plus one for each file that `raw.githubusercontent.com` served out of date. A reader who needs more can use a read token (5,000 an hour).
- **Sizes.** At most 1,000 files are listed in a folder (GitHub's limit for listing a folder). Items up to 100 MB can be read; saving refuses items over `maxBytes` (1 MB unless set).
- **Editors.** Fine-grained tokens only reach repos owned by the account or organisation they are made for. Someone who is only a collaborator on another person's repo may not be able to make one. For several editors, put the data repos in an organisation.
- **No "Sign in with GitHub".** That needs a server: GitHub's sign-in doesn't allow requests from a web page. So tokens are pasted.
- **A few minutes for readers.** The editor sees a save at once. Other devices see it at their next load; `raw.githubusercontent.com` can lag a few minutes, and the module then reads the file through the API instead.
