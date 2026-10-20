'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'app', 'index.html'), 'utf8');

/** Tags that never have a closing tag. */
const VOID = new Set(['meta', 'link', 'input', 'img', 'br', 'hr', 'source', 'wbr']);

/**
 * Walks the tags of a page and reports the first nesting problem: a closing tag that does not match
 * the open one, a tag left open, or a stray closing tag. Comments and the bodies of script and style
 * are skipped. This is not a full HTML parser, it is a guard against the typo that shifts a whole page.
 */
function nestingProblem(source) {
    const stripped = source
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, (m, tag) => `<${tag}></${tag}>`);
    const stack = [];
    const tag = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
    let match;
    while ((match = tag.exec(stripped))) {
        const name = match[1].toLowerCase();
        const line = stripped.slice(0, match.index).split('\n').length;
        if (VOID.has(name) || match[2] === '/') continue;
        if (match[0].startsWith('</')) {
            const open = stack.pop();
            if (!open) return `stray </${name}> on line ${line}`;
            if (open.name !== name) return `</${name}> on line ${line} closes <${open.name}> from line ${open.line}`;
        } else {
            stack.push({ name, line });
        }
    }
    return stack.length ? `<${stack[stack.length - 1].name}> from line ${stack[stack.length - 1].line} is never closed` : null;
}

test('the checker finds the typos it is meant to find', () => {
    assert.equal(nestingProblem('<div><span>a</span></div>'), null);
    assert.match(nestingProblem('<div><div>a</div></div></div>'), /stray/);
    assert.match(nestingProblem('<div><span>a</div></span>'), /closes <span>/);
    assert.match(nestingProblem('<section><div>a</section>'), /closes <div>/);
    assert.match(nestingProblem('<div><p>a</p>'), /never closed/);
    assert.equal(nestingProblem('<div><input type="text"><img src="x"><!-- <div> --><script>if (a < b) {}</script></div>'), null);
});

test('index.html is well nested, so every panel, dialog and toolbar ends where it should', () => {
    assert.equal(nestingProblem(html), null);
});

test('a Content-Security-Policy limits scripts to this site and the analytics script, and allows what the app needs', () => {
    const match = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
    assert.ok(match, 'the policy is in a meta tag');
    const policy = Object.fromEntries(match[1].split(';').map((part) => part.trim().split(/\s+/)).filter((p) => p[0]).map(([name, ...values]) => [name, values]));
    assert.deepEqual(policy['script-src'], ["'self'", 'https://scripts.simpleanalyticscdn.com']);
    assert.ok(!match[1].includes("'unsafe-eval'") && !policy['script-src'].includes("'unsafe-inline'"));
    assert.ok(policy['img-src'].includes('data:') && policy['img-src'].includes('blob:'), 'textures and objects are data and blob images');
    assert.ok(policy['style-src'].includes("'unsafe-inline'"), 'style attributes are used');
    assert.deepEqual(policy['object-src'], ["'none'"]);
    // The policy only holds if the page really has no inline script or event handler attributes.
    const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map((m) => m[1]);
    assert.ok(scripts.every((attrs) => /\bsrc=/.test(attrs)), 'every script is external');
    assert.ok(!/\son[a-z]+\s*=/i.test(html.replace(/<!--[\s\S]*?-->/g, '')), 'no inline event handlers');
    for (const attrs of scripts) {
        const src = /\bsrc="([^"]+)"/.exec(attrs)[1];
        assert.ok(!/^https?:/.test(src) || src.startsWith('https://scripts.simpleanalyticscdn.com/'), `${src} is allowed by the policy`);
    }
});

