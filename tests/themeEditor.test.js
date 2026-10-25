'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load');
const { makeUI } = require('./support/fakes');

/** A permissive element: remembers listeners and plain values, and answers every method call with nothing. */
function makeElement() {
    const target = { listeners: {}, classes: new Set(), children: [] };
    target.addEventListener = (type, fn) => { target.listeners[type] = fn; };
    target.classList = { add: (c) => target.classes.add(c), remove: (c) => target.classes.delete(c), contains: (c) => target.classes.has(c) };
    target.appendChild = (child) => { target.children.push(child); return child; };
    target.setAttribute = () => {};
    target.focus = () => {};
    target.style = {};
    return new Proxy(target, { get: (t, key) => (key in t ? t[key] : undefined), set: (t, key, value) => { t[key] = value; return true; } });
}

function fresh(saveTheme) {
    const elements = {};
    const ui = makeUI();
    const document = {
        getElementById: (id) => (elements[id] = elements[id] || makeElement()),
        createElement: () => makeElement(),
        addEventListener() {},
        activeElement: null
    };
    const app = loadApp(['app/js/themeEditor.js'], {
        document,
        UI: ui,
        Config: { getAllPalettes: () => [], getPaletteById: () => null },
        Objects: { themes: () => [], list: () => [] },
        Textures: { dataUrlFor: () => null },
        ThemeManager: { get: () => null, saveTheme }
    });
    const ThemeEditor = app.run('ThemeEditor');
    ThemeEditor.init();
    ThemeEditor.open('tiles', null);
    elements.themeEditorName.value = 'Swamp';
    elements.themeEditorName.listeners.input();
    return { elements, ui, ThemeEditor, hidden: () => elements.themeEditor.classes.has('hidden') };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test('closing the editor during a save is ignored, and the save then finishes and closes it once', async () => {
    let finish;
    const env = fresh(() => new Promise((resolve) => { finish = resolve; }));
    env.elements.themeEditorSave.listeners.click();
    await tick();
    env.elements.themeEditorCancel.listeners.click();
    env.elements.themeEditorClose.listeners.click();
    assert.equal(env.hidden(), false, 'the dialog stays while saving');
    finish({ saved: true });
    await tick();
    assert.equal(env.hidden(), true);
    assert.deepEqual(env.ui.notes, ['Created "Swamp"']);
});

test('a failed save keeps the dialog open with the reason, and it can be closed afterwards', async () => {
    const env = fresh(() => Promise.reject(new Error('disk full')));
    env.elements.themeEditorSave.listeners.click();
    await tick();
    assert.match(env.elements.themeEditorError.textContent, /disk full/);
    assert.equal(env.hidden(), false);
    assert.equal(env.elements.themeEditorSave.disabled, false);
    env.elements.themeEditorCancel.listeners.click();
    env.elements.themeEditorCancel.listeners.click();
    assert.equal(env.hidden(), true, 'closing still asks once, because the name typed was never saved');
});

test('an editor with no changes closes at once; with changes the first request asks and the second discards', () => {
    const env = fresh(() => Promise.resolve({ saved: true }));
    // Back to the state it opened in: nothing to lose.
    env.elements.themeEditorName.value = '';
    env.elements.themeEditorName.listeners.input();
    env.elements.themeEditorCancel.listeners.click();
    assert.equal(env.hidden(), true, 'nothing changed, so no question');

    env.ThemeEditor.open('tiles', null);
    env.elements.themeEditorName.value = 'Dunes';
    env.elements.themeEditorName.listeners.input();
    const root = env.elements.themeEditor;
    root.listeners.pointerdown({ target: root });
    assert.equal(env.hidden(), false, 'a backdrop click does not throw the edit away');
    assert.match(env.elements.themeEditorError.textContent, /unsaved changes/);
    assert.equal(env.elements.themeEditorCancel.textContent, 'Discard changes');
    env.elements.themeEditorClose.listeners.click();
    assert.equal(env.hidden(), true, 'asked again: discarded');
    assert.equal(env.elements.themeEditorCancel.textContent, 'Cancel');
});

test('typing after the question takes it back, and saving needs no question', async () => {
    const env = fresh(() => Promise.resolve({ saved: true }));
    env.elements.themeEditorCancel.listeners.click();
    assert.equal(env.elements.themeEditorCancel.textContent, 'Discard changes');
    env.elements.themeEditorName.value = 'Swamp 2';
    env.elements.themeEditorName.listeners.input();
    assert.equal(env.elements.themeEditorCancel.textContent, 'Cancel');
    assert.equal(env.elements.themeEditorError.textContent, '');
    env.elements.themeEditorCancel.listeners.click();
    assert.equal(env.hidden(), false, 'asks again after a further edit');
    env.elements.themeEditorSave.listeners.click();
    await tick();
    assert.equal(env.hidden(), true);
});
