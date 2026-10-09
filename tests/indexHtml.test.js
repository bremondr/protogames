'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

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

test('the main regions of the page are direct children of the right containers', () => {
    // A stray </div> shifts everything after it out of its container; these anchors would move with it.
    const body = html.slice(html.indexOf('<body'));
    for (const id of ['printDialog', 'shareDialog', 'themeEditor']) {
        const before = body.slice(0, body.indexOf(`id="${id}"`));
        const depth = (before.match(/<div\b/g) || []).length - (before.match(/<\/div>/g) || []).length;
        assert.ok(depth <= 1, `${id} is a top-level dialog (nesting depth ${depth})`);
    }
});

test('every element id the scripts look up by getElementById or a local $ helper exists in index.html', () => {
    // shortcutHelp is created by shortcuts.js when the overlay opens. autoSaveToggle is kept only for code
    // that tolerates its absence (the checkbox is commented out); drop it when that code is removed.
    const allowed = new Set(['shortcutHelp', 'autoSaveToggle']);
    const jsDir = path.resolve(__dirname, '..', 'js');
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
