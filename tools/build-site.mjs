#!/usr/bin/env node
/* Builds the folder that GitHub Pages publishes: the site from main at the root, and a preview of every open pull
   request under /preview/pr-<number>/. Nothing is copied from a working tree: every version is read straight from
   a git ref, so this works the same in CI and on a laptop. Plain Node 18+ and git, no packages.

   The original is consumer/build-site.mjs in bremondr/web-kit. Projects keep a copy in tools/build-site.mjs, next
   to tools/preview-runtime.js, and run it from .github/workflows/pages.yml. Don't edit the copy: what differs
   between projects goes in site.json at the repository's root (all of it optional):

     {
       "name": "Ultimate Playbook",          shown on the list of previews
       "root": ".",                          the site's folder in the repository
       "paths": ["index.html", "css", "js"], what is published, inside root; without it, everything except the
                                             usual non-site files (DEFAULT_EXCLUDE below) and "exclude"
       "exclude": ["/notes/", "*.psd"],      files to leave out (see "Patterns" below)
       "pages": ["index.html"],              pages every version must have, checked for missing files; the
                                             preview link points at the first one
       "serviceWorker": "sw.js",             in the live site: VERSION and APP_FILES filled in; in previews:
                                             replaced with one that does nothing
       "dropFromPreviews": ["analytics"],    <script> tags whose opening tag contains one of these are removed
                                             from preview pages (analytics, say)
       "checks": ["node --test"],            commands that must pass on main before anything is published
       "maxPreviews": 20,
       "feedback": {"labels": ["feedback"], "event": "app:feedback"},
                                             a Feedback link on the preview badge (see preview-runtime.js)
       "global": "APP_PREVIEW",              another global name for the preview's description
       "commentMarker": "<!-- site-preview -->", "commentNote": "..."   the bot comment on pull requests
     }

   Patterns: "*" is any part of a name, "**" any number of folders, "?" one character. A pattern ending in "/" is a
   folder and everything in it. A pattern starting with "/" or with a "/" inside is matched from the site's root;
   otherwise it matches a file or folder of that name anywhere.

     node tools/build-site.mjs --out _site --main main [--previews previews.json] [--repo owner/name] [--summary build-summary.json] [--config site.json]
     node tools/build-site.mjs --run-checks [--config site.json]

   previews.json:       [{"number": 16, "title": "...", "ref": "refs/previews/pr-16", "isDraft": false}, ...]
   build-summary.json:  (not published) for each pull request asked for: built (with the commit), skipped (and why)
                        or over the cap, and the comment's marker, note and link. The workflow turns it into one
                        comment per pull request.

   A preview is the site exactly as in its pull request, with these changes made here:
   - preview-runtime.js is the first script of each of its HTML pages: its own browser storage (localStorage,
     sessionStorage, IndexedDB and Cache Storage get a per-preview prefix), and a badge;
   - a robots noindex tag, so previews stay out of search results;
   - "dropFromPreviews" scripts removed;
   - the service worker, if one is named, replaced with one that does nothing, so a preview never caches files or
     deletes the live site's offline copy (all versions share one origin, and so one set of caches).
   Run it from the repository's root. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Not part of the site unless "paths" says otherwise: the repository's own files, tools, tests and docs. */
export const DEFAULT_EXCLUDE = [
  '/.github/', '/.claude/', '/node_modules/', '/tools/', '/tests/', '/docs/',
  '.gitignore', '.gitattributes', '*.md', '*.test.mjs', '*.test.js',
  '/site.json', '/vendor.json', '/package.json', '/package-lock.json'
];

export const DEFAULTS = {
  name: '',
  root: '.',
  paths: null,
  exclude: [],
  pages: ['index.html'],
  serviceWorker: '',
  dropFromPreviews: [],
  checks: ['node --test'],
  maxPreviews: 20,
  feedback: null,
  global: '',
  commentMarker: '<!-- site-preview -->',
  commentNote: 'It keeps its own saved data, separate from the live site, and doesn\'t work offline. It is removed when this pull request is closed or merged.'
};

/** What a preview's service worker becomes: installs, takes over its own pages and lets every request through. */
export const STUB_SERVICE_WORKER = `/* Previews don't work offline: this stands in for the site's service worker (see tools/build-site.mjs). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
`;

/* ---- pure helpers (tested in build-site.test.mjs) ---- */

