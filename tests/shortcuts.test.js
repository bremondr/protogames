'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('./support/load');

const app = loadApp(['js/shortcuts.js']);
const S = app.run('Shortcuts');

/** A KeyboardEvent stand-in. `mods` is any of 'ctrl', 'meta', 'shift', 'alt'. */
function ev(key, mods = [], extra = {}) {
    return {
        key,
        code: extra.code || '',
        ctrlKey: mods.includes('ctrl'),
        metaKey: mods.includes('meta'),
        shiftKey: mods.includes('shift'),
        altKey: mods.includes('alt'),
        ...extra
    };
}
const idFor = (event, isMac = false, context = {}) => {
    const binding = S.findBinding(event, isMac, context);
    return binding ? binding.id : null;
};

// ---- Registry integrity -----------------------------------------------------------------

test('binding ids are unique and every binding has a label and a group', () => {
    const ids = S.BINDINGS.map((b) => b.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const binding of S.BINDINGS) {
        assert.ok(binding.label, binding.id);
        assert.ok(S.GROUPS.includes(binding.group), `${binding.id}: unknown group ${binding.group}`);
        assert.ok(binding.documentation || binding.keys.length > 0, `${binding.id}: no keys`);
    }
});

test('no two bindings share a key (the registry is conflict-free)', () => {
    assert.deepEqual(plain(S.findConflicts()), []);
});

test('the conflict detector really detects conflicts', () => {
    const clash = [
        { id: 'a', keys: ['mod+z'] },
        { id: 'b', keys: ['mod+y', 'mod+z'] },
        { id: 'c', keys: ['plus'] },
        { id: 'd', keys: ['shift+plus'] }
    ];
    const found = plain(S.findConflicts(clash));
    assert.equal(found.length, 2);
    assert.deepEqual(found[0].slice(0, 2), ['a', 'b']);
    assert.deepEqual(found[1].slice(0, 2), ['c', 'd'], 'Shift does not make a symbol a different key');
});

test('every binding from the issue exists with the proposed keys', () => {
    const keysOf = (id) => S.BINDINGS.find((b) => b.id === id).keys;
    assert.deepEqual(plain(keysOf('undo')), ['mod+z']);
    assert.ok(keysOf('redo').includes('mod+shift+z') && keysOf('redo').includes('mod+y'));
    assert.deepEqual(plain(keysOf('tool-eraser')), ['e']);
    assert.deepEqual(plain(keysOf('tool-brush')), ['b']);
    assert.deepEqual(plain(keysOf('tool-fill')), ['g']);
    assert.deepEqual(plain(keysOf('tool-select')), ['v']);
    assert.deepEqual(plain(keysOf('brush-smaller')), ['bracketleft']);
    assert.deepEqual(plain(keysOf('brush-larger')), ['bracketright']);
    for (let i = 1; i <= 9; i++) assert.deepEqual(plain(keysOf(`swatch-${i}`)), [String(i)]);
    assert.deepEqual(plain(keysOf('swatch-next')), ['tab']);
    assert.deepEqual(plain(keysOf('swatch-prev')), ['shift+tab']);
    assert.ok(keysOf('zoom-in').includes('plus') && keysOf('zoom-out').includes('minus'));
    assert.deepEqual(plain(keysOf('zoom-fit')), ['0']);
    assert.deepEqual(plain(keysOf('save')), ['mod+s']);
    assert.deepEqual(plain(keysOf('help')), ['question']);
});

test('Space + drag panning is documented in the registry but never matched as a key', () => {
    const pan = S.BINDINGS.find((b) => b.id === 'pan');
    assert.ok(pan.documentation);
    assert.equal(S.displayFor(pan, false), 'Space + drag');
    assert.equal(idFor(ev(' ', [], { code: 'Space' })), null);
});

// ---- Matching ---------------------------------------------------------------------------------

test('undo and redo: Ctrl on Windows/Linux, Cmd on macOS', () => {
    assert.equal(idFor(ev('z', ['ctrl'])), 'undo');
    assert.equal(idFor(ev('Z', ['ctrl', 'shift'])), 'redo');
    assert.equal(idFor(ev('y', ['ctrl'])), 'redo');
    assert.equal(idFor(ev('z', ['meta']), true), 'undo');
    assert.equal(idFor(ev('Z', ['meta', 'shift']), true), 'redo');
    assert.equal(idFor(ev('y', ['meta']), true), 'redo');
});

