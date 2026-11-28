#!/usr/bin/env node
/* git-store-kit: writes git-store-index.json, the index of a data repo's item files, so that apps read the repo
   without a token and with no GitHub API requests (from raw.githubusercontent.com, which has no limit).

   The original is git-store-kit/index/build-index.mjs in bremondr/web-kit. A data repo keeps a copy at
   .github/build-index.mjs, and .github/workflows/update-index.yml (from the same folder) runs it on every push.
   Plain Node 18+, no packages. Apps never load this file.

     node .github/build-index.mjs                   every top-level folder (not hidden ones like .github)
     node .github/build-index.mjs drills plans      only these folders (a folder inside one: data/boards)
     node .github/build-index.mjs --check           exit code 1 when the index is missing or out of date

   Run it at the repo's root. It lists the item files directly in each folder (<id>.json, where an id is letters,
   digits, '-' and '_', up to 64), with git's blob sha of each, and leaves anything else out (a README, a picture,
   subfolders). It rewrites git-store-index.json only when the list changed, so a commit that touches nothing listed
   leaves it as it was:

     {"type": "git-store-index", "version": 1, "generatedAt": "2026-12-01T10:00:00.000Z", "commit": "<commit sha>",
      "folders": {"drills": [{"name": "abc.json", "path": "drills/abc.json", "sha": "<blob sha>", "size": 1234}]}}

   `commit` is the commit it was built from (git's HEAD), or null outside a git checkout. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const INDEX_FILE = 'git-store-index.json';
const ITEM = /^[A-Za-z0-9_-]{1,64}\.json$/;
const FOLDER_PART = /^[A-Za-z0-9._-]{1,100}$/;
const SKIP = new Set(['node_modules']);

/** Git's id of a file's bytes (its blob sha), what `git hash-object` gives. */
export function blobSha(bytes){
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

const byName = (a, b) => a < b ? -1 : a > b ? 1 : 0;

/** The folders of the index for the repo at `root`: {folder: [{name, path, sha, size}]}, sorted. `folders` names
    them; by default every top-level folder that isn't hidden. Throws for a folder name that isn't one. */
export function indexFolders(root, folders = null){
  let names = folders;
  if (!names || !names.length){
    names = readdirSync(root).filter(n => !n.startsWith('.') && !SKIP.has(n) && FOLDER_PART.test(n) && statSync(join(root, n)).isDirectory());
  } else {
    names = names.map(n => String(n).replace(/^\/+|\/+$/g, ''));
    for (const n of names) if (!n.split('/').every(p => FOLDER_PART.test(p) && p !== '.' && p !== '..')) throw new Error(`Not a folder name: ${n}`);
  }
  const out = {};
  for (const folder of [...new Set(names)].sort(byName)){
    const dir = join(root, folder);
    const files = existsSync(dir) && statSync(dir).isDirectory() ? readdirSync(dir).filter(n => ITEM.test(n)).sort(byName) : [];
    out[folder] = files.filter(name => statSync(join(dir, name)).isFile()).map(name => {
      const bytes = readFileSync(join(dir, name));
      return {name, path: `${folder}/${name}`, sha: blobSha(bytes), size: bytes.length};
    });
  }
  return out;
}

/** The whole index, as the file's text. */
export function indexText(folders, {commit = null, now = new Date()} = {}){
  return JSON.stringify({type: 'git-store-index', version: 1, generatedAt: now.toISOString(), commit, folders}, null, 2) + '\n';
}

/** Whether the index file at `root` already lists exactly these folders. */
export function isCurrent(root, folders){
  try {
    const old = JSON.parse(readFileSync(join(root, INDEX_FILE), 'utf8'));
    return old.type === 'git-store-index' && old.version === 1 && JSON.stringify(old.folders) === JSON.stringify(folders);
  } catch { return false; }
}

function headCommit(root){
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch { return null; }
}

function main(argv){
  const check = argv.includes('--check');
  const root = resolve('.');
  const folders = indexFolders(root, argv.filter(a => a !== '--check'));
  const count = Object.values(folders).reduce((n, list) => n + list.length, 0);
  const summary = `${count} file(s) in ${Object.keys(folders).length} folder(s): ${Object.keys(folders).join(', ') || 'none'}`;
  if (isCurrent(root, folders)){ console.log(`${INDEX_FILE} is up to date (${summary}).`); return 0; }
  if (check){ console.log(`${INDEX_FILE} is missing or out of date (${summary}). Run: node .github/build-index.mjs`); return 1; }
  writeFileSync(join(root, INDEX_FILE), indexText(folders, {commit: headCommit(root)}));
  console.log(`Wrote ${INDEX_FILE} (${summary}).`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href){
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e){ console.error(e.message); process.exitCode = 1; }
}
