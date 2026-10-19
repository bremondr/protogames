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
    const refs = [...html.matchAll(/\b(?:href|src)="([^"#?]*)(?:[?#][^"]*)?"/g)].map((m) => m[1]).filter((ref) => ref && !/^(https?:|\.\/$)/.test(ref));
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

test('the logo in the editor header links back to the landing page', () => {
    const app = fs.readFileSync(path.join(ROOT, 'app', 'index.html'), 'utf8');
    const brand = /<a class="brand" href="([^"]*)"[^>]*>[\s\S]*?<\/a>/.exec(app);
    assert.ok(brand, 'the brand is a link');
    assert.equal(path.posix.normalize(`/app/${brand[1]}`), '/', 'it points at the site root, where the landing page is');
    assert.ok(/class="brand-mark"/.test(brand[0]) && /Protogames<\/span>/.test(brand[0]), 'the logo and the name are both inside it');
    assert.match(brand[0], /aria-label="[^"]+"/, 'it has an accessible name');
});

test('the landing page loads the project library before its own script, and links to a showcase that exists', () => {
    assert.ok(html.indexOf('app/js/projectLibrary.js') > 0 && html.indexOf('app/js/projectLibrary.js') < html.indexOf('src="landing.js"'), 'library first');
    const link = /href="app\/\?showcase=([^"]+)"/.exec(html);
    assert.ok(link, 'there is a link that opens a showcase');
    const config = fs.readFileSync(path.join(ROOT, 'app', 'js', 'config.js'), 'utf8');
    assert.ok(config.includes(`id: '${link[1]}'`), 'the showcase is in Config.SHOWCASES');
    assert.ok(fs.existsSync(path.join(ROOT, 'app', 'showcases', link[1] + '.protogames.json')), 'and its file is shipped');
    assert.match(html, /id="projects"[^>]*\bhidden\b/, 'the project list is hidden until there are projects');
});

function helpers() {
    const module = { exports: {} };
    vm.runInNewContext(script, { location: { hash: '', search: '', replace() {} }, module });
    return module.exports;
}

test('ages are told in plain words', () => {
    const { describeAge } = helpers();
    const now = Date.UTC(2026, 9, 19, 12, 0, 0);
    assert.equal(describeAge(0, now), 'Never saved');
    assert.equal(describeAge(now - 20 * 1000, now), 'Edited just now');
    assert.equal(describeAge(now - 60 * 1000, now), 'Edited 1 minute ago');
    assert.equal(describeAge(now - 5 * 60 * 1000, now), 'Edited 5 minutes ago');
    assert.equal(describeAge(now - 3 * 3600 * 1000, now), 'Edited 3 hours ago');
    assert.equal(describeAge(now - 30 * 3600 * 1000, now), 'Edited yesterday');
    assert.equal(describeAge(now - 4 * 86400 * 1000, now), 'Edited 4 days ago');
    assert.equal(describeAge(Date.UTC(2026, 6, 1), now), 'Edited 2026-07-01');
    assert.equal(describeAge(now + 5000, now), 'Edited just now', 'a clock that is off does not make negative ages');
});

test('a project is described by its board and tiles', () => {
    const { describeBoard } = helpers();
    assert.equal(describeBoard({ readable: true, boardShape: 'hexagon', gridType: 'hexagon', tiles: 91 }), 'Hexagon board, 91 hexagon tiles');
    assert.equal(describeBoard({ readable: true, boardShape: 'rectangle', gridType: 'square', tiles: 1 }), 'Rectangle board, 1 square tile');
    assert.equal(describeBoard({ readable: true, boardShape: '', gridType: '', tiles: 4 }), '4 tiles');
    assert.equal(describeBoard({ readable: false }), 'This project cannot be read');
});

/** Just enough of a document for the list: elements with children, text, classes and listeners. */
function fakeDocument() {
    const byId = {};
    const make = (tag) => {
        const el = {
            tag, children: [], attributes: {}, listeners: {}, className: '', textContent: '', hidden: false, href: '', type: '',
            classList: { _set: new Set(), add(n) { this._set.add(n); }, remove(n) { this._set.delete(n); }, contains(n) { return this._set.has(n); } },
            setAttribute(k, v) { el.attributes[k] = v; },
            appendChild(c) { el.children.push(c); return c; },
            append(...cs) { cs.forEach((c) => el.children.push(c)); },
            addEventListener(type, fn) { el.listeners[type] = fn; },
            click() { el.listeners.click(); }
        };
        Object.defineProperty(el, 'textContent', { get: () => el._text || '', set: (v) => { el._text = v; if (v === '') el.children = []; } });
        return el;
    };
    for (const id of ['projects', 'projectList', 'navProjects', 'projectsNote']) byId[id] = make('x');
    byId.projects.hidden = true;
    return { byId, createElement: make, getElementById: (id) => byId[id] };
}

function visitWithProjects(entries) {
    const document = fakeDocument();
    const removed = [];
    const ProjectLibrary = { KEY_PREFIX: 'protogames_project:', importLegacy() {}, list: () => entries.filter((e) => !removed.includes(e.id)), remove: (id) => removed.push(id) };
    const events = {};
    vm.runInNewContext(script, { location: { hash: '', search: '', replace() {} }, document, ProjectLibrary, window: { addEventListener: (type, fn) => { events[type] = fn; } }, setTimeout, clearTimeout, Date });
    return { document, removed, events };
}

const ENTRY = { id: 'aaaaaa-1111', readable: true, name: 'Dragon isle', timestamp: Date.now(), tiles: 91, boardShape: 'hexagon', gridType: 'hexagon' };

test('with no projects the list stays hidden', () => {
    const { document } = visitWithProjects([]);
    assert.equal(document.byId.projects.hidden, true);
    assert.equal(document.byId.navProjects.hidden, true);
});

test('each project is a link that opens it in the app', () => {
    const { document } = visitWithProjects([ENTRY, { ...ENTRY, id: 'bbbbbb-2222', name: 'Second' }]);
    assert.equal(document.byId.projects.hidden, false);
    assert.equal(document.byId.navProjects.hidden, false);
    const items = document.byId.projectList.children;
    assert.equal(items.length, 2);
    const open = items[0].children[0];
    assert.equal(open.href, 'app/?project=aaaaaa-1111');
    assert.deepEqual(open.children.map((c) => c.textContent), ['Dragon isle', 'Hexagon board, 91 hexagon tiles', 'Edited just now']);
});

test('deleting asks twice: the first press only asks, the second deletes', () => {
    const { document, removed } = visitWithProjects([ENTRY]);
    const button = () => document.byId.projectList.children[0].children[1];
    button().click();
    assert.deepEqual(removed, [], 'nothing deleted by the first press');
    assert.equal(button().textContent, 'Delete for good?');
    button().click();
    assert.deepEqual(removed, ['aaaaaa-1111']);
    assert.equal(document.byId.projects.hidden, true, 'the last project is gone, the list hides');
    assert.match(document.byId.projectsNote.textContent, /Deleted "Dragon isle"/);
});

test('a change made in another tab refreshes the list', () => {
    const { document, events } = visitWithProjects([ENTRY]);
    assert.equal(typeof events.storage, 'function');
    document.byId.projectList.children.length = 0;
    events.storage({ key: 'protogames_project:aaaaaa-1111' });
    assert.equal(document.byId.projectList.children.length, 1);
    events.storage({ key: 'something_else' });
    assert.equal(document.byId.projectList.children.length, 1, 'other keys are ignored');
});
