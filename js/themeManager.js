/**
 * PROTOGAMES THEME MANAGER
 * Imports custom tile themes (palettes with optional texture images) and item
 * sets (placeable object images). Accepts JSON files or plain images.
 * Imported themes persist in localStorage.
 *
 * Tile theme JSON:
 *   { "type": "protogames-tile-theme", "name": "Swamp",
 *     "tiles": [ { "label": "Bog", "hex": "#4b5d3a", "image": "data:image/png;base64,… | https://…" } ] }
 * Item set JSON:
 *   { "type": "protogames-item-set", "name": "Sci-fi",
 *     "items": [ { "label": "Outpost", "image": "data:image/png;base64,… | https://…" } ] }
 */
const ThemeManager = (() => {
    const KEY = 'protogames_custom_themes';
    let store = { tiles: [], items: [] };

    const slug = (s) => String(s || 'theme').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'theme';
    const uid = (base, taken) => { let id = base, n = 2; while (taken.has(id)) id = `${base}-${n++}`; return id; };
    const labelFromFile = (name) => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    function readFile(file, as) {
        return new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = rej;
            as === 'text' ? r.readAsText(file) : r.readAsDataURL(file);
        });
    }
    function loadImage(src) {
        return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('Could not load image')); i.src = src; });
    }
    function averageHex(img) {
        const c = document.createElement('canvas'); c.width = 16; c.height = 16;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0, 16, 16);
        const d = x.getImageData(0, 0, 16, 16).data; let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 20) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        n = n || 1;
        return '#' + [r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('');
    }
    // Ensure palette hexes are unique across all palettes (hex is the tile's identity).
    function uniqueHex(hex, used) {
        let h = hex.toLowerCase();
        while (used.has(h)) {
            const n = parseInt(h.slice(1), 16);
            h = '#' + ((n + 1) & 0xffffff).toString(16).padStart(6, '0');
        }
        used.add(h);
        return h;
    }
    function usedHexes() {
        const s = new Set([String(Config.DEFAULT_FILL).toLowerCase()]);
        Config.COLOR_PALETTES.forEach((p) => p.colors.forEach((c) => s.add(c.hex.toLowerCase())));
        return s;
    }

    async function applyTileTheme(theme) {
        for (const t of theme.tiles) {
            if (t.image) { try { Textures.registerImage(t.hex, await loadImage(t.image)); } catch (e) { /* keep flat color */ } }
        }
        Config.COLOR_PALETTES.push({ id: theme.id, name: theme.name, description: 'Imported theme', custom: true, colors: theme.tiles.map(({ label, hex }) => ({ label, hex })) });
        Textures.resetLabels();
    }
    async function applyItemSet(set) {
        const items = [];
        for (const it of set.items) { try { items.push({ id: it.id, label: it.label, img: await loadImage(it.image) }); } catch (e) { /* skip */ } }
        Objects.registerSet({ id: set.id, name: set.name, items });
    }

    function persist() {
        try { localStorage.setItem(KEY, JSON.stringify(store)); return true; } catch (e) { return false; }
    }
    function refreshPaletteSelect() {
        const s = AppState.getState();
        UI.initializePaletteSelector(s.currentPaletteId);
        AppState.setAvailablePalettes(Config.getAllPalettes());
    }
    function emit() { window.dispatchEvent(new CustomEvent('pg:themeschange')); }

    async function init() {
        try { store = JSON.parse(localStorage.getItem(KEY)) || store; } catch (e) { /* ignore */ }
        store.tiles = store.tiles || []; store.items = store.items || [];
        for (const t of store.tiles) await applyTileTheme(t);
        for (const s of store.items) await applyItemSet(s);
        refreshPaletteSelect();
        if (store.tiles.length) {
            const s = AppState.getState();
            UI.renderColorPalette(s.currentPaletteId, s.currentColor);
            Renderer.renderBoard();
        }
        emit();
    }

    /** Builds a theme/set from the chosen files: one JSON file, or any number of images. */
    async function parseFiles(kind, files) {
        const list = Array.from(files || []);
        if (!list.length) return null;
        const json = list.find((f) => /json$/i.test(f.type) || /\.json$/i.test(f.name));
        if (json) {
            const data = JSON.parse(await readFile(json, 'text'));
            if (kind === 'tiles') {
                const tiles = data.tiles || data.colors;
                if (!Array.isArray(tiles) || !tiles.length) throw new Error('No "tiles" found in file');
                return { name: data.name || labelFromFile(json.name), tiles: tiles.map((t, i) => ({ label: t.label || `Tile ${i + 1}`, hex: t.hex || '#cccccc', image: t.image || null })) };
            }
            if (!Array.isArray(data.items) || !data.items.length) throw new Error('No "items" found in file');
            return { name: data.name || labelFromFile(json.name), items: data.items.map((it, i) => ({ label: it.label || `Item ${i + 1}`, image: it.image })) };
        }
        const images = list.filter((f) => /^image\//.test(f.type));
        if (!images.length) throw new Error('Choose a .json file or image files');
        const entries = [];
        for (const f of images) {
            const src = await readFile(f, 'url');
            entries.push({ label: labelFromFile(f.name), image: src, hex: kind === 'tiles' ? averageHex(await loadImage(src)) : undefined });
        }
        const name = images.length === 1 ? entries[0].label : (kind === 'tiles' ? 'Custom tiles' : 'Custom items');
        return kind === 'tiles' ? { name, tiles: entries } : { name, items: entries };
    }

    async function importFiles(kind, files) {
        const parsed = await parseFiles(kind, files);
        if (!parsed) return null;
        if (kind === 'tiles') {
            const ids = new Set(Config.COLOR_PALETTES.map((p) => p.id));
            const used = usedHexes();
            const theme = { id: uid('custom-' + slug(parsed.name), ids), name: parsed.name, tiles: parsed.tiles.map((t) => ({ ...t, hex: uniqueHex(t.hex, used) })) };
            await applyTileTheme(theme);
            store.tiles.push(theme);
            refreshPaletteSelect();
        } else {
            const ids = new Set(Objects.themes().map((t) => t.id));
            const id = uid('custom-' + slug(parsed.name), ids);
            const taken = new Set();
            const set = { id, name: parsed.name, items: parsed.items.filter((it) => it.image).map((it) => {
                const itemId = uid(slug(it.label), taken); taken.add(itemId);
                return { ...it, id: `${id}:${itemId}` };
            }) };
            await applyItemSet(set);
            store.items.push(set);
        }
        const saved = persist();
        emit();
        return { name: parsed.name, count: (parsed.tiles || parsed.items).length, saved };
    }

    function remove(kind, id) {
        if (kind === 'tiles') {
            const t = store.tiles.find((x) => x.id === id);
            if (!t) return;
            t.tiles.forEach((tile) => Textures.unregister(tile.hex));
            const i = Config.COLOR_PALETTES.findIndex((p) => p.id === id);
            if (i >= 0) Config.COLOR_PALETTES.splice(i, 1);
            Textures.resetLabels();
            store.tiles = store.tiles.filter((x) => x.id !== id);
            const sel = document.getElementById('paletteSelect');
            const wasActive = AppState.getState().currentPaletteId === id;
            refreshPaletteSelect();
            if (wasActive && sel) { sel.value = Config.DEFAULT_PALETTE_ID; sel.dispatchEvent(new Event('change')); }
            Renderer.renderBoard();
        } else {
            Objects.removeSet(id);
            store.items = store.items.filter((x) => x.id !== id);
            Renderer.renderBoard();
        }
        persist();
        emit();
    }

    function list(kind) {
        return (kind === 'tiles' ? store.tiles : store.items).map((t) => ({ id: t.id, name: t.name, count: (t.tiles || t.items).length }));
    }

    function downloadTemplate(kind) {
        const data = kind === 'tiles'
            ? { type: 'protogames-tile-theme', name: 'My Tile Theme', tiles: [{ label: 'Bog', hex: '#4b5d3a', image: null }, { label: 'Reeds', hex: '#8a9a4a', image: null }] }
            : { type: 'protogames-item-set', name: 'My Item Set', items: [{ label: 'Outpost', image: 'https://example.com/outpost.png' }] };
        Utils.triggerBlobDownload(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), kind === 'tiles' ? 'tile-theme.template.json' : 'item-set.template.json');
    }

    return { init, importFiles, remove, list, downloadTemplate };
})();