/** site.json's contents with the defaults filled in; throws on what can't work. */
export function readConfig(raw = {}) {
  const config = {...DEFAULTS, ...raw};
  const list = (key) => {
    if (config[key] === null && key === 'paths') return;
    if (!Array.isArray(config[key]) || config[key].some(v => typeof v !== 'string' || !v)) throw new Error(`site.json: "${key}" must be a list of names.`);
  };
  ['paths', 'exclude', 'pages', 'dropFromPreviews', 'checks'].forEach(list);
  if (!config.pages.length) throw new Error('site.json: "pages" needs at least one page.');
  if (!Number.isInteger(config.maxPreviews) || config.maxPreviews < 0) throw new Error('site.json: "maxPreviews" must be a whole number.');
  if (config.feedback !== null && typeof config.feedback !== 'object') throw new Error('site.json: "feedback" must be an object.');
  config.root = path.posix.normalize(String(config.root || '.')).replace(/\/$/, '');
  if (config.root.startsWith('..') || config.root.startsWith('/')) throw new Error('site.json: "root" must be a folder inside the repository.');
  config.pages = config.pages.map(p => path.posix.normalize(p));
  return config;
}

/** A pattern from "exclude" as a regular expression over site paths (see "Patterns" above). */
export function patternRegex(pattern) {
  let p = pattern, dir = false, anchored = false;
  if (p.endsWith('/')) { dir = true; p = p.slice(0, -1); }
  if (p.startsWith('/')) { anchored = true; p = p.slice(1); }
  else if (p.includes('/')) anchored = true;
  const body = p.split(/(\*\*|\*|\?)/).map(part =>
    part === '**' ? '.*' : part === '*' ? '[^/]*' : part === '?' ? '[^/]' : part.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('');
  return new RegExp(`${anchored ? '^' : '(?:^|/)'}${body}${dir ? '/' : '(?:/|$)'}`);
}

/** The site's files out of everything listed: those "paths" names, or everything but the excluded ones. */
export function siteFiles(files, config) {
  const patterns = [...(config.paths ? [] : DEFAULT_EXCLUDE), ...config.exclude].map(patternRegex);
  return files.filter(f => !patterns.some(re => re.test(f)));
}

/** Where the preview link points inside a version: the first page's folder, or the page itself. */
export function startPath(config) {
  const page = config.pages[0];
  if (page === 'index.html') return '';
  return page.endsWith('/index.html') ? page.slice(0, -'index.html'.length) : page;
}

/** A short hash of the site's files (path and content), so the live site's offline cache changes exactly when they do. */
export function contentVersion(files) {
  const h = createHash('sha256');
  for (const [name, data] of [...files].sort((a, b) => a[0] < b[0] ? -1 : 1)) h.update(name).update('\0').update(data).update('\0');
  return h.digest('hex').slice(0, 12);
}

/** The live service worker with VERSION and APP_FILES written from what is really published (paths relative to it). */
export function stampServiceWorker(source, version, files) {
  const list = ['./', ...files.sort().map(f => `./${f}`)];
  const withVersion = source.replace(/const VERSION = '[^']*';/, () => `const VERSION = '${version}';`);
  const stamped = withVersion.replace(/const APP_FILES = \[[\s\S]*?\n\];/, () => `const APP_FILES = [\n${list.map(f => `  '${f}'`).join(',\n')}\n];`);
  if (withVersion === source || stamped === withVersion) throw new Error('The service worker has no VERSION or APP_FILES to fill in.');
  return stamped;
}

export const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export const previewName = number => `pr-${Number(number)}`;

/** What a preview runs with: label, short commit, storage prefix, its pull request and the badge's Feedback link. */
export function buildInfo({ name, label, sha, number, repo, config = DEFAULTS }) {
  const feedback = config.feedback && (config.feedback.repo || repo)
    ? {repo: config.feedback.repo || repo, labels: config.feedback.labels || [], event: config.feedback.event || 'preview:feedback'}
    : null;
  return {
    name,
    label,
    sha: sha ? String(sha).slice(0, 7) : '',
    storagePrefix: `preview:${name}:`,
    pullUrl: repo && number ? `https://github.com/${repo}/pull/${Number(number)}` : '',
    feedback,
    global: config.global || ''
  };
}

/** Removes the <script> elements whose opening tag contains one of `needles`. */
export function dropScripts(html, needles) {
  if (!needles.length) return html;
  return html.replace(/[ \t]*<script\b([^>]*)>[\s\S]*?<\/script>[ \t]*(?:\r?\n)?/gi, (whole, attributes) =>
    needles.some(n => attributes.includes(n)) ? '' : whole);
}

/** A preview's page: noindex, and the runtime first so storage is separate before any of the page runs. */
export function previewPageHtml(html, runtimeSrc, drop = []) {
  const page = dropScripts(html, drop);
  if (!/<head[^>]*>/i.test(page)) throw new Error('The page has no <head> to add the preview runtime to.');
  return page.replace(/<head[^>]*>/i, open => `${open}\n<meta name="robots" content="noindex">\n<script src="${runtimeSrc}"></script>`);
}

/** The runtime's address from a page, as the page links it: it sits at the preview's root. */
export const runtimeSrcFor = page => `${'../'.repeat(page.split('/').length - 1)}preview-runtime.js`;

/** The runtime with this preview's description filled in. */
export function runtimeSource(template, info) {
  const marker = '/*BUILD*/ null';
  if (!template.includes(marker)) throw new Error('preview-runtime.js has no build marker.');
  return template.replace(marker, () => JSON.stringify(info));
}

/** /preview/index.html: the live previews and where each came from. */
export function previewsIndexHtml(previews, repo, { name = '', start = '' } = {}) {
  const heading = `${name ? `${escapeHtml(name)} previews` : 'Previews'}`;
  const items = previews.map(p => {
    const title = p.title ? ` <span class="title">${escapeHtml(p.title)}</span>` : '';
    const draft = p.isDraft ? ' <span class="tag">draft</span>' : '';
    const sha = p.sha ? ` <code>${escapeHtml(p.sha)}</code>` : '';
    const source = repo ? ` <a class="src" href="https://github.com/${escapeHtml(repo)}/pull/${Number(p.number)}">PR #${Number(p.number)}</a>` : '';
    return `    <li><a href="${escapeHtml(previewName(p.number))}/${escapeHtml(start)}">${escapeHtml(previewName(p.number))}</a>${title}${draft}${sha}${source}</li>`;
  });
  const body = items.length ? `  <ul>\n${items.join('\n')}\n  </ul>` : '  <p>No previews right now. Open a pull request to get one.</p>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${heading}</title>
<style>
  :root { color-scheme: light dark; --fg: #1b2420; --bg: #ffffff; --muted: #55625b; --tag: #e6eee9; --link: #1e5b8a; }
  @media (prefers-color-scheme: dark) { :root { --fg: #e4ece7; --bg: #141a17; --muted: #9fb0a6; --tag: #26332c; --link: #8cc4f0; } }
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 42rem; margin: 2rem auto; padding: 0 16px; color: var(--fg); background: var(--bg); }
  a { color: var(--link); }
  li { margin: 0.5rem 0; overflow-wrap: anywhere; }
  .title, code { color: var(--muted); }
  .tag { font-size: 0.75rem; background: var(--tag); border-radius: 4px; padding: 0 0.35rem; }
  .src { font-size: 0.85rem; }
</style>
</head>
<body>
  <h1>${heading}</h1>
  <p>Work in progress, one per open pull request. Each preview keeps its own saved data, separate from the <a href="../${escapeHtml(start)}">live site</a>, and doesn't work offline.</p>
${body}
</body>
</html>
`;
}

/** Same-repository pull requests only, in the order given (newest first). Capped in build(), after skipping. */
export function eligiblePreviews(pulls) {
  return pulls.filter(p => p && Number.isInteger(p.number) && p.ref && !p.isCrossRepository);
}

const FILE_ATTRIBUTES = [['script', 'src'], ['link', 'href'], ['img', 'src']];
const LOADED_LINKS = /\b(?:stylesheet|icon|manifest|preload|modulepreload)\b/i;

/** Local files a page loads: every relative <script src>, <img src> and <link href> for a stylesheet, icon,
    manifest or preload, as site paths. A folder ("demo/") means its index.html. */
export function localReferences(html, pagePath) {
  const found = new Set();
  const bare = html.replace(/<!--[\s\S]*?-->/g, '');
  const attribute = (element, name) => {
    const match = element.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    return match && (match[1] ?? match[2] ?? match[3]);
  };
  for (const [tag, name] of FILE_ATTRIBUTES) {
    for (const element of bare.match(new RegExp(`<${tag}\\b[^>]*>`, 'gi')) || []) {
      if (tag === 'link' && !LOADED_LINKS.test(attribute(element, 'rel') || '')) continue;
      const value = attribute(element, name);
      if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(value)) continue;   // other sites, data: URLs, anchors
      let target = value.split(/[?#]/)[0];
      try { target = decodeURIComponent(target); } catch { /* keep it as written */ }
      if (!target) continue;
      let file = path.posix.normalize(path.posix.join(path.posix.dirname(pagePath), target));
      if (file.endsWith('/') || file === '.') file = path.posix.join(file, 'index.html');
      found.add(file);
    }
  }
  return [...found];
}

/** For a GitHub comment built from file names in a pull request: one short line, no markup. */
export const plainText = text => String(text).replace(/[^\w./ @+,()-]/g, '?').slice(0, 200);

/* ---- reading a version out of git ---- */

let ROOT = process.cwd();
const git = args => execFileSync('git', args, {cwd: ROOT, maxBuffer: 256 * 1024 * 1024});
const commitOf = ref => git(['rev-parse', '--verify', `${ref}^{commit}`]).toString().trim();

/** A pull request that can't have a preview; `reason` is what the comment on it says. */
export class SkipError extends Error {
  constructor(message, reason) { super(message); this.reason = reason; }
}

/** Writes the site's files as they are at `ref` into `dir`; returns their site paths. */
function exportSite(ref, dir, config) {
  const prefix = config.root === '.' ? '' : `${config.root}/`;
  const wanted = config.paths ? config.paths.map(p => prefix + p) : [config.root];
  const entries = git(['ls-tree', '-r', '-z', '--full-tree', ref, '--', ...wanted]).toString().split('\0').filter(Boolean);
  const listed = entries
    .map(line => { const [meta, file] = line.split('\t'); return {type: meta.split(' ')[1], file}; })
    .filter(e => e.type === 'blob' && e.file.startsWith(prefix))
    .map(e => e.file.slice(prefix.length));
  const files = siteFiles(listed, config).filter(f => f !== 'preview' && !f.startsWith('preview/'));
  for (const page of config.pages) {
    if (!files.includes(page)) throw new SkipError(`${ref} has no ${page}`, `the head has no ${page}, rebase on main`);
  }
  for (const file of files) {
    const target = path.join(dir, file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, git(['show', `${ref}:${prefix}${file}`]));
  }
  return files;
}

/** Throws a SkipError when a page loads a local file that isn't in the export. */
function checkExport(dir, files, config) {
  const have = new Set(files);
  const missing = [];
  for (const page of config.pages) {
    for (const f of localReferences(fs.readFileSync(path.join(dir, page), 'utf8'), page)) if (!have.has(f) && !missing.includes(f)) missing.push(f);
  }
  if (missing.length) {
    const shown = missing.slice(0, 3).map(plainText).join(', ');
    throw new SkipError(`missing: ${missing.join(', ')}`, `files the pages load are missing from the head (${shown}${missing.length > 3 ? `, and ${missing.length - 3} more` : ''}), rebase on main`);
  }
}

/** Fills in the live service worker's VERSION and APP_FILES; returns the version, or '' without a service worker. */
function stampLive(out, files, config) {
  const sw = config.serviceWorker;
  if (!sw || !files.includes(sw)) return '';
  const base = path.posix.dirname(sw) === '.' ? '' : `${path.posix.dirname(sw)}/`;
  const own = files.filter(f => f !== sw && f.startsWith(base));
  const version = contentVersion(own.map(f => [f, fs.readFileSync(path.join(out, f))]));
  const file = path.join(out, sw);
  fs.writeFileSync(file, stampServiceWorker(fs.readFileSync(file, 'utf8'), version, own.map(f => f.slice(base.length))));
  return version;
}

/** Turns an exported version into a preview: the runtime in every HTML page, and the service worker stubbed. */
function makePreview(dir, files, config, info, template) {
  fs.writeFileSync(path.join(dir, 'preview-runtime.js'), runtimeSource(template, info));
  for (const page of files.filter(f => /\.html?$/i.test(f))) {
    const file = path.join(dir, page);
    try {
      fs.writeFileSync(file, previewPageHtml(fs.readFileSync(file, 'utf8'), runtimeSrcFor(page), config.dropFromPreviews));
    } catch (error) {
      if (config.pages.includes(page)) throw new SkipError(`${page}: ${error.message}`, `${plainText(page)} has no <head>`);
      console.warn(`${info.name}: ${page} was left as it is (${error.message})`);
    }
  }
  if (config.serviceWorker && files.includes(config.serviceWorker)) fs.writeFileSync(path.join(dir, config.serviceWorker), STUB_SERVICE_WORKER);
}

/* ---- build ---- */

export function build({ out, main, previews = [], repo = '', config: raw = {}, cwd = process.cwd(), runtime = path.join(HERE, 'preview-runtime.js') }) {
  ROOT = cwd;
  const config = readConfig(raw);
  fs.rmSync(out, {recursive: true, force: true});
  fs.mkdirSync(out, {recursive: true});
  const start = startPath(config);
  const summary = {
    production: commitOf(main),
    start,
    comment: {marker: config.commentMarker, note: config.commentNote},
    previews: [],
    results: []
  };

  const live = exportSite(main, out, config);
  const version = stampLive(out, live, config);
  if (version) summary.version = version;
  fs.writeFileSync(path.join(out, '.nojekyll'), '');

  const template = fs.readFileSync(runtime, 'utf8');
  const built = [];
  // the cap counts previews really built, so a skipped pull request doesn't use up a place
  for (const preview of eligiblePreviews(previews)) {
    const name = previewName(preview.number);
    const dir = path.join(out, 'preview', name);
    if (built.length >= config.maxPreviews) {
      summary.results.push({number: preview.number, name, status: 'over-cap', reason: `only the newest ${config.maxPreviews} previews are published`});
      continue;
    }
    try {
      let commit;
      try { commit = commitOf(preview.ref); } catch { throw new SkipError(`${preview.ref} is not available`, 'its head could not be fetched'); }
      const files = exportSite(preview.ref, dir, config);
      checkExport(dir, files, config);
      const info = buildInfo({name, label: `PR #${preview.number}`, sha: commit, number: preview.number, repo, config});
      makePreview(dir, files, config, info, template);
      built.push({...preview, sha: info.sha});
      summary.previews.push({name, sha: info.sha});
      summary.results.push({number: preview.number, name, status: 'built', sha: info.sha});
    } catch (error) {
      // one pull request that can't be built must never stop the live site from being published
      console.warn(`Skipping ${name}: ${error.message}`);
      fs.rmSync(dir, {recursive: true, force: true});
      summary.results.push({number: preview.number, name, status: 'skipped', reason: error.reason || `it could not be prepared (${plainText(error.message)})`});
    }
  }
  fs.mkdirSync(path.join(out, 'preview'), {recursive: true});
  fs.writeFileSync(path.join(out, 'preview', 'index.html'), previewsIndexHtml(built, repo, {name: config.name, start}));
  return summary;
}

/** Runs site.json's "checks" one after another; returns false at the first that fails. */
export function runChecks(config, cwd = process.cwd()) {
  for (const command of config.checks) {
    console.log(`\n$ ${command}`);
    try { execSync(command, {cwd, stdio: 'inherit'}); }
    catch { console.error(`\nFailed: ${command}. Nothing is published until main passes its checks.`); return false; }
  }
  return true;
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error(`Unexpected argument ${argv[i]}`);
    const key = argv[i].slice(2);
    if (key === 'run-checks') { args[key] = true; continue; }
    if (i + 1 >= argv.length) throw new Error(`--${key} needs a value`);
    args[key] = argv[++i];
  }
  return args;
}

