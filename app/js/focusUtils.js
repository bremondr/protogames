/**
 * PROTOGAMES FOCUS UTILITIES
 * --------------------------------------------------------------
 * Keyboard-focus rules shared by the shortcut layer, pan-with-Space and the dialogs:
 * what counts as a typing target, a Tab trap for modal dialogs, restoring focus on
 * close, and "is a dialog open" so Escape only closes the topmost thing.
 *
 * Adopting it in another dialog: call `FocusUtils.trapTab(rootElement)` once (rootElement
 * is the visible dialog or its backdrop) and `FocusUtils.restoreFocusOnHide(backdrop)`
 * for a backdrop that is shown/hidden with the `hidden` class. Give the dialog
 * role="dialog" aria-modal="true" and move focus into it when it opens.
 * Dialogs that are built and removed on the fly use `FocusUtils.modalKeys(root, handlers)`
 * instead, which keeps working when a click leaves focus on <body>.
 */
const FocusUtils = (() => {
    const TABBABLE = 'a[href], button, input, select, textarea, [tabindex]';
    // Inputs that take no typed text: keys like Space or Tab still belong to the page.
    const NON_TEXT_INPUTS = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'color', 'range', 'image'];

    /** Typing targets: shortcuts and pan-with-Space must never fire while the user is entering text. */
    function isTypingTarget(target) {
        if (!target) return false;
        const tag = String(target.tagName || '').toUpperCase();
        if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (tag === 'INPUT') return !NON_TEXT_INPUTS.includes(String(target.type || 'text').toLowerCase());
        return Boolean(target.isContentEditable);
    }

    /**
     * Where Tab should go inside a trapped dialog: the element to focus instead of the
     * browser default, or null to let the browser move focus normally.
     * `items` are the tabbable elements in order, `active` the focused one.
     */
    function wrapTarget(items, active, shift) {
        if (!items.length) return null;
        const first = items[0];
        const last = items[items.length - 1];
        if (!items.includes(active)) return shift ? last : first; // focus is outside the dialog: bring it back
        if (shift && active === first) return last;
        if (!shift && active === last) return first;
        return null;
    }

    function tabbables(root) {
        return Array.from(root.querySelectorAll(TABBABLE)).filter((node) =>
            !node.disabled && node.tabIndex >= 0 && !node.closest('[hidden]') && node.getClientRects().length > 0);
    }

    /** Keeps Tab / Shift+Tab inside `root` while it handles key events (it only receives them while focus is inside). */
    function trapTab(root) {
        root?.addEventListener('keydown', (event) => {
            if (event.key !== 'Tab' || event.defaultPrevented) return;
            const target = wrapTarget(tabbables(root), document.activeElement, event.shiftKey);
            if (target) {
                event.preventDefault();
                target.focus();
            }
        });
    }

    // Open dialogs that listen on `document`, oldest first; only the last visible one answers keys.
    const keyLayers = [];

    /**
     * Escape (and any other key in `handlers`, keyed by KeyboardEvent.key) plus the Tab trap for a
     * dialog that is built on the fly. The listener sits on `document`, not on the dialog, because
     * clicking dialog text drops focus to <body>, where a listener on the dialog never hears keys.
     * Only the topmost visible layer answers, and a key someone else already handled is left alone.
     * Returns a function that stops listening (call it when the dialog closes).
     */
    function modalKeys(root, handlers = {}) {
        const layer = { root, handlers };
        const visible = (item) => item.root.isConnected && !item.root.classList.contains('hidden');
        const onKeyDown = (event) => {
            if (!root.isConnected) return stop(); // removed without closing (a share link clears dialogs)
            if (event.defaultPrevented || event.isComposing) return;
            const top = [...keyLayers].reverse().find(visible);
            if (top !== layer) return;
            if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) {
                const target = wrapTarget(tabbables(root), document.activeElement, event.shiftKey);
                if (target) {
                    event.preventDefault();
                    target.focus();
                }
            } else if (handlers[event.key]) {
                event.preventDefault();
                handlers[event.key](event);
            }
        };
        const stop = () => {
            document.removeEventListener('keydown', onKeyDown);
            const at = keyLayers.indexOf(layer);
            if (at >= 0) keyLayers.splice(at, 1);
        };
        keyLayers.push(layer);
        document.addEventListener('keydown', onKeyDown);
        return stop;
    }

    /**
     * Puts focus back where it was when `backdrop` (hidden by adding the `hidden` class)
     * closes, unless the dialog's own code already moved it somewhere sensible.
     */
    function restoreFocusOnHide(backdrop) {
        if (!backdrop || typeof MutationObserver === 'undefined') return;
        let opener = null;
        // The last element focused outside the dialog is where the user came from.
        document.addEventListener('focusin', (event) => {
            if (!backdrop.contains(event.target)) opener = event.target;
        });
        new MutationObserver(() => {
            if (!backdrop.classList.contains('hidden')) return;
            const active = document.activeElement;
            const lost = !active || active === document.body || backdrop.contains(active);
            if (lost && opener && opener.isConnected && opener.focus) opener.focus();
        }).observe(backdrop, { attributes: true, attributeFilter: ['class'] });
    }

    /**
     * A modal dialog or the shortcut help overlay is on screen: it owns Escape. A help overlay that
     * was hidden (a share link opened over it) is not on screen.
     */
    function layerOpen() {
        return Boolean(document.querySelector('.modal-backdrop:not(.hidden), #shortcutHelp:not(.hidden)'));
    }

    /**
     * Elements that use Space (or Enter) themselves: a pan must not steal the key from them.
     * Typing targets are covered by isTypingTarget; this adds the rest of the interactive ones.
     */
    const OWN_SPACE = 'input, select, textarea, button, a[href], summary, [role="button"], [role="checkbox"], [role="radio"], [role="tab"], [role="switch"], [role="menuitem"], [role="option"], [role="slider"]';
    function keepsSpace(target) {
        if (!target) return false;
        if (isTypingTarget(target)) return true;
        try {
            if (target.closest && target.closest('dialog[open], [role="dialog"], [role="alertdialog"]')) return true;
            return Boolean(target.matches && target.matches(OWN_SPACE));
        } catch (error) { return false; }
    }

    return { isTypingTarget, keepsSpace, wrapTarget, tabbables, trapTab, modalKeys, restoreFocusOnHide, layerOpen };
})();
