/**
 * PROTOGAMES COORDINATES PANEL
 * --------------------------------------------------------------
 * The "Coordinates" panel in the sidebar: switches the column and row labels on, picks a style (chess,
 * battleship, go, numbers) or lets each axis have its own symbols, list, skipped letters, start,
 * direction and sides. Controls are plain markup in index.html tied to the settings by `data-lb`
 * attributes ("enabled", "preset", "placement", "columns.symbols", "rows.bottom" and so on), so adding a
 * control needs no code here.
 *
 * The settings are part of the design (saved with it), not of the tile undo history. Everything is cleaned
 * up through Labels.normalize, so the panel can never store something a file could not hold. Other modules
 * hear about changes with the `pg:labelschange` event, which is also sent when a board or file is loaded.
 */
const LabelsPanel = (() => {
    const $$ = (selector) => Array.from(document.querySelectorAll(selector));
    const current = () => AppState.getState().labels;

    function readPath(labels, path) {
        const [first, second] = path.split('.');
        return second === undefined ? labels[first] : labels[first][second];
    }

    function withPath(labels, path, value) {
        const next = JSON.parse(JSON.stringify(labels));
        const [first, second] = path.split('.');
        if (second === undefined) next[first] = value;
        else next[first][second] = value;
        return next;
    }

    /** Stores new settings (cleaned up), saves, redraws and lets the rest of the app know. */
    function commit(next, { rerender = false } = {}) {
        AppState.setLabels(Labels.normalize(next));
        AppState.markDirty();
        FileManager.autoSaveToLocalStorage(true);
        Renderer.requestRender();
        window.dispatchEvent(new CustomEvent('pg:labelschange', { detail: { rerender } }));
    }

    /** Fields that only make sense for some symbol sets. */
    function visible(path, labels) {
        const [axis, field] = path.split('.');
        if (field === 'custom') return labels[axis].symbols === 'custom';
        if (field === 'skip') return labels[axis].symbols === 'letters';
        return true;
    }

    const isInfinite = () => typeof Infinite !== 'undefined' && Infinite.isActive();

    /** Shows the settings in the controls (a control being typed in is left alone, so typing is never interrupted). */
    function render() {
        const labels = current();
        const blocked = isInfinite();
        const focused = document.activeElement;
        $$('[data-lb]').forEach((el) => {
            const path = el.dataset.lb;
            if (el === focused && el.type !== 'checkbox' && el.tagName !== 'SELECT') return;
            if (path === 'preset') el.value = Labels.matchPreset(labels);
            else if (el.type === 'checkbox') el.checked = Boolean(readPath(labels, path));
            else el.value = readPath(labels, path);
            el.disabled = blocked && path !== 'enabled' ? true : false;
        });
        const enabledBox = document.querySelector('[data-lb="enabled"]');
        if (enabledBox) enabledBox.disabled = blocked;
        $$('[data-lb-show]').forEach((el) => { el.hidden = !visible(el.dataset.lbShow, labels); });
        const options = document.getElementById('labelsOptions');
        if (options) options.hidden = !labels.enabled || blocked;
        const note = document.getElementById('labelsNote');
        if (note) note.hidden = !blocked;
    }

    function onChange(event) {
        const el = event.target.closest ? event.target.closest('[data-lb]') : null;
        if (!el) return;
        const path = el.dataset.lb;
        const labels = current();
        if (path === 'preset') {
            // "Custom" is only what the panel shows once something differs from every preset: choosing it changes nothing.
            if (el.value !== 'custom') commit(Labels.applyPreset(labels, el.value), { rerender: true });
            return;
        }
        let value;
        if (el.type === 'checkbox') value = el.checked;
        else if (el.type === 'number') {
            if (el.value.trim() === '') return; // still typing
            value = Number.parseInt(el.value, 10);
            if (!Number.isInteger(value)) return;
        } else value = el.value;
        commit(withPath(labels, path, value), { rerender: true });
    }

    function init() {
        const panel = document.querySelector('[data-lb="enabled"]')?.closest('section');
        if (!panel) return;
        // 'input' for the text and number fields (live preview while typing), 'change' for everything else and for leaving a field.
        panel.addEventListener('input', (event) => { if (event.target.type === 'text' || event.target.type === 'number') onChange(event); });
        panel.addEventListener('change', (event) => {
            onChange(event);
            // Leaving a text field shows the cleaned-up value (extra spaces collapsed, entries cut to length).
            render();
        });
        window.addEventListener('pg:labelschange', render);
        window.addEventListener('pg:designchange', render);
        render();
    }

    return { init, render };
})();
