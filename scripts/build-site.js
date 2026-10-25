#!/usr/bin/env node
'use strict';
/**
 * Builds the folder that is published to GitHub Pages: the production app at the root and any
 * number of preview builds under /preview/<name>/. Nothing is copied from a working tree; every
 * version is read straight from a git ref, so this works the same in CI and on a laptop.
 *
 *   node scripts/build-site.js --out _site --main main [--previews previews.json] [--repo owner/name] [--summary build-summary.json]
 *
 * previews.json: [{ "number": 66, "title": "...", "ref": "refs/previews/pr-66", "isDraft": false }, ...]
 * build-summary.json (not published): for every pull request that was asked for, whether its preview was built, skipped
 * (and why) or left out because of the cap. The workflow turns it into one comment per pull request.
 *
 * Production is the site exactly as committed (landing page at the root, app in app/). Previews have the same
 * layout and get one change: a generated preview-runtime.js (own browser storage + a badge) is the first
 * script of their app/index.html, and the analytics script is removed so experiments do not count as visits. See docs/DEPLOYMENT.md.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
/** What makes up the site: the landing page at the root and the app in app/. Everything else in the repo (tests, docs, dev tools) is not published. */
const APP_PATHS = ['index.html', 'landing.js', 'app'];
/** The app's page inside the site. It and the landing page are the pages that get the preview runtime. */
const APP_PAGE = 'app/index.html';
/** The landing page lists the projects saved in the browser, so in a preview it needs the same isolated storage as the app. */
const LANDING_PAGE = 'index.html';
const MAX_PREVIEWS = 20;
const ANALYTICS_PATTERN = /^[ \t]*<script[^>]*simpleanalyticscdn[^>]*><\/script>[ \t]*\r?\n?/m;

// ---- Pure helpers (unit-tested) ---------------------------------------------------------------------

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Folder name of a pull request preview. */
const previewName = (number) => `pr-${Number(number)}`;

/**
 * The description a preview runs with: label, short commit, storage prefix and relative links.
 * `page` is where the script runs: the app (/preview/<name>/app/) or the landing page (/preview/<name>/).
 */
function buildInfo({ name, label, sha, page = 'app' }) {
    return {
        name,
        label,
        sha: sha ? String(sha).slice(0, 7) : '',
        // Keys are namespaced per preview, so previews never touch production or each other.
        storagePrefix: `preview:${name}:`,
        // A preview lives at /preview/<name>/, so these hold wherever the site is hosted.
        productionUrl: page === 'landing' ? '../../' : '../../../app/',
        indexUrl: page === 'landing' ? '../' : '../../'
    };
}

/** The page of a preview: analytics off, the runtime first so storage is isolated before the app starts. */
function previewIndexHtml(html) {
    const withoutAnalytics = html.replace(ANALYTICS_PATTERN, '');
    if (!/<head[^>]*>/i.test(withoutAnalytics)) throw new Error('The app page has no <head> to add the preview runtime to.');
    return withoutAnalytics.replace(/<head[^>]*>/i, (open) => `${open}\n    <meta name="robots" content="noindex">\n    <script src="preview-runtime.js"></script>`);
}

/** The runtime script with this preview's description filled in. */
function runtimeSource(template, info) {
    const marker = '/*BUILD*/ null';
    if (!template.includes(marker)) throw new Error('preview-runtime.js has no build marker.');
    return template.replace(marker, () => JSON.stringify(info));
}

