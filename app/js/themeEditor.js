/**
 * PROTOGAMES THEME EDITOR
 * --------------------------------------------------------------
 * Dialog for creating and editing tile themes (terrains with a color,
 * optional texture image and name) and item sets (named images).
 * Persistence and board updates are delegated to ThemeManager.saveTheme.
 */
const ThemeEditor = (() => {
    const $ = (id) => document.getElementById(id);
    let el = {};
    let editor = null;
    let rowKey = 0;
    let pendingKey = null;
    let lastFocus = null;

    const ICON_IMAGE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"></path></svg>';
    const ICON_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
    const ICON_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>';

    function init() {
        el = {
            root: $('themeEditor'),
            title: $('themeEditorTitle'),
            name: $('themeEditorName'),
            rowsTitle: $('themeEditorRowsTitle'),
            rowsHint: $('themeEditorRowsHint'),
            rows: $('themeEditorRows'),
            add: $('themeEditorAdd'),
            error: $('themeEditorError'),
            save: $('themeEditorSave'),
            cancel: $('themeEditorCancel'),
            close: $('themeEditorClose'),
            file: $('themeEditorFile'),
            baseField: $('themeEditorBaseField'),
            base: $('themeEditorBase'),
            baseHint: $('themeEditorBaseHint')
        };
        if (!el.root) return;

        el.close.addEventListener('click', close);
        el.cancel.addEventListener('click', close);
        el.root.addEventListener('pointerdown', (e) => { if (e.target === el.root) close(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && editor) close(); });
        el.name.addEventListener('input', () => { editor.name = el.name.value; setError(''); });
        el.base.addEventListener('change', () => setBase(el.base.value));
        el.add.addEventListener('click', addRow);
        el.save.addEventListener('click', save);
        el.file.addEventListener('change', onFile);
    }

    function newRow(kind, r = {}) {
        return {
            key: ++rowKey,
            label: r.label || '',
            hex: r.hex || '#8bbf5a',
            image: r.image || null,
            orig: kind === 'tiles' ? (r.hex || null) : null,
            id: r.id || null
        };
    }

    function open(kind, id) {
        const existing = id ? ThemeManager.get(kind, id) : null;
        const source = existing ? (kind === 'tiles' ? existing.tiles : existing.items) : null;
        const rows = source
            ? source.map((r) => newRow(kind, r))
            : kind === 'tiles'
                ? [{ label: 'Plains', hex: '#a7c46a' }, { label: 'Forest', hex: '#2f6b3a' }, { label: 'Water', hex: '#2f7fd1' }].map((r) => ({ ...newRow(kind, r), orig: null }))
                : [newRow(kind)];
        editor = { kind, id: existing ? id : null, name: existing ? existing.name : '', rows, blankRows: rows, base: '', autoName: '', saving: false };
        lastFocus = document.activeElement;

        const tiles = kind === 'tiles';
        el.title.textContent = (editor.id ? 'Edit ' : 'New ') + (tiles ? 'tile theme' : 'item set');
        el.name.value = editor.name;
        el.name.placeholder = tiles ? 'e.g. Swamplands' : 'e.g. Sci-fi outposts';
        el.rowsTitle.textContent = tiles ? 'Terrains' : 'Items';
        el.rowsHint.textContent = tiles ? 'Color, optional texture image, name' : 'PNG image and name';
        el.add.innerHTML = ICON_PLUS + (tiles ? 'Add terrain' : 'Add item');
        el.save.textContent = editor.id ? 'Save changes' : 'Create';
        el.save.disabled = false;
        setError('');
        renderBaseChoice();
        renderRows();
        el.root.classList.remove('hidden');
        el.name.focus();
    }

    // ---- Start from an existing theme -------------------------------------------------------------

    /** Themes a new one can copy: the built-in and imported ones. */
    function baseList(kind) {
        return kind === 'tiles'
            ? Config.getAllPalettes().map((p) => ({ id: p.id, name: p.name }))
            : Objects.themes().map((t) => ({ id: t.id, name: t.name }));
    }

    /** Editable copies of a theme's terrains or items (textures become images, so everything can be changed). */
    function baseRows(kind, baseId) {
        const own = ThemeManager.get(kind, baseId);
        if (kind === 'tiles') {
            const source = own ? own.tiles : (Config.getPaletteById(baseId) || {}).colors || [];
            return source.map((t) => ({
                ...newRow(kind, { label: t.label, hex: t.hex, image: t.image || Textures.dataUrlFor(t.hex) || null }),
                orig: null
            }));
        }
        const source = own ? own.items : Objects.list(baseId).map((o) => ({ label: o.label, image: Objects.dataUrlFor(o.id) }));
        return source.filter((item) => item.image).map((item) => ({ ...newRow(kind, { label: item.label, image: item.image }), id: null }));
    }

    /** The "Start from" choice only exists for a new theme; an edit changes the theme itself. */
    function renderBaseChoice() {
        const tiles = editor.kind === 'tiles';
        el.baseField.hidden = Boolean(editor.id);
        if (editor.id) return;
        el.base.innerHTML = '';
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = tiles ? 'Blank — default terrains' : 'Blank set';
        el.base.appendChild(blank);
        baseList(editor.kind).forEach((b) => {
            const option = document.createElement('option');
            option.value = b.id;
            option.textContent = b.name;
            el.base.appendChild(option);
        });
        el.base.value = '';
        el.baseHint.textContent = tiles
            ? 'Copies its terrain names, colors and patterns; you can change everything before saving. The original stays as it is.'
            : 'Copies its items and names; you can change everything before saving. The original stays as it is.';
    }

    function setBase(baseId) {
        if (!editor || editor.id) return;
        const base = baseList(editor.kind).find((b) => b.id === baseId);
        // A name the person typed is kept; one we suggested ("Space copy") follows the choice.
        const followsChoice = !editor.name.trim() || editor.name === editor.autoName;
        editor.autoName = base ? `${base.name} copy` : '';
        editor.rows = base ? baseRows(editor.kind, baseId) : editor.blankRows.map((r) => ({ ...r, key: ++rowKey }));
        editor.base = baseId;
        if (followsChoice) {
            editor.name = editor.autoName;
            el.name.value = editor.name;
        }
        setError('');
        renderRows();
    }

    /** Closes on the person's request. While a save is running the dialog stays, so the save can finish and report. */
    function close() {
        if (editor && editor.saving) return;
        finish();
    }

    function finish() {
        editor = null;
        el.root.classList.add('hidden');
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function setError(message) {
        el.error.textContent = message;
    }

    function noun(i) {
        return (editor.kind === 'tiles' ? 'terrain ' : 'item ') + (i + 1);
    }

    function addRow() {
        const tiles = editor.kind === 'tiles';
        const hex = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
        editor.rows.push({ ...newRow(editor.kind, tiles ? { hex } : {}), orig: null });
        setError('');
        renderRows();
        el.rows.lastElementChild?.querySelector('input[type="text"]')?.focus();
    }

    function renderRows() {
        const tiles = editor.kind === 'tiles';
        el.rows.innerHTML = '';
        editor.rows.forEach((row, i) => {
            const li = document.createElement('div');
            li.className = 'editor-row';
            li.setAttribute('role', 'listitem');

            if (tiles) {
                const swatch = document.createElement('label');
                swatch.className = 'editor-color';
                swatch.style.background = row.hex;
                swatch.setAttribute('aria-label', 'Color for ' + (row.label || noun(i)));
                const color = document.createElement('input');
                color.type = 'color';
                color.value = row.hex;
                color.addEventListener('input', () => { row.hex = color.value; swatch.style.background = row.hex; setError(''); });
                swatch.appendChild(color);
                li.appendChild(swatch);
            }

            const pick = document.createElement('button');
            pick.type = 'button';
            pick.className = 'editor-image' + (tiles ? '' : ' contain');
            pick.setAttribute('aria-label', (row.image ? 'Replace image for ' : 'Add image for ') + (row.label || noun(i)));
            if (row.image) pick.style.backgroundImage = `url("${row.image}")`;
            else pick.innerHTML = ICON_IMAGE;
            pick.addEventListener('click', () => { pendingKey = row.key; el.file.click(); });
            li.appendChild(pick);

            const label = document.createElement('input');
            label.type = 'text';
            label.className = 'editor-label';
            label.value = row.label;
            label.placeholder = tiles ? 'Terrain name' : 'Item name';
            label.setAttribute('aria-label', (tiles ? 'Terrain ' : 'Item ') + (i + 1) + ' name');
            label.addEventListener('input', () => { row.label = label.value; setError(''); });
            li.appendChild(label);

            if (tiles && row.image) {
                const clear = document.createElement('button');
                clear.type = 'button';
                clear.className = 'link-button';
                clear.textContent = 'Remove texture';
                clear.setAttribute('aria-label', 'Remove texture for ' + (row.label || noun(i)));
                clear.addEventListener('click', () => { row.image = null; renderRows(); });
                li.appendChild(clear);
            }

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'theme-row-remove editor-remove';
            remove.setAttribute('aria-label', 'Remove ' + (row.label || noun(i)));
            remove.innerHTML = ICON_CLOSE;
            remove.addEventListener('click', () => {
                editor.rows = editor.rows.filter((r) => r.key !== row.key);
                renderRows();
            });
            li.appendChild(remove);

            el.rows.appendChild(li);
        });
    }

    function onFile() {
        const file = el.file.files && el.file.files[0];
        const key = pendingKey;
        el.file.value = '';
        if (!file || key == null || !editor) return;
        const reader = new FileReader();
        reader.onload = () => {
            const row = editor && editor.rows.find((r) => r.key === key);
            if (!row) return;
            row.image = reader.result;
            if (!row.label) row.label = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
            renderRows();
        };
        reader.readAsDataURL(file);
    }

    async function save() {
        if (!editor || editor.saving) return;
        const name = editor.name.trim();
        if (!name) { setError('Give the theme a name.'); return; }

        let data;
        if (editor.kind === 'tiles') {
            const tiles = editor.rows.map((r, i) => ({ label: r.label.trim() || 'Terrain ' + (i + 1), hex: r.hex, image: r.image, orig: r.orig }));
            if (!tiles.length) { setError('Add at least one terrain.'); return; }
            data = { name, tiles };
        } else {
            const items = editor.rows.filter((r) => r.image).map((r, i) => ({ label: r.label.trim() || 'Item ' + (i + 1), image: r.image, id: r.id }));
            if (!items.length) { setError('Add at least one item with an image.'); return; }
            data = { name, items };
        }

        const mine = editor;
        mine.saving = true;
        el.save.disabled = true;
        el.save.textContent = 'Saving…';
        try {
            const r = await ThemeManager.saveTheme(mine.kind, data, mine.id);
            UI.showNotification((mine.id ? 'Updated "' : 'Created "') + name + '"' + (r && r.saved === false ? ' — too large to keep after reload' : ''));
            mine.saving = false;
            if (editor === mine) finish();
        } catch (err) {
            mine.saving = false;
            if (editor !== mine) return;
            el.save.disabled = false;
            el.save.textContent = mine.id ? 'Save changes' : 'Create';
            setError('Could not save: ' + err.message);
        }
    }

    return { init, open };
})();
