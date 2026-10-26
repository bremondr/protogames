/**
 * PROTOGAMES KEYBOARD SHORTCUTS
 * --------------------------------------------------------------
 * One registry (BINDINGS) defines every shortcut: id, label, group and keys.
 * Matching, formatting and conflict detection are pure functions (unit-tested in
 * Node); the browser glue at the bottom binds keydown, runs the actions, shows
 * hints in tooltips and renders the "?" help overlay from the same list.
 *
 * Key descriptors: "mod+shift+z", "e", "bracketleft", "period", ...
 *   mod   = Cmd on macOS, Ctrl elsewhere
 *   named keys stand for symbols: plus equal minus underscore bracketleft
 *   bracketright question comma period numpadadd numpadsubtract
 *
 * The app never claims Tab: it always moves focus, so the canvas cannot trap a keyboard user.
 */
const Shortcuts = (() => {
    // ---- The registry: add or change shortcuts here, nowhere else --------------------------

    const GROUPS = ['Edit', 'Tools', 'Colors', 'View', 'File', 'Playtest', 'Help'];

    const BINDINGS = [
        { id: 'undo', group: 'Edit', label: 'Undo', keys: ['mod+z'], repeat: true },
        { id: 'redo', group: 'Edit', label: 'Redo', keys: ['mod+shift+z', 'mod+y'], repeat: true },
        // Esc is handled where the thing it cancels lives (Interactions, Playtest, the dialogs); listed here for the overlay.
        { id: 'cancel', group: 'Edit', label: 'Cancel a line or a drag in progress', display: 'Esc', keys: [], documentation: true },

        { id: 'tool-brush', group: 'Tools', label: 'Brush', keys: ['b'] },
        { id: 'tool-fill', group: 'Tools', label: 'Fill', keys: ['g'] },
        { id: 'tool-line', group: 'Tools', label: 'Line', keys: ['l'] },
        { id: 'tool-select', group: 'Tools', label: 'Select (not available yet)', keys: ['v'], available: false },
        { id: 'tool-eraser', group: 'Tools', label: 'Toggle eraser', keys: ['e'] },
        { id: 'tool-start', group: 'Tools', label: 'Start markers on/off', keys: ['m'] },
        { id: 'brush-smaller', group: 'Tools', label: 'Smaller brush / eraser', keys: ['bracketleft'], repeat: true },
        { id: 'brush-larger', group: 'Tools', label: 'Larger brush / eraser', keys: ['bracketright'], repeat: true },

        // Swatches 1-9 are nine bindings but shown as one line ("1 – 9") in the overlay.
        ...Array.from({ length: 9 }, (_, i) => ({
            id: `swatch-${i + 1}`,
            group: 'Colors',
            label: i === 0 ? 'Pick swatch' : `Pick swatch ${i + 1}`,
            keys: [String(i + 1)],
            listed: i === 0 ? '1 – 9' : false
        })),
        { id: 'swatch-next', group: 'Colors', label: 'Next swatch', keys: ['period'], repeat: true },
        { id: 'swatch-prev', group: 'Colors', label: 'Previous swatch', keys: ['comma'], repeat: true },

        { id: 'zoom-in', group: 'View', label: 'Zoom in', keys: ['plus', 'equal', 'numpadadd'], repeat: true },
        { id: 'zoom-out', group: 'View', label: 'Zoom out', keys: ['minus', 'underscore', 'numpadsubtract'], repeat: true },
        { id: 'zoom-fit', group: 'View', label: 'Fit to screen', keys: ['0'] },
        // Handled by ViewControls (pointer input), listed so the overlay documents every way to navigate.
        { id: 'pan', group: 'View', label: 'Pan', display: 'Space + drag', keys: [], documentation: true },
        { id: 'zoom-wheel', group: 'View', label: 'Zoom at pointer', display: 'Mouse wheel / pinch', keys: [], documentation: true },

        { id: 'save', group: 'File', label: 'Save project', keys: ['mod+s'] },

        // Handled by the playtest code; listed so the overlay documents every way to play.
        { id: 'play-leave', group: 'Playtest', label: 'Leave playtest (a drag in progress is cancelled first)', display: 'Esc', keys: [], documentation: true },
        { id: 'play-tab', group: 'Playtest', label: 'Move between trays, dice and the piece list', display: 'Tab / Shift+Tab', keys: [], documentation: true },
        { id: 'play-send', group: 'Playtest', label: 'Send a tray piece to a free start', display: 'Enter / Space', keys: [], documentation: true },
        { id: 'play-move', group: 'Playtest', label: 'Move the focused piece one tile', display: 'Arrow keys', keys: [], documentation: true },
        { id: 'play-return', group: 'Playtest', label: 'Return the focused piece to its tray', display: 'Delete / Backspace', keys: [], documentation: true },

        { id: 'help', group: 'Help', label: 'Show keyboard shortcuts', keys: ['question'] },
        { id: 'move-focus', group: 'Help', label: 'Move between controls', display: 'Tab / Shift+Tab', keys: [], documentation: true },
        { id: 'close-dialog', group: 'Help', label: 'Close the top dialog', display: 'Esc', keys: [], documentation: true }
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
        comma: ',',
        period: '.'
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
        const digit = /^(Digit|Numpad)(\d)$/.exec(code);
        // With NumLock off a numpad digit reports its navigation key (End, ArrowDown...), which is not a digit.
        if (digit && (digit[1] === 'Digit' || event.key === digit[2])) return digit[2];
        if (digit) return null;
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
        // AltGr is reported as Ctrl+Alt on Windows; it types characters ([ ] on Czech and German layouts), so it is no modifier.
        const altGr = typeof event.getModifierState === 'function' && event.getModifierState('AltGraph');
        const ctrl = Boolean(event.ctrlKey) && !altGr;
        const alt = Boolean(event.altKey) && !altGr;
        const modPressed = isMac ? Boolean(event.metaKey) : ctrl;
        const otherPressed = isMac ? ctrl : Boolean(event.metaKey);
        if (modPressed !== combo.mod || otherPressed) return false;
        if (alt !== combo.alt) return false;
        if (!SHIFT_AGNOSTIC.has(combo.key) && Boolean(event.shiftKey) !== combo.shift) return false;
        return true;
    }

    /** The binding an event triggers, or null. */
    function findBinding(event, isMac, bindings = BINDINGS) {
        for (const binding of bindings) {
            if (binding.available === false || binding.documentation) continue;
            if (binding.keys.some((descriptor) => matchesCombo(descriptor, event, isMac))) return binding;
        }
        return null;
    }

    // ---- Playtest ------------------------------------------------------------------------------------------

    /** While editing is locked only navigation and help shortcuts stay on, and undo/redo step through piece moves. */
    function allowedInPlaytest(binding) {
        return binding.group === 'View' || binding.group === 'Help' || binding.id === 'undo' || binding.id === 'redo';
    }

    // ---- Which events to leave alone --------------------------------------------------------------------

    /** Typing targets: shortcuts must never fire while the user is entering text (one rule, shared with pan-with-Space). */
    const isTypingTarget = (target) => FocusUtils.isTypingTarget(target);

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
        comma: ',',
        period: '.',
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
     * Pairs of bindings that would fire on the same key press (same descriptor). Used by the tests to keep the registry conflict-free.
     */
    function findConflicts(bindings = BINDINGS) {
        const seen = new Map();
        const conflicts = [];
        for (const binding of bindings) {
            if (binding.documentation) continue;
            for (const descriptor of binding.keys) {
                const combo = parseCombo(descriptor);
                const normalized = `${combo.mod ? 'mod+' : ''}${combo.shift ? 'shift+' : ''}${combo.alt ? 'alt+' : ''}${combo.key}`;
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
        // In playtest the same keys step through piece moves instead of painting.
        'undo': () => { if (AppState.getState().playtest) Playtest.undoMove(); else if (!Interactions.isStrokeActive()) Interactions.undo(); },
        'redo': () => { if (AppState.getState().playtest) Playtest.redoMove(); else if (!Interactions.isStrokeActive()) Interactions.redo(); },
        'tool-start': () => { if (AppState.getState().isStartToolActive) Interactions.selectColorTool(); else Interactions.selectStartTool(); },
        'tool-brush': () => Interactions.setDrawMode('brush'),
        'tool-fill': () => Interactions.setDrawMode('fill'),
        'tool-line': () => Interactions.setDrawMode('line'),
        'tool-eraser': () => Interactions.toggleEraser(),
        'brush-smaller': () => announceSize(Interactions.changeActiveSize(-1)),
        'brush-larger': () => announceSize(Interactions.changeActiveSize(1)),
        'swatch-next': () => Interactions.cycleSwatch(1),
        'swatch-prev': () => Interactions.cycleSwatch(-1),
        'zoom-in': () => ViewControls.zoomIn(),
        'zoom-out': () => ViewControls.zoomOut(),
        'zoom-fit': () => ViewControls.fit(),
        'save': () => FileManager.saveProjectFile(),
        'help': () => toggleHelp()
    };
    for (let i = 1; i <= 9; i++) ACTIONS[`swatch-${i}`] = () => Interactions.pickSwatch(i - 1);

    function announceSize({ tool, size }) {
        const text = tool === 'object' || tool === 'start' ? (tool === 'start' ? 'Start markers' : 'Objects') + ' are placed one tile at a time' : `${tool === 'eraser' ? 'Eraser' : 'Brush'} size ${size}`;
        UI.showNotification(text, 1200);
    }

    function dialogOpen() {
        return Boolean(document.querySelector('.modal-backdrop:not(.hidden)'));
    }

    /**
     * Ctrl/Cmd+S is the one key the app takes even while a text field has focus (the permanent
     * "Project name" field, prompts): the browser's own Save Page dialog is never what anyone wants.
     * Everything else, Ctrl+Z and Ctrl+Y included, stays with the field.
     */
    function isSaveInField(event) {
        return FocusUtils.isTypingTarget(event.target) && !event.isComposing && !event.defaultPrevented && matchesCombo('mod+s', event, isMac());
    }

    function onKeyDown(event) {
        if (isSaveInField(event)) {
            event.preventDefault();
            if (!event.repeat && !dialogOpen() && !AppState.getState().playtest) FileManager.saveProjectFile();
            return;
        }
        if (shouldIgnore(event, { dialogOpen: dialogOpen() })) return;
        const binding = findBinding(event, isMac());
        if (!binding) return;
        const action = ACTIONS[binding.id];
        if (!action) return;
        if (AppState.getState().playtest && !allowedInPlaytest(binding)) {
            // Still claim the key so Ctrl+S and friends do not fall through to the browser.
            event.preventDefault();
            return;
        }
        // Claim the key (Ctrl+S saving the page, Ctrl+Y opening history...).
        event.preventDefault();
        if (event.repeat && !binding.repeat) return;
        action(event);
    }

    /** "Control+Shift+Z"-style value for aria-keyshortcuts. */
    function ariaShortcut(descriptor) {
        const combo = parseCombo(descriptor);
        const names = { plus: '+', equal: '=', minus: '-', underscore: '_', bracketleft: '[', bracketright: ']', question: '?', comma: ',', period: '.', numpadadd: '+', numpadsubtract: '-' };
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
    let stopHelpKeys = null;

    /** The help overlay if it is on screen. A hidden one (a share link opened over it) is a leftover. */
    function helpOverlay() {
        const overlay = document.getElementById('shortcutHelp');
        return overlay && !overlay.classList.contains('hidden') ? overlay : null;
    }

    function closeHelp() {
        const overlay = document.getElementById('shortcutHelp');
        if (!overlay) return;
        if (stopHelpKeys) stopHelpKeys();
        stopHelpKeys = null;
        overlay.remove();
        if (helpReturnFocus && helpReturnFocus.focus) helpReturnFocus.focus();
        helpReturnFocus = null;
    }

    function toggleHelp() {
        if (helpOverlay()) closeHelp();
        else showHelp();
    }

    /** Lists the current bindings, grouped, straight from the registry. */
    function showHelp() {
        if (helpOverlay()) return;
        if (document.getElementById('shortcutHelp')) { // hidden leftover
            const opener = helpReturnFocus;
            closeHelp();
            helpReturnFocus = opener;
        }
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
        stopHelpKeys = FocusUtils.modalKeys(overlay, { Escape: closeHelp, '?': closeHelp });
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
        allowedInPlaytest,
        isMacPlatform,
        init,
        applyHints,
        showHelp,
        closeHelp,
        overridePlatform
    };
})();
