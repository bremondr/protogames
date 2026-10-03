/**
 * PROTOGAMES SHARE LINK
 * --------------------------------------------------------------
 * Puts a whole board into the address itself, after "#b=": nothing is uploaded and
 * anyone who opens the link gets their own copy. The board is not stored tile by
 * tile; only the board settings, the distinct colours and objects, and which tile
 * uses which are kept, then deflate-compressed and written as base64url.
 *
 * The link has its own version (`v`) and remembers the project file format (`f`) its
 * colours belong to. Opening a link builds a project from it and runs it through
 * ProjectFormat.parse, so a link made before a palette change migrates exactly like a
 * saved file. The pure half (pack, unpack, base64url, url helpers) is unit-tested in
 * Node; the dialog and the compression need the browser.
 */
const ShareLink = (() => {
    /** Version of the link payload (not the project file format). */
    const LINK_VERSION = 1;
    const MAX_TILES = 20000;
    const MAX_DIMENSION = 100;
    const HASH_PATTERN = /[#&]b=([A-Za-z0-9_-]+)/;
    const HEX_COLOR = /^#[0-9a-f]{6}$/i;
    // Rules of thumb for the apps a link gets pasted into (chat, email); browsers themselves take far more.
    const LONG_LINK = 2000;
    const VERY_LONG_LINK = 8000;

    // ---- Pure: payload -------------------------------------------------------------------------

    /**
     * Compact payload for a board: { v, f, n, c, p, k, t, ob, o }
     *  k = distinct colours, t = per-tile colour index (base 36, dot separated),
     *  ob = distinct object ids, o = "tileIndex:objectIndex" pairs.
     */
    function pack({ projectName, boardConfig, paletteId, polygons, formatVersion }) {
        const colors = [];
        const colorIndex = new Map();
        const tiles = polygons.map((polygon) => {
            const color = String(polygon.color || '').toLowerCase();
            if (!colorIndex.has(color)) {
                colorIndex.set(color, colors.length);
                colors.push(color);
            }
            return colorIndex.get(color).toString(36);
        });
        const objects = [];
        const objectIndex = new Map();
        const placed = [];
        polygons.forEach((polygon, index) => {
            if (!polygon.object) return;
            if (!objectIndex.has(polygon.object)) {
                objectIndex.set(polygon.object, objects.length);
                objects.push(polygon.object);
            }
            placed.push(`${index.toString(36)}:${objectIndex.get(polygon.object).toString(36)}`);
        });
        return {
            v: LINK_VERSION,
            f: formatVersion,
            n: projectName || '',
            c: boardConfig,
            p: paletteId,
            k: colors,
            t: tiles.join('.'),
            ob: objects,
            o: placed.join('.')
        };
    }

    function fail(message) {
        throw new Error(message);
    }

    function boardConfigFrom(raw) {
        if (!raw || typeof raw !== 'object') fail('The link has no board settings.');
        const config = { ...raw };
        for (const key of ['width', 'height', 'radius', 'size']) {
            if (config[key] === undefined) continue;
            if (!Number.isInteger(config[key]) || config[key] < 1 || config[key] > MAX_DIMENSION) fail(`The board ${key} in the link is out of range.`);
        }
        return config;
    }

    /**
     * Rebuilds a project-shaped object from a payload and freshly generated, blank tiles
     * (the tile order of a generated board is fixed by its settings). Throws on anything
     * unexpected; the result still has to go through ProjectFormat.parse.
     */
    function unpack(data, polygons, { defaultProjectName = 'Untitled' } = {}) {
        if (!data || typeof data !== 'object') fail('Unrecognised link.');
        if (data.v !== LINK_VERSION) fail(data.v > LINK_VERSION ? 'This link was made by a newer version of Protogames.' : 'Unrecognised link.');
        if (!Number.isInteger(data.f) || data.f < 0) fail('Unrecognised link.');
        if (!Array.isArray(data.k) || !data.k.every((c) => typeof c === 'string' && HEX_COLOR.test(c))) fail('The link has invalid colours.');
        if (typeof data.t !== 'string') fail('The link has no tiles.');
        const tiles = data.t ? data.t.split('.') : [];
        if (tiles.length !== polygons.length) fail('Board size mismatch.');
        const result = polygons.map((polygon, i) => {
            const color = data.k[parseInt(tiles[i], 36)];
            if (color === undefined) fail('The link refers to a colour it does not contain.');
            return { ...polygon, color };
        });
        const objects = Array.isArray(data.ob) ? data.ob : [];
        if (!objects.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 200)) fail('The link has invalid items.');
        const placed = typeof data.o === 'string' && data.o ? data.o.split('.') : [];
        for (const entry of placed) {
            const [tile, object] = entry.split(':');
            const target = result[parseInt(tile, 36)];
            const id = objects[parseInt(object, 36)];
            if (!target || !id) fail('The link places an item on a tile that does not exist.');
            target.object = id;
        }
        const paletteId = typeof data.p === 'string' ? data.p : '';
        return {
            version: data.f,
            projectName: typeof data.n === 'string' && data.n ? data.n : defaultProjectName,
            appState: {
                boardConfig: boardConfigFrom(data.c),
                currentColor: data.k[0] || '#ffffff',
                paletteId,
                isEraserActive: false,
                autoSaveEnabled: true,
                polygons: result
            }
        };
    }

    // ---- Pure: base64url and addresses ---------------------------------------------------------

    function toBase64Url(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function fromBase64Url(text) {
        const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(base64 + '==='.slice((base64.length + 3) % 4));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    /** The encoded board in an address hash ("#b=..."), or null. */
    function hashPayload(hash) {
        const match = HASH_PATTERN.exec(hash || '');
        return match ? match[1] : null;
    }

    function urlFor(baseUrl, encoded) {
        return `${baseUrl.split('#')[0]}#b=${encoded}`;
    }

    /** How risky a link of this many characters is to paste around: 'ok', 'long' or 'veryLong'. */
    function sizeLevel(length) {
        if (length > VERY_LONG_LINK) return 'veryLong';
        return length > LONG_LINK ? 'long' : 'ok';
    }

    const SIZE_WARNINGS = {
        long: 'Long link: some chat or email apps may cut it off. Sharing the project file is safer.',
        veryLong: 'This link is likely to break when pasted into chats or email. Share the project file instead.'
    };

    function describeLength(length) {
        return `${length > 1024 ? `${(length / 1024).toFixed(1)} KB` : `${length} characters`} link`;
    }

    // ---- Compression (browser: CompressionStream) ------------------------------------------------

    async function pipe(bytes, stream) {
        const buffer = await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer();
        return new Uint8Array(buffer);
    }

    async function encode(data) {
        const json = new TextEncoder().encode(JSON.stringify(data));
        return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
    }

    async function decode(text) {
        const bytes = await pipe(fromBase64Url(text), new DecompressionStream('deflate-raw'));
        return JSON.parse(new TextDecoder().decode(bytes));
    }

    // ---- Browser glue ------------------------------------------------------------------------------------

    const $ = (id) => document.getElementById(id);
    let currentUrl = '';

    function currentPayload() {
        const state = AppState.getState();
        return pack({
            projectName: state.currentProjectName || '',
            boardConfig: state.boardConfig,
            paletteId: state.currentPaletteId,
            polygons: state.polygons,
            formatVersion: ProjectFormat.CURRENT_VERSION
        });
    }

    function usesCustomContent(state) {
        const builtIn = Config.COLOR_PALETTES.some((p) => p.id === state.currentPaletteId);
        const customObject = state.polygons.some((p) => p.object && String(p.object).includes(':'));
        return !builtIn || customObject;
    }

    function closeDialog() {
        $('shareDialog')?.classList.add('hidden');
    }

    async function openDialog() {
        const state = AppState.getState();
        if (!state.polygons.length) {
            UI.showNotification('Generate a board before sharing.');
            return;
        }
        try {
            currentUrl = urlFor(location.href, await encode(currentPayload()));
        } catch (error) {
            UI.showNotification(`Could not create link: ${error.message}`);
            return;
        }
        $('shareUrl').value = currentUrl;
        $('shareSize').textContent = describeLength(currentUrl.length);
        $('shareNote').textContent = usesCustomContent(state)
            ? 'Uses a custom theme or item set; others will see flat colours or missing items unless they import it too.'
            : '';
        // The link always stays copyable; a long one just comes with a warning and a file download.
        const level = sizeLevel(currentUrl.length);
        const warning = $('shareWarning');
        warning.textContent = SIZE_WARNINGS[level] || '';
        warning.hidden = level === 'ok';
        warning.dataset.level = level;
        $('shareDownload').hidden = level === 'ok';
        $('shareDownload').classList.toggle('primary-button', level === 'veryLong');
        $('shareDownload').classList.toggle('secondary-button', level !== 'veryLong');
        $('shareCopy').textContent = 'Copy';
        $('shareDialog').classList.remove('hidden');
        $('shareUrl').focus();
        $('shareUrl').select();
    }

    async function copyLink() {
        let copied = false;
        try {
            await navigator.clipboard.writeText(currentUrl);
            copied = true;
        } catch (error) {
            const input = $('shareUrl');
            input.focus();
            input.select();
            try { copied = document.execCommand('copy'); } catch (fallbackError) { /* not allowed */ }
        }
        $('shareCopy').textContent = copied ? 'Copied' : 'Press Ctrl+C';
    }

    /** Opens the board in the address, if there is one. Returns true when a link was handled. */
    async function openFromHash() {
        const payload = hashPayload(location.hash);
        if (!payload) return false;
        try {
            const data = await decode(payload);
            if (!data || typeof data !== 'object') fail('Unrecognised link.');
            const config = boardConfigFrom(data.c);
            const polygons = Geometry.generateGrid(config, AppState.getState().canvas, null);
            if (polygons.length > MAX_TILES) fail('The board in the link is too large.');
            const project = ProjectFormat.parse(unpack(data, polygons, { defaultProjectName: Config.DEFAULT_PROJECT_NAME }));
            document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach((modal) => modal.remove());
            FileManager.restoreState(project, { skipNotification: true });
            try { ViewControls.fit(); } catch (error) { /* view not ready */ }
            UI.showNotification('Shared board opened', 3500);
        } catch (error) {
            console.error('Share link error:', error);
            UI.showNotification(`Could not open the shared link: ${error.message}`, 5000);
        }
        try { history.replaceState(null, '', location.pathname + location.search); } catch (error) { /* sandboxed frame */ }
        return true;
    }

    function init() {
        $('shareButton')?.addEventListener('click', openDialog);
        $('shareCopy')?.addEventListener('click', copyLink);
        $('shareClose')?.addEventListener('click', closeDialog);
        $('shareDownload')?.addEventListener('click', () => { closeDialog(); FileManager.saveProjectFile(); });
        $('shareUrl')?.addEventListener('focus', (event) => event.target.select());
        const backdrop = $('shareDialog');
        backdrop?.addEventListener('pointerdown', (event) => { if (event.target === backdrop) closeDialog(); });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && backdrop && !backdrop.classList.contains('hidden')) closeDialog();
        });
        // A link pasted into an already open tab changes only the hash.
        window.addEventListener('hashchange', () => { if (hashPayload(location.hash)) openFromHash(); });
    }

    return {
        LINK_VERSION,
        pack,
        unpack,
        toBase64Url,
        fromBase64Url,
        hashPayload,
        urlFor,
        LONG_LINK,
        VERY_LONG_LINK,
        sizeLevel,
        describeLength,
        encode,
        decode,
        hasLink: () => hashPayload(typeof location !== 'undefined' ? location.hash : '') !== null,
        openFromHash,
        init
    };
})();
