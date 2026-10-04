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

test('the main regions of the page are direct children of the right containers', () => {
    // A stray </div> shifts everything after it out of its container; these anchors would move with it.
    const body = html.slice(html.indexOf('<body'));
    for (const id of ['printDialog', 'shareDialog', 'themeEditor']) {
        const before = body.slice(0, body.indexOf(`id="${id}"`));
        const depth = (before.match(/<div\b/g) || []).length - (before.match(/<\/div>/g) || []).length;
        assert.ok(depth <= 1, `${id} is a top-level dialog (nesting depth ${depth})`);
    }
});
