'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('./support/load');

const app = loadApp(['app/js/focusUtils.js', 'app/js/shortcuts.js']);
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
const idFor = (event, isMac = false) => {
    const binding = S.findBinding(event, isMac);
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
    assert.deepEqual(plain(keysOf('swatch-next')), ['period']);
    assert.deepEqual(plain(keysOf('swatch-prev')), ['comma']);
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

test('the app never claims Tab; swatches cycle on . and ,', () => {
    for (const mods of [[], ['shift'], ['ctrl']]) assert.equal(idFor(ev('Tab', mods)), null, `Tab ${mods}`);
    for (const binding of S.BINDINGS) for (const key of binding.keys) assert.ok(!/tab/.test(key), `${binding.id} uses ${key}`);
    assert.equal(idFor(ev('.', [], { code: 'Period' })), 'swatch-next');
    assert.equal(idFor(ev(',', [], { code: 'Comma' })), 'swatch-prev');
    assert.equal(S.BINDINGS.find((b) => b.id === 'swatch-next').repeat, true);
    assert.equal(S.BINDINGS.find((b) => b.id === 'swatch-prev').repeat, true);
    assert.equal(idFor(ev('.', ['ctrl'])), null);
    assert.equal(S.hintFor(S.BINDINGS.find((b) => b.id === 'swatch-next'), false), '.');
});

test('AltGr (reported as Ctrl+Alt) still types [ and ] on Czech and German layouts', () => {
    const altGr = (key, code) => ev(key, ['ctrl', 'alt'], { code, getModifierState: (name) => name === 'AltGraph' });
    assert.equal(idFor(altGr('[', 'BracketLeft')), 'brush-smaller');
    assert.equal(idFor(altGr(']', 'BracketRight')), 'brush-larger');
    // Without AltGraph, Ctrl+Alt+[ is a real modifier chord and stays free for the browser.
    assert.equal(idFor(ev('[', ['ctrl', 'alt'], { code: 'BracketLeft', getModifierState: () => false })), null);
    // AltGr does not turn other keys into Ctrl+Z.
    assert.equal(idFor(ev('z', ['ctrl', 'alt'], { getModifierState: (name) => name === 'AltGraph' })), null);
});

test('numpad digits pick swatches only with NumLock on (the key reports the digit)', () => {
    assert.equal(idFor(ev('End', [], { code: 'Numpad1' })), null);
    assert.equal(idFor(ev('ArrowDown', [], { code: 'Numpad2' })), null);
    assert.equal(idFor(ev('Clear', [], { code: 'Numpad5' })), null);
    assert.equal(idFor(ev('0', [], { code: 'Numpad0' })), 'zoom-fit');
    assert.equal(idFor(ev('Insert', [], { code: 'Numpad0' })), null);
    assert.equal(idFor(ev('3', [], { code: 'Numpad3' })), 'swatch-3');
});

test('every way to operate the app is listed: Esc, Tab and the playtest keys', () => {
    const docs = S.BINDINGS.filter((b) => b.documentation).map((b) => `${b.group}:${b.display}`);
    for (const wanted of ['Edit:Esc', 'Playtest:Esc', 'Playtest:Tab / Shift+Tab', 'Playtest:Enter / Space', 'Playtest:Arrow keys', 'Playtest:Delete / Backspace', 'Help:Esc', 'Help:Tab / Shift+Tab', 'View:Space + drag']) {
        assert.ok(docs.includes(wanted), wanted);
    }
    assert.ok(S.GROUPS.includes('Playtest'));
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
    assert.equal(S.formatCombo('period', false), '.');
    assert.equal(S.formatCombo('comma', false), ',');
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

test('in playtest mode only navigation, help and undo/redo (of piece moves) stay on', () => {
    const allowed = S.BINDINGS.filter((b) => !b.documentation && S.allowedInPlaytest(b)).map((b) => b.id).sort();
    assert.deepEqual(plain(allowed), ['help', 'redo', 'undo', 'zoom-fit', 'zoom-in', 'zoom-out']);
    for (const id of ['tool-start', 'tool-brush', 'tool-fill', 'tool-line', 'tool-eraser', 'brush-smaller', 'brush-larger', 'swatch-1', 'swatch-next', 'save']) {
        assert.equal(S.allowedInPlaytest(S.BINDINGS.find((b) => b.id === id)), false, `${id} is locked`);
    }
});

// ---- Focus rules (audit M3-M5, L12, L13) ---------------------------------------------------------

/** A tiny element: tag, optional attributes, and the selectors it answers to. */
function el(tag, attrs = {}) {
    const node = { tagName: tag, ...attrs };
    node.matches = (selector) => selector.split(',').some((part) => {
        part = part.trim();
        if (part === tag.toLowerCase()) return true;
        const role = /^\[role="(\w+)"\]$/.exec(part);
        if (role) return attrs.role === role[1];
        return part === 'a[href]' && tag === 'A' && Boolean(attrs.href);
    });
    node.closest = (selector) => (attrs.inDialog && /dialog/.test(selector) ? {} : null);
    return node;
}

test('Space belongs to inputs, buttons, links and widgets; only the page and the canvas pan', () => {
    const F = app.run('FocusUtils');
    for (const target of [el('INPUT', { type: 'checkbox' }), el('INPUT', { type: 'color' }), el('INPUT', { type: 'file' }), el('INPUT', { type: 'range' }),
        el('INPUT', { type: 'text' }), el('SELECT'), el('BUTTON'), el('A', { href: '#' }), el('SUMMARY'), el('DIV', { role: 'switch' }), el('SPAN', { role: 'tab' }),
        el('DIV', { role: 'button' }), el('DIV', { role: 'checkbox' }), el('P', { inDialog: true })]) {
        assert.equal(F.keepsSpace(target), true, `${target.tagName} ${target.type || target.role || ''}`);
    }
    for (const target of [el('BODY'), el('CANVAS'), el('DIV'), null]) assert.equal(F.keepsSpace(target), false);
});

test('a hidden help overlay is not an open layer, so Escape keeps working', () => {
    const queries = [];
    const withDocument = (found) => loadApp(['app/js/focusUtils.js'], { document: { querySelector: (selector) => { queries.push(selector); return found; } } }).run('FocusUtils');
    assert.equal(withDocument({}).layerOpen(), true);
    assert.equal(withDocument(null).layerOpen(), false);
    assert.match(queries[0], /#shortcutHelp:not\(\.hidden\)/, 'only a visible help overlay counts');
});

test('modalKeys: Escape and the Tab trap work from <body>, only the topmost layer answers, and it stops cleanly', () => {
    const listeners = new Set();
    const body = { tagName: 'BODY' };
    const control = (id) => ({ id, focus() { doc.activeElement = this; }, tabIndex: 0, getClientRects: () => [1], closest: () => null });
    const first = control('a');
    const last = control('b');
    const mkRoot = () => ({ isConnected: true, hidden: false, classList: { contains(name) { return name === 'hidden' && this.hiddenNow; } }, querySelectorAll: () => [first, last] });
    const doc = {
        activeElement: body,
        addEventListener: (type, fn) => listeners.add(fn),
        removeEventListener: (type, fn) => listeners.delete(fn)
    };
    const F = loadApp(['app/js/focusUtils.js'], { document: doc }).run('FocusUtils');
    const press = (key, extra = {}) => {
        const event = { key, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
        for (const fn of [...listeners]) fn(event);
        return event;
    };
    const closed = [];
    const rootA = mkRoot();
    const stopA = F.modalKeys(rootA, { Escape: () => closed.push('A') });
    assert.equal(press('Escape').defaultPrevented, true);
    assert.deepEqual(closed, ['A'], 'focus on <body> still closes the dialog');
    assert.equal(press('Tab').defaultPrevented, true, 'focus outside the dialog is pulled back in');
    assert.equal(doc.activeElement, first);
    press('Tab', { shiftKey: true });
    assert.equal(doc.activeElement, last);
    assert.equal(press('Tab').defaultPrevented, true, 'wraps from the last control');
    assert.equal(doc.activeElement, first);
    assert.equal(press('Tab', { ctrlKey: true }).defaultPrevented, false, "Ctrl+Tab is the browser's");
    // A second dialog on top owns the keys; a key already handled elsewhere is left alone.
    const rootB = mkRoot();
    const stopB = F.modalKeys(rootB, { Escape: () => closed.push('B') });
    press('Escape');
    assert.deepEqual(closed, ['A', 'B']);
    rootB.classList.hiddenNow = true; // hidden: the layer below answers again
    press('Escape');
    assert.deepEqual(closed, ['A', 'B', 'A']);
    press('Escape', { defaultPrevented: true });
    assert.deepEqual(closed, ['A', 'B', 'A'], 'a key someone else handled is left alone');
    // Removed from the page without closing (a share link clears dialogs): it unregisters itself.
    rootA.isConnected = false;
    press('Escape');
    assert.equal(listeners.size, 1);
    stopB();
    assert.equal(listeners.size, 0);
    stopA();
});

test('shortcuts and pan-with-Space share one typing-target rule', () => {
    const F = app.run('FocusUtils');
    for (const target of [{ tagName: 'INPUT', type: 'text' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' }, { tagName: 'DIV', isContentEditable: true },
        { tagName: 'BUTTON' }, { tagName: 'INPUT', type: 'checkbox' }, { tagName: 'BODY' }, null]) {
        assert.equal(F.isTypingTarget(target), S.isTypingTarget(target));
    }
    // A clicked button is not a typing target, so Space can pan after pressing Undo.
    assert.equal(F.isTypingTarget({ tagName: 'BUTTON' }), false);
});

test('Tab wraps inside a dialog and pulls stray focus back in', () => {
    const F = app.run('FocusUtils');
    const [a, b, c, outside] = ['a', 'b', 'c', 'x'].map((id) => ({ id }));
    const items = [a, b, c];
    assert.equal(F.wrapTarget(items, c, false), a);
    assert.equal(F.wrapTarget(items, a, true), c);
    assert.equal(F.wrapTarget(items, b, false), null);
    assert.equal(F.wrapTarget(items, b, true), null);
    assert.equal(F.wrapTarget(items, outside, false), a);
    assert.equal(F.wrapTarget(items, outside, true), c);
    assert.equal(F.wrapTarget([], outside, false), null);
});

test('the start tool has its own key, which no other shortcut uses', () => {
    const binding = S.BINDINGS.find((b) => b.id === 'tool-start');
    assert.deepEqual(plain(binding.keys), ['m']);
    assert.equal(S.findBinding({ key: 'm', code: 'KeyM' }, false).id, 'tool-start');
    assert.deepEqual(plain(S.findConflicts()), []);
});