/** /preview/index.html: every live preview and where it came from. */
function previewsIndexHtml(previews, repo) {
    const items = previews.map((p) => {
        const title = p.title ? ` <span class="title">${escapeHtml(p.title)}</span>` : '';
        const draft = p.isDraft ? ' <span class="tag">draft</span>' : '';
        const source = repo ? ` <a class="src" href="https://github.com/${escapeHtml(repo)}/pull/${Number(p.number)}">PR #${Number(p.number)}</a>` : '';
        return `        <li><a href="${escapeHtml(previewName(p.number))}/">${escapeHtml(previewName(p.number))}</a>${title}${draft}${source}</li>`;
    });
    const body = items.length ? `    <ul>\n${items.join('\n')}\n    </ul>` : '    <p>No previews right now. Open a pull request to get one.</p>';
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>Protogames previews</title>
    <style>
        body { font: 16px/1.5 system-ui, sans-serif; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; color: #1b2230; }
        li { margin: 0.4rem 0; }
        .title { color: #4a5568; }
        .tag { font-size: 0.75rem; background: #edf2f7; border-radius: 4px; padding: 0 0.35rem; }
        .src { font-size: 0.85rem; }
    </style>
</head>
<body>
    <h1>Protogames previews</h1>
    <p>Work in progress, built from open pull requests. Each preview keeps its own saved data. <a href="../">Production</a></p>
${body}
</body>
</html>
`;
}

/**
 * Gives the preview's landing page the runtime too, so the projects it lists are the preview's own (storage is shared by
 * every version on one origin). A pull request whose landing page cannot take it is left as it is: the app still works.
 */
function addRuntimeToLanding(dir, template, { name, label, sha }) {
    const landing = path.join(dir, LANDING_PAGE);
    if (!fs.existsSync(landing)) return;
    try {
        const html = previewIndexHtml(fs.readFileSync(landing, 'utf8'));
        fs.writeFileSync(path.join(dir, 'preview-runtime.js'), runtimeSource(template, buildInfo({ name, label, sha, page: 'landing' })));
        fs.writeFileSync(landing, html);
    } catch (error) {
        console.warn(`The landing page of ${name} was left as it is: ${error.message}`);
    }
}

/** Pull requests that may become previews: same-repository only, in the order given (newest first). Not capped; see build(). */
function eligiblePreviews(pulls) {
    return pulls.filter((p) => p && Number.isInteger(p.number) && p.ref && !p.isCrossRepository);
}

/** Previews to publish if every one of them could be built: eligible pull requests, capped. */
function selectPreviews(pulls, limit = MAX_PREVIEWS) {
    return eligiblePreviews(pulls).slice(0, limit);
}

/** The attribute of each tag that names a file the page loads. */
const FILE_ATTRIBUTES = [['script', 'src'], ['link', 'href'], ['img', 'src']];

/** Local files a page needs: every relative `<script src>`, `<link href>` and `<img src>`, as site paths (no query or hash). */
function localReferences(html, pagePath) {
    const found = new Set();
    const bare = html.replace(/<!--[\s\S]*?-->/g, '');
    for (const [tag, attribute] of FILE_ATTRIBUTES) {
        const elements = bare.match(new RegExp(`<${tag}\\b[^>]*>`, 'gi')) || [];
        for (const element of elements) {
            const match = element.match(new RegExp(`\\s${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
            const value = match && (match[1] ?? match[2] ?? match[3]);
            // Absolute addresses, data: URLs and in-page anchors are not files of this site.
            if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(value)) continue;
            let target = value.split(/[?#]/)[0];
            try { target = decodeURIComponent(target); } catch { /* keep it as written */ }
            if (target) found.add(path.posix.normalize(path.posix.join(path.posix.dirname(pagePath), target)));
        }
    }
    return [...found];
}

/** The referenced files of `html` that are not in `files` (the exported file list). */
function missingReferences(html, pagePath, files) {
    const have = files instanceof Set ? files : new Set(files);
    return localReferences(html, pagePath).filter((file) => !have.has(file));
}

/** Text for a GitHub comment built from file names of a pull request: one short line, no markup. */
const plainText = (text) => String(text).replace(/[^\w./ @+,()-]/g, '?').slice(0, 200);

// ---- Reading a version out of git -----------------------------------------------------------------------

function git(args) {
    return execFileSync('git', args, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
}

const sha = (ref) => git(['rev-parse', '--verify', `${ref}^{commit}`]).toString().trim();

/** A pull request that cannot be a preview; `reason` is what the comment on the pull request says. */
class SkipError extends Error {
    constructor(message, reason) {
        super(message);
        this.reason = reason;
    }
}

/** Writes the app as it is at `ref` into `dir` and returns what was written. */
function exportApp(ref, dir) {
    const listed = git(['ls-tree', '-r', '--name-only', '-z', ref, '--', ...APP_PATHS]).toString().split('\0').filter(Boolean);
    if (!listed.includes(APP_PAGE)) throw new SkipError(`${ref} does not contain ${APP_PAGE}`, `rebase on main, the app moved to ${path.posix.dirname(APP_PAGE)}/`);
    for (const file of listed) {
        const target = path.join(dir, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, git(['show', `${ref}:${file}`]));
    }
    return listed;
}

// ---- Build -----------------------------------------------------------------------------------------------

/** Throws a SkipError when the exported app or landing page would not work: a missing page, or files they need that are not there. */
function checkExport(dir, listed) {
    if (!listed.includes(LANDING_PAGE)) throw new SkipError(`no ${LANDING_PAGE}`, `the head has no landing page (${LANDING_PAGE}), rebase on main`);
    const files = new Set(listed);
    const missing = [];
    for (const page of [APP_PAGE, LANDING_PAGE]) {
        for (const file of missingReferences(fs.readFileSync(path.join(dir, page), 'utf8'), page, files)) if (!missing.includes(file)) missing.push(file);
    }
    if (missing.length) {
        const shown = missing.slice(0, 3).map(plainText).join(', ');
        throw new SkipError(`${missing.length} file(s) used by the pages are missing: ${missing.join(', ')}`, `files used by the pages are missing from the head (${shown}${missing.length > 3 ? `, and ${missing.length - 3} more` : ''}), rebase on main`);
    }
}

function build({ out, main, previews = [], repo = '', limit = MAX_PREVIEWS }) {
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    const summary = { production: sha(main), previews: [], skipped: [], results: [] };

    exportApp(main, out);
    fs.writeFileSync(path.join(out, '.nojekyll'), '');

    const template = fs.readFileSync(path.join(__dirname, 'preview-runtime.js'), 'utf8');
    const built = [];
    // The cap counts previews that were really built, so a skipped pull request does not use up a place.
    for (const preview of eligiblePreviews(previews)) {
        const name = previewName(preview.number);
        const dir = path.join(out, 'preview', name);
        const skip = (reason) => {
            summary.skipped.push(preview.number);
            summary.results.push({ number: preview.number, name, status: 'skipped', reason });
        };
        if (built.length >= limit) {
            summary.results.push({ number: preview.number, name, status: 'over-cap', reason: `only the newest ${limit} previews are published` });
            continue;
        }
        let commit;
        try {
            commit = sha(preview.ref);
        } catch (error) {
            // A pull request that could not be fetched must not take the whole site down.
            console.warn(`Skipping ${name}: ${preview.ref} is not available.`);
            skip('its head could not be fetched');
            continue;
        }
        try {
            const listed = exportApp(preview.ref, dir);
            checkExport(dir, listed);
            const info = buildInfo({ name, label: `PR #${preview.number}`, sha: commit });
            fs.writeFileSync(path.join(dir, 'app', 'preview-runtime.js'), runtimeSource(template, info));
            const indexFile = path.join(dir, APP_PAGE);
            fs.writeFileSync(indexFile, previewIndexHtml(fs.readFileSync(indexFile, 'utf8')));
            addRuntimeToLanding(dir, template, { name, label: `PR #${preview.number}`, sha: commit });
            built.push(preview);
            summary.previews.push({ name, sha: info.sha });
            summary.results.push({ number: preview.number, name, status: 'built', sha: info.sha });
        } catch (error) {
            // A pull request without app/index.html, <head> or files its pages need must not stop production from being published.
            console.warn(`Skipping ${name}: ${error.message}`);
            fs.rmSync(dir, { recursive: true, force: true });
            skip(error.reason || `its pages could not be prepared (${plainText(error.message)})`);
        }
    }
    fs.mkdirSync(path.join(out, 'preview'), { recursive: true });
    fs.writeFileSync(path.join(out, 'preview', 'index.html'), previewsIndexHtml(built, repo));
    return summary;
}

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i += 2) {
        if (!argv[i].startsWith('--')) throw new Error(`Unexpected argument ${argv[i]}`);
        args[argv[i].slice(2)] = argv[i + 1];
    }
    return args;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.out || !args.main) throw new Error('Usage: node scripts/build-site.js --out <dir> --main <ref> [--previews <file.json>] [--repo owner/name] [--summary <file.json>]');
    const previews = args.previews ? JSON.parse(fs.readFileSync(args.previews, 'utf8')) : [];
    const summary = build({ out: path.resolve(args.out), main: args.main, previews, repo: args.repo || '' });
    if (args.summary) fs.writeFileSync(path.resolve(args.summary), `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`production ${summary.production.slice(0, 7)}; ${summary.previews.length} preview(s): ${summary.previews.map((p) => `${p.name}@${p.sha}`).join(', ') || 'none'}`);
}

if (require.main === module) main();

module.exports = { APP_PATHS, APP_PAGE, LANDING_PAGE, MAX_PREVIEWS, escapeHtml, previewName, buildInfo, previewIndexHtml, runtimeSource, previewsIndexHtml, eligiblePreviews, selectPreviews, localReferences, missingReferences, SkipError, build };