function loadConfig(file) {
  const where = path.resolve(file || 'site.json');
  if (!fs.existsSync(where)) {
    if (file) throw new Error(`No ${file} here.`);
    return {};
  }
  return JSON.parse(fs.readFileSync(where, 'utf8'));
}

function cli() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig(args.config);
  if (args['run-checks']) process.exit(runChecks(readConfig(config)) ? 0 : 1);
  if (!args.out || !args.main) throw new Error('Usage: node tools/build-site.mjs --out <dir> --main <ref> [--previews <file.json>] [--repo owner/name] [--summary <file.json>] [--config site.json]\n   or: node tools/build-site.mjs --run-checks [--config site.json]');
  const previews = args.previews ? JSON.parse(fs.readFileSync(args.previews, 'utf8')) : [];
  const cwd = git(['rev-parse', '--show-toplevel']).toString().trim();
  const summary = build({out: path.resolve(args.out), main: args.main, previews, repo: args.repo || '', config, cwd});
  if (args.summary) fs.writeFileSync(path.resolve(args.summary), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`live site ${summary.production.slice(0, 7)}${summary.version ? ` (offline version ${summary.version})` : ''}; ${summary.previews.length} preview(s): ${summary.previews.map(p => `${p.name}@${p.sha}`).join(', ') || 'none'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { cli(); } catch (error) { console.error(error.message); process.exit(1); }
}
