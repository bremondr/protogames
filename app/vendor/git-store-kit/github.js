/* git-store-kit: the GitHub calls. No DOM, so it runs in Node.

   Every call takes a context {fetch, token}: `fetch` is the browser's (or a fake one in tests and the demo), and
   `token` is only ever put in the Authorization header of requests to api.github.com. It is never part of a URL, an
   error, or anything returned.

   - Lists and file contents with a token go through the API (5,000 requests an hour).
   - Without a token, the list comes from the repo's index (git-store-index.json) on raw.githubusercontent.com when
     it has one, or else through the API (60 requests an hour for each IP address, a 304 included), and file contents
     come from raw.githubusercontent.com, which has no limit. */
import { encodePath, INDEX_FILE } from './sources.js';

export const API = 'https://api.github.com';
export const RAW = 'https://raw.githubusercontent.com';

/* What went wrong, in words people can act on. `code` is for the app:
   no-token, auth, forbidden, not-found, rate-limit, offline, conflict, too-big, invalid, server */
const MESSAGES = {
  'no-token': 'This needs a GitHub token for the repo.',
  auth: 'GitHub didn’t accept the token. It may have expired: make a new one and paste it again.',
  forbidden: 'The token can’t do that in this repo. Check that it was made for this repo, with the right permissions.',
  'not-found': 'GitHub can’t find it. Check the repo’s name; a private repo also needs a token.',
  'rate-limit': 'GitHub’s limit for reading without a token is used up for now.',
  offline: 'GitHub can’t be reached. Check the connection.',
  conflict: 'It changed on GitHub since it was loaded.',
  'too-big': 'It’s too big to save.',
  invalid: 'GitHub refused it as it is.',
  server: 'GitHub had a problem. Try again in a moment.'
};

export class GitHubError extends Error {
  constructor(code, {status = 0, resetAt = null, detail = ''} = {}){
    let message = MESSAGES[code] || MESSAGES.server;
    if (code === 'rate-limit' && resetAt) message += ` It resets at ${new Date(resetAt).toTimeString().slice(0, 5)}, or add a token.`;
    super(message);
    this.name = 'GitHubError';
    this.code = code;
    this.status = status;
    this.resetAt = resetAt;
    this.detail = String(detail || '').slice(0, 200);   // GitHub's own message, for logs; it never holds the token
  }
}

/* ---- text and bytes ---- */
const utf8 = new TextEncoder(), fromUtf8 = new TextDecoder();

/** base64 of the text's UTF-8 bytes: plain btoa only takes Latin-1 and breaks on "Šňůra". */
export function toBase64(text){
  const bytes = utf8.encode(text);
  let s = '';
  for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
  return btoa(s);
}
/** The text in base64 (GitHub's has line breaks in it). */
export function fromBase64(b64){
  const s = atob(String(b64).replace(/\s+/g, ''));
  return fromUtf8.decode(Uint8Array.from(s, c => c.charCodeAt(0)));
}

/** Git's id of a file's content (its blob sha): SHA-1 of "blob <bytes>\0" and the bytes. Null where the browser
    has no crypto.subtle (a page on plain http other than localhost). */
export async function gitBlobSha(text){
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) return null;
  const body = utf8.encode(text), head = utf8.encode(`blob ${body.length}\0`);
  const all = new Uint8Array(head.length + body.length);
  all.set(head); all.set(body, head.length);
  const hash = new Uint8Array(await subtle.digest('SHA-1', all));
  return [...hash].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ---- requests ---- */
async function send(ctx, url, init){
  try { return await ctx.fetch(url, init); }
  catch (e){ throw new GitHubError('offline', {detail: e && e.name}); }
}

async function failure(res, {token}){
  let detail = '';
  try { const body = await res.json(); detail = body && body.message; } catch { /* not JSON */ }
  const s = res.status, h = res.headers;
  const remaining = h.get('x-ratelimit-remaining'), reset = Number(h.get('x-ratelimit-reset'));
  if ((s === 403 || s === 429) && (remaining === '0' || /rate limit/i.test(detail)))
    return new GitHubError('rate-limit', {status: s, resetAt: reset ? reset * 1000 : null, detail});
  if (s === 401) return new GitHubError(token ? 'auth' : 'no-token', {status: s, detail});
  if (s === 403) return new GitHubError(token ? 'forbidden' : 'no-token', {status: s, detail});
  if (s === 404) return new GitHubError('not-found', {status: s, detail});
  if (s === 409) return new GitHubError('conflict', {status: s, detail});
  if (s === 413) return new GitHubError('too-big', {status: s, detail});
  // a save without the file's current sha, or with an old one, is refused with 422 that says so
  if (s === 422) return new GitHubError(/sha/i.test(detail) ? 'conflict' : 'invalid', {status: s, detail});
  return new GitHubError('server', {status: s, detail});
}

/** A request to api.github.com. Returns the Response for 2xx and 304, throws a GitHubError otherwise. */
export async function api(ctx, method, path, {body, accept = 'application/vnd.github+json', etag} = {}){
  const headers = {Accept: accept};
  if (ctx.token) headers.Authorization = `Bearer ${ctx.token}`;
  if (etag) headers['If-None-Match'] = etag;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  // no-store: the browser neither answers from its cache nor adds conditions of its own, so a 304 reaches us
  const res = await send(ctx, API + path, {method, headers, cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body)});
  if (res.ok || res.status === 304) return res;
  throw await failure(res, ctx);
}

