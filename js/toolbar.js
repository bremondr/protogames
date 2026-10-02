/**
 * PROTOGAMES TOOLBAR
 * --------------------------------------------------------------
 * Floating tool bar over the canvas (brush, objects, eraser, undo/redo/clear)
 * and the Themes panel (tile themes / item sets import). It mirrors AppState
 * into the DOM and routes clicks to Interactions / ThemeManager.
 */
const Toolbar = (() => {
    const $ = (id) => document.getElementById(id);
    let el = {};
    let brushOpen = false;
    let objOpen = false;
    let objTheme = 'medieval';

    function init() {
        el = {
            bar: $('toolBar'),
            brush: $('brushButton'),
            fill: $('fillButton'),
            line: $('lineButton'),
            brushChevron: $('brushColorButton'),
            brushColorDot: $('brushColorDot'),
            brushChevronIcon: $('brushChevronIcon'),
            brushIconFill: $('brushIconFill'),
            brushPop: $('brushPopover'),
            paletteGrid: document.querySelector('.palette-grid'),
            objGroup: $('objectGroup'),
            objButton: $('objectButton'),
            objThumb: $('objectThumb'),
            objChevron: $('objectChevron'),
            objChevronIcon: $('objectChevronIcon'),
            objPop: $('objectPopover'),
            objThemeSelect: $('objectThemeSelect'),
            objGrid: $('objectGrid'),
            tileList: $('tileThemeList'),
            itemList: $('itemThemeList'),
            tileInput: $('tileThemeInput'),
            itemInput: $('itemThemeInput')
        };

        el.brush?.addEventListener('click', selectBrush);
        $('brushSmaller')?.addEventListener('click', () => Interactions.changeBrushSize(-1));
        $('brushLarger')?.addEventListener('click', () => Interactions.changeBrushSize(1));
        window.addEventListener('pg:brushsize', syncBrushSize);
        el.fill?.addEventListener('click', () => Interactions.setDrawMode('fill'));
        el.line?.addEventListener('click', () => Interactions.setDrawMode('line'));
        el.brushChevron?.addEventListener('click', () => setPopovers(!brushOpen, false));
        el.paletteGrid?.addEventListener('click', (e) => {
            if (e.target.closest('.palette-swatch')) setTimeout(() => setPopovers(false, objOpen), 120);
        });
        el.objButton?.addEventListener('click', () => Interactions.selectObjectTool());
        el.objChevron?.addEventListener('click', () => setPopovers(false, !objOpen));
        el.objThemeSelect?.addEventListener('change', onObjectTheme);
        el.objGrid?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-object]');
            if (!btn) return;
            Interactions.selectObjectTool(btn.dataset.object);
            setPopovers(brushOpen, false);
        });

        document.addEventListener('pointerdown', (e) => {
            if ((brushOpen || objOpen) && el.bar && !el.bar.contains(e.target)) setPopovers(false, false);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && (brushOpen || objOpen)) setPopovers(false, false);
        });

        bindThemePanel();
        bindFocusMode();
        window.addEventListener('pg:toolchange', sync);
        window.addEventListener('pg:themeschange', renderThemes);
        // Swatches are re-rendered on palette change; keep the brush color dot current.
        el.paletteGrid && new MutationObserver(sync).observe(el.paletteGrid, { attributes: true, subtree: true, attributeFilter: ['class'] });
        sync();
        renderThemes();
    }

    /** Shows the brush size and disables the stepper buttons at the limits. */
    function syncBrushSize() {
        const size = AppState.getState().brushSize;
        const value = $('brushSizeValue');
        if (value) value.textContent = String(size);
        const smaller = $('brushSmaller');
        const larger = $('brushLarger');
        if (smaller) smaller.disabled = size <= Config.BRUSH_SIZE_MIN;
        if (larger) larger.disabled = size >= Config.BRUSH_SIZE_MAX;
    }

    function toolName() {
        const s = AppState.getState();
        return s.isObjectToolActive ? 'object' : s.isEraserActive ? 'eraser' : 'brush';
    }

    function selectBrush() {
        Interactions.setDrawMode('brush');
        const btns = Array.from(el.paletteGrid?.querySelectorAll('.palette-swatch') || []);
        const color = (AppState.getState().currentColor || '').toLowerCase();
        const match = btns.find((b) => (b.dataset.color || '').toLowerCase() === color) || btns[0];
        match?.click();
    }

    function setPopovers(brush, obj) {
        brushOpen = brush;
        objOpen = obj;
        sync();
    }

    function onObjectTheme() {
        objTheme = el.objThemeSelect.value;
        const items = Objects.list(objTheme);
        const current = AppState.getState().currentObject;
        if (items[0] && !items.some((o) => o.id === current)) Interactions.selectObjectTool(items[0].id);
        else sync();
    }

    /** Mirrors AppState into toolbar visuals. */
    function sync() {
        if (!el.bar) return;
        const s = AppState.getState();
        const tool = toolName();
        const color = s.currentColor;
        syncBrushSize();

        // Brush is highlighted only when painting terrain colour with the plain brush; fill and
        // line are highlighted by mode and combine with whichever paint source (colour, object, eraser) is active.
        const mode = s.drawMode;
        const brushActive = tool === 'brush' && mode === 'brush';
        el.brush.classList.toggle('active', brushActive);
        el.brush.setAttribute('aria-pressed', String(brushActive));
        el.fill?.classList.toggle('active', mode === 'fill');
        el.fill?.setAttribute('aria-pressed', String(mode === 'fill'));
        el.line?.classList.toggle('active', mode === 'line');
        el.line?.setAttribute('aria-pressed', String(mode === 'line'));
        el.brushIconFill?.setAttribute('fill', color);
        el.brushChevron.classList.toggle('open', brushOpen);
        el.brushChevron.setAttribute('aria-expanded', String(brushOpen));
        el.brushPop.classList.toggle('open', brushOpen);
        let dotImage = 'none';
        try { const u = Textures.urlFor(color); if (u) dotImage = `url(${u})`; } catch (e) { /* flat color */ }
        el.brushColorDot.style.backgroundColor = color;
        el.brushColorDot.style.backgroundImage = dotImage;

        el.objGroup.classList.toggle('active', tool === 'object');
        el.objButton.setAttribute('aria-pressed', String(tool === 'object'));
        el.objButton.setAttribute('aria-label', 'Place ' + (Objects.labelFor(s.currentObject) || 'object'));
        const thumb = Objects.urlFor(s.currentObject);
        el.objThumb.style.backgroundImage = thumb ? `url(${thumb})` : 'none';
        el.objChevron.setAttribute('aria-expanded', String(objOpen));
        el.objChevronIcon.classList.toggle('flipped', objOpen);
        el.brushChevronIcon.classList.toggle('flipped', brushOpen);
        el.objPop.classList.toggle('open', objOpen);

        renderObjects(s.currentObject);
    }

    function renderObjects(current) {
        if (!el.objThemeSelect) return;
        const themes = Objects.themes();
        if (!themes.some((t) => t.id === objTheme)) objTheme = themes[0].id;
        const sig = themes.map((t) => t.id + t.name).join('|');
        if (el.objThemeSelect.dataset.sig !== sig) {
            el.objThemeSelect.dataset.sig = sig;
            el.objThemeSelect.innerHTML = '';
            themes.forEach((t) => {
                const o = document.createElement('option');
                o.value = t.id; o.textContent = t.name;
                el.objThemeSelect.appendChild(o);
            });
        }
        el.objThemeSelect.value = objTheme;

        el.objGrid.innerHTML = '';
        Objects.list(objTheme).forEach((o) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'object-item' + (o.id === current ? ' selected' : '');
            btn.dataset.object = o.id;
            btn.setAttribute('role', 'listitem');
            btn.setAttribute('aria-pressed', String(o.id === current));
            const url = Objects.urlFor(o.id);
            btn.innerHTML = '<span class="object-thumb"><span class="object-img" aria-hidden="true"></span></span><span class="object-label"></span>';
            if (url) btn.querySelector('.object-img').style.backgroundImage = `url(${url})`;
            btn.querySelector('.object-label').textContent = o.label;
            el.objGrid.appendChild(btn);
        });
    }

    // ---- Focus mode ---------------------------------------------------

    /** Hides the header and sidebar and, where allowed, enters browser full screen. */
    function setFocusMode(on) {
        const body = document.body;
        if (on === body.classList.contains('focus-mode')) return;
        body.classList.toggle('focus-mode', on);
        const button = $('focusButton');
        if (button) {
            const label = on ? 'Exit full screen' : 'Full screen';
            button.setAttribute('aria-pressed', String(on));
            button.setAttribute('aria-label', label);
            button.dataset.tip = label;
        }
        setPopovers(false, false);
        try {
            if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
            } else if (!on && document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
            }
        } catch (e) { /* full screen not allowed (e.g. in a frame): hiding the chrome still applies */ }
        // Let the canvas re-measure and the board re-fit the new workspace size.
        setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
    }

    function bindFocusMode() {
        $('focusButton')?.addEventListener('click', () => setFocusMode(!document.body.classList.contains('focus-mode')));
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) setFocusMode(false);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.body.classList.contains('focus-mode') && !brushOpen && !objOpen) setFocusMode(false);
        });
    }

    // ---- Themes panel -------------------------------------------------

    function bindThemePanel() {
        [['tiles', 'tileInput', 'tilePick', 'tileTemplate'], ['items', 'itemInput', 'itemPick', 'itemTemplate']].forEach(([kind, input, pick, template]) => {
            $(pick)?.addEventListener('click', () => el[input]?.click());
            $(template)?.addEventListener('click', () => ThemeManager.downloadTemplate(kind));
            el[input]?.addEventListener('change', (e) => importThemes(kind, e.target));
        });
        [['tiles', 'tileNew', 'tileExport', 'tileExportSelect'], ['items', 'itemNew', 'itemExport', 'itemExportSelect']].forEach(([kind, create, exportBtn, select]) => {
            $(create)?.addEventListener('click', () => { setPopovers(false, false); ThemeEditor.open(kind); });
            $(exportBtn)?.addEventListener('click', () => { const id = $(select)?.value; if (id) ThemeManager.exportTheme(kind, id); });
        });
        [el.tileList, el.itemList].forEach((list) => list?.addEventListener('click', (e) => {
            const edit = e.target.closest('[data-edit]');
            if (edit) { ThemeEditor.open(edit.dataset.kind, edit.dataset.edit); return; }
            const btn = e.target.closest('[data-remove]');
            if (!btn) return;
            const kind = btn.dataset.kind;
            const id = btn.dataset.remove;
            if (kind === 'items' && objTheme === id) objTheme = 'medieval';
            ThemeManager.remove(kind, id);
        }));
    }

    /** Fills the export dropdowns with every tile theme / item set, keeping the current choice. */
    function renderExportOptions() {
        [['tileExportSelect', Config.getAllPalettes()], ['itemExportSelect', Objects.themes()]].forEach(([id, options]) => {
            const select = $(id);
            if (!select) return;
            const previous = select.value;
            select.innerHTML = '';
            options.forEach((o) => {
                const opt = document.createElement('option');
                opt.value = o.id;
                opt.textContent = o.name;
                select.appendChild(opt);
            });
            if (options.some((o) => o.id === previous)) select.value = previous;
        });
    }

    async function importThemes(kind, input) {
        if (!input.files || !input.files.length) return;
        try {
            const r = await ThemeManager.importFiles(kind, input.files);
            if (r) UI.showNotification(`Imported "${r.name}" (${r.count}${kind === 'tiles' ? ' tiles' : ' items'})${r.saved ? '' : ' — too large to keep after reload'}`);
        } catch (err) {
            UI.showNotification('Import failed: ' + err.message);
        }
        input.value = '';
    }

    function renderThemes() {
        [['tiles', el.tileList], ['items', el.itemList]].forEach(([kind, list]) => {
            if (!list) return;
            const entries = ThemeManager.list(kind);
            list.classList.toggle('hidden', !entries.length);
            list.innerHTML = '';
            entries.forEach((c) => {
                const row = document.createElement('div');
                row.className = 'theme-row';
                row.setAttribute('role', 'listitem');
                const name = document.createElement('span');
                name.className = 'theme-row-name';
                name.textContent = c.name;
                const count = document.createElement('span');
                count.className = 'theme-row-count';
                count.textContent = c.count + (kind === 'tiles' ? ' tiles' : ' items');
                const edit = document.createElement('button');
                edit.type = 'button';
                edit.className = 'theme-row-remove theme-row-edit';
                edit.dataset.edit = c.id;
                edit.dataset.kind = kind;
                edit.setAttribute('aria-label', 'Edit ' + c.name);
                edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'theme-row-remove';
                remove.dataset.remove = c.id;
                remove.dataset.kind = kind;
                remove.setAttribute('aria-label', 'Remove ' + c.name);
                remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
                row.append(name, count, edit, remove);
                list.appendChild(row);
            });
        });
        renderExportOptions();
        sync();
    }

    return { init, sync, selectBrush };
})();
