'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const Site = require('../scripts/build-site.js');

const ROOT = path.resolve(__dirname, '..');
const runtimeTemplate = () => fs.readFileSync(path.join(ROOT, 'scripts', 'preview-runtime.js'), 'utf8');

// ---- Pure helpers ---------------------------------------------------------------------------------------

test('preview folders are named after the pull request number only', () => {
    assert.equal(Site.previewName(66), 'pr-66');
    assert.equal(Site.previewName('7'), 'pr-7');
    assert.equal(Site.previewName('../../etc'), 'pr-NaN', 'anything that is not a number cannot form a path');
});

test('buildInfo gives every preview its own storage prefix and relative links', () => {
    const a = Site.buildInfo({ name: 'pr-1', label: 'PR #1', sha: 'abcdef0123456789' });
    const b = Site.buildInfo({ name: 'pr-2', label: 'PR #2', sha: '' });
    assert.equal(a.sha, 'abcdef0');
    assert.notEqual(a.storagePrefix, b.storagePrefix);
    assert.ok(a.storagePrefix.endsWith(':'));
    assert.equal(a.productionUrl, '../../');
    assert.equal(a.indexUrl, '../');
});

test('a preview page gets the runtime first and loses analytics; the rest is untouched', () => {
    const html = '<!doctype html>\n<html>\n<head>\n    <title>x</title>\n</head>\n<body>\n<script src="js/config.js"></script>\n<script async src="https://scripts.simpleanalyticscdn.com/latest.js"></script>\n</body>\n</html>\n';
    const out = Site.previewIndexHtml(html);
    assert.match(out, /<head>\n    <meta name="robots" content="noindex">\n    <script src="preview-runtime.js"><\/script>/);
    assert.ok(out.indexOf('preview-runtime.js') < out.indexOf('js/config.js'), 'runtime runs before the app');
    assert.ok(!out.includes('simpleanalytics'));
    assert.ok(out.includes('<script src="js/config.js"></script>') && out.includes('<title>x</title>'));
    assert.throws(() => Site.previewIndexHtml('<body></body>'), /no <head>/);
});

test('the runtime template is filled in once and refuses a template without the marker', () => {
    const info = Site.buildInfo({ name: 'pr-3', label: 'PR #3', sha: '1234567' });
    const source = Site.runtimeSource(runtimeTemplate(), info);
    assert.ok(source.includes('"storagePrefix":"preview:pr-3:"'));
    assert.ok(!source.includes('/*BUILD*/ null'));
    assert.throws(() => Site.runtimeSource('nothing here', info), /no build marker/);
});

test('the previews page lists previews and escapes everything it got from GitHub', () => {
    const html = Site.previewsIndexHtml([{ number: 5, title: '<img src=x onerror=alert(1)> & "more"', isDraft: true }], 'owner/repo');
    assert.ok(html.includes('href="pr-5/"'));
    assert.ok(html.includes('https://github.com/owner/repo/pull/5'));
    assert.ok(html.includes('draft'));
    assert.ok(!html.includes('<img'), 'a title cannot inject markup');
    assert.ok(html.includes('&lt;img') && html.includes('&amp;') && html.includes('&quot;more&quot;'));
    assert.match(Site.previewsIndexHtml([], 'owner/repo'), /No previews right now/);
});

test('only same-repository pull requests become previews, capped', () => {
    const pulls = [
        { number: 1, ref: 'refs/previews/pr-1', isCrossRepository: false },
        { number: 2, ref: 'refs/previews/pr-2', isCrossRepository: true },
        { number: 3, isCrossRepository: false },
        { number: '4', ref: 'x' },
        null,
        { number: 5, ref: 'refs/previews/pr-5' }
    ];
    assert.deepEqual(Site.selectPreviews(pulls).map((p) => p.number), [1, 5], 'forks, missing refs and non-numeric numbers are dropped');
    const many = Array.from({ length: 30 }, (_, i) => ({ number: i + 1, ref: `r${i}` }));
    assert.equal(Site.selectPreviews(many).length, Site.MAX_PREVIEWS);
    assert.equal(Site.selectPreviews(many, 3).length, 3);
});

// ---- The preview runtime in a fake browser ------------------------------------------------------------------

