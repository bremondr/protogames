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

    // ---- Browser glue -----------------------------------------------------------------------------------------
    // Everything below needs the DOM and the rest of the app; it is exercised in the browser, not in the unit tests.

    let macOverride = null;
    const isMac = () => (macOverride === null ? isMacPlatform() : macOverride);

    /** What each binding does. Keys are binding ids from BINDINGS. */
    const ACTIONS = {
        'undo': () => { if (!Interactions.isStrokeActive()) Interactions.undo(); },
        'redo': () => { if (!Interactions.isStrokeActive()) Interactions.redo(); },
        'tool-brush': () => Toolbar.selectBrush(),
        'tool-fill': () => Interactions.setDrawMode('fill'),
        'tool-line': () => Interactions.setDrawMode('line'),
        'tool-eraser': () => Interactions.toggleEraser(),
        'brush-smaller': () => announceBrushSize(Interactions.changeBrushSize(-1)),
        'brush-larger': () => announceBrushSize(Interactions.changeBrushSize(1)),
        'swatch-next': () => Interactions.cycleSwatch(1),
        'swatch-prev': () => Interactions.cycleSwatch(-1),
        'zoom-in': () => ViewControls.zoomIn(),
        'zoom-out': () => ViewControls.zoomOut(),
        'zoom-fit': () => ViewControls.fit(),
        'save': () => FileManager.saveProjectFile(),
        'help': () => toggleHelp()
    };
    for (let i = 1; i <= 9; i++) ACTIONS[`swatch-${i}`] = () => Interactions.pickSwatch(i - 1);

    function announceBrushSize(size) {
        UI.showNotification(`Brush size ${size}`, 1200);
    }

    function dialogOpen() {
        return Boolean(document.querySelector('.modal-backdrop:not(.hidden)'));
    }

    /** Keyboard focus is on nothing in particular, so Tab may cycle swatches instead of moving focus. */
    function focusNeutral() {
        const active = document.activeElement;
        return !active || active === document.body || active === document.getElementById('gameCanvas');
    }

    function onKeyDown(event) {
        if (shouldIgnore(event, { dialogOpen: dialogOpen() })) return;
        const binding = findBinding(event, isMac(), { focusNeutral: focusNeutral() });
        if (!binding) return;
        const action = ACTIONS[binding.id];
        if (!action) return;
        // Claim the key (stops Tab moving focus, Ctrl+S saving the page, Ctrl+Y opening history...).
        event.preventDefault();
        if (event.repeat && !binding.repeat) return;
        action(event);
    }

    /** "Control+Shift+Z"-style value for aria-keyshortcuts. */
    function ariaShortcut(descriptor) {
        const combo = parseCombo(descriptor);
        const names = { plus: '+', equal: '=', minus: '-', underscore: '_', bracketleft: '[', bracketright: ']', question: '?', tab: 'Tab', numpadadd: '+', numpadsubtract: '-' };
        const parts = [];
        if (combo.mod) parts.push(isMac() ? 'Meta' : 'Control');
        if (combo.alt) parts.push('Alt');
        if (combo.shift) parts.push('Shift');
        parts.push(names[combo.key] || combo.key.toUpperCase());
        return parts.join('+');
    }

    /**
     * Adds the shortcut to the tooltip of every element marked data-shortcut="<binding id>"
     * ("Undo" becomes "Undo (Ctrl+Z)") and sets aria-keyshortcuts.
     */
    function applyHints(root = document) {
        root.querySelectorAll('[data-shortcut]').forEach((element) => {
            const binding = BINDINGS.find((b) => b.id === element.dataset.shortcut);
            if (!binding) return;
            if (element.dataset.shortcutBase === undefined) {
                element.dataset.shortcutBase = element.dataset.tip || element.getAttribute('title') || element.getAttribute('aria-label') || binding.label;
            }
            const hint = hintFor(binding, isMac());
            const text = hint ? `${element.dataset.shortcutBase} (${hint})` : element.dataset.shortcutBase;
            if (element.classList.contains('pg-tip')) element.dataset.tip = text;
            else element.setAttribute('title', text);
            if (binding.keys.length) element.setAttribute('aria-keyshortcuts', binding.keys.map(ariaShortcut).join(' '));
        });
    }

    // ---- Help overlay ("?") -------------------------------------------------------------------------------------------

    let helpReturnFocus = null;

    function closeHelp() {
        const overlay = document.getElementById('shortcutHelp');
        if (!overlay) return;
        overlay.remove();
        if (helpReturnFocus && helpReturnFocus.focus) helpReturnFocus.focus();
        helpReturnFocus = null;
    }

    function toggleHelp() {
        if (document.getElementById('shortcutHelp')) closeHelp();
        else showHelp();
    }

    /** Lists the current bindings, grouped, straight from the registry. */
    function showHelp() {
        if (document.getElementById('shortcutHelp')) return;
        helpReturnFocus = document.activeElement;
        const overlay = document.createElement('div');
        overlay.id = 'shortcutHelp';
        overlay.className = 'modal-backdrop';
        const dialog = document.createElement('div');
        dialog.className = 'modal shortcut-help';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'shortcutHelpTitle');

        const head = document.createElement('div');
        head.className = 'shortcut-help-head';
        const title = document.createElement('h3');
        title.id = 'shortcutHelpTitle';
        title.textContent = 'Keyboard shortcuts';
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'icon-close';
        close.setAttribute('aria-label', 'Close');
        close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
        head.append(title, close);
        dialog.appendChild(head);

        const columns = document.createElement('div');
        columns.className = 'shortcut-help-groups';
        for (const group of GROUPS) {
            const entries = BINDINGS.filter((b) => b.group === group && b.listed !== false);
            if (!entries.length) continue;
            const section = document.createElement('section');
            const heading = document.createElement('h4');
            heading.textContent = group;
            const list = document.createElement('dl');
            for (const binding of entries) {
                const term = document.createElement('dt');
                term.textContent = binding.label;
                const keys = document.createElement('dd');
                const text = binding.listed || displayFor(binding, isMac());
                for (const [index, alternative] of text.split(' or ').entries()) {
                    if (index) keys.append(' or ');
                    const cap = document.createElement('kbd');
                    cap.textContent = alternative;
                    keys.appendChild(cap);
                }
                if (binding.available === false) term.classList.add('unavailable');
                list.append(term, keys);
            }
            section.append(heading, list);
            columns.appendChild(section);
        }
        dialog.appendChild(columns);

        const note = document.createElement('p');
        note.className = 'shortcut-help-note';
        note.textContent = isMac() ? '⌘ is the Command key.' : 'Shortcuts are paused while you type in a field or a dialog is open.';
        dialog.appendChild(note);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        close.addEventListener('click', closeHelp);
        overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay) closeHelp(); });
        overlay.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' || event.key === '?') {
                event.preventDefault();
                event.stopPropagation();
                closeHelp();
            }
        });
        close.focus();
    }

    function init() {
        document.addEventListener('keydown', onKeyDown);
        document.getElementById('helpButton')?.addEventListener('click', toggleHelp);
        applyHints();
    }

    /** Tests and demos can pretend to be on a Mac. Pass null to restore detection. */
    function overridePlatform(mac) {
        macOverride = mac;
        applyHints();
    }

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
        isMacPlatform,
        init,
        applyHints,
        showHelp,
        closeHelp,
        overridePlatform
    };
})();
