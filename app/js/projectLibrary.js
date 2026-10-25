/**
 * PROTOGAMES PROJECT LIBRARY
 * --------------------------------------------------------------
 * The projects a person keeps in this browser. Every project is its own localStorage entry,
 * `protogames_project:<id>`, holding the same payload the autosave always had (see ProjectFormat),
 * so any number of projects can be open in different tabs and none can overwrite another.
 *
 * Plain script with no dependencies: the landing page lists the projects with it too (both pages
 * share one origin, so they share the storage).
 *
 * Older versions kept one autosave per tab, `protogames_autosave:<tab id>` (and `protogames_autosave`
 * before that). importLegacy() turns each of them into a project, once.
 */
const ProjectLibrary = (() => {
    const KEY_PREFIX = 'protogames_project:';
    const LEGACY_KEY = 'protogames_autosave';
    const LEGACY_PREFIX = `${LEGACY_KEY}:`;
    const ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
    const MAX_NAME_LENGTH = 80;

    const isValidId = (id) => typeof id === 'string' && ID_PATTERN.test(id);
    const keyFor = (id) => KEY_PREFIX + id;

    /** The browser's storage, or null when it is blocked (reading window.localStorage can throw). */
    function storage() {
        try { return globalThis.localStorage || null; } catch (error) { return null; }
    }

    function newId() {
        try {
            if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
        } catch (error) { /* not available */ }
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }

    /** A name a person typed, tidied: whitespace collapsed, cut to a sensible length. Empty when nothing is left. */
    function cleanName(text) {
        return Array.from(String(text == null ? '' : text).replace(/\s+/g, ' ').trim()).slice(0, MAX_NAME_LENGTH).join('');
    }

    /** A saved time that can be believed: from the past up to a day ahead (clocks differ), else 0 for "never saved". */
    function cleanTimestamp(value, now = Date.now()) {
        return Number.isFinite(value) && value >= 0 && value <= now + 24 * 60 * 60 * 1000 ? value : 0;
    }

    /**
     * What a stored payload says about itself, without validating it (the editor does that when it opens it).
     * Returns null when the text is not a project at all.
     */
    function summarize(raw) {
        let parsed;
        try { parsed = JSON.parse(raw); } catch (error) { return null; }
        if (!parsed || typeof parsed !== 'object' || !parsed.appState || typeof parsed.appState !== 'object') return null;
        const config = parsed.appState.boardConfig && typeof parsed.appState.boardConfig === 'object' ? parsed.appState.boardConfig : {};
        return {
            name: cleanName(parsed.projectName) || 'Untitled project',
            timestamp: cleanTimestamp(parsed.timestamp),
            tiles: Array.isArray(parsed.appState.polygons) ? parsed.appState.polygons.length : 0,
            boardShape: typeof config.boardShape === 'string' ? config.boardShape : '',
            gridType: typeof config.gridType === 'string' ? config.gridType : ''
        };
    }

    /** Every project in the browser, newest edit first. An unreadable entry is listed too (`readable: false`) so it can be deleted. */
    function list() {
        const store = storage();
        if (!store) return [];
        const entries = [];
        try {
            for (let i = 0; i < store.length; i++) {
                const key = store.key(i);
                if (!key || !key.startsWith(KEY_PREFIX)) continue;
                const id = key.slice(KEY_PREFIX.length);
                if (!isValidId(id)) continue;
                const summary = summarize(store.getItem(key));
                entries.push(summary
                    ? { id, readable: true, ...summary }
                    : { id, readable: false, name: 'Unreadable project', timestamp: 0, tiles: 0, boardShape: '', gridType: '' });
            }
        } catch (error) {
            return entries;
        }
        return entries.sort((a, b) => b.timestamp - a.timestamp || (a.id < b.id ? -1 : 1));
    }

    const MINUTE = 60 * 1000;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;

    /** "Edited just now", "Edited 5 minutes ago", "Edited yesterday", "Edited 3 days ago"; an old one becomes its date. */
    function describeAge(timestamp, now) {
        timestamp = cleanTimestamp(timestamp, now);
        if (!timestamp) return 'Never saved';
        const age = Math.max(0, now - timestamp);
        const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
        if (age < MINUTE) return 'Edited just now';
        if (age < HOUR) return `Edited ${plural(Math.floor(age / MINUTE), 'minute')}`;
        if (age < DAY) return `Edited ${plural(Math.floor(age / HOUR), 'hour')}`;
        if (age < 2 * DAY) return 'Edited yesterday';
        if (age < 30 * DAY) return `Edited ${plural(Math.floor(age / DAY), 'day')}`;
        return `Edited ${new Date(timestamp).toISOString().slice(0, 10)}`;
    }

    const BOARD_NAMES = { hexagon: 'Hexagon', rectangle: 'Rectangle', triangle: 'Triangle', circle: 'Circle', infinite: 'Infinite', country: 'Country' };
    const TILE_NAMES = { hexagon: 'hexagon', square: 'square', triangle: 'triangle' };

    /** "Hexagon board, 91 hexagon tiles" for an entry of list(). */
    function describeBoard(entry) {
        if (!entry.readable) return 'This project cannot be read';
        const board = BOARD_NAMES[entry.boardShape];
        const tile = TILE_NAMES[entry.gridType] ? `${TILE_NAMES[entry.gridType]} tile` : 'tile';
        const tiles = `${entry.tiles} ${tile}${entry.tiles === 1 ? '' : 's'}`;
        return board ? `${board} board, ${tiles}` : tiles;
    }

    /** The stored text of a project, or null. */
    function read(id) {
        const store = storage();
        if (!store || !isValidId(id)) return null;
        try { return store.getItem(keyFor(id)); } catch (error) { return null; }
    }

    /** Like read(), but a storage that cannot be read throws instead of looking like a project that is not there. */
    function readStrict(id) {
        const store = storage();
        if (!store) throw new Error('This browser does not allow storing projects.');
        if (!isValidId(id)) return null;
        return store.getItem(keyFor(id));
    }

    /**
     * Stores a payload and returns the text stored. Throws (a QuotaExceededError when the storage is full) so the
     * caller can tell the person.
     */
    function write(id, payload) {
        if (!isValidId(id)) throw new Error(`Not a project id: ${id}`);
        const store = storage();
        if (!store) throw new Error('This browser does not allow storing projects.');
        const text = JSON.stringify(payload);
        store.setItem(keyFor(id), text);
        return text;
    }

    function remove(id) {
        const store = storage();
        if (!store || !isValidId(id)) return;
        try { store.removeItem(keyFor(id)); } catch (error) { /* storage unavailable */ }
    }

    /**
     * Turns the per-tab autosaves of older versions into projects and deletes them. The project id is made from
     * the old key, so doing it again (another tab, a reload) finds the project and does nothing twice. An autosave
     * newer than the project it was imported into replaces it; one that cannot be copied (storage full) stays where
     * it is, and `onProblem` is told how many. Returns how many projects were created or brought up to date.
     */
    function importLegacy(onProblem) {
        const store = storage();
        if (!store) return 0;
        let recovered = 0;
        let problems = 0;
        try {
            const keys = [];
            for (let i = 0; i < store.length; i++) {
                const key = store.key(i);
                if (key && (key === LEGACY_KEY || key.startsWith(LEGACY_PREFIX))) keys.push(key);
            }
            for (const key of keys) {
                try {
                    const raw = store.getItem(key);
                    const summary = summarize(raw);
                    if (summary) {
                        const slot = key === LEGACY_KEY ? 'legacy' : key.slice(LEGACY_PREFIX.length);
                        const id = `recovered-${slot.replace(/[^A-Za-z0-9_-]/g, '')}`.slice(0, 64);
                        if (isValidId(id)) {
                            const existing = store.getItem(keyFor(id));
                            const known = existing === null ? null : summarize(existing);
                            // Copied when there is no project yet, or the autosave is newer than the unreadable or older one.
                            if (existing === null || !known || summary.timestamp > known.timestamp) {
                                store.setItem(keyFor(id), raw);
                                recovered += 1;
                            }
                        }
                    }
                    // An unreadable slot is dropped, as the old cleanup did; a readable one is now a project.
                    store.removeItem(key);
                } catch (error) {
                    // The copy failed: the original is the only one left, so it stays.
                    problems += 1;
                    console.error('Could not import an autosave of an older version.', error);
                }
            }
        } catch (error) {
            console.error('Could not import the autosaves of an older version.', error);
        }
        if (problems && onProblem) onProblem(problems);
        return recovered;
    }

    return { KEY_PREFIX, MAX_NAME_LENGTH, isValidId, newId, cleanName, summarize, cleanTimestamp, list, read, readStrict, write, remove, importLegacy, describeAge, describeBoard };
})();
