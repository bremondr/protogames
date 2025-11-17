/**
 * Simple localStorage cache with LRU eviction.
 */
const TextureCache = (() => {
    const STORAGE_KEY = 'protogames_texture_cache';
    const MAX_ITEMS = TextureConfig.CACHE_MAX_ITEMS || 50;

    function loadCache() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (_e) {
            return {};
        }
    }

    function saveCache(cache) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
        } catch (_e) {
            /* ignore quota errors */
        }
    }

    function getCacheEntries(cache) {
        return Object.entries(cache)
            .map(([k, v]) => ({ key: k, ...v }))
            .sort((a, b) => b.lastAccessed - a.lastAccessed);
    }

    function evictIfNeeded(cache) {
        const entries = getCacheEntries(cache);
        if (entries.length <= MAX_ITEMS) return cache;
        const trimmed = entries.slice(0, MAX_ITEMS);
        const next = {};
        trimmed.forEach((entry) => {
            next[entry.key] = {
                data: entry.data,
                created: entry.created,
                lastAccessed: entry.lastAccessed
            };
        });
        return next;
    }

    function get(key) {
        const cache = loadCache();
        if (!cache[key]) return null;
        cache[key].lastAccessed = Date.now();
        saveCache(cache);
        return cache[key].data;
    }

    function set(key, data) {
        const cache = loadCache();
        cache[key] = {
            data,
            created: Date.now(),
            lastAccessed: Date.now()
        };
        const trimmed = evictIfNeeded(cache);
        saveCache(trimmed);
    }

    function clear() {
        localStorage.removeItem(STORAGE_KEY);
    }

    function stats() {
        const cache = loadCache();
        const entries = getCacheEntries(cache);
        return {
            count: entries.length,
            max: MAX_ITEMS
        };
    }

    return {
        get,
        set,
        clear,
        stats
    };
})();