test('the app scripts are deferred: over HTTP/2 a plain script tag is fetched one round trip after the other (8 s at 150 ms latency, 1 s deferred)', () => {
    const own = [...html.matchAll(/<script\b([^>]*)>/gi)].map((m) => m[1]).filter((attrs) => /\bsrc="js\//.test(attrs));
    assert.ok(own.length > 30, 'the app scripts are in the page');
    assert.ok(own.every((attrs) => /\bdefer\b/.test(attrs)), 'every app script has defer, which keeps their order and runs them before DOMContentLoaded');
});

test('the page has favicons (small .ico and the logo png), and they are files that exist', () => {
    const hrefs = [...html.matchAll(/<link rel="icon"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(hrefs.some((h) => h.endsWith('.ico')), 'a .ico favicon');
    assert.ok(hrefs.some((h) => h.endsWith('.png')), 'a .png favicon');
    for (const href of hrefs) assert.ok(fs.existsSync(path.resolve(__dirname, '..', 'app', decodeURIComponent(href))), `${href} exists`);
});

test('the main regions of the page are direct children of the right containers', () => {
    // A stray </div> shifts everything after it out of its container; these anchors would move with it.
    const body = html.slice(html.indexOf('<body'));
    for (const id of ['exportDialog', 'loadDialog', 'shareDialog', 'themeEditor']) {
        const before = body.slice(0, body.indexOf(`id="${id}"`));
        const depth = (before.match(/<div\b/g) || []).length - (before.match(/<\/div>/g) || []).length;
        assert.ok(depth <= 1, `${id} is a top-level dialog (nesting depth ${depth})`);
    }
});

test('every element id the scripts look up by getElementById or a local $ helper exists in index.html', () => {
    // shortcutHelp is created by shortcuts.js when the overlay opens.
    const allowed = new Set(['shortcutHelp']);
    const jsDir = path.resolve(__dirname, '..', 'app', 'js');
    const pageIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    const missing = [];
    for (const file of fs.readdirSync(jsDir).filter((f) => f.endsWith('.js'))) {
        const source = fs.readFileSync(path.join(jsDir, file), 'utf8');
        // Only files that define "$ = (id) => document.getElementById(id)" may use $('id').
        const usesDollar = /const \$ = \(id\) => document\.getElementById\(id\)/.test(source);
        const lookups = [...source.matchAll(/getElementById\('([^']+)'\)/g)];
        if (usesDollar) lookups.push(...source.matchAll(/(?<![\w$.])\$\('([^']+)'\)/g));
        for (const [, id] of lookups) {
            if (!pageIds.has(id) && !allowed.has(id)) missing.push(`${file}: #${id}`);
        }
    }
    assert.deepEqual([...new Set(missing)], []);
});

test('the Project panel holds the name and three buttons: Export, Share and Load; the old panels are gone', () => {
    const panel = /<section class="panel" aria-labelledby="project-title">([\s\S]*?)<\/section>/.exec(html);
    assert.ok(panel, 'one Project panel');
    assert.ok(panel[1].includes('id="projectNameInput"'));
    const buttons = [...panel[1].matchAll(/<button\b[^>]*id="([^"]+)"[^>]*>/g)].map((m) => m[1]);
    assert.deepEqual(buttons, ['exportButton', 'shareButton', 'loadProjectBtn']);
    assert.ok(!html.includes('File Management') && !html.includes('id="files-title"'), 'File Management is part of the Project panel now');
    for (const old of ['saveProjectBtn', 'exportPNGBtn', 'exportSVGBtn', 'printButton', 'newProjectButton', 'allProjectsLink']) {
        assert.ok(!html.includes(`id="${old}"`), `${old} moved into a dialog`);
    }
});

test('the Export dialog has the tabs Print, PNG, SVG and Project file, each tied to its own panel', () => {
    const dialog = /<div id="exportDialog"[\s\S]*?<!-- Load dialog/.exec(html)[0];
    const tabs = [...dialog.matchAll(/role="tab" id="exportTab-(\w+)" aria-controls="exportPanel-(\w+)" data-tab="(\w+)">([^<]+)</g)];
    assert.deepEqual(tabs.map((m) => m[4]), ['Print', 'PNG', 'SVG', 'Project file']);
    for (const [, id, controls, data] of tabs) {
        assert.equal(id, controls);
        assert.equal(id, data);
        assert.match(dialog, new RegExp(`role="tabpanel" id="exportPanel-${id}" aria-labelledby="exportTab-${id}"`), `panel for ${id}`);
    }
    // the print controls are still all there, the picture tabs have their options
    for (const pr of ['tileMm', 'paper', 'overlapMm', 'marginMm', 'textures', 'legend']) assert.ok(dialog.includes(`data-pr="${pr}"`), pr);
    assert.deepEqual([...dialog.matchAll(/data-ex-group="(\w+)"/g)].map((m) => m[1]), ['scale', 'background', 'background']);
    assert.deepEqual([...dialog.matchAll(/data-ex="(\w+)"/g)].map((m) => m[1]), ['textures', 'objects', 'grid', 'textures', 'objects', 'grid']);
});

test('the Load dialog offers the projects of this browser, a file import, a new project and the home page', () => {
    const dialog = /<div id="loadDialog"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/.exec(html)[0];
    for (const id of ['loadList', 'loadEmpty', 'loadImport', 'loadNew', 'loadHome', 'loadClose']) assert.ok(dialog.includes(`id="${id}"`), id);
    assert.ok(html.includes('<input type="file" id="loadProject"'), 'the file input the import button clicks');
});