/** Just enough of the Web Storage API to prove the prefixing (named properties are not modelled). */
const makeStorageClass = () => class FakeStorage {
    constructor() { this.map = new Map(); }
    get length() { return this.map.size; }
    key(i) { return [...this.map.keys()][i] ?? null; }
    getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
    setItem(k, v) { this.map.set(String(k), String(v)); }
    removeItem(k) { this.map.delete(k); }
    clear() { this.map.clear(); }
};

function loadRuntime(info, extra = {}) {
    const context = { ...extra };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(Site.runtimeSource(runtimeTemplate(), info), context);
    return context;
}

test('a preview never sees or touches the keys of production or of another preview', () => {
    const Storage = makeStorageClass();
    const shared = new Storage(); // the one real storage of the shared origin
    shared.setItem('protogames_autosave:tab1', 'production work');
    shared.setItem('preview:pr-9:protogames_autosave:tab1', 'someone else');

    loadRuntime(Site.buildInfo({ name: 'pr-8', label: 'PR #8', sha: '' }), { Storage });
    assert.equal(shared.getItem('protogames_autosave:tab1'), null, 'production data is invisible');
    assert.equal(shared.length, 0, 'and so is the other preview');
    shared.setItem('protogames_minimap', 'off');
    assert.equal(shared.getItem('protogames_minimap'), 'off');
    assert.equal(shared.length, 1);
    assert.equal(shared.key(0), 'protogames_minimap', 'key() reports the names the app wrote');
    assert.equal(shared.key(1), null);
    // What was stored really lives under the prefix, next to the untouched data of the others.
    assert.equal(shared.map.get('preview:pr-8:protogames_minimap'), 'off');
    assert.equal(shared.map.get('protogames_autosave:tab1'), 'production work', 'production data is untouched');
    assert.equal(shared.map.get('preview:pr-9:protogames_autosave:tab1'), 'someone else');
});

test('clear() and removeItem() in a preview only remove the preview\'s own keys', () => {
    const Storage = makeStorageClass();
    const shared = new Storage();
    shared.setItem('production', 'keep me');
    loadRuntime(Site.buildInfo({ name: 'pr-8', label: 'PR #8', sha: '' }), { Storage });
    shared.setItem('a', '1');
    shared.setItem('b', '2');
    shared.removeItem('a');
    assert.equal(shared.length, 1);
    shared.clear();
    assert.equal(shared.length, 0);
    assert.equal(shared.map.get('production'), 'keep me', 'clear() leaves the other versions alone');
});

test('production has no runtime, so without a build description nothing is patched', () => {
    const Storage = makeStorageClass();
    const context = { Storage };
    context.window = context;
    vm.createContext(context);
    // The template as committed (marker still null): the app's storage is left alone.
    vm.runInContext(runtimeTemplate(), context);
    const storage = new Storage();
    storage.setItem('k', 'v');
    assert.equal(storage.key(0), 'k');
    assert.equal(context.PG_BUILD, undefined);
});

test('the badge names the preview and links back to production and the list', () => {
    const created = [];
    const element = (tag) => {
        const node = { tag, style: {}, children: [], attrs: {}, listeners: {}, setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); }, addEventListener(t, f) { this.listeners[t] = f; }, remove() { this.removed = true; } };
        created.push(node);
        return node;
    };
    const body = { children: [], appendChild(c) { this.children.push(c); } };
    const document = { readyState: 'complete', body, createElement: element, addEventListener() {} };
    loadRuntime(Site.buildInfo({ name: 'pr-12', label: 'PR #12', sha: 'abcdef0123' }), { document, Storage: makeStorageClass() });
    assert.equal(body.children.length, 1);
    const badge = body.children[0];
    assert.equal(badge.children[0].textContent, 'Preview: PR #12 (abcdef0)');
    const links = badge.children.filter((c) => c.tag === 'a').map((c) => [c.textContent, c.href]);
    assert.deepEqual(links, [['production', '../../'], ['all previews', '../']]);
    badge.children.find((c) => c.tag === 'button').listeners.click();
    assert.equal(badge.removed, true, 'the badge can be dismissed');
});

// ---- Building the site from git ----------------------------------------------------------------------------------

