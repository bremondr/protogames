/* git-store-kit: an app's items as JSON files in GitHub repos, one file per item, every save a commit.

     import { createGitStore } from './git-store-kit/store.js';
     const store = createGitStore({
       app: 'ultimate-playbook',              // names its storage keys and its cache
       folder: 'drills',                      // where the items are in each repo: drills/<id>.json
       param: 'team',                         // the link parameter: #team=sunset
       shortName: n => `bremondr/ultimate-playbook-${n}`,
       read: json => checkedItemOrNull(json), // every item read from a repo goes through this
       write: item => jsonForTheFile(item),
     });
     store.followFromHash(location.hash);
     await store.load();                      // store.sources(): [{repo, items: [{id, name, item, sha}], …}]
     await store.save(repo, item, {note});    // a commit; throws a GitStoreConflict when it changed meanwhile

   A "source" is a repo the viewer follows. Anyone can read a public one; a private one, and every write, needs a
   GitHub token for that repo, pasted once per device (setToken). The module knows nothing about the items: `read`,
   `write`, `id` and `name` say what they are. See README.md in this folder. */
import { deleteFile, fileHistory, gitBlobSha, GitHubError, listFolder, readBlob, readFile, readRaw, repoInfo, writeFile } from './github.js';
import { checkBranch, checkFolder, checkRepo, hashValue, ID, idOfFile, itemPath, parseRepo, repoKey } from './sources.js';
import { indexedCache } from './cache.js';

export { GitHubError } from './github.js';

/** Thrown by save and remove when the file changed on GitHub since it was loaded. `theirs` is the version there now
    ({item, sha}, or null when it was removed); `mine` is what was being saved (null for a remove). Pass it to
    store.resolve with 'overwrite', 'theirs' or 'copy'. */
export class GitStoreConflict extends GitHubError {
  constructor({repo, id, op, mine, theirs, note}){
    super('conflict', {status: 409});
    this.name = 'GitStoreConflict';
    Object.assign(this, {repo, id, op, mine, theirs, note});
  }
}

/** Whether a source (an entry of store.sources()) needs a token, or a new one, before it works: null when it
    doesn't, or {action: 'add' | 'replace', code, reason}. `reason` is one sentence to show next to the button;
    `label` names a source in it ("repo" unless given). A token that can only read is not a need: it is a choice. */
export function tokenNeed(source, {label = 'repo'} = {}){
  const code = source && source.error && source.error.code;
  if (!code) return null;
  const has = !!source.hasToken;
  if (code === 'no-token') return {action: 'add', code, reason: `Saving to this ${label} needs a GitHub token for it.`};
  if (code === 'not-found') return has
    ? {action: 'replace', code, reason: `GitHub can’t find this ${label} with the token on this device: the token may be for another ${label}, or the name is wrong.`}
    : {action: 'add', code, reason: `GitHub shows this ${label} only with a token: it is private (or the name is wrong). A token for it lets this device read it.`};
  if (code === 'auth') return {action: has ? 'replace' : 'add', code, reason: 'GitHub didn’t accept the token: it may have expired or been deleted. Make a new one and paste it here.'};
  if (code === 'forbidden') return {action: has ? 'replace' : 'add', code, reason: `The token can’t do that in this ${label}. Make one for this ${label} with Contents: Read and write.`};
  return null;
}

const TOKEN = /^[A-Za-z0-9_]{20,255}$/;
const randomId = () => {
  const abc = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => abc[b % abc.length]).join('');
};

// run `work` on each of `list`, at most `n` at a time
async function eachLimited(list, n, work){
  let next = 0;
  await Promise.all(Array.from({length: Math.min(n, list.length)}, async () => { while (next < list.length) await work(list[next++]); }));
}

