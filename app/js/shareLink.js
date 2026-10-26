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
    /**
     * Version of the link payload (not the project file format). 2 added infinite boards, 3 country
     * boards, 4 players and start markers and 5 the board generator of circle boards (key `g`); links without
     * any of these are still written as version 1 so older apps can open them.
     */
    const LINK_VERSION = 5;
    const GENERATOR_LINK_VERSION = 5;
    const PLAYER_LINK_VERSION = 4;
    // First project file format that has players and dice; links made before it get them from the migration.
    const FORMAT_WITH_PLAYERS = 6;
    const SEATS = ['bottom', 'top', 'left', 'right'];
    const MAX_PLAYERS = 8;
    const PIECE_KINDS = ['pawn', 'disc', 'cube', 'meeple'];
    // A country board is cut from a rectangle up to this wide and (derived from the outline) this tall.
    const COUNTRY_MAX_ACROSS = 120;
    const COUNTRY_MAX_SPAN = 201;
    // The link version a board shape needs. Circle boards carry their generator (`g`); a circle link without it is
    // still valid (generator 1), so unlike the others the shape does not require its version when reading.
    const LINK_VERSION_FOR_SHAPE = { infinite: 2, country: 3, circle: GENERATOR_LINK_VERSION };
    const SHAPES_REQUIRING_VERSION = ['infinite', 'country'];
    const MAX_TILES = 20000;
    // The same caps as the project file validator, which owns them.
    const MAX_DIMENSION = ProjectFormat.MAX_BOARD_DIMENSION;
    // A link for the biggest board (20000 tiles) inflates to well under 1 MB; this leaves room and stops bombs.
    const MAX_INFLATED_BYTES = 2 * 1024 * 1024;
    const HASH_PATTERN = /[#&]b=([A-Za-z0-9_-]+)/;
    // Project files accept #rgb too; links carry only the long form, so either is accepted on the way in.
    const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
    // A side of a board may be as wide as a radius-100 hexagon board.
    const MAX_SPAN = ProjectFormat.MAX_BOARD_SPAN;
    // Rules of thumb for the apps a link gets pasted into (chat, email); browsers themselves take far more.
    const LONG_LINK = 2000;
    const VERY_LONG_LINK = 8000;

    // ---- Pure: payload -------------------------------------------------------------------------

    /** "#RGB" or "#RRGGBB" in any case as lower-case "#rrggbb"; anything else is only lower-cased (and refused later). */
    function normalizeHex(value) {
        const text = String(value || '').toLowerCase();
        const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
        return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : text;
    }

    /**
     * Compact payload for a board: { v, f, n, c, p, k, t, ob, o }
     *  k = distinct colours, t = per-tile colour index (base 36, dot separated),
     *  ob = distinct object ids, o = "tileIndex:objectIndex" pairs.
     * g = the board generator version, for circle boards only (see the specification, "Generator versions").
     * Only when the design has them: pl = players as [colour, seat, [[kind, count], ...]],
     *  sc = distinct start colours, s = "tileIndex:colourIndex" pairs of start markers.
     * The dice set is not carried: every design has the standard set until it can be edited.
     */
    function pack({ projectName, boardConfig: fullConfig, paletteId, polygons, formatVersion, players }) {
        // The generator travels as `g` and only for circle boards; every other board stays readable by older apps.
        const { generator, ...boardConfig } = fullConfig || {};
        const isCircle = boardConfig.boardShape === 'circle';
        const colors = [];
        const colorIndex = new Map();
        const tiles = polygons.map((polygon) => {
            const color = normalizeHex(polygon.color);
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
        const startColors = [];
        const startIndex = new Map();
        const starts = [];
        polygons.forEach((polygon, index) => {
            if (!polygon.start) return;
            const color = normalizeHex(polygon.start);
            if (!startIndex.has(color)) {
                startIndex.set(color, startColors.length);
                startColors.push(color);
            }
            starts.push(`${index.toString(36)}:${startIndex.get(color).toString(36)}`);
        });
        const playerList = Array.isArray(players) ? players : [];
        const hasPlayers = playerList.length > 0 || starts.length > 0;
        return {
            v: Math.max(LINK_VERSION_FOR_SHAPE[boardConfig && boardConfig.boardShape] || 1, hasPlayers ? PLAYER_LINK_VERSION : 1),
            f: formatVersion,
            n: projectName || '',
            c: fullConfig ? boardConfig : fullConfig,
            p: paletteId,
            k: colors,
            t: tiles.join('.'),
            ob: objects,
            o: placed.join('.'),
            ...(playerList.length
                ? { pl: playerList.map((p) => [normalizeHex(p.color), p.seat, (p.pieces || []).map((e) => [e.kind, e.count])]) }
                : {}),
            ...(starts.length ? { sc: startColors, s: starts.join('.') } : {}),
            ...(isCircle ? { g: Number.isInteger(generator) && generator >= 1 ? generator : Config.GENERATOR_VERSION } : {}),
            ...(boardConfig && boardConfig.boardShape === 'infinite' ? { i: polygons.map((p) => p.id).join('.') } : {})
        };
    }

    function fail(message) {
        throw new Error(message);
    }

    /** The generator version a payload's board was made with: `g`, or generator 1 for a circle link that has none. */
    function generatorOf(data) {
        if (data.g !== undefined) return data.g;
        return data.c && data.c.boardShape === 'circle' ? 1 : Config.GENERATOR_VERSION;
    }

    function boardConfigFrom(raw, generator = Config.GENERATOR_VERSION) {
        if (!raw || typeof raw !== 'object') fail('The link has no board settings.');
        // The generator never comes from the settings themselves, only from the link's `g`.
        const config = { ...raw, generator };
        const limit = (key) => {
            if (key === 'radius' || key === 'size') return MAX_DIMENSION;
            if (config.boardShape === 'country') return key === 'width' ? COUNTRY_MAX_ACROSS : COUNTRY_MAX_SPAN;
            // Hexagon and circle boards are 2 * radius + 1 or 2 wide, so a width or height reaches past 100.
            return MAX_SPAN;
        };
        for (const key of ['width', 'height', 'radius', 'size']) {
            if (config[key] === undefined) continue;
            if (!Number.isInteger(config[key]) || config[key] < 1 || config[key] > limit(key)) fail(`The board ${key} in the link is out of range.`);
        }
        return config;
    }

    /** The cheap checks on a payload's version fields, so a bad link is refused before any board is built. */
    function checkEnvelope(data) {
        if (!data || typeof data !== 'object') fail('Unrecognised link.');
        // The type comes first: "3" > 2 is true in JavaScript and would claim a newer version.
        if (!Number.isInteger(data.v) || data.v < 1) fail('Unrecognised link.');
        if (data.v > LINK_VERSION) fail('This link was made by a newer version of Protogames.');
        if (!Number.isInteger(data.f) || data.f < 0) fail('Unrecognised link.');
        const needs = data.c && SHAPES_REQUIRING_VERSION.includes(data.c.boardShape) && LINK_VERSION_FOR_SHAPE[data.c.boardShape];
        if (needs && data.v < needs) fail('Unrecognised link.');
        if (data.g !== undefined) {
            if (!Number.isInteger(data.g) || data.g < 1 || data.v < GENERATOR_LINK_VERSION) fail('Unrecognised link.');
            if (data.g > Config.GENERATOR_VERSION) fail('This link was made by a newer version of Protogames (a newer board generator).');
        }
        if ((data.pl !== undefined || data.sc !== undefined || data.s !== undefined) && data.v < PLAYER_LINK_VERSION) fail('Unrecognised link.');
    }

    /** Rough tile count of a board's settings, high enough never to undercount (the exact check follows the build). */
    function estimateTiles(config) {
        const number = (key, fallback) => (Number.isFinite(config[key]) ? config[key] : fallback);
        let cells;
        if (config.boardShape === 'hexagon' || config.boardShape === 'circle') cells = (2 * number('radius', 5) + 2) ** 2;
        else if (config.boardShape === 'square' || config.boardShape === 'triangle') cells = number('size', 10) ** 2;
        else cells = number('width', 11) * number('height', 11);
        return config.gridType === 'triangle' && config.boardShape !== 'triangle' ? cells * 6 : cells;
    }

    /**
     * Rebuilds a project-shaped object from a payload and freshly generated, blank tiles
     * (the tile order of a generated board is fixed by its settings). Throws on anything
     * unexpected; the result still has to go through ProjectFormat.parse.
     */
    function unpack(data, polygons, { defaultProjectName = 'Untitled' } = {}) {
        checkEnvelope(data);
        if (!Array.isArray(data.k) || !data.k.every((c) => typeof c === 'string' && HEX_COLOR.test(c))) fail('The link has invalid colours.');
        if (typeof data.t !== 'string') fail('The link has no tiles.');
        const tiles = data.t ? data.t.split('.') : [];
        if (tiles.length !== polygons.length) {
            fail(data.c && data.c.boardShape === 'circle'
                ? 'This link does not match the board this version of Protogames generates (it was made with a different board generator).'
                : 'Board size mismatch.');
        }
        const result = polygons.map((polygon, i) => {
            const color = data.k[parseInt(tiles[i], 36)];
            if (color === undefined) fail('The link refers to a colour it does not contain.');
            return { ...polygon, color: normalizeHex(color) };
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
        startsFrom(data, result);
        const players = playersFrom(data.pl);
        const paletteId = typeof data.p === 'string' ? data.p : '';
        return {
            version: data.f,
            projectName: typeof data.n === 'string' && data.n ? data.n : defaultProjectName,
            appState: {
                boardConfig: boardConfigFrom(data.c, generatorOf(data)),
                currentColor: data.k[0] ? normalizeHex(data.k[0]) : '#ffffff',
                paletteId,
                isEraserActive: false,
                autoSaveEnabled: true,
                polygons: result,
                // Links of the format that has them carry players; the standard dice are implied (see pack).
                ...(data.f >= FORMAT_WITH_PLAYERS ? { players, dice: standardDice() } : {})
            }
        };
    }

    /** The dice every design starts with: a copy, so nothing shared can be changed by accident. */
    function standardDice() {
        return Config.STANDARD_DICE.map((die) => ({ sides: die.sides }));
    }

    /** Puts the start markers of a payload onto the (already built) tiles. */
    function startsFrom(data, tiles) {
        if (data.sc === undefined && data.s === undefined) return 0;
        if (!Array.isArray(data.sc) || !data.sc.every((c) => typeof c === 'string' && HEX_COLOR.test(c))) fail('The link has invalid start colours.');
        const entries = typeof data.s === 'string' && data.s ? data.s.split('.') : [];
        for (const entry of entries) {
            const [tile, color] = entry.split(':');
            const target = tiles[parseInt(tile, 36)];
            const hex = data.sc[parseInt(color, 36)];
            if (!target || !hex) fail('The link places a start marker on a tile that does not exist.');
            target.start = normalizeHex(hex);
        }
        return entries.length;
    }

    /** The players of a payload, checked for shape only; ProjectFormat.parse checks what they mean. */
    function playersFrom(raw) {
        if (raw === undefined) return [];
        if (!Array.isArray(raw) || raw.length > MAX_PLAYERS) fail('The link has invalid players.');
        return raw.map((entry) => {
            if (!Array.isArray(entry) || entry.length !== 3) fail('The link has invalid players.');
            const [color, seat, pieces] = entry;
            if (typeof color !== 'string' || !HEX_COLOR.test(color) || !SEATS.includes(seat) || !Array.isArray(pieces) || pieces.length > PIECE_KINDS.length) {
                fail('The link has invalid players.');
            }
            return {
                color: normalizeHex(color),
                seat,
                pieces: pieces.map((piece) => {
                    if (!Array.isArray(piece) || piece.length !== 2 || !PIECE_KINDS.includes(piece[0]) || !Number.isInteger(piece[1])) fail('The link has invalid pieces.');
                    return { kind: piece[0], count: piece[1] };
                })
            };
        });
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
        // Only the page itself: the sender's query (?project=<id>, ?showcase=...) means nothing to the recipient.
        return `${baseUrl.split('#')[0].split('?')[0]}#b=${encoded}`;
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

    /**
     * Inflates a stream but gives up once the output passes `limit` bytes: a few kilobytes of
     * deflate can expand to gigabytes, so the size must be checked while reading, not after.
     */
    async function inflate(bytes, limit) {
        const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
        const chunks = [];
        let total = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.length;
            if (total > limit) {
                await reader.cancel().catch(() => {});
                fail('The link is too large to open.');
            }
            chunks.push(value);
        }
        const out = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
        return out;
    }

    async function decode(text) {
        return JSON.parse(new TextDecoder().decode(await inflate(fromBase64Url(text), MAX_INFLATED_BYTES)));
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
            polygons: Infinite.isActive() ? Infinite.paintedTiles(state.polygons) : state.polygons,
            formatVersion: ProjectFormat.CURRENT_VERSION,
            players: state.players
        });
    }

    /**
     * Why a board cannot be shared as a link, or '' when it can: the same limits openFromHash applies, so the
     * dialog never shows a link that the recipient (or this tab) would refuse.
     */
    function shareProblem(config, tileCount) {
        const tooBig = tileCount > MAX_TILES || (config.boardShape !== 'infinite' && estimateTiles(config) > MAX_TILES * 8);
        return tooBig ? `This board has too many tiles for a link (at most ${MAX_TILES}). Save the project file to share it.` : '';
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
        const painted = Infinite.isActive() ? Infinite.paintedTiles(state.polygons) : state.polygons;
        const problem = shareProblem(state.boardConfig, painted.length);
        if (problem) {
            UI.showNotification(problem, 6000);
            return;
        }
        try {
            currentUrl = urlFor(location.origin && location.origin !== 'null' ? location.origin + location.pathname : location.href, await encode(currentPayload()));
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

    /**
     * Clears the way for the new board. Dialogs made on the fly (prompts, confirmations) are removed;
     * the ones that live in index.html (print, share, theme editor) are only hidden, because
     * removing them would break those features until the page is reloaded.
     */
    function dismissModals() {
        document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach((modal) => {
            if (modal.id) modal.classList.add('hidden'); else modal.remove();
        });
    }

    /** Opens the board in the address, if there is one. Returns true when a link was handled, false when there is none or it failed. */
    /** Waits (a few seconds at most) for the country outlines a link needs; refuses the link if they cannot be had. */
    async function outlinesFor(config) {
        if (typeof CountryBoard === 'undefined') fail('This link needs the country outlines, which are not available here.');
        const ok = await Promise.race([CountryBoard.ready(), new Promise((resolve) => setTimeout(() => resolve(false), 8000))]);
        if (!ok) fail(`The outlines of ${config.country || 'the country'} could not be downloaded. Check the connection and open the link again.`);
    }

    async function openFromHash() {
        const payload = hashPayload(location.hash);
        if (!payload) return false;
        // Forgotten before decoding: a link that crashes the tab must not be opened again by the reload.
        forgetHash();
        try {
            const data = await decode(payload);
            checkEnvelope(data);
            const config = boardConfigFrom(data.c, generatorOf(data));
            // An infinite board has no fixed tile list: its tiles are named in the link and rebuilt from their ids.
            let polygons;
            if (config.boardShape === 'infinite') {
                const ids = String(data.i || '').split('.').filter(Boolean);
                if (ids.length > MAX_TILES) fail('The board in the link is too large.');
                polygons = ids.map((id) => Infinite.fromId(id)).filter(Boolean);
            } else {
                // Checked before the grid is generated: the settings alone can ask for far more tiles than a board may have.
                if (estimateTiles(config) > MAX_TILES * 8) fail('The board in the link is too large.');
                // A country board is cut to an outline that has to be downloaded the first time.
                if (config.boardShape === 'country') await outlinesFor(config);
                polygons = Geometry.generateGrid(config, AppState.getState().canvas, null);
            }
            if (polygons.length > MAX_TILES) fail('The board in the link is too large.');
            const project = ProjectFormat.parse(unpack(data, polygons, { defaultProjectName: Config.DEFAULT_PROJECT_NAME }));
            dismissModals();
            // A shared board becomes a project of its own; the open project (if any) is saved and stays as it was.
            FileManager.showAsNewProject(() => FileManager.restoreState(project, { skipNotification: true }));
            try { ViewControls.fit(); } catch (error) { /* view not ready */ }
            UI.showNotification('Shared board opened', 3500);
            return true;
        } catch (error) {
            console.error('Share link error:', error);
            UI.showNotification(`Could not open the shared link: ${error.message}`, 5000);
            return false;
        }
    }

    function forgetHash() {
        try { history.replaceState(null, '', location.pathname + location.search); } catch (error) { /* sandboxed frame */ }
    }

    /** A link pasted into an already open tab changes only the hash. It opens as a new project, so nothing is replaced. */
    function onHashChange() {
        if (!hashPayload(location.hash)) return;
        // The link opens as a new project and the open board is saved first; only when that save failed
        // does replacing the board lose work, and then the person is asked.
        FileManager.guardReplace(() => openFromHash(), forgetHash);
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
        window.addEventListener('hashchange', onHashChange);
    }

    return {
        LINK_VERSION,
        pack,
        unpack,
        shareProblem,
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
        onHashChange,
        init
    };
})();
