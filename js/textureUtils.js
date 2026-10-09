/**
 * PROTOGAMES TEXTURE UTILITIES
 * Colour helpers and the blob-URL cache shared by the tile textures (textures.js) and the
 * map objects (objects.js).
 */
const TextureUtils = (() => {
    /** [r, g, b] of "#rrggbb" or "rgb(a)(r, g, b, ...)". */
    function rgb(c) {
        const m = /^rgba?\(([^)]+)\)/.exec(c);
        if (m) return m[1].split(',').slice(0, 3).map((v) => parseFloat(v));
        const n = parseInt(c.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    /** Lightens (amt > 0) or darkens (amt < 0) a colour; returns an rgba() string. */
    function shade(hex, amt, alpha = 1) {
        const [r, g, b] = rgb(hex);
        const f = (c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
        return `rgba(${f(r)},${f(g)},${f(b)},${alpha})`;
    }

    // Object URL (no ';' in it) so it can be interpolated into inline style strings.
    function toObjectUrl(dataUrl) {
        const [head, b64] = dataUrl.split(',');
        const bin = atob(b64), arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return URL.createObjectURL(new Blob([arr], { type: head.slice(5).split(';')[0] }));
    }

    /** A key -> object URL map whose entries are revoked when they are dropped. */
    function createUrlCache() {
        const urls = new Map();
        return {
            has: (key) => urls.has(key),
            get: (key) => urls.get(key),
            set: (key, url) => { urls.set(key, url); return url; },
            /** Forgets a cached object URL and frees the blob behind it. */
            drop(key) {
                const url = urls.get(key);
                if (url) URL.revokeObjectURL(url);
                urls.delete(key);
            }
        };
    }

    return { rgb, shade, toObjectUrl, createUrlCache };
})();
