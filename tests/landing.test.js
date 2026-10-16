'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(ROOT, 'landing.js'), 'utf8');

test('every local link, image and script of the landing page exists', () => {
    const refs = [...html.matchAll(/\b(?:href|src)="([^"#]*)(?:#[^"]*)?"/g)].map((m) => m[1]).filter((ref) => ref && !/^(https?:|\.\/$)/.test(ref));
    assert.ok(refs.includes('app/') && refs.includes('landing.js'), 'it links to the app and loads its script');
    for (const ref of refs) assert.ok(fs.existsSync(path.join(ROOT, decodeURIComponent(ref))), `${ref} exists`);
});

test('the landing page allows scripts only from its own site and has no inline script', () => {
    assert.match(html, /script-src 'self';/);
    assert.ok(!/<script(?![^>]*\bsrc=)/.test(html), 'no inline script');
});

function visit(hash, search = '') {
    let target = null;
    vm.runInNewContext(script, { location: { hash, search, replace: (url) => { target = url; } } });
    return target;
}

test('an old share link addressed to the site root is forwarded to the app with its hash', () => {
    assert.equal(visit('#b=abc_DEF-123'), 'app/#b=abc_DEF-123');
    assert.equal(visit('#b=xyz', '?x=1'), 'app/?x=1#b=xyz');
});

test('ordinary visits and in-page anchors stay on the landing page', () => {
    for (const hash of ['', '#features', '#how', '#bx']) assert.equal(visit(hash), null, hash || '(none)');
});