test('the wrong modifier for the platform does not trigger', () => {
    assert.equal(idFor(ev('z', ['meta']), false), null, 'Win key + Z on Windows');
    assert.equal(idFor(ev('z', ['ctrl']), true), null, 'Ctrl+Z on a Mac');
    assert.equal(idFor(ev('z', ['ctrl', 'meta']), true), null);
    assert.equal(idFor(ev('s', ['ctrl', 'alt'])), null);
});

test('plain keys need exactly their own modifiers', () => {
    assert.equal(idFor(ev('e')), 'tool-eraser');
    assert.equal(idFor(ev('E')), 'tool-eraser', 'Caps Lock');
    assert.equal(idFor(ev('e', ['shift'])), null);
    assert.equal(idFor(ev('e', ['ctrl'])), null);
    assert.equal(idFor(ev('e', ['alt'])), null);
    assert.equal(idFor(ev('b')), 'tool-brush');
    assert.equal(idFor(ev('g')), 'tool-fill');
    assert.equal(idFor(ev('l')), 'tool-line');
});

test('the Select tool key is reserved but does nothing until the tool exists', () => {
    assert.equal(idFor(ev('v')), null);
});

test('brush size keys', () => {
    assert.equal(idFor(ev('[', [], { code: 'BracketLeft' })), 'brush-smaller');
    assert.equal(idFor(ev(']', [], { code: 'BracketRight' })), 'brush-larger');
    // Layouts where the bracket needs AltGr/Shift or has a different character on the key.
    assert.equal(idFor(ev('{', ['shift'], { code: 'BracketLeft' })), 'brush-smaller');
    assert.equal(idFor(ev('ú', [], { code: 'BracketLeft' })), 'brush-smaller');
});

test('swatch number keys work on the number row, the numpad and AZERTY-style layouts', () => {
    for (let i = 1; i <= 9; i++) {
        assert.equal(idFor(ev(String(i))), `swatch-${i}`);
        assert.equal(idFor(ev(String(i), [], { code: `Numpad${i}` })), `swatch-${i}`);
    }
    assert.equal(idFor(ev('&', [], { code: 'Digit1' })), 'swatch-1', 'AZERTY needs Shift for digits; the key position is what counts');
    assert.equal(idFor(ev('1', ['ctrl'])), null, 'Ctrl+1 belongs to the browser');
    assert.equal(idFor(ev('0')), 'zoom-fit');
});

test('Tab cycles swatches only when focus is not on a control', () => {
    assert.equal(idFor(ev('Tab'), false, { focusNeutral: false }), null);
    assert.equal(idFor(ev('Tab'), false, { focusNeutral: true }), 'swatch-next');
    assert.equal(idFor(ev('Tab', ['shift']), false, { focusNeutral: true }), 'swatch-prev');
    assert.equal(idFor(ev('Tab', ['shift']), false, { focusNeutral: false }), null);
    assert.equal(idFor(ev('Tab', ['ctrl']), false, { focusNeutral: true }), null, 'Ctrl+Tab switches browser tabs');
});

test('zoom keys: + (with or without Shift), =, the numpad, - and _', () => {
    assert.equal(idFor(ev('+', ['shift'])), 'zoom-in');
    assert.equal(idFor(ev('=')), 'zoom-in');
    assert.equal(idFor(ev('+', [], { code: 'NumpadAdd' })), 'zoom-in');
    assert.equal(idFor(ev('-')), 'zoom-out');
    assert.equal(idFor(ev('_', ['shift'])), 'zoom-out');
    assert.equal(idFor(ev('-', [], { code: 'NumpadSubtract' })), 'zoom-out');
    assert.equal(idFor(ev('=', ['ctrl'])), null, 'Ctrl+= is the browser zoom');
    assert.equal(idFor(ev('-', ['ctrl'])), null, 'Ctrl+- is the browser zoom');
});

test('save is Ctrl/Cmd+S only', () => {
    assert.equal(idFor(ev('s', ['ctrl'])), 'save');
    assert.equal(idFor(ev('s', ['meta']), true), 'save');
    assert.equal(idFor(ev('s')), null);
    assert.equal(idFor(ev('S', ['ctrl', 'shift'])), null, 'Save As keeps its browser meaning');
});

test('? opens help', () => {
    assert.equal(idFor(ev('?', ['shift'])), 'help');
    assert.equal(idFor(ev('?')), 'help');
    assert.equal(idFor(ev('/')), null);
});

