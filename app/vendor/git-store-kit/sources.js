/* git-store-kit: link values, repo names, folders and item ids. No DOM, so it runs in Node.

   Everything that ends up in a URL passes through here first, and is checked strictly against GitHub's rules, so a
   value from a link (#team=…) can't become anything but a plain repo name. */

// GitHub user and organisation names: letters, digits and single hyphens, not at either end, at most 39 characters
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
// repository names: letters, digits, '.', '-' and '_', at most 100 characters, and not '.' or '..'
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
// a folder inside the repo: names like a repo's, separated by '/'
const FOLDER_PART = /^[A-Za-z0-9._-]{1,100}$/;
// branch names: kept to a safe subset of what git allows
const BRANCH = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
// an item's id is its file name without .json
export const ID = /^[A-Za-z0-9_-]{1,64}$/;

const isRepoName = name => REPO.test(name) && name !== '.' && name !== '..' && !/\.git$/i.test(name);

/** "owner/repo" if the value is one, checked; null otherwise. */
export function checkRepo(value){
  if (typeof value !== 'string') return null;
  const m = /^([^/]+)\/([^/]+)$/.exec(value.trim());
  return m && OWNER.test(m[1]) && isRepoName(m[2]) ? `${m[1]}/${m[2]}` : null;
}

/** A link value as "owner/repo": "owner/repo" in full, or a short name through `shortName` (sunset →
    bremondr/ultimate-playbook-sunset). Null when it isn't one, or when the short name gives something that isn't. */
export function parseRepo(value, shortName = null){
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (v.includes('/')) return checkRepo(v);
  if (!shortName || !isRepoName(v)) return null;
  let full = null;
  try { full = shortName(v); } catch { return null; }
  return checkRepo(full);
}

/** The same repo whatever the letter case: GitHub treats names case-insensitively. */
export const repoKey = repo => String(repo).toLowerCase();

/** The value of `param` in the part of an address after '#', for example 'sunset' in '#angel&team=sunset'. */
export function hashValue(hash, param){
  const parts = String(hash || '').replace(/^#/, '').split('&');
  for (const part of parts){
    const k = part.indexOf('=');
    if (k > 0 && part.slice(0, k) === param){
      try { return decodeURIComponent(part.slice(k + 1)); } catch { return null; }
    }
  }
  return null;
}

/** The hash without `param`, for an app that wants to tidy the address after following a source. */
export function hashWithout(hash, param){
  const parts = String(hash || '').replace(/^#/, '').split('&').filter(p => p && !p.startsWith(param + '='));
  return parts.length ? '#' + parts.join('&') : '';
}

/** A folder inside the repo ('drills', 'data/boards'), checked; '' for the root. Throws when it isn't one. */
export function checkFolder(folder){
  if (folder == null || folder === '') return '';
  const parts = String(folder).replace(/^\/+|\/+$/g, '').split('/');
  if (!parts.every(p => FOLDER_PART.test(p) && p !== '.' && p !== '..')) throw new Error(`Not a folder name: ${folder}`);
  return parts.join('/');
}

/** A branch name, checked; null for the repo's default branch. Throws when it isn't one. */
export function checkBranch(branch){
  if (branch == null || branch === '') return null;
  if (!BRANCH.test(branch) || branch.split('/').some(p => p === '.' || p === '..' || p.endsWith('.lock'))) throw new Error(`Not a branch name: ${branch}`);
  return branch;
}

/** The file of an item: <folder>/<id>.json. */
export function itemPath(folder, id){
  if (!ID.test(id)) throw new Error('Not an item id');
  return (folder ? folder + '/' : '') + id + '.json';
}

/** The id of an item's file name, or null for any other file (a README, a picture, a file with another name). */
export function idOfFile(name){
  const m = /^(.+)\.json$/.exec(name);
  return m && ID.test(m[1]) ? m[1] : null;
}

/** A path for a URL: each part encoded, the slashes kept. */
export const encodePath = path => path.split('/').map(encodeURIComponent).join('/');

/* ---- the index: git-store-index.json at the root of a repo ----

   {"type": "git-store-index", "version": 1, "generatedAt": "<ISO date>", "commit": "<commit sha or null>",
    "folders": {"drills": [{"name": "abc.json", "path": "drills/abc.json", "sha": "<git blob sha>", "size": 1234}]}}

   Made by index/build-index.mjs in the data repo, on every push. Someone else wrote it, so every field is checked. */
export const INDEX_FILE = 'git-store-index.json';
const SHA = /^[0-9a-f]{40}$/;

/** The files of `folder` in an index ([{name, path, sha, size}], like a folder listing), or null when the index
    isn't a valid one or doesn't list that folder. One bad entry makes the whole index unusable. */
export function indexedFiles(index, folder){
  if (!index || typeof index !== 'object' || Array.isArray(index)) return null;
  if (index.type !== 'git-store-index' || index.version !== 1) return null;
  if (index.commit != null && !SHA.test(index.commit)) return null;
  if (index.generatedAt != null && (typeof index.generatedAt !== 'string' || isNaN(Date.parse(index.generatedAt)))) return null;
  const folders = index.folders;
  if (!folders || typeof folders !== 'object' || Array.isArray(folders)) return null;
  if (!Object.prototype.hasOwnProperty.call(folders, folder)) return null;
  const list = folders[folder];
  if (!Array.isArray(list)) return null;
  const prefix = folder ? folder + '/' : '', seen = new Set(), out = [];
  for (const f of list){
    if (!f || typeof f !== 'object') return null;
    const {name, path, sha, size} = f;
    if (typeof name !== 'string' || !idOfFile(name) || path !== prefix + name || seen.has(name)) return null;
    if (typeof sha !== 'string' || !SHA.test(sha)) return null;
    if (size != null && !(Number.isSafeInteger(size) && size >= 0)) return null;
    seen.add(name);
    out.push({name, path, sha, size: size ?? null});
  }
  return out;
}
