#!/usr/bin/env node
'use strict';
/**
 * Builds the folder that is published to GitHub Pages: the production app at the root and any
 * number of preview builds under /preview/<name>/. Nothing is copied from a working tree; every
 * version is read straight from a git ref, so this works the same in CI and on a laptop.
 *
 *   node scripts/build-site.js --out _site --main main [--previews previews.json] [--repo owner/name]
 *
 * previews.json: [{ "number": 66, "title": "...", "ref": "refs/previews/pr-66", "isDraft": false }, ...]
 *
 * Production is the app exactly as committed. Previews get one change: a generated
 * preview-runtime.js (own browser storage + a badge) is the first script of their index.html, and
 * the analytics script is removed so experiments do not count as visits. See docs/DEPLOYMENT.md.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
/** What makes up the app; everything else in the repo (tests, docs, dev tools) is not published. */
const APP_PATHS = ['index.html', 'styles.css', 'js', 'images', 'showcases'];
const MAX_PREVIEWS = 20;
const ANALYTICS_PATTERN = /^[ \t]*<script[^>]*simpleanalyticscdn[^>]*><\/script>[ \t]*\r?\n?/m;

// ---- Pure helpers (unit-tested) ---------------------------------------------------------------------

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Folder name of a pull request preview. */
const previewName = (number) => `pr-${Number(number)}`;

/** The description a preview runs with: label, short commit, storage prefix and relative links. */
function buildInfo({ name, label, sha }) {
    return {
        name,
        label,
        sha: sha ? String(sha).slice(0, 7) : '',
        // Keys are namespaced per preview, so previews never touch production or each other.
        storagePrefix: `preview:${name}:`,
        // A preview lives at /preview/<name>/, so these hold wherever the site is hosted.
        productionUrl: '../../',
        indexUrl: '../'
    };
}

/** The page of a preview: analytics off, the runtime first so storage is isolated before the app starts. */
function previewIndexHtml(html) {
    const withoutAnalytics = html.replace(ANALYTICS_PATTERN, '');
    if (!/<head[^>]*>/i.test(withoutAnalytics)) throw new Error('index.html has no <head> to add the preview runtime to.');
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

/** Previews to publish: same-repository pull requests only, newest first, capped. */
function selectPreviews(pulls, limit = MAX_PREVIEWS) {
    return pulls
        .filter((p) => p && Number.isInteger(p.number) && p.ref && !p.isCrossRepository)
        .slice(0, limit);
}

// ---- Reading a version out of git -----------------------------------------------------------------------

function git(args) {
    return execFileSync('git', args, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });
}

const sha = (ref) => git(['rev-parse', '--verify', `${ref}^{commit}`]).toString().trim();

/** Writes the app as it is at `ref` into `dir` and returns what was written. */
function exportApp(ref, dir) {
    const listed = git(['ls-tree', '-r', '--name-only', '-z', ref, '--', ...APP_PATHS]).toString().split('\0').filter(Boolean);
    if (!listed.includes('index.html')) throw new Error(`${ref} does not contain index.html`);
    for (const file of listed) {
        const target = path.join(dir, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, git(['show', `${ref}:${file}`]));
    }
    return listed;
}

// ---- Build -----------------------------------------------------------------------------------------------

function build({ out, main, previews = [], repo = '' }) {
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    const summary = { production: sha(main), previews: [] };

    exportApp(main, out);
    fs.writeFileSync(path.join(out, '.nojekyll'), '');

    const template = fs.readFileSync(path.join(__dirname, 'preview-runtime.js'), 'utf8');
    const chosen = selectPreviews(previews);
    const skipped = [];
    for (const preview of chosen) {
        const name = previewName(preview.number);
        const dir = path.join(out, 'preview', name);
        let commit;
        try {
            commit = sha(preview.ref);
        } catch (error) {
            // A pull request that could not be fetched must not take the whole site down.
            console.warn(`Skipping ${name}: ${preview.ref} is not available.`);
            skipped.push(preview.number);
            continue;
        }
        exportApp(preview.ref, dir);
        const info = buildInfo({ name, label: `PR #${preview.number}`, sha: commit });
        fs.writeFileSync(path.join(dir, 'preview-runtime.js'), runtimeSource(template, info));
        const indexFile = path.join(dir, 'index.html');
        fs.writeFileSync(indexFile, previewIndexHtml(fs.readFileSync(indexFile, 'utf8')));
        summary.previews.push({ name, sha: info.sha });
    }
    fs.mkdirSync(path.join(out, 'preview'), { recursive: true });
    fs.writeFileSync(path.join(out, 'preview', 'index.html'), previewsIndexHtml(chosen.filter((p) => !skipped.includes(p.number)), repo));
    summary.skipped = skipped;
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
    if (!args.out || !args.main) throw new Error('Usage: node scripts/build-site.js --out <dir> --main <ref> [--previews <file.json>] [--repo owner/name]');
    const previews = args.previews ? JSON.parse(fs.readFileSync(args.previews, 'utf8')) : [];
    const summary = build({ out: path.resolve(args.out), main: args.main, previews, repo: args.repo || '' });
    console.log(`production ${summary.production.slice(0, 7)}; ${summary.previews.length} preview(s): ${summary.previews.map((p) => `${p.name}@${p.sha}`).join(', ') || 'none'}`);
}

if (require.main === module) main();

module.exports = { APP_PATHS, MAX_PREVIEWS, escapeHtml, previewName, buildInfo, previewIndexHtml, runtimeSource, previewsIndexHtml, selectPreviews, build };