function localStore(given){
  if (given !== undefined) return given;
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function createGitStore({
  app, folder = 'items', branch = null, param = 'source', shortName = null,
  read, write, id: idOf = item => item && item.id, name: nameOf = item => item && item.name,
  setId = (item, id) => ({...item, id}), newId = randomId,
  commitMessage = ({op, name, note}) => note || `${{add: 'Add', update: 'Update', remove: 'Remove', copy: 'Add a copy of', restore: 'Restore'}[op]} ${name}`,
  indent = 2, maxBytes = 1e6, fetch: fetchFn = (...a) => globalThis.fetch(...a), storage, cache = indexedCache()
} = {}){
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(app || '')) throw new Error('createGitStore needs an `app` name: letters, digits, ".", "-" or "_"');
  if (typeof read !== 'function' || typeof write !== 'function') throw new Error('createGitStore needs `read` and `write`');
  folder = checkFolder(folder);
  branch = checkBranch(branch);
  const local = localStore(storage);
  const SOURCES_KEY = `${app}:git-store:sources`, TOKENS_KEY = `${app}:git-store:tokens`;
  const cacheKey = repo => `${app}:${repoKey(repo)}`;

  /* ---- local storage: the followed repos and the tokens ---- */
  const loadJson = (key, otherwise) => { try { const v = JSON.parse(local.getItem(key)); return v ?? otherwise; } catch { return otherwise; } };
  const saveJson = (key, value) => { try { local.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
  const tokens = () => { const t = local ? loadJson(TOKENS_KEY, {}) : {}; return t && typeof t === 'object' ? t : {}; };
  const tokenOf = repo => { const t = tokens()[repoKey(repo)]; return typeof t === 'string' && TOKEN.test(t) ? t : null; };
  const ctxFor = (repo, withToken = true) => ({fetch: fetchFn, token: withToken ? tokenOf(repo) : null});

  /* ---- state ---- */
  const states = new Map();   // repoKey → {repo, items: Map, loadedAt, error, stale, private, canWrite, dropped, loading}
  const listeners = new Set();
  const emit = () => { const s = sources(); listeners.forEach(fn => { try { fn(s); } catch (e){ setTimeout(() => { throw e; }); } }); };

  function stateOf(repo){
    const k = repoKey(repo);
    if (!states.has(k)) states.set(k, {repo, items: new Map(), loadedAt: 0, error: null, stale: false, private: null, canWrite: null, dropped: 0, loading: null, cached: undefined});
    return states.get(k);
  }
  function needRepo(repo){
    const r = checkRepo(repo);
    if (!r) throw new Error(`Not a repo name: ${String(repo).slice(0, 120)}`);
    return stateOf(r);
  }

  const safeRead = json => { if (json === undefined) return null; try { return read(json) ?? null; } catch { return null; } };
  function entryFrom(id, sha, json){
    let item = safeRead(json);
    if (!item) return null;
    if (idOf(item) !== id) item = setId(item, id);   // the file name says which item it is
    return {id, name: String(nameOf(item) ?? id), item, sha};
  }
  function apply(st, entry){
    st.items = new Map(); st.dropped = 0;
    for (const id of Object.keys(entry.files).sort()){
      const f = entry.files[id], e = entryFrom(id, f.sha, f.json);
      if (e) st.items.set(id, e); else st.dropped++;
    }
    st.loadedAt = entry.loadedAt;
    if (entry.private != null) st.private = entry.private;
    if (entry.canWrite != null) st.canWrite = entry.canWrite;
  }
  async function cachedOf(st){
    if (st.cached === undefined){ try { st.cached = await cache.get(cacheKey(st.repo)); } catch { st.cached = null; } }
    return st.cached;
  }
  async function keep(st, entry){
    st.cached = entry;
    try { await cache.set(cacheKey(st.repo), entry); } catch { /* the copy in memory still works */ }
  }
  // after a save or a remove: the item and the cache at once (the next load lists the folder again)
  async function remember(st, id, version){
    const entry = structuredClone(await cachedOf(st) || {etag: null, files: {}, loadedAt: Date.now()});
    entry.etag = null;
    if (version) entry.files[id] = {sha: version.sha, json: version.json}; else delete entry.files[id];
    await keep(st, entry);
    if (version){ const e = entryFrom(id, version.sha, version.json); if (e) st.items.set(id, e); else st.items.delete(id); }
    else st.items.delete(id);
    emit();
  }

  const errorInfo = e => ({code: e && e.code || 'server', message: e && e.code ? e.message : 'Something went wrong.', resetAt: e && e.resetAt || null});

  function snapshot(st){
    return {
      repo: st.repo, items: [...st.items.values()], loadedAt: st.loadedAt, error: st.error, stale: st.stale,
      private: st.private, canWrite: !!tokenOf(st.repo) && st.canWrite !== false, hasToken: !!tokenOf(st.repo),
      dropped: st.dropped, loading: !!st.loading
    };
  }

  /* ---- following ---- */
  function following(){
    const list = local ? loadJson(SOURCES_KEY, []) : [...states.values()].map(s => s.repo);
    const seen = new Set();
    return (Array.isArray(list) ? list : []).map(checkRepo).filter(r => r && !seen.has(repoKey(r)) && seen.add(repoKey(r)));
  }
  function follow(value){
    const repo = parseRepo(value, shortName);
    if (!repo) return null;
    const list = following();
    const known = list.find(r => repoKey(r) === repoKey(repo));
    if (!known){ list.push(repo); if (local) saveJson(SOURCES_KEY, list); }
    stateOf(known || repo);
    emit();
    return known || repo;
  }
  async function unfollow(repo){
    const k = repoKey(repo);
    if (local) saveJson(SOURCES_KEY, following().filter(r => repoKey(r) !== k));
    removeToken(repo, {quiet: true});
    states.delete(k);
    try { await cache.delete(cacheKey(repo)); } catch { /* nothing kept */ }
    emit();
  }

  /* ---- reading ---- */
  async function fileText(ctx, st, f){
    if (ctx.token) return readBlob(ctx, st.repo, f.sha);
    // no token: raw.githubusercontent.com has no limit but can be a few minutes old, so check it is this version
    const text = await readRaw(ctx, st.repo, f.path, branch).catch(() => null);
    if (text != null){
      const sha = await gitBlobSha(text);
      if (sha === null || sha === f.sha) return text;
    }
    return readBlob(ctx, st.repo, f.sha);
  }

  async function loadSource(st){
    const cached = await cachedOf(st);
    if (!st.loadedAt && cached){ apply(st, cached); st.stale = true; emit(); }   // the saved copy at once
    const ctx = ctxFor(st.repo);
    try {
      const info = ctx.token ? await repoInfo(ctx, st.repo) : null;
      const list = await listFolder(ctx, st.repo, folder, {branch, etag: cached && cached.etag});
      let entry;
      if (list.notModified) entry = {...cached, loadedAt: Date.now()};
      else {
        const files = {}, old = (cached && cached.files) || {};
        const wanted = list.files.map(f => ({...f, id: idOfFile(f.name)})).filter(f => f.id);
        await eachLimited(wanted, 6, async f => {
          if (old[f.id] && old[f.id].sha === f.sha){ files[f.id] = old[f.id]; return; }
          let json;
          try { json = JSON.parse(await fileText(ctx, st, f)); } catch (e){ if (e instanceof GitHubError) throw e; json = undefined; }
          files[f.id] = {sha: f.sha, json};
        });
        entry = {etag: list.etag, files, loadedAt: Date.now()};
      }
      entry.private = info ? info.private : false;   // listed without a token: public
      entry.canWrite = info ? info.canWrite : false;
      await keep(st, entry);
      apply(st, entry);
      st.error = null; st.stale = false;
    } catch (e){
      st.error = errorInfo(e);
      st.stale = !!st.loadedAt;
    }
  }

  /** Loads every followed source (or one), from GitHub where it can and from the saved copy where it can't.
      Resolves to sources() (or that one source) once done; listeners hear about every step. */
  async function load(repo = null){
    const list = repo ? [needRepo(repo).repo] : following();
    await Promise.all(list.map(r => {
      const st = stateOf(r);
      if (!st.loading){
        st.loading = loadSource(st).finally(() => { st.loading = null; emit(); });
        emit();
      }
      return st.loading;
    }));
    return repo ? source(repo) : sources();
  }

  function sources(){ return following().map(r => snapshot(stateOf(r))); }
  function source(repo){ const r = checkRepo(repo); return r ? snapshot(stateOf(r)) : null; }

  /** One item as it is on GitHub now, for editing it (working folder): {item, sha}, or null when there is none. */
  async function open(repo, id){
    const st = needRepo(repo);
    const f = await readFile(ctxFor(st.repo), st.repo, itemPath(folder, id), branch);
    if (!f){ await remember(st, id, null); return null; }
    let json; try { json = JSON.parse(f.text); } catch { throw new GitHubError('invalid', {detail: 'not JSON'}); }
    const e = entryFrom(id, f.sha, json);
    if (!e) throw new GitHubError('invalid', {detail: 'the app could not read it'});
    await remember(st, id, {sha: f.sha, json});
    return {item: e.item, sha: f.sha};
  }

  /* ---- writing ---- */
  async function conflict(st, {id, op, mine, note}){
    const now = await readFile(ctxFor(st.repo), st.repo, itemPath(folder, id), branch).catch(() => null);
    let theirs = null;
    if (now){
      let json; try { json = JSON.parse(now.text); } catch { json = undefined; }
      const e = entryFrom(id, now.sha, json);
      theirs = {item: e ? e.item : null, sha: now.sha};
      await remember(st, id, {sha: now.sha, json});
    } else await remember(st, id, null);
    return new GitStoreConflict({repo: st.repo, id, op, mine, theirs, note});
  }

  /** Saves an item to its file, as one commit. `base` is the version it was loaded at (default: the one this store
      last saw); `overwrite` replaces whatever is there; `asCopy` saves it under a new id. Resolves to
      {id, sha, commit, item}; throws a GitStoreConflict when the file changed since `base`. */
  async function save(repo, item, {base, note = '', overwrite = false, asCopy = false, op = null} = {}){
    const st = needRepo(repo);
    if (!following().some(r => repoKey(r) === repoKey(st.repo))) follow(st.repo);
    const ctx = ctxFor(st.repo);
    if (!ctx.token) throw new GitHubError('no-token');
    let id = idOf(item);
    if (asCopy){ id = newId(item); item = setId(item, id); }   // newId gets the item being copied
    if (typeof id !== 'string' || !ID.test(id)) throw new GitHubError('invalid', {detail: 'the item has no usable id'});
    const json = write(item), text = JSON.stringify(json, null, indent) + '\n';
    if (new TextEncoder().encode(text).length > maxBytes) throw new GitHubError('too-big');
    const path = itemPath(folder, id), known = st.items.get(id);
    let sha = asCopy ? null : base !== undefined ? base : known ? known.sha : null;
    if (overwrite){ const now = await readFile(ctx, st.repo, path, branch); sha = now ? now.sha : null; }
    op = op || (asCopy ? 'copy' : sha ? 'update' : 'add');
    const message = commitMessage({op, item, name: String(nameOf(item) ?? id), note: String(note || '').trim()});
    let result;
    try { result = await writeFile(ctx, st.repo, path, {text, message, sha, branch}); }
    catch (e){ if (e.code === 'conflict') throw await conflict(st, {id, op, mine: item, note}); throw e; }
    await remember(st, id, {sha: result.sha, json});
    return {id, sha: result.sha, commit: result.commit, item};
  }

  /** Removes an item's file, as one commit. Resolves when it is gone (also when it already was). */
  async function remove(repo, id, {base, note = '', overwrite = false} = {}){
    const st = needRepo(repo);
    const ctx = ctxFor(st.repo);
    if (!ctx.token) throw new GitHubError('no-token');
    const path = itemPath(folder, id), known = st.items.get(id);
    let sha = base !== undefined && !overwrite ? base : known && !overwrite ? known.sha : null;
    if (!sha){ const now = await readFile(ctx, st.repo, path, branch); if (!now){ await remember(st, id, null); return {id, commit: null}; } sha = now.sha; }
    const name = known ? known.name : id;
    const message = commitMessage({op: 'remove', item: known ? known.item : null, name, note: String(note || '').trim()});
    let result;
    try { result = await deleteFile(ctx, st.repo, path, {sha, message, branch}); }
    catch (e){
      if (e.code === 'not-found'){ await remember(st, id, null); return {id, commit: null}; }
      if (e.code === 'conflict') throw await conflict(st, {id, op: 'remove', mine: null, note});
      throw e;
    }
    await remember(st, id, null);
    return {id, commit: result.commit};
  }

  /** Settles a conflict: 'overwrite' (mine replaces theirs, or the remove goes ahead), 'theirs' (keep what is on
      GitHub, nothing is written) or 'copy' (mine is saved under a new id). Resolves to {id, sha, item, kept}. */
  async function resolve(c, choice){
    if (!(c instanceof GitStoreConflict)) throw new Error('resolve needs the conflict that save or remove threw');
    if (choice === 'theirs') return {id: c.id, sha: c.theirs ? c.theirs.sha : null, item: c.theirs ? c.theirs.item : null, kept: 'theirs'};
    if (c.op === 'remove'){
      if (choice !== 'overwrite') throw new Error('A removal can only go ahead (overwrite) or keep theirs');
      return {...await remove(c.repo, c.id, {overwrite: true, note: c.note}), item: null, kept: 'mine'};
    }
    if (choice === 'overwrite') return {...await save(c.repo, c.mine, {overwrite: true, note: c.note, op: c.op}), kept: 'mine'};
    if (choice === 'copy') return {...await save(c.repo, c.mine, {asCopy: true, note: c.note}), kept: 'copy'};
    throw new Error(`Not a choice: ${choice}`);
  }

  /* ---- history ---- */
  /** The versions of an item, newest first: [{commit, date, author, message}]. */
  async function history(repo, id){
    const st = needRepo(repo);
    return fileHistory(ctxFor(st.repo), st.repo, itemPath(folder, id), {branch});
  }
  /** An item as it was at a commit: {item, sha}. */
  async function version(repo, id, commit){
    const st = needRepo(repo);
    if (!/^[0-9a-f]{7,64}$/i.test(commit || '')) throw new GitHubError('invalid', {detail: 'not a commit'});
    const f = await readFile(ctxFor(st.repo), st.repo, itemPath(folder, id), commit);
    if (!f) throw new GitHubError('not-found');
    let json; try { json = JSON.parse(f.text); } catch { throw new GitHubError('invalid', {detail: 'not JSON'}); }
    const e = entryFrom(id, f.sha, json);
    if (!e) throw new GitHubError('invalid', {detail: 'the app could not read this version'});
    return {item: e.item, sha: f.sha};
  }
  /** Saves an older version as the newest one (history stays as it was, with one more commit). `base` is the version
      the app has open (working folder): when the file changed since then, it throws a GitStoreConflict, as save does.
      Without it, the version this store last saw is the base. Resolves to what save resolves to. */
  async function restore(repo, id, commit, {base, note = ''} = {}){
    const old = await version(repo, id, commit);
    const st = needRepo(repo);
    const known = st.items.get(id);
    const message = note || `Restore ${nameOf(old.item) ?? id} as it was in ${commit.slice(0, 7)}`;
    if (base !== undefined) return save(st.repo, old.item, {note: message, op: 'restore', base});
    return save(st.repo, old.item, {note: message, op: 'restore', base: known ? known.sha : undefined, overwrite: !known});
  }

  /* ---- tokens ---- */
  /** Keeps a token for a repo on this device. Throws when it doesn't look like a GitHub token. */
  function setToken(repo, token){
    const st = needRepo(repo);
    const t = String(token || '').trim();
    if (!TOKEN.test(t)) throw new Error('That doesn’t look like a GitHub token. Copy the whole token, which starts with github_pat_.');
    const all = tokens();
    all[repoKey(st.repo)] = t;
    if (!local || !saveJson(TOKENS_KEY, all)) throw new Error('This browser can’t keep the token (storage is off or full).');
    st.canWrite = null;
    emit();
  }
  function removeToken(repo, {quiet = false} = {}){
    const all = tokens();
    delete all[repoKey(repo)];
    if (local) saveJson(TOKENS_KEY, all);
    const st = states.get(repoKey(repo));
    if (st) st.canWrite = null;
    if (!quiet) emit();
  }
  const hasToken = repo => !!tokenOf(repo);

  function subscribe(fn){ listeners.add(fn); return () => listeners.delete(fn); }

  return {
    app, folder, branch, param,
    following, follow, unfollow,
    followFromHash: (hash = globalThis.location ? globalThis.location.hash : '') => { const v = hashValue(hash, param); return v == null ? null : follow(v); },
    load, sources, source,
    items: () => sources().flatMap(s => s.items.map(i => ({repo: s.repo, ...i}))),
    open, save, remove, resolve, history, version, restore,
    /** An item's name, as the project's `name` option gives it. */
    nameOf: item => (item == null ? '' : String(nameOf(item) ?? idOf(item) ?? '')),
    setToken, removeToken, hasToken,
    subscribe
  };
}
