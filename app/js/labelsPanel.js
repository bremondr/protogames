/**
 * PROTOGAMES COORDINATES PANEL
 * --------------------------------------------------------------
 * The "Coordinates" panel in the sidebar. Two switches (coordinates around the board, coordinates on the tiles),
 * a picker for the INDEXING made of small pictures, and the symbols of each axis (letters, numbers, Roman numerals,
 * Greek letters or the user's own list). Quick styles, start, direction, sides and placement are under "More options".
 *
 * The picker only offers the indexings that make sense for the current tile shape and board shape (Labels.schemesFor):
 * square tiles have one, hexagon tiles on a rectangle choose between offset and half steps, hexagon tiles on a hexagon,
 * circle or triangle board between two families of straight lines and half steps. The other controls are plain markup
 * in index.html tied to the settings by `data-lb` attributes ("enabled", "onTiles", "preset", "placement",
 * "columns.symbols", "rows.bottom" and so on), so adding one needs no code here.
 *
 * The settings are part of the design (saved with it), not of the tile undo history. Everything is cleaned up through
 * Labels.normalize, so the panel can never store something a file could not hold. Other modules hear about changes with
 * the `pg:labelschange` event, which is also sent when a board or file is loaded.
 *
 * Hovering a name around the board lights up its row or column (AppState.labelHover, drawn by the renderer; never saved).
 */