test('a site build puts production at the root and previews under /preview/<name>/', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-site-'));
    try {
        const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
        const summary = Site.build({ out, main: head, previews: [{ number: 66, title: 'Experiment', ref: head, isDraft: false }, { number: 70, ref: head, isCrossRepository: true }], repo: 'owner/repo' });
        assert.equal(summary.previews.length, 1);

        const production = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
        const preview = fs.readFileSync(path.join(out, 'preview', 'pr-66', 'index.html'), 'utf8');
        assert.ok(!production.includes('preview-runtime'), 'production is the app exactly as committed');
        assert.ok(preview.includes('preview-runtime.js') && !preview.includes('simpleanalytics'));
        assert.ok(fs.existsSync(path.join(out, 'js', 'config.js')) && fs.existsSync(path.join(out, 'preview', 'pr-66', 'js', 'config.js')));
        assert.ok(fs.existsSync(path.join(out, 'preview', 'pr-66', 'preview-runtime.js')));
        assert.ok(!fs.existsSync(path.join(out, 'preview-runtime.js')), 'the runtime is not in production');
        assert.ok(!fs.existsSync(path.join(out, 'preview', 'pr-70')), 'a fork is not published');
        assert.ok(!fs.existsSync(path.join(out, 'tests')) && !fs.existsSync(path.join(out, 'scripts')), 'only the app is published');
        assert.ok(fs.existsSync(path.join(out, '.nojekyll')));
        assert.ok(fs.readFileSync(path.join(out, 'preview', 'index.html'), 'utf8').includes('pr-66'));
        // Binary files survive the trip through git.
        assert.deepEqual(fs.readFileSync(path.join(out, 'images', 'protogames proto logo.png')), fs.readFileSync(path.join(ROOT, 'images', 'protogames proto logo.png')));
    } finally {
        fs.rmSync(out, { recursive: true, force: true });
    }
});

test('a pull request whose ref cannot be read is skipped instead of failing the whole build', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-site-'));
    const warn = console.warn;
    try {
        console.warn = () => {};
        const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
        const summary = Site.build({ out, main: head, previews: [{ number: 1, ref: 'refs/previews/does-not-exist' }, { number: 2, ref: head }] });
        assert.deepEqual(summary.previews.map((p) => p.name), ['pr-2']);
        assert.deepEqual(summary.skipped, [1]);
        assert.ok(!fs.existsSync(path.join(out, 'preview', 'pr-1')));
        assert.ok(!fs.readFileSync(path.join(out, 'preview', 'index.html'), 'utf8').includes('pr-1/'));
    } finally {
        console.warn = warn;
        fs.rmSync(out, { recursive: true, force: true });
    }
});

test('a pull request that cannot become a preview is skipped and never aborts the build', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-site-'));
    const warn = console.warn;
    try {
        console.warn = () => {};
        const run = (args, input) => execFileSync('git', args, { cwd: ROOT, input }).toString().trim();
        const head = run(['rev-parse', 'HEAD']);
        // Unreferenced commits: one without index.html, one whose index.html has no <head>.
        const commitOf = (tree) => run(['commit-tree', tree, '-m', 'test']);
        const noIndex = commitOf(run(['mktree'], ''));
        const blob = run(['hash-object', '-w', '--stdin'], '<p>no head here</p>');
        const noHead = commitOf(run(['mktree'], `100644 blob ${blob}\tindex.html\n`));
        const summary = Site.build({ out, main: head, previews: [{ number: 1, ref: noIndex }, { number: 2, ref: noHead }, { number: 3, ref: head }] });
        assert.deepEqual(summary.previews.map((p) => p.name), ['pr-3']);
        assert.deepEqual(summary.skipped, [1, 2]);
        assert.ok(fs.existsSync(path.join(out, 'index.html')), 'production is still published');
        assert.ok(!fs.existsSync(path.join(out, 'preview', 'pr-1')) && !fs.existsSync(path.join(out, 'preview', 'pr-2')));
        const list = fs.readFileSync(path.join(out, 'preview', 'index.html'), 'utf8');
        assert.ok(list.includes('pr-3') && !list.includes('pr-1/') && !list.includes('pr-2/'));
    } finally {
        console.warn = warn;
        fs.rmSync(out, { recursive: true, force: true });
    }
});
