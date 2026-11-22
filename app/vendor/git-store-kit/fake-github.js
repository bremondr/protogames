/* git-store-kit: a small GitHub in memory, for tests and demos. Pass `fake.fetch` as the store's `fetch` option.

   It answers the requests the store makes, the way GitHub does: the API on api.github.com (repos, folders with ETag
   and 304, files, blobs, saves and removals with sha checks, commits of a file) and file contents on
   raw.githubusercontent.com. Repos are public or private; tokens are given per repo, to read or to write. Reads
   without a token count against a limit of 60 (a 304 doesn't), like GitHub's limit for each IP address.

     const fake = createFakeGitHub();
     fake.addRepo('me/team', {private: false, files: {'drills/a1.json': {name: 'Angel'}}});
     fake.addToken('github_pat_' + 'x'.repeat(30), 'me/team', 'write');
     const store = createGitStore({..., fetch: fake.fetch});

   fake.log lists every request, with the token left out. fake.offline = true makes every request fail as offline;
   fake.staleRaw = true makes raw.githubusercontent.com serve each file's previous version, as its cache can. */
import { fromBase64, gitBlobSha, toBase64 } from './github.js';

const API = 'https://api.github.com', RAW = 'https://raw.githubusercontent.com';

export function createFakeGitHub({limit = 60, now = () => Date.now()} = {}){
  const repos = new Map();    // lower-case 'owner/name' → {name, private, files: Map path → {text, sha}, commits: []}
  const tokens = new Map();   // token → Map repoKey → 'read' | 'write'
  const blobs = new Map();    // sha → text
  const fake = {log: [], offline: false, staleRaw: false, used: 0, limit, resetAt: now() + 3600e3};
  let counter = 0;

  async function put(repo, path, text, {message, author = 'someone'}){
    const sha = await gitBlobSha(text);
    blobs.set(sha, text);
    repo.files.set(path, {text, sha});
    await commit(repo, message, author, [path]);
    return sha;
  }
  async function commit(repo, message, author, paths){
    counter++;
    const c = {sha: await gitBlobSha(`commit ${counter} ${repo.name} ${message}`), date: new Date(now() + counter * 1000).toISOString(), author, message, paths, tree: new Map(repo.files)};
    repo.commits.unshift(c);
    return c;
  }

  fake.addRepo = async (name, {private: priv = false, files = {}} = {}) => {
    const repo = {name, private: priv, files: new Map(), commits: []};
    repos.set(name.toLowerCase(), repo);
    for (const [path, json] of Object.entries(files)) await put(repo, path, typeof json === 'string' ? json : JSON.stringify(json, null, 2) + '\n', {message: `Add ${path}`, author: 'owner'});
    return repo;
  };
  fake.addToken = (token, name, access = 'write') => {
    if (!tokens.has(token)) tokens.set(token, new Map());
    tokens.get(token).set(name.toLowerCase(), access);
  };
  /** A change made somewhere else (another device, someone on GitHub): json, or null to remove the file. */
  fake.edit = async (name, path, json, {author = 'another device', message} = {}) => {
    const repo = repos.get(name.toLowerCase());
    if (json === null){ repo.files.delete(path); await commit(repo, message || `Remove ${path}`, author, [path]); return null; }
    return put(repo, path, typeof json === 'string' ? json : JSON.stringify(json, null, 2) + '\n', {message: message || `Update ${path}`, author});
  };
  fake.file = (name, path) => { const f = repos.get(name.toLowerCase()).files.get(path); return f ? JSON.parse(f.text) : null; };
  fake.commits = name => repos.get(name.toLowerCase()).commits.map(c => ({sha: c.sha, message: c.message, author: c.author, paths: c.paths}));

  /* ---- answering ---- */
  const json = (status, body, headers = {}) => new Response(body == null ? null : JSON.stringify(body), {status, headers: {'content-type': 'application/json', ...headers}});
  const text = (status, body, headers = {}) => new Response(body, {status, headers: {'content-type': 'text/plain; charset=utf-8', ...headers}});
  const rateHeaders = () => ({'x-ratelimit-limit': String(fake.limit), 'x-ratelimit-remaining': String(Math.max(0, fake.limit - fake.used)), 'x-ratelimit-reset': String(Math.floor(fake.resetAt / 1000))});

  fake.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = (init.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers || {});
    const auth = headers.get('authorization');
    const entry = {method, url: url.href, token: !!auth, status: 0};
    fake.log.push(entry);
    if (init.body){ try { const b = JSON.parse(init.body); entry.body = {message: b.message, sha: b.sha, content: b.content ? `${b.content.length} characters of base64` : undefined}; } catch { /* not JSON */ } }
    if (fake.offline){ entry.status = 'offline'; throw new TypeError('Failed to fetch'); }
    const res = await answer(url, method, headers, auth, init);
    entry.status = res.status;
    return res;
  };

  async function answer(url, method, headers, auth, init){
    if (url.origin === RAW){
      const [, owner, name, ref, ...rest] = url.pathname.split('/').map(decodeURIComponent);
      const repo = repos.get(`${owner}/${name}`.toLowerCase());
      if (!repo || repo.private || (ref !== 'HEAD' && ref !== 'main')) return text(404, '404: Not Found');
      const path = rest.join('/');
      let f = repo.files.get(path);
      if (fake.staleRaw){ const older = repo.commits.slice(1).find(c => c.tree.has(path)); if (older) f = older.tree.get(path); }
      return f ? text(200, f.text, {'access-control-allow-origin': '*'}) : text(404, '404: Not Found');
    }
    if (url.origin !== API) return text(404, 'not GitHub');

    // who is asking
    let access = null;
    const token = auth && /^Bearer (.+)$/.exec(auth);
    if (auth){ if (!token || !tokens.has(token[1])) return json(401, {message: 'Bad credentials'}); }
    const m = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (!m) return json(404, {message: 'Not Found'});
    const key = `${decodeURIComponent(m[1])}/${decodeURIComponent(m[2])}`.toLowerCase(), repo = repos.get(key);
    if (token) access = tokens.get(token[1]).get(key) || null;
    if (!token){
      if (fake.used >= fake.limit && !headers.get('if-none-match')) return json(403, {message: 'API rate limit exceeded for 127.0.0.1.'}, rateHeaders());
    }
    if (!repo || (repo.private && !access)) { if (!token) fake.used++; return json(404, {message: 'Not Found'}, rateHeaders()); }
    const rest = m[3] || '';
    const count = () => { if (!token) fake.used++; };

    if (!rest && method === 'GET'){ count(); return json(200, {full_name: repo.name, private: repo.private, default_branch: 'main', permissions: {pull: true, push: access === 'write'}}, rateHeaders()); }

    const contents = /^\/contents\/?(.*)$/.exec(rest);
    if (contents){
      const path = contents[1].split('/').map(decodeURIComponent).join('/');
      const ref = url.searchParams.get('ref');
      if (method === 'GET'){
        let tree = repo.files;
        if (ref && ref !== 'main'){ const c = repo.commits.find(c => c.sha.startsWith(ref)); if (!c){ count(); return json(404, {message: 'No commit found for the ref ' + ref}); } tree = c.tree; }
        const file = tree.get(path);
        if (file){ count(); return json(200, {type: 'file', name: path.split('/').pop(), path, sha: file.sha, size: new TextEncoder().encode(file.text).length, encoding: 'base64', content: toBase64(file.text).replace(/(.{60})/g, '$1\n')}, rateHeaders()); }
        const prefix = path ? path + '/' : '';
        const names = new Map();
        for (const [p, f] of tree) if (p.startsWith(prefix)){
          const part = p.slice(prefix.length).split('/');
          if (part.length === 1) names.set(part[0], {type: 'file', name: part[0], path: p, sha: f.sha, size: new TextEncoder().encode(f.text).length});
          else if (!names.has(part[0])) names.set(part[0], {type: 'dir', name: part[0], path: prefix + part[0], sha: '0'.repeat(40), size: 0});
        }
        if (!names.size){ count(); return json(404, {message: 'Not Found'}, rateHeaders()); }
        const list = [...names.values()].sort((a, b) => a.name.localeCompare(b.name));
        const etag = `"${(await gitBlobSha(JSON.stringify(list) + (token ? 'auth' : ''))).slice(0, 32)}"`;
        if (headers.get('if-none-match') === etag) return new Response(null, {status: 304, headers: {etag, ...rateHeaders()}});
        if (!token && fake.used >= fake.limit) return json(403, {message: 'API rate limit exceeded for 127.0.0.1.'}, rateHeaders());
        count();
        return json(200, list, {etag, ...rateHeaders()});
      }
      if (method === 'PUT' || method === 'DELETE'){
        if (access !== 'write') return json(token ? 403 : 401, {message: token ? 'Resource not accessible by personal access token' : 'Requires authentication'});
        const body = JSON.parse(init.body || '{}'), current = repo.files.get(path);
        if (method === 'DELETE'){
          if (!current) return json(404, {message: 'Not Found'});
          if (body.sha !== current.sha) return json(409, {message: `${path} does not match ${body.sha}`});
          repo.files.delete(path);
          const c = await commit(repo, body.message, 'owner', [path]);
          return json(200, {content: null, commit: {sha: c.sha, message: body.message}});
        }
        if (current && !body.sha) return json(422, {message: 'Invalid request.\n\n"sha" wasn\'t supplied.'});
        if (current && body.sha !== current.sha) return json(409, {message: `${path} does not match ${body.sha}`});
        if (!current && body.sha) return json(409, {message: `${path} does not match ${body.sha}`});
        const sha = await put(repo, path, fromBase64(body.content), {message: body.message, author: 'owner'});
        return json(current ? 200 : 201, {content: {name: path.split('/').pop(), path, sha}, commit: {sha: repo.commits[0].sha, message: body.message}});
      }
    }
    const blob = /^\/git\/blobs\/([0-9a-f]{40})$/.exec(rest);
    if (blob && method === 'GET'){
      count();
      return blobs.has(blob[1]) ? text(200, blobs.get(blob[1]), rateHeaders()) : json(404, {message: 'Not Found'});
    }
    if (rest === '/commits' && method === 'GET'){
      count();
      const path = url.searchParams.get('path'), max = Number(url.searchParams.get('per_page')) || 30;
      const list = repo.commits.filter(c => !path || c.paths.includes(path)).slice(0, max);
      return json(200, list.map(c => ({sha: c.sha, commit: {message: c.message, author: {name: c.author, date: c.date}, committer: {name: c.author, date: c.date}}, author: {login: c.author}})), rateHeaders());
    }
    return json(404, {message: 'Not Found'});
  }

  return fake;
}