const LabelsPanel = (() => {
    const $$ = (selector) => Array.from(document.querySelectorAll(selector));
    const state = () => AppState.getState();
    const current = () => state().labels;

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

    const isInfinite = () => state().boardConfig.boardShape === 'infinite';

    // ---- Highlighting a line by hovering its name ----------------------------------------------------------

    function clearHover() {
        const canvas = state().canvas;
        if (canvas) canvas.classList.remove('over-label');
        if (AppState.setLabelHover(null)) Renderer.requestRender();
    }

    function onCanvasMove(event) {
        const s = state();
        // a mouse or pen only: a finger has no hover, and a pressed button means painting or panning
        if (!s.canvas || !s.labels.enabled || event.pointerType === 'touch' || event.buttons || s.boardConfig.boardShape === 'infinite') {
            if (s.labelHover || s.canvas?.classList.contains('over-label')) clearHover();
            return;
        }
        const rect = s.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (s.canvas.width / rect.width);
        const y = (event.clientY - rect.top) * (s.canvas.height / rect.height);
        const world = { x: (x - s.view.x) / s.view.scale, y: (y - s.view.y) / s.view.scale };
        const found = Labels.hit(s.polygons, s.labels, s.boardConfig.boardShape, world);
        s.canvas.classList.toggle('over-label', Boolean(found));
        if (AppState.setLabelHover(found)) Renderer.requestRender();
    }

    // ---- Pictures of the indexings ----------------------------------------------------------------------

    const R = 8;
    const W = Math.sqrt(3) * R; // width of a pointy-top hexagon, height of a flat-top one

    function hexagon(cx, cy, pointy) {
        const offset = pointy ? -30 : 0;
        return Array.from({ length: 6 }, (_, i) => {
            const angle = ((60 * i + offset) * Math.PI) / 180;
            return `${(cx + R * Math.cos(angle)).toFixed(1)},${(cy + R * Math.sin(angle)).toFixed(1)}`;
        }).join(' ');
    }

    const cell = (points, cls) => `<polygon points="${points}"${cls ? ` class="${cls}"` : ''}/>`;
    const word = (x, y, text) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}">${text}</text>`;

    /** The tiles of a small board as markup: tiles = [{ x, y, hi: 'straight' | 'zigzag' | '' }] and labels = [{ x, y, text }]. */
    function picture(tiles, labels, pointy, polygonOf) {
        const group = (kind) => tiles.filter((t) => t.hi === kind);
        const draw = (list) => list.map((t) => cell(polygonOf ? polygonOf(t) : hexagon(t.x, t.y, pointy), '')).join('');
        return `<svg class="labels-scheme-picture" viewBox="0 0 120 92" aria-hidden="true" focusable="false">`
            + `<g>${draw(group(''))}</g><g class="straight">${draw(group('straight'))}</g><g class="zigzag">${draw(group('zigzag'))}</g>`
            + labels.map((l) => word(l.x, l.y, l.text)).join('') + '</svg>';
    }

    /** A small board for one indexing, drawn the way that indexing reads (the line that one letter names is highlighted). */
    function schemePicture(scheme, orientation) {
        const pointy = orientation !== 'flat-top';
        if (scheme === 'grid') {
            const s = 14;
            const tiles = [];
            for (let c = 0; c < 4; c++) for (let r = 0; r < 3; r++) tiles.push({ x: 32 + c * s, y: 28 + r * s, hi: c === 1 ? 'straight' : '' });
            const square = (t) => `${t.x},${t.y} ${t.x + s},${t.y} ${t.x + s},${t.y + s} ${t.x},${t.y + s}`;
            const labels = ['A', 'B', 'C', 'D'].map((text, c) => ({ x: 39 + c * s, y: 18, text })).concat([1, 2, 3].map((text, r) => ({ x: 22, y: 35 + r * s, text: String(text) })));
            return picture(tiles, labels, true, square);
        }
        if (scheme === 'triangles') {
            const h = 13.9;
            const tiles = [];
            for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) tiles.push({ x: 28 + k * 8, y: 24 + r * h, up: k % 2 === 0, hi: r === 1 ? 'straight' : '' });
            const tri = (t) => (t.up ? `${t.x},${t.y} ${t.x + 8},${t.y + h} ${t.x - 8},${t.y + h}` : `${t.x - 8},${t.y} ${t.x + 8},${t.y} ${t.x},${t.y + h}`);
            const labels = [1, 2, 3].map((text, r) => ({ x: 14, y: 31 + r * h, text: String(text) }));
            return picture(tiles, labels, true, tri);
        }
        if (scheme === 'offset') {
            const tiles = [];
            const labels = [];
            if (pointy) {
                for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) tiles.push({ x: 36 + c * W + (r % 2 ? W / 2 : 0), y: 34 + r * 1.5 * R, hi: c === 1 ? 'zigzag' : '' });
                ['A', 'B', 'C', 'D'].forEach((text, c) => labels.push({ x: 36 + c * W, y: 18, text }));
                [1, 2, 3].forEach((text, r) => labels.push({ x: 18, y: 34 + r * 1.5 * R, text: String(text) }));
            } else {
                for (let c = 0; c < 4; c++) for (let r = 0; r < 3; r++) tiles.push({ x: 34 + c * 1.5 * R, y: 30 + r * W + (c % 2 ? W / 2 : 0), hi: r === 1 ? 'zigzag' : '' });
                ['A', 'B', 'C', 'D'].forEach((text, c) => labels.push({ x: 34 + c * 1.5 * R, y: 14, text }));
                [1, 2, 3].forEach((text, r) => labels.push({ x: 16, y: 30 + r * W, text: String(text) }));
            }
            return picture(tiles, labels, pointy);
        }
        if (scheme === 'doubled') {
            const tiles = [];
            const labels = [];
            if (pointy) {
                for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) tiles.push({ x: 38 + c * W + (r % 2 ? W / 2 : 0), y: 36 + r * 1.5 * R, hi: r === 1 ? 'straight' : '' });
                ['A', 'B', 'C'].forEach((text, r) => labels.push({ x: 18, y: 36 + r * 1.5 * R, text }));
                for (let k = 0; k < 8; k++) labels.push({ x: 38 + k * W / 2, y: k % 2 ? 36 + 2 * 1.5 * R + 16 : 20, text: String(k + 1) });
            } else {
                for (let c = 0; c < 4; c++) for (let j = 0; j < 3; j++) tiles.push({ x: 34 + c * 1.5 * R, y: 30 + j * W + (c % 2 ? W / 2 : 0), hi: c === 1 ? 'straight' : '' });
                ['A', 'B', 'C', 'D'].forEach((text, c) => labels.push({ x: 34 + c * 1.5 * R, y: 14, text }));
                for (let k = 0; k < 6; k++) labels.push({ x: k % 2 ? 34 + 3 * 1.5 * R + 18 : 16, y: 30 + k * W / 2, text: String(k + 1) });
            }
            return picture(tiles, labels, pointy);
        }
        // axial: a hexagon of 19 tiles, rows and leaning diagonals
        const tiles = [];
        const labels = [];
        const cells = [];
        for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) if (Math.abs(q + r) <= 2) cells.push({ q, r });
        if (pointy) {
            const ox = 60;
            const oy = 46;
            cells.forEach(({ q, r }) => tiles.push({ x: ox + W * (q + r / 2), y: oy + 1.5 * R * r, hi: q === 0 ? 'straight' : '' }));
            for (let r = -2; r <= 2; r++) {
                const q0 = Math.max(-2, -2 - r);
                labels.push({ x: ox + W * (q0 + r / 2) - W * 0.9, y: oy + 1.5 * R * r, text: 'abcde'[2 - r] });
            }
            for (let q = -2; q <= 2; q++) {
                const r1 = Math.min(2, 2 - q);
                labels.push({ x: ox + W * (q + r1 / 2) + W * 0.5, y: oy + 1.5 * R * r1 + 1.5 * R, text: String(q + 3) });
            }
        } else {
            const ox = 60;
            const oy = 46;
            cells.forEach(({ q, r }) => tiles.push({ x: ox + 1.5 * R * q, y: oy + W * (r + q / 2), hi: r === 0 ? 'straight' : '' }));
            for (let q = -2; q <= 2; q++) {
                const r0 = Math.max(-2, -2 - q);
                labels.push({ x: ox + 1.5 * R * q, y: oy + W * (r0 + q / 2) - W * 0.8, text: 'ABCDE'[q + 2] });
            }
            for (let r = -2; r <= 2; r++) {
                const q0 = Math.max(-2, -2 - r);
                labels.push({ x: ox + 1.5 * R * q0 - R * 1.3, y: oy + W * (r + q0 / 2) - W * 0.3, text: String(r + 3) });
            }
        }
        return picture(tiles, labels, pointy);
    }

    // ---- The panel -----------------------------------------------------------------------------------------

    let cardsKey = '';

    /** The picker: a card with a picture for every indexing that makes sense here. Rebuilt only when that list changes. */
    function renderSchemes(context, labels) {
        const allowed = Labels.schemesFor(context);
        const chosen = Labels.schemeOf(labels, context);
        const holder = document.getElementById('labelsSchemeCards');
        const fieldset = document.getElementById('labelsSchemes');
        const note = document.getElementById('labelsSchemeNote');
        if (!holder || !fieldset) return;
        fieldset.hidden = allowed.length === 0;
        const key = `${allowed.join(',')}|${context.orientation}|${context.tile}`;
        if (key !== cardsKey) {
            cardsKey = key;
            holder.textContent = '';
            allowed.forEach((scheme) => {
                const info = Labels.schemeInfo(scheme, context.orientation);
                const card = document.createElement('label');
                card.className = 'labels-scheme';
                const input = document.createElement('input');
                input.type = 'radio';
                input.name = 'labelsScheme';
                input.value = scheme;
                const picture = document.createElement('span');
                picture.innerHTML = schemePicture(scheme, context.orientation);
                const name = document.createElement('span');
                name.className = 'labels-scheme-name';
                name.textContent = info.name;
                const hint = document.createElement('span');
                hint.className = 'labels-scheme-hint';
                hint.textContent = info.hint;
                card.append(input, picture, name, hint);
                holder.appendChild(card);
            });
        }
        holder.querySelectorAll('input').forEach((input) => {
            input.checked = input.value === chosen;
            input.disabled = allowed.length === 1;
        });
        if (note) {
            note.textContent = allowed.length === 1
                ? 'This is the only indexing that fits these tiles.'
                : 'Pick how the tiles are numbered. Only the indexings that fit this board are shown.';
        }
        const names = Labels.axisNames(context, chosen);
        const columns = document.getElementById('labelsColumnsLegend');
        const rows = document.getElementById('labelsRowsLegend');
        if (columns) columns.textContent = names.columns;
        if (rows) rows.textContent = names.rows;
    }

    /** Shows the settings in the controls (a control being typed in is left alone, so typing is never interrupted). */
    function render() {
        clearHover();
        const labels = current();
        const blocked = isInfinite();
        const context = Labels.contextOfConfig(state().boardConfig);
        const focused = document.activeElement;
        $$('[data-lb]').forEach((el) => {
            const path = el.dataset.lb;
            if (el === focused && el.type !== 'checkbox' && el.tagName !== 'SELECT') return;
            if (path === 'preset') el.value = Labels.matchPreset(labels);
            else if (el.type === 'checkbox') el.checked = Boolean(readPath(labels, path));
            else el.value = readPath(labels, path);
            el.disabled = blocked;
        });
        $$('[data-lb-show]').forEach((el) => { el.hidden = !visible(el.dataset.lbShow, labels); });
        const options = document.getElementById('labelsOptions');
        if (options) options.hidden = !(labels.enabled || labels.onTiles) || blocked;
        const note = document.getElementById('labelsNote');
        if (note) note.hidden = !blocked;
        if (!blocked) renderSchemes(context, labels);
    }

    function onChange(event) {
        const el = event.target.closest ? event.target.closest('[data-lb], input[name="labelsScheme"]') : null;
        if (!el) return;
        const labels = current();
        if (el.name === 'labelsScheme') {
            commit({ ...labels, scheme: el.value }, { rerender: true });
            return;
        }
        const path = el.dataset.lb;
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
        const canvas = state().canvas;
        if (canvas) {
            canvas.addEventListener('pointermove', onCanvasMove);
            canvas.addEventListener('pointerleave', clearHover);
            canvas.addEventListener('pointerdown', clearHover); // painting or panning starts: nothing is lit
        }
        window.addEventListener('pg:labelschange', render);
        window.addEventListener('pg:designchange', render);
        render();
    }

    return { init, render, schemePicture };
})();