const repoPath = repo => `/repos/${repo.split('/').map(encodeURIComponent).join('/')}`;
const query = params => {
  const q = Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  return q.length ? '?' + q.join('&') : '';
};

/** What the repo is to this token: {private, canWrite, defaultBranch}. */
export async function repoInfo(ctx, repo){
  const r = await (await api(ctx, 'GET', repoPath(repo))).json();
  return {private: !!r.private, canWrite: !!(r.permissions && r.permissions.push), defaultBranch: r.default_branch || 'main'};
}

/** The files in a folder: {etag, files: [{name, path, sha, size}]}, or {notModified: true} when it is the same as
    for `etag`. A missing folder in a repo that exists is an empty list. */
export async function listFolder(ctx, repo, folder, {branch = null, etag = null} = {}){
  let res;
  try { res = await api(ctx, 'GET', `${repoPath(repo)}/contents/${encodePath(folder)}${query({ref: branch})}`, {etag}); }
  catch (e){
    if (e.code !== 'not-found' || !folder) throw e;
    await repoInfo(ctx, repo);                 // throws not-found when the repo itself is missing (or private)
    return {etag: null, files: []};
  }
  if (res.status === 304) return {notModified: true};
  const list = await res.json();
  if (!Array.isArray(list)) throw new GitHubError('invalid', {detail: 'not a folder'});
  return {
    etag: res.headers.get('etag'),
    files: list.filter(f => f && f.type === 'file').map(f => ({name: f.name, path: f.path, sha: f.sha, size: f.size}))
  };
}

/** A file's text by its blob sha, through the API: exact, whatever its size (up to 100 MB). */
export async function readBlob(ctx, repo, sha){
  return (await api(ctx, 'GET', `${repoPath(repo)}/git/blobs/${encodeURIComponent(sha)}`, {accept: 'application/vnd.github.raw'})).text();
}

/** A public file's text from raw.githubusercontent.com (no rate limit; may be up to 5 minutes old), or null. */
export async function readRaw(ctx, repo, path, branch = null){
  const res = await send(ctx, `${RAW}/${repo}/${branch ? encodePath(branch) : 'HEAD'}/${encodePath(path)}`, {cache: 'no-cache'});
  return res.ok ? res.text() : null;
}

/** The repo's index (git-store-index.json) from raw.githubusercontent.com, parsed but not checked: null when there is
    none, or it isn't JSON. Throws `offline` when the host can't be reached. */
export async function readIndex(ctx, repo, branch = null){
  const text = await readRaw(ctx, repo, INDEX_FILE, branch);
  if (text == null) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/** A file as it is now (or at `ref`, a branch or a commit): {sha, text}, or null when there is no such file. */
export async function readFile(ctx, repo, path, ref = null){
  let res;
  try { res = await api(ctx, 'GET', `${repoPath(repo)}/contents/${encodePath(path)}${query({ref})}`); }
  catch (e){ if (e.code === 'not-found') return null; throw e; }
  const f = await res.json();
  if (!f || f.type !== 'file') return null;
  // up to 1 MB the content comes inline; above that it is empty, and the blob gives it
  const text = f.encoding === 'base64' && f.content ? fromBase64(f.content) : await readBlob(ctx, repo, f.sha);
  return {sha: f.sha, text};
}

/** Creates or replaces a file. `sha` is the version it replaces (none for a new file); GitHub refuses with a
    conflict when the file is no longer that version. Returns {sha, commit}. */
export async function writeFile(ctx, repo, path, {text, message, sha = null, branch = null}){
  if (!ctx.token) throw new GitHubError('no-token');
  const body = {message, content: toBase64(text)};
  if (sha) body.sha = sha;
  if (branch) body.branch = branch;
  const r = await (await api(ctx, 'PUT', `${repoPath(repo)}/contents/${encodePath(path)}`, {body})).json();
  return {sha: r.content && r.content.sha, commit: r.commit && r.commit.sha};
}

/** Deletes a file at version `sha`. Returns {commit}. */
export async function deleteFile(ctx, repo, path, {sha, message, branch = null}){
  if (!ctx.token) throw new GitHubError('no-token');
  const body = {message, sha};
  if (branch) body.branch = branch;
  const r = await (await api(ctx, 'DELETE', `${repoPath(repo)}/contents/${encodePath(path)}`, {body})).json();
  return {commit: r.commit && r.commit.sha};
}

/** The commits that changed a file, newest first: [{commit, date, author, message}]. */
export async function fileHistory(ctx, repo, path, {branch = null, max = 30} = {}){
  const list = await (await api(ctx, 'GET', `${repoPath(repo)}/commits${query({path, sha: branch, per_page: max})}`)).json();
  return (Array.isArray(list) ? list : []).map(c => ({
    commit: c.sha,
    date: (c.commit && (c.commit.committer || c.commit.author) || {}).date || null,
    author: (c.author && c.author.login) || (c.commit && c.commit.author && c.commit.author.name) || '',
    message: (c.commit && c.commit.message) || ''
  }));
}
