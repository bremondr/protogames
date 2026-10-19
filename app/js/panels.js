/**
 * PROTOGAMES PANELS
 * --------------------------------------------------------------
 * The panels of the sidebar (Board Setup, Players, Project, Themes) fold up to their heading. Each heading
 * holds a button (.panel-toggle) whose aria-expanded says whether the panel is open; a folded panel gets the
 * class `collapsed`, which hides everything in it but the heading (see styles.css). Which panels are folded is
 * remembered in this browser; a panel the page does not know about starts open.
 */
const Panels = (() => {
    const KEY = 'protogames_panels';

    /** The ids (of the headings) of the panels that were folded last time. */
    function loadFolded() {
        try {
            const saved = JSON.parse(localStorage.getItem(KEY) || '[]');
            return new Set(Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : []);
        } catch (error) {
            return new Set();
        }
    }

    function saveFolded(folded) {
        try { localStorage.setItem(KEY, JSON.stringify([...folded])); } catch (error) { /* storage unavailable */ }
    }

    function apply(toggle, folded) {
        const panel = toggle.closest('.panel');
        if (!panel) return;
        panel.classList.toggle('collapsed', folded);
        toggle.setAttribute('aria-expanded', String(!folded));
    }

    function init(root = document) {
        const folded = loadFolded();
        root.querySelectorAll('.panel-toggle').forEach((toggle) => {
            const heading = toggle.closest('h2');
            const id = heading && heading.id;
            if (!id) return;
            apply(toggle, folded.has(id));
            toggle.addEventListener('click', () => {
                const nowFolded = toggle.getAttribute('aria-expanded') === 'true';
                apply(toggle, nowFolded);
                if (nowFolded) folded.add(id); else folded.delete(id);
                saveFolded(folded);
            });
        });
    }

    return { init };
})();
