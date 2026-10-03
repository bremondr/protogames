/**
 * PROTOGAMES PLAYTEST MODE
 * --------------------------------------------------------------
 * Locks editing so the board can be played on without changing it by accident:
 * painting, the tool bar, the side panel and every editing shortcut are off, while
 * pan and zoom keep working. The state lives in AppState (`playtest`), which
 * Interactions and Shortcuts check; this module owns the button, the status pill
 * and the way back (button or Escape).
 */
const Playtest = (() => {
    const PILL_VISIBLE_MS = 10000;
    let pillTimer = null;

    const $ = (id) => document.getElementById(id);

    function isOn() {
        return AppState.getState().playtest;
    }

    function setOn(on) {
        const wanted = Boolean(on);
        if (wanted === isOn()) return;
        clearTimeout(pillTimer);
        if (wanted) {
            // A stroke or line in progress must not survive the lock.
            Interactions.cancelStroke();
            AppState.setHoverPolygonId(null, null);
            Renderer.renderBoard();
        }
        AppState.setPlaytest(wanted);
        document.body.classList.toggle('playtest', wanted);

        const button = $('playButton');
        if (button) {
            const label = wanted ? 'Back to editing' : 'Playtest (lock editing)';
            button.setAttribute('aria-pressed', String(wanted));
            button.setAttribute('aria-label', label);
            button.dataset.tip = label;
        }
        const pill = $('playtestPill');
        if (pill) {
            pill.hidden = !wanted;
            pill.classList.remove('faded');
            // The pill fades out after a while so it does not sit on the board.
            if (wanted) pillTimer = setTimeout(() => pill.classList.add('faded'), PILL_VISIBLE_MS);
        }
        window.dispatchEvent(new CustomEvent('pg:playtest', { detail: { on: wanted } }));
        // Let the canvas re-measure now that the side panel appeared or went away.
        setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
    }

    function init() {
        $('playButton')?.addEventListener('click', () => setOn(!isOn()));
        $('playtestBack')?.addEventListener('click', () => setOn(false));
        document.addEventListener('keydown', (event) => {
            // The help overlay uses Escape to close itself first.
            if (event.key === 'Escape' && isOn() && !document.getElementById('shortcutHelp')) setOn(false);
        });
    }

    return { init, setOn, isOn };
})();
