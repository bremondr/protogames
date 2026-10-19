'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./support/load');
const { makeStorage } = require('./support/fakes');

/** A panel with a heading button, with just what Panels.init touches. */
function makePanel(id) {
    const classes = new Set();
    const panel = { classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)), contains: (name) => classes.has(name) } };
    const attributes = {};
    const toggle = {
        listeners: {},
        setAttribute: (key, value) => { attributes[key] = value; },
        getAttribute: (key) => attributes[key],
        closest: (selector) => (selector === 'h2' ? { id } : selector === '.panel' ? panel : null),
        addEventListener(type, fn) { toggle.listeners[type] = fn; },
        click() { toggle.listeners.click(); }
    };
    attributes['aria-expanded'] = 'true';
    return { panel, toggle, folded: () => classes.has('collapsed'), expanded: () => attributes['aria-expanded'] };
}

function fresh(initial = {}, ids = ['a-title', 'b-title']) {
    const storage = makeStorage(initial);
    const panels = ids.map(makePanel);
    const root = { querySelectorAll: () => panels.map((p) => p.toggle) };
    const app = loadApp(['app/js/panels.js'], { localStorage: storage });
    return { Panels: app.run('Panels'), root, panels, storage };
}

test('panels start open, and a click folds one up and opens it again', () => {
    const { Panels, root, panels } = fresh();
    Panels.init(root);
    assert.deepEqual(panels.map((p) => [p.folded(), p.expanded()]), [[false, 'true'], [false, 'true']]);
    panels[0].toggle.click();
    assert.deepEqual([panels[0].folded(), panels[0].expanded()], [true, 'false']);
    assert.equal(panels[1].folded(), false, 'the other panel is not touched');
    panels[0].toggle.click();
    assert.deepEqual([panels[0].folded(), panels[0].expanded()], [false, 'true']);
});

test('which panels are folded is remembered, and comes back on the next visit', () => {
    const first = fresh();
    first.Panels.init(first.root);
    first.panels[1].toggle.click();
    assert.equal(first.storage.getItem('protogames_panels'), '["b-title"]');

    const next = fresh(first.storage.dump());
    next.Panels.init(next.root);
    assert.deepEqual(next.panels.map((p) => p.folded()), [false, true]);
    assert.equal(next.panels[1].expanded(), 'false');
    next.panels[1].toggle.click();
    assert.equal(next.storage.getItem('protogames_panels'), '[]', 'opening it again forgets it');
});

test('damaged or blocked storage leaves every panel open instead of failing', () => {
    for (const bad of ['{nope', '"text"', '{"a":1}', '[1,2]', 'null']) {
        const { Panels, root, panels } = fresh({ protogames_panels: bad });
        assert.doesNotThrow(() => Panels.init(root), bad);
        assert.deepEqual(panels.map((p) => p.folded()), [false, false], bad);
    }
    const blocked = fresh();
    blocked.storage.failWith = new Error('denied');
    assert.doesNotThrow(() => blocked.Panels.init(blocked.root));
    assert.doesNotThrow(() => blocked.panels[0].toggle.click(), 'folding still works for this visit');
    assert.equal(blocked.panels[0].folded(), true);
});

test('a heading button without a panel heading id is left alone', () => {
    const { Panels, root, panels } = fresh({}, ['']);
    assert.doesNotThrow(() => Panels.init(root));
    assert.equal(panels[0].toggle.listeners.click, undefined);
});

test('every sidebar panel of the page folds up: its heading is a button with an id, and the page loads the script', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
    const sidebar = html.slice(html.indexOf('<aside class="sidebar"'), html.indexOf('</aside>'));
    const panels = sidebar.match(/<section class="panel"/g) || [];
    assert.ok(panels.length >= 4, 'the sidebar has its panels');
    const headings = [...sidebar.matchAll(/<h2 id="([^"]+)"><button type="button" class="panel-toggle" aria-expanded="true">/g)];
    assert.equal(headings.length, panels.length, 'one fold button per panel');
    assert.equal(new Set(headings.map((m) => m[1])).size, headings.length, 'distinct ids, they are the remembered keys');
    assert.ok(html.indexOf('js/panels.js') > html.indexOf('js/ui.js'), 'loaded with the other scripts');
    const css = fs.readFileSync(path.join(__dirname, '..', 'app', 'styles.css'), 'utf8');
    assert.match(css, /\.panel\.collapsed > :not\(h2\) \{\s*display: none;/);
});
