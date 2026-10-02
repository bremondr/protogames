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
        window.addEventListener('pg:toolchange', sync);
        window.addEventListener('pg:themeschange', renderThemes);
        // Swatches are re-rendered on palette change; keep the brush color dot current.
        el.paletteGrid && new MutationObserver(sync).observe(el.paletteGrid, { attributes: true, subtree: true, attributeFilter: ['class'] });
        sync();
        renderThemes();
    }

    function toolName() {
        const s = AppState.getState();
        return s.isObjectToolActive ? 'object' : s.isEraserActive ? 'eraser' : 'brush';
    }

    function selectBrush() {
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

        el.brush.classList.toggle('active', tool === 'brush');
        el.brush.setAttribute('aria-pressed', String(tool === 'brush'));
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

    // ---- Themes panel -------------------------------------------------

    function bindThemePanel() {
        [['tiles', 'tileInput', 'tilePick', 'tileTemplate'], ['items', 'itemInput', 'itemPick', 'itemTemplate']].forEach(([kind, input, pick, template]) => {
            $(pick)?.addEventListener('click', () => el[input]?.click());
            $(template)?.addEventListener('click', () => ThemeManager.downloadTemplate(kind));
            el[input]?.addEventListener('change', (e) => importThemes(kind, e.target));
        });
        [el.tileList, el.itemList].forEach((list) => list?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-remove]');
            if (!btn) return;
            const kind = btn.dataset.kind;
            const id = btn.dataset.remove;
            if (kind === 'items' && objTheme === id) objTheme = 'medieval';
            ThemeManager.remove(kind, id);
        }));
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
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'theme-row-remove';
                remove.dataset.remove = c.id;
                remove.dataset.kind = kind;
                remove.setAttribute('aria-label', 'Remove ' + c.name);
                remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
                row.append(name, count, remove);
                list.appendChild(row);
            });
        });
        sync();
    }

    return { init, sync };
})();
