/**
 * PROTOGAMES KEYBOARD SHORTCUTS
 * --------------------------------------------------------------
 * One registry (BINDINGS) defines every shortcut: id, label, group and keys.
 * Matching, formatting and conflict detection are pure functions (unit-tested in
 * Node); the browser glue at the bottom binds keydown, runs the actions, shows
 * hints in tooltips and renders the "?" help overlay from the same list.
 *
 * Key descriptors: "mod+shift+z", "e", "bracketleft", "tab", ...
 *   mod   = Cmd on macOS, Ctrl elsewhere
 *   named keys stand for symbols: plus equal minus underscore bracketleft
 *   bracketright question numpadadd numpadsubtract tab
 */
const Shortcuts = (() => {
    // ---- The registry: add or change shortcuts here, nowhere else --------------------------

    const GROUPS = ['Edit', 'Tools', 'Colors', 'View', 'File', 'Help'];

    const BINDINGS = [
        { id: 'undo', group: 'Edit', label: 'Undo', keys: ['mod+z'], repeat: true },
        { id: 'redo', group: 'Edit', label: 'Redo', keys: ['mod+shift+z', 'mod+y'], repeat: true },

        { id: 'tool-brush', group: 'Tools', label: 'Brush', keys: ['b'] },
        { id: 'tool-fill', group: 'Tools', label: 'Fill', keys: ['g'] },
        { id: 'tool-line', group: 'Tools', label: 'Line', keys: ['l'] },
        { id: 'tool-select', group: 'Tools', label: 'Select (not available yet)', keys: ['v'], available: false },
        { id: 'tool-eraser', group: 'Tools', label: 'Toggle eraser', keys: ['e'] },
        { id: 'brush-smaller', group: 'Tools', label: 'Smaller brush', keys: ['bracketleft'], repeat: true },
        { id: 'brush-larger', group: 'Tools', label: 'Larger brush', keys: ['bracketright'], repeat: true },

        // Swatches 1-9 are nine bindings but shown as one line ("1 – 9") in the overlay.
        ...Array.from({ length: 9 }, (_, i) => ({
            id: `swatch-${i + 1}`,
            group: 'Colors',
            label: i === 0 ? 'Pick swatch' : `Pick swatch ${i + 1}`,
            keys: [String(i + 1)],
            listed: i === 0 ? '1 – 9' : false
        })),
        { id: 'swatch-next', group: 'Colors', label: 'Next swatch', keys: ['tab'], when: 'focus-neutral', repeat: true },
        { id: 'swatch-prev', group: 'Colors', label: 'Previous swatch', keys: ['shift+tab'], when: 'focus-neutral', repeat: true },

        { id: 'zoom-in', group: 'View', label: 'Zoom in', keys: ['plus', 'equal', 'numpadadd'], repeat: true },
        { id: 'zoom-out', group: 'View', label: 'Zoom out', keys: ['minus', 'underscore', 'numpadsubtract'], repeat: true },
        { id: 'zoom-fit', group: 'View', label: 'Fit to screen', keys: ['0'] },
        // Handled by ViewControls (pointer input), listed so the overlay documents every way to navigate.
        { id: 'pan', group: 'View', label: 'Pan', display: 'Space + drag', keys: [], documentation: true },
        { id: 'zoom-wheel', group: 'View', label: 'Zoom at pointer', display: 'Mouse wheel / pinch', keys: [], documentation: true },

        { id: 'save', group: 'File', label: 'Save project', keys: ['mod+s'] },

        { id: 'help', group: 'Help', label: 'Show keyboard shortcuts', keys: ['question'] }
    ];

    // ---- Key descriptors -----------------------------------------------------------------------

    /** Named keys: descriptor name -> the KeyboardEvent.key it stands for. */
    const NAMED = {
        plus: '+',
        equal: '=',
        minus: '-',
        underscore: '_',
        bracketleft: '[',
        bracketright: ']',
        question: '?',
        tab: 'Tab'
    };
    // Symbols are typed with or without Shift depending on the keyboard, so Shift is not part of the match.
    const SHIFT_AGNOSTIC = new Set(['plus', 'equal', 'minus', 'underscore', 'bracketleft', 'bracketright', 'question', 'numpadadd', 'numpadsubtract']);
    const CODE_NAMES = { NumpadAdd: 'numpadadd', NumpadSubtract: 'numpadsubtract', BracketLeft: 'bracketleft', BracketRight: 'bracketright' };

    function parseCombo(descriptor) {
        const parts = descriptor.split('+');
        const key = parts.pop();
        const flags = new Set(parts);
        return { key, mod: flags.has('mod'), shift: flags.has('shift'), alt: flags.has('alt') };
    }

    /** The descriptor name of the key an event represents ("z", "5", "plus", "tab"...), or null. */
    function eventKeyName(event) {
        const code = event.code || '';
        const digit = /^(?:Digit|Numpad)(\d)$/.exec(code);
        if (digit) return digit[1];
        if (CODE_NAMES[code]) return CODE_NAMES[code];
        const key = event.key;
        if (typeof key !== 'string' || !key) return null;
        for (const [name, symbol] of Object.entries(NAMED)) if (symbol === key) return name;
        const lower = key.toLowerCase();
        return lower.length === 1 ? lower : null;
    }

    /** Does the keyboard event match the key descriptor? */
    function matchesCombo(descriptor, event, isMac) {
        const combo = typeof descriptor === 'string' ? parseCombo(descriptor) : descriptor;
        if (eventKeyName(event) !== combo.key) return false;
        const modPressed = isMac ? Boolean(event.metaKey) : Boolean(event.ctrlKey);
        const otherPressed = isMac ? Boolean(event.ctrlKey) : Boolean(event.metaKey);
        if (modPressed !== combo.mod || otherPressed) return false;
        if (Boolean(event.altKey) !== combo.alt) return false;
        if (!SHIFT_AGNOSTIC.has(combo.key) && Boolean(event.shiftKey) !== combo.shift) return false;
        return true;
    }

    /**
     * The binding an event triggers, or null. `context.focusNeutral` says whether keyboard
     * focus is on nothing in particular (so Tab may cycle swatches instead of moving focus).
     */
    function findBinding(event, isMac, context = {}, bindings = BINDINGS) {
        for (const binding of bindings) {
            if (binding.available === false || binding.documentation) continue;
            if (binding.when === 'focus-neutral' && !context.focusNeutral) continue;
            if (binding.keys.some((descriptor) => matchesCombo(descriptor, event, isMac))) return binding;
        }
        return null;
    }

    // ---- Which events to leave alone --------------------------------------------------------------------

    /** Typing targets: shortcuts must never fire while the user is entering text. */
    function isTypingTarget(target) {
        if (!target) return false;
        const tag = String(target.tagName || '').toUpperCase();
        if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (tag === 'INPUT') {
            // Checkboxes, buttons, file and colour inputs do not take typed text.
            return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'color', 'range', 'image'].includes(String(target.type || 'text').toLowerCase());
        }
        return Boolean(target.isContentEditable);
    }

    /** Should this keydown be ignored entirely (typing, dialogs open, IME, held modifier-only)? */
    function shouldIgnore(event, state) {
        if (event.isComposing || event.defaultPrevented) return true;
        if (state && state.dialogOpen) return true;
        return isTypingTarget(event.target);
    }

    // ---- Display -----------------------------------------------------------------------------------------

    const MAC_SYMBOLS = { mod: '⌘', shift: '⇧', alt: '⌥' };
    const PLAIN_NAMES = { mod: 'Ctrl', shift: 'Shift', alt: 'Alt' };
    const KEY_LABELS = {
        plus: '+',
        equal: '=',
        minus: '−',
        underscore: '_',
        bracketleft: '[',
        bracketright: ']',
        question: '?',
        tab: 'Tab',
        numpadadd: 'Num +',
        numpadsubtract: 'Num −'
    };

    /** "Ctrl+Shift+Z" (or "⇧⌘Z" on a Mac) for a key descriptor. */
    function formatCombo(descriptor, isMac) {
        const combo = parseCombo(descriptor);
        const key = KEY_LABELS[combo.key] || combo.key.toUpperCase();
        const modifiers = [];
        if (isMac) {
            if (combo.alt) modifiers.push(MAC_SYMBOLS.alt);
            if (combo.shift) modifiers.push(MAC_SYMBOLS.shift);
            if (combo.mod) modifiers.push(MAC_SYMBOLS.mod);
            return modifiers.join('') + key;
        }
        if (combo.mod) modifiers.push(PLAIN_NAMES.mod);
        if (combo.alt) modifiers.push(PLAIN_NAMES.alt);
        if (combo.shift) modifiers.push(PLAIN_NAMES.shift);
        return [...modifiers, key].join('+');
    }

    /** The text shown for a binding: its first key (or the documentation text). */
    function displayFor(binding, isMac) {
        if (binding.display) return binding.display;
        return binding.keys.map((descriptor) => formatCombo(descriptor, isMac)).join(' or ');
    }

    /** Short hint for tooltips: the primary key only. */
    function hintFor(binding, isMac) {
        if (binding.display) return binding.display;
        return binding.keys.length ? formatCombo(binding.keys[0], isMac) : '';
    }

    // ---- Registry sanity ---------------------------------------------------------------------------------

    /**
     * Pairs of bindings that would fire on the same key press (same descriptor in
     * the same focus context). Used by the tests to keep the registry conflict-free.
     */
    function findConflicts(bindings = BINDINGS) {
        const seen = new Map();
        const conflicts = [];
        for (const binding of bindings) {
            if (binding.documentation) continue;
            for (const descriptor of binding.keys) {
                const combo = parseCombo(descriptor);
                const normalized = `${binding.when || 'always'}|${combo.mod ? 'mod+' : ''}${combo.shift ? 'shift+' : ''}${combo.alt ? 'alt+' : ''}${combo.key}`;
                // Shift-agnostic symbols collide regardless of Shift.
                const keyId = SHIFT_AGNOSTIC.has(combo.key) ? normalized.replace('shift+', '') : normalized;
                if (seen.has(keyId)) conflicts.push([seen.get(keyId), binding.id, descriptor]);
                else seen.set(keyId, binding.id);
            }
        }
        return conflicts;
    }

    const isMacPlatform = () =>
        typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');

    return {
        BINDINGS,
        GROUPS,
        parseCombo,
        eventKeyName,
        matchesCombo,
        findBinding,
        isTypingTarget,
        shouldIgnore,
        formatCombo,
        displayFor,
        hintFor,
        findConflicts,
        isMacPlatform
    };
})();