test('events without a usable key are ignored', () => {
    assert.equal(idFor({ key: 'Shift', code: 'ShiftLeft' }), null);
    assert.equal(idFor({ key: undefined }), null);
    assert.equal(idFor({}), null);
    assert.equal(idFor(ev('F5')), null);
    assert.equal(idFor(ev('Dead')), null);
});

test('only undo, redo, brush size, swatch cycling and zoom repeat when a key is held', () => {
    const repeating = S.BINDINGS.filter((b) => b.repeat).map((b) => b.id).sort();
    assert.deepEqual(plain(repeating), ['brush-larger', 'brush-smaller', 'redo', 'swatch-next', 'swatch-prev', 'undo', 'zoom-in', 'zoom-out']);
});

// ---- Typing and dialogs ---------------------------------------------------------------------------

test('shortcuts are disabled while typing in inputs, textareas, selects and editable content', () => {
    for (const type of ['text', 'search', 'number', 'email', 'password', 'url', 'tel', undefined]) {
        assert.equal(S.isTypingTarget({ tagName: 'INPUT', type }), true, `input ${type}`);
    }
    assert.equal(S.isTypingTarget({ tagName: 'TEXTAREA' }), true);
    assert.equal(S.isTypingTarget({ tagName: 'SELECT' }), true);
    assert.equal(S.isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
});

test('buttons, checkboxes, file/colour inputs and the page itself are not typing targets', () => {
    for (const type of ['checkbox', 'radio', 'button', 'submit', 'file', 'color', 'range']) {
        assert.equal(S.isTypingTarget({ tagName: 'INPUT', type }), false, `input ${type}`);
    }
    assert.equal(S.isTypingTarget({ tagName: 'BUTTON' }), false);
    assert.equal(S.isTypingTarget({ tagName: 'BODY' }), false);
    assert.equal(S.isTypingTarget({ tagName: 'CANVAS' }), false);
    assert.equal(S.isTypingTarget(null), false);
});

test('shouldIgnore covers typing, open dialogs, IME composition and handled events', () => {
    const input = { tagName: 'INPUT', type: 'text' };
    const body = { tagName: 'BODY' };
    assert.equal(S.shouldIgnore({ target: body }, { dialogOpen: false }), false);
    assert.equal(S.shouldIgnore({ target: input }, { dialogOpen: false }), true);
    assert.equal(S.shouldIgnore({ target: body }, { dialogOpen: true }), true);
    assert.equal(S.shouldIgnore({ target: body, isComposing: true }, {}), true);
    assert.equal(S.shouldIgnore({ target: body, defaultPrevented: true }, {}), true);
});

// ---- Display ---------------------------------------------------------------------------------------

test('key labels differ between macOS and other platforms', () => {
    assert.equal(S.formatCombo('mod+z', false), 'Ctrl+Z');
    assert.equal(S.formatCombo('mod+shift+z', false), 'Ctrl+Shift+Z');
    assert.equal(S.formatCombo('mod+z', true), '⌘Z');
    assert.equal(S.formatCombo('mod+shift+z', true), '⇧⌘Z');
    assert.equal(S.formatCombo('mod+s', true), '⌘S');
});

test('symbol and special keys have readable labels', () => {
    assert.equal(S.formatCombo('bracketleft', false), '[');
    assert.equal(S.formatCombo('bracketright', false), ']');
    assert.equal(S.formatCombo('minus', false), '−');
    assert.equal(S.formatCombo('plus', false), '+');
    assert.equal(S.formatCombo('tab', false), 'Tab');
    assert.equal(S.formatCombo('shift+tab', false), 'Shift+Tab');
    assert.equal(S.formatCombo('question', false), '?');
    assert.equal(S.formatCombo('e', false), 'E');
});

test('displayFor lists every alternative and hintFor only the first', () => {
    const redo = S.BINDINGS.find((b) => b.id === 'redo');
    assert.equal(S.displayFor(redo, false), 'Ctrl+Shift+Z or Ctrl+Y');
    assert.equal(S.hintFor(redo, false), 'Ctrl+Shift+Z');
    assert.equal(S.hintFor(redo, true), '⇧⌘Z');
    assert.equal(S.hintFor(S.BINDINGS.find((b) => b.id === 'tool-fill'), false), 'G');
});
