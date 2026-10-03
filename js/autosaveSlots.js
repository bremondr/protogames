/**
 * PROTOGAMES AUTOSAVE SLOTS
 * --------------------------------------------------------------
 * localStorage is shared by every tab of the site, so one autosave key would let a tab
 * overwrite another tab's recovery copy (opening a share link in a new tab is enough).
 * Instead every tab writes its own slot, `protogames_autosave:<tab id>`, and never
 * touches anyone else's.
 *
 *  - The tab id lives in sessionStorage: it survives a reload of the tab but is not
 *    shared with other tabs.
 *  - A tab holds a Web Lock named after its id for as long as it is open, so other tabs
 *    can tell a live slot from an orphan (the tab crashed or was closed).
 *  - On start-up a tab offers its own slot (reload), otherwise the newest orphan,
 *    including the single key older versions used (`protogames_autosave`).
 *  - Old orphans are cleaned up.
 *
 * The payload inside a slot is unchanged (see ProjectFormat), only the key differs. The
 * choice of slot is a pure function (unit-tested); the rest needs the browser.
 */
const AutosaveSlots = (() => {
    const LEGACY_KEY = Config.AUTO_SAVE_KEY;
    const PREFIX = `${LEGACY_KEY}:`;
    const LEGACY_ID = 'legacy';
    const TAB_ID_KEY = 'protogames_tab_id';
    const LOCK_PREFIX = 'protogames-tab:';
    const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
    const MAX_ORPHANS = 5;

    // ---- Pure: which slot to offer, which to delete ------------------------------------------------------

    /**
     * entries: [{ key, id, timestamp, valid }] for every slot in storage (`valid` false when
     * the stored text is not readable JSON). liveIds: ids of tabs that are open right now.
     * Returns { offer, remove }: the entry to offer for restoring (or null) and the keys to delete.
     * A live tab's slot, and the own slot, are never offered to others and never deleted.
     */
    function choose(entries, { ownId, liveIds = [], now = Date.now(), maxAgeMs = MAX_AGE_MS, maxOrphans = MAX_ORPHANS } = {}) {
        const live = new Set(liveIds);
        const own = entries.find((entry) => entry.id === ownId) || null;
        const orphans = entries
            .filter((entry) => entry.id !== ownId && !live.has(entry.id))
            .sort((a, b) => b.timestamp - a.timestamp);

        const remove = [];
        // Only a readable slot can be offered; the newest one wins.
        const offer = own || orphans.find((entry) => entry.valid) || null;

        let kept = 0;
        for (const entry of orphans) {
            if (entry === offer) continue;
            const tooOld = now - entry.timestamp > maxAgeMs;
            if (!entry.valid || tooOld || kept >= maxOrphans) remove.push(entry.key);
            else kept += 1;
        }
        return { offer, remove };
    }

    // ---- Browser glue ------------------------------------------------------------------------------------------

    let ownId = null;
    let liveSnapshot = [];

    const keyFor = (id) => (id === LEGACY_ID ? LEGACY_KEY : PREFIX + id);
    const idFrom = (key) => (key === LEGACY_KEY ? LEGACY_ID : key.slice(PREFIX.length));

    function newId() {
        try {
            if (crypto.randomUUID) return crypto.randomUUID();
        } catch (error) { /* not available */ }
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function storedTabId() {
        try { return sessionStorage.getItem(TAB_ID_KEY); } catch (error) { return null; }
    }

    function rememberTabId(id) {
        try { sessionStorage.setItem(TAB_ID_KEY, id); } catch (error) { /* private mode: reload then gets a new slot */ }
    }

    const hasLocks = () => typeof navigator !== 'undefined' && Boolean(navigator.locks && navigator.locks.request);

    /** Tries to hold the lock for `id` for the life of the tab. Resolves false when another tab already holds it. */
    function holdLock(id) {
        return new Promise((resolve) => {
            navigator.locks
                .request(LOCK_PREFIX + id, { ifAvailable: true }, (lock) => {
                    if (!lock) {
                        resolve(false);
                        return undefined;
                    }
                    resolve(true);
                    return new Promise(() => {}); // never settles: the lock is held until the tab closes
                })
                .catch(() => resolve(false));
        });
    }

    async function liveTabIds() {
        if (!hasLocks() || !navigator.locks.query) return [];
        try {
            const state = await navigator.locks.query();
            return (state.held || [])
                .map((lock) => lock.name)
                .filter((name) => name && name.startsWith(LOCK_PREFIX))
                .map((name) => name.slice(LOCK_PREFIX.length));
        } catch (error) {
            return [];
        }
    }

    /**
     * Gives this tab its id and lock and notes which other tabs are alive. Call once before
     * anything reads or writes an autosave. Without Web Locks (an insecure page, an old
     * browser) every other slot is treated as live: nothing of another tab is ever taken over
     * or deleted, which is safe but gives up recovering a crashed tab's work.
     */
    async function claim() {
        let id = storedTabId() || newId();
        if (hasLocks()) {
            // A duplicated tab inherits the id of the original; the lock tells them apart.
            if (!(await holdLock(id))) {
                id = newId();
                await holdLock(id);
            }
            liveSnapshot = (await liveTabIds()).filter((live) => live !== id);
        }
        ownId = id;
        rememberTabId(id);
        return id;
    }

    function ownKey() {
        return keyFor(ownId || 'unclaimed');
    }

    function readEntries() {
        const entries = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key !== LEGACY_KEY && !(key && key.startsWith(PREFIX))) continue;
            const raw = localStorage.getItem(key);
            let timestamp = 0;
            let valid = false;
            try {
                const parsed = JSON.parse(raw);
                valid = Boolean(parsed) && typeof parsed === 'object';
                timestamp = valid && Number.isFinite(parsed.timestamp) ? parsed.timestamp : 0;
            } catch (error) { /* corrupt */ }
            entries.push({ key, id: idFrom(key), timestamp, valid, raw });
        }
        return entries;
    }

    /**
     * Picks the slot to offer at start-up and deletes stale ones. Returns { key, raw, own } or
     * null. `own` is true for this tab's own slot (a reload) and false for an orphan being adopted.
     */
    function takeRestorable() {
        if (!window.localStorage || ownId === null) return null;
        try {
            const entries = readEntries();
            // Without Web Locks nothing can be proven orphaned, so only the own slot is offered.
            const liveIds = hasLocks() ? liveSnapshot : entries.filter((e) => e.id !== ownId && e.id !== LEGACY_ID).map((e) => e.id);
            const { offer, remove } = choose(entries, { ownId, liveIds });
            remove.forEach((key) => localStorage.removeItem(key));
            return offer ? { key: offer.key, raw: offer.raw, own: offer.id === ownId } : null;
        } catch (error) {
            console.error('Could not look for autosaved work.', error);
            return null;
        }
    }

    function remove(key) {
        try { localStorage.removeItem(key); } catch (error) { /* storage unavailable */ }
    }

    return { LEGACY_KEY, PREFIX, LEGACY_ID, MAX_AGE_MS, MAX_ORPHANS, choose, claim, ownKey, takeRestorable, remove };
})();
