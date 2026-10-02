/**
 * PROTOGAMES OBJECTS
 * Placeable map objects (buildings, items, markers) drawn on top of terrain.
 * Each polygon stores an optional `object` id. Drawings share the terrain
 * illustration style: side-on view, upper-left light, soft ground shadow, thin outline.
 */
const Objects = (() => {
    const D = 128;          // design space
    const RES = 256;        // raster resolution
    const cache = new Map();
    const LINE = 'rgba(20,16,12,0.6)';

    function rgb(c) {
        const m = /^rgba?\(([^)]+)\)/.exec(c);
        if (m) return m[1].split(',').slice(0, 3).map((v) => parseFloat(v));
        const n = parseInt(c.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function shade(hex, amt, a = 1) {
        const [r, g, b] = rgb(hex);
        const f = (c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
        return `rgba(${f(r)},${f(g)},${f(b)},${a})`;
    }
    function shadow(ctx, x, y, w) {
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.beginPath(); ctx.ellipse(x + w * 0.25, y + 1, w, w * 0.26, 0, 0, Math.PI * 2); ctx.fill();
    }
    function stroke(ctx, lw = 1.4) { ctx.strokeStyle = LINE; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
    function poly(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
    // Front block with shaded right side (upper-left light)
    function block(ctx, x, y, w, h, col) {
        ctx.fillStyle = col; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = shade(col, -0.28); ctx.fillRect(x + w * 0.68, y, w * 0.32, h);
        ctx.fillStyle = shade(col, 0.25, 0.6); ctx.fillRect(x, y, w * 0.12, h);
        ctx.beginPath(); ctx.rect(x, y, w, h); stroke(ctx);
    }
    function crenels(ctx, x, y, w, col, n) {
        const cw = w / (n * 2 - 1);
        for (let i = 0; i < n; i++) block(ctx, x + i * cw * 2, y - cw * 0.9, cw, cw * 0.9, col);
    }
    function roofCone(ctx, cx, y, w, h, col) {
        poly(ctx, [[cx - w / 2, y], [cx, y - h], [cx + w / 2, y]]); ctx.fillStyle = col; ctx.fill();
        poly(ctx, [[cx, y - h], [cx + w / 2, y], [cx + w * 0.12, y]]); ctx.fillStyle = shade(col, -0.3); ctx.fill();
        poly(ctx, [[cx - w / 2, y], [cx, y - h], [cx + w / 2, y]]); stroke(ctx);
    }
    function win(ctx, x, y, w, h, lit = true) {
        ctx.fillStyle = lit ? '#f2c46a' : '#2b2420';
        ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + w / 2); ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
        stroke(ctx, 1);
    }

    const STONE = '#bdb5a6', ROOF = '#b5452e', WOOD = '#8a5a35', CANVAS = '#e7d9b8';
    const G = {
        castle(ctx) {
            shadow(ctx, 64, 104, 52);
            block(ctx, 34, 56, 60, 48, STONE);
            crenels(ctx, 34, 56, 60, STONE, 5);
            block(ctx, 16, 40, 22, 64, shade(STONE, 0.05));
            crenels(ctx, 16, 40, 22, STONE, 3);
            block(ctx, 90, 40, 22, 64, shade(STONE, -0.05));
            crenels(ctx, 90, 40, 22, STONE, 3);
            block(ctx, 52, 30, 24, 32, STONE);
            roofCone(ctx, 64, 30, 30, 22, ROOF);
            ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(64, 8); ctx.lineTo(64, -2); ctx.stroke();
            poly(ctx, [[64, -2], [76, 1], [64, 5]]); ctx.fillStyle = '#c62828'; ctx.fill();
            ctx.fillStyle = '#3b2a1e'; ctx.beginPath(); ctx.moveTo(56, 104); ctx.lineTo(56, 86); ctx.arc(64, 86, 8, Math.PI, 0); ctx.lineTo(72, 104); ctx.closePath(); ctx.fill(); stroke(ctx);
            win(ctx, 23, 56, 7, 10); win(ctx, 97, 56, 7, 10, false); win(ctx, 60, 40, 7, 10);
        },
        tower(ctx) {
            shadow(ctx, 64, 106, 26);
            block(ctx, 48, 36, 32, 70, STONE);
            ctx.strokeStyle = 'rgba(60,50,40,0.35)'; ctx.lineWidth = 1;
            for (let y = 46; y < 104; y += 10) { ctx.beginPath(); ctx.moveTo(48, y); ctx.lineTo(80, y); ctx.stroke(); }
            roofCone(ctx, 64, 38, 44, 32, '#3f5f8a');
            win(ctx, 59, 52, 9, 13); win(ctx, 59, 78, 9, 13, false);
        },
        house(ctx) {
            shadow(ctx, 64, 102, 40);
            block(ctx, 30, 62, 68, 40, '#efe3c8');
            poly(ctx, [[24, 64], [64, 30], [104, 64]]); ctx.fillStyle = ROOF; ctx.fill();
            poly(ctx, [[64, 30], [104, 64], [64, 64]]); ctx.fillStyle = shade(ROOF, -0.3); ctx.fill();
            poly(ctx, [[24, 64], [64, 30], [104, 64]]); stroke(ctx);
            block(ctx, 78, 30, 10, 20, '#9a8f84');
            ctx.fillStyle = '#5a3a24'; ctx.fillRect(56, 80, 14, 22); ctx.beginPath(); ctx.rect(56, 80, 14, 22); stroke(ctx);
            win(ctx, 38, 74, 11, 12); win(ctx, 80, 74, 11, 12);
        },
        windmill(ctx) {
            shadow(ctx, 64, 106, 30);
            poly(ctx, [[46, 106], [54, 44], [74, 44], [82, 106]]); ctx.fillStyle = '#e9dcc2'; ctx.fill();
            poly(ctx, [[66, 44], [74, 44], [82, 106], [70, 106]]); ctx.fillStyle = shade('#e9dcc2', -0.28); ctx.fill();
            poly(ctx, [[46, 106], [54, 44], [74, 44], [82, 106]]); stroke(ctx);
            roofCone(ctx, 64, 46, 28, 16, ROOF);
            ctx.fillStyle = '#5a3a24'; ctx.fillRect(58, 90, 11, 16);
            const cx = 64, cy = 40;
            for (let i = 0; i < 4; i++) {
                const a = Math.PI / 4 + i * Math.PI / 2;
                ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
                ctx.fillStyle = WOOD; ctx.fillRect(-1.5, 0, 3, 40);
                ctx.fillStyle = 'rgba(240,232,214,0.95)'; ctx.fillRect(2, 8, 10, 30);
                ctx.strokeStyle = 'rgba(120,90,60,0.6)'; ctx.lineWidth = 0.8;
                for (let k = 12; k < 38; k += 6) { ctx.beginPath(); ctx.moveTo(2, k); ctx.lineTo(12, k); ctx.stroke(); }
                ctx.beginPath(); ctx.rect(2, 8, 10, 30); stroke(ctx, 1);
                ctx.restore();
            }
            ctx.fillStyle = '#4a3020'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill(); stroke(ctx, 1);
        },
        ruins(ctx) {
            shadow(ctx, 64, 104, 48);
            poly(ctx, [[22, 104], [22, 60], [30, 56], [34, 66], [40, 60], [42, 104]]); ctx.fillStyle = STONE; ctx.fill(); stroke(ctx);
            ctx.fillStyle = shade(STONE, -0.28); ctx.fillRect(36, 64, 6, 40);
            poly(ctx, [[50, 104], [50, 74], [60, 70], [70, 78], [76, 72], [80, 104]]); ctx.fillStyle = shade(STONE, -0.05); ctx.fill(); stroke(ctx);
            ctx.fillStyle = '#3b2f28'; ctx.beginPath(); ctx.moveTo(58, 104); ctx.lineTo(58, 90); ctx.arc(64, 90, 6, Math.PI, 0); ctx.lineTo(70, 104); ctx.closePath(); ctx.fill();
            block(ctx, 88, 70, 12, 34, STONE);
            block(ctx, 85, 64, 18, 6, shade(STONE, 0.1));
            [[30, 106, 6], [44, 108, 4], [80, 108, 5], [104, 104, 6], [70, 110, 3]].forEach(([x, y, r]) => {
                poly(ctx, [[x - r, y], [x - r * 0.4, y - r], [x + r * 0.7, y - r * 0.6], [x + r, y]]); ctx.fillStyle = shade(STONE, -0.1); ctx.fill(); stroke(ctx, 1);
            });
            ctx.fillStyle = '#5f8a3a'; [[24, 60], [52, 74], [92, 66]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); });
        },
        camp(ctx) {
            shadow(ctx, 64, 102, 42);
            poly(ctx, [[22, 102], [64, 38], [106, 102]]); ctx.fillStyle = CANVAS; ctx.fill();
            poly(ctx, [[64, 38], [106, 102], [72, 102]]); ctx.fillStyle = shade(CANVAS, -0.3); ctx.fill();
            poly(ctx, [[54, 102], [64, 64], [74, 102]]); ctx.fillStyle = '#3a2a1e'; ctx.fill();
            poly(ctx, [[22, 102], [64, 38], [106, 102]]); stroke(ctx);
            ctx.strokeStyle = WOOD; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(64, 38); ctx.lineTo(64, 28); ctx.stroke();
            poly(ctx, [[64, 28], [76, 31], [64, 35]]); ctx.fillStyle = '#2f6fed'; ctx.fill();
        },
        treasure(ctx) {
            shadow(ctx, 64, 100, 34);
            block(ctx, 34, 66, 60, 34, WOOD);
            ctx.beginPath(); ctx.moveTo(34, 66); ctx.lineTo(34, 58); ctx.quadraticCurveTo(64, 38, 94, 58); ctx.lineTo(94, 66); ctx.closePath();
            ctx.fillStyle = shade(WOOD, 0.12); ctx.fill(); stroke(ctx);
            ctx.fillStyle = '#e0b43a';
            [40, 84].forEach((x) => { ctx.fillRect(x, 50, 5, 50); });
            ctx.fillRect(34, 64, 60, 4);
            ctx.fillRect(58, 64, 12, 14); ctx.fillStyle = '#3a2a1e'; ctx.fillRect(62, 69, 4, 6);
            ctx.beginPath(); ctx.rect(34, 64, 60, 4); stroke(ctx, 1);
            ctx.fillStyle = '#f2cc4a';
            [[24, 102], [30, 106], [100, 104], [106, 100]].forEach(([x, y]) => { ctx.beginPath(); ctx.ellipse(x, y, 4, 2.4, 0, 0, Math.PI * 2); ctx.fill(); stroke(ctx, 0.8); });
        },
        banner(ctx) {
            shadow(ctx, 58, 106, 14);
            ctx.fillStyle = WOOD; ctx.fillRect(54, 18, 4, 88); ctx.beginPath(); ctx.rect(54, 18, 4, 88); stroke(ctx, 1);
            ctx.fillStyle = '#e0b43a'; ctx.beginPath(); ctx.arc(56, 16, 4, 0, Math.PI * 2); ctx.fill(); stroke(ctx, 1);
            ctx.beginPath(); ctx.moveTo(58, 24); ctx.bezierCurveTo(74, 18, 84, 32, 100, 26); ctx.lineTo(96, 44); ctx.lineTo(100, 62); ctx.bezierCurveTo(84, 68, 74, 54, 58, 60); ctx.closePath();
            ctx.fillStyle = '#c62828'; ctx.fill();
            ctx.save(); ctx.clip(); ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(76, 0, 30, 80); ctx.restore();
            ctx.beginPath(); ctx.moveTo(58, 24); ctx.bezierCurveTo(74, 18, 84, 32, 100, 26); ctx.lineTo(96, 44); ctx.lineTo(100, 62); ctx.bezierCurveTo(84, 68, 74, 54, 58, 60); ctx.closePath(); stroke(ctx);
            ctx.fillStyle = '#f2cc4a'; poly(ctx, [[72, 34], [76, 42], [72, 50], [68, 42]]); ctx.fill();
        },
        campfire(ctx) {
            shadow(ctx, 64, 100, 30);
            const glow = ctx.createRadialGradient(64, 84, 2, 64, 84, 46);
            glow.addColorStop(0, 'rgba(255,170,60,0.5)'); glow.addColorStop(1, 'rgba(255,120,30,0)');
            ctx.fillStyle = glow; ctx.fillRect(0, 30, 128, 98);
            [[-0.35], [0.35]].forEach(([a]) => { ctx.save(); ctx.translate(64, 96); ctx.rotate(a); ctx.fillStyle = WOOD; ctx.fillRect(-26, -4, 52, 8); ctx.beginPath(); ctx.rect(-26, -4, 52, 8); stroke(ctx, 1); ctx.restore(); });
            [[64, 92, 18, 42, '#e65100'], [62, 92, 12, 32, '#ff9800'], [64, 92, 6, 20, '#ffe082']].forEach(([x, y, w, h, c]) => {
                ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w, y - h * 0.5, x, y - h); ctx.quadraticCurveTo(x + w, y - h * 0.5, x + w, y); ctx.closePath(); ctx.fillStyle = c; ctx.fill();
            });
            [[46, 100], [82, 100], [40, 94], [88, 94]].forEach(([x, y]) => { ctx.beginPath(); ctx.ellipse(x, y, 6, 4, 0, 0, Math.PI * 2); ctx.fillStyle = '#8d8a83'; ctx.fill(); stroke(ctx, 1); });
        },
        crystal(ctx) {
            shadow(ctx, 64, 104, 32);
            const glow = ctx.createRadialGradient(64, 70, 4, 64, 70, 50);
            glow.addColorStop(0, 'rgba(120,230,255,0.45)'); glow.addColorStop(1, 'rgba(120,230,255,0)');
            ctx.fillStyle = glow; ctx.fillRect(0, 10, 128, 110);
            [[44, 104, 10, 34, -0.35], [84, 104, 10, 30, 0.35], [64, 106, 14, 66, 0], [54, 106, 8, 40, -0.15], [74, 106, 8, 44, 0.18]].forEach(([x, y, w, h, a]) => {
                ctx.save(); ctx.translate(x, y); ctx.rotate(a);
                poly(ctx, [[-w, 0], [-w, -h * 0.75], [0, -h], [w, -h * 0.75], [w, 0]]); ctx.fillStyle = '#5fd3ec'; ctx.fill();
                poly(ctx, [[0, -h], [w, -h * 0.75], [w, 0], [0, 0]]); ctx.fillStyle = '#2a8fb3'; ctx.fill();
                poly(ctx, [[-w, -h * 0.75], [0, -h], [-w * 0.3, -h * 0.7], [-w * 0.6, 0], [-w, 0]]); ctx.fillStyle = 'rgba(220,250,255,0.7)'; ctx.fill();
                poly(ctx, [[-w, 0], [-w, -h * 0.75], [0, -h], [w, -h * 0.75], [w, 0]]); stroke(ctx, 1.2);
                ctx.restore();
            });
        }
    };

    const MEDIEVAL = [
        { id: 'castle', label: 'Castle' },
        { id: 'tower', label: 'Tower' },
        { id: 'house', label: 'House' },
        { id: 'windmill', label: 'Windmill' },
        { id: 'ruins', label: 'Ruins' },
        { id: 'camp', label: 'Camp' },
        { id: 'treasure', label: 'Treasure' },
        { id: 'banner', label: 'Banner' },
        { id: 'campfire', label: 'Campfire' },
        { id: 'crystal', label: 'Crystal' }
    ];
    // Object themes: add new sets here ({ id, name, items }) and their drawings to G.
    const THEMES = [
        { id: 'medieval', name: 'Medieval', items: MEDIEVAL }
    ];
    let ALL = THEMES.flatMap((t) => t.items);
    const custom = new Map(); // id -> canvas

    /** Registers an imported item set. items: [{ id, label, img: HTMLImageElement }] */
    function registerSet(set) {
        removeSet(set.id);
        set.items.forEach((it) => {
            const c = document.createElement('canvas'); c.width = RES; c.height = RES;
            const x = c.getContext('2d');
            const pad = RES * 0.06, box = RES - pad * 2;
            const k = Math.min(box / it.img.width, box / it.img.height);
            const w = it.img.width * k, h = it.img.height * k;
            x.drawImage(it.img, (RES - w) / 2, RES - pad - h, w, h);
            custom.set(it.id, c);
        });
        THEMES.push({ id: set.id, name: set.name, custom: true, items: set.items.map(({ id, label }) => ({ id, label })) });
        ALL = THEMES.flatMap((t) => t.items);
    }
    function removeSet(id) {
        const i = THEMES.findIndex((t) => t.id === id && t.custom);
        if (i < 0) return;
        THEMES[i].items.forEach((it) => { custom.delete(it.id); cache.delete(it.id); if (typeof objUrls !== 'undefined') objUrls.delete(it.id); });
        THEMES.splice(i, 1);
        ALL = THEMES.flatMap((t) => t.items);
    }

    function canvasFor(id) {
        if (custom.has(id)) { if (!cache.has(id)) cache.set(id, { canvas: custom.get(id), url: null }); return custom.get(id); }
        if (!G[id]) return null;
        if (cache.has(id)) return cache.get(id).canvas;
        const c = document.createElement('canvas'); c.width = RES; c.height = RES;
        const ctx = c.getContext('2d');
        ctx.scale(RES / D, RES / D);
        ctx.translate(0, 8);
        G[id](ctx);
        cache.set(id, { canvas: c, url: null });
        return c;
    }
    function dataUrlFor(id) {
        if (!canvasFor(id)) return null;
        const e = cache.get(id);
        if (!e.url) e.url = e.canvas.toDataURL('image/png');
        return e.url;
    }
    /** Draws a polygon's object centered on it (not clipped, so tall objects can overlap the tile above). */
    function drawOnPolygon(ctx, polygon) {
        const c = polygon && polygon.object ? canvasFor(polygon.object) : null;
        if (!c || !polygon.vertices?.length) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, cx = 0, cy = 0;
        polygon.vertices.forEach((v) => { minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); cx += v.x; cy += v.y; });
        cx /= polygon.vertices.length; cy /= polygon.vertices.length;
        const size = Math.min(maxX - minX, maxY - minY) * 0.85;
        ctx.drawImage(c, cx - size / 2, cy - size * 0.55, size, size);
    }


    // Object URL (no ';' in it) so it can be interpolated into inline style strings.
    function toObjectUrl(dataUrl) {
        const [head, b64] = dataUrl.split(',');
        const bin = atob(b64), arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return URL.createObjectURL(new Blob([arr], { type: head.slice(5).split(';')[0] }));
    }
    const objUrls = new Map();
    function urlFor(key) {
        if (objUrls.has(key) && (custom.has(key) ? cache.has(key) : true)) return objUrls.get(key);
        const d = dataUrlFor(key);
        const u = d ? toObjectUrl(d) : null;
        objUrls.set(key, u);
        return u;
    }
    const themes = () => THEMES.map(({ id, name }) => ({ id, name }));
    const list = (themeId) => ((THEMES.find((t) => t.id === themeId) || THEMES[0]).items).slice();
    return { registerSet, removeSet, themes, list, dataUrlFor, urlFor, drawOnPolygon, labelFor: (id) => (ALL.find((o) => o.id === id) || {}).label };
})();
