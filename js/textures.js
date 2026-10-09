/**
 * PROTOGAMES TEXTURES
 * Procedural, seamlessly tiling terrain textures keyed by palette color.
 * The hex color stays the tile's identity (save/load/export); textures are
 * a visual layer used by the renderer (canvas patterns) and swatches (data URLs).
 */
const Textures = (() => {
    const S = 128;
    const cache = new Map();
    let labelMap = null;

    const customTiles = new Map();
    /** Registers an image texture for a palette color (custom tile themes). */
    function registerImage(hex, img) {
        const key = String(hex).toLowerCase();
        const c = document.createElement('canvas'); c.width = S; c.height = S;
        const x = c.getContext('2d');
        const k = Math.max(S / img.width, S / img.height);
        x.drawImage(img, (S - img.width * k) / 2, (S - img.height * k) / 2, img.width * k, img.height * k);
        customTiles.set(key, c);
        cache.delete(key); dropUrl(key);
    }
    function unregister(hex) { const key = String(hex).toLowerCase(); customTiles.delete(key); cache.delete(key); dropUrl(key); }
    function resetLabels() { labelMap = null; }

    function getLabel(hex) {
        if (!labelMap) {
            labelMap = new Map();
            Config.COLOR_PALETTES.forEach((p) => p.colors.forEach((c) => {
                const k = c.hex.toLowerCase();
                if (!labelMap.has(k)) labelMap.set(k, c.label.toLowerCase());
            }));
        }
        return labelMap.get(String(hex).toLowerCase()) || null;
    }

    function rng(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
    function rgb(hex) { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    function shade(hex, amt, alpha = 1) {
        const [r, g, b] = rgb(hex);
        const f = (c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
        return `rgba(${f(r)},${f(g)},${f(b)},${alpha})`;
    }
    function mix(a, b, k) {
        const A = rgb(a), B = rgb(b);
        return '#' + A.map((c, i) => Math.round(c + (B[i] - c) * k).toString(16).padStart(2, '0')).join('');
    }
    const LINE = 'rgba(20,16,12,0.55)';
    function groundShadow(ctx, X, Y, w) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(X + w * 0.35, Y + 0.5, w, w * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    }
    function outline(ctx, lw = 0.8) { ctx.strokeStyle = LINE; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
    // Side-on conifer: stacked tiers, lit left / shaded right.
    function drawConifer(ctx, X, Y, s, base) {
        const h = 20 * s, w = 7 * s;
        groundShadow(ctx, X, Y, w * 0.9);
        ctx.fillStyle = '#4a3322'; ctx.fillRect(X - 0.9 * s, Y - 3 * s, 1.8 * s, 3.5 * s);
        for (let k = 0; k < 3; k++) {
            const ty = Y - 2.5 * s - k * h * 0.26, tw = w * (1 - k * 0.22), th = h * 0.45;
            ctx.beginPath(); ctx.moveTo(X - tw, ty); ctx.lineTo(X, ty - th); ctx.lineTo(X + tw, ty); ctx.closePath();
            ctx.fillStyle = shade(base, -0.18 + k * 0.06); ctx.fill(); outline(ctx, 0.6 * s);
            ctx.fillStyle = shade(base, 0.2 + k * 0.05, 0.85);
            ctx.beginPath(); ctx.moveTo(X - tw + 0.6, ty - 0.4); ctx.lineTo(X, ty - th + 1); ctx.lineTo(X - tw * 0.1, ty - 0.4); ctx.closePath(); ctx.fill();
        }
    }
    // Side-on broadleaf: trunk + lumpy crown, same lighting and footprint as conifers.
    function drawLeafy(ctx, X, Y, s, base) {
        const r = 5.2 * s, cy = Y - 3.2 * s - r;
        groundShadow(ctx, X, Y, 6.3 * s * 0.9);
        ctx.fillStyle = '#4a3322'; ctx.fillRect(X - 1 * s, Y - 4.5 * s, 2 * s, 5 * s);
        const lobes = [[-0.55, 0.25, 0.75], [0.55, 0.25, 0.75], [0, -0.35, 0.85], [0, 0.2, 0.9]];
        ctx.beginPath(); lobes.forEach(([dx, dy, k]) => { ctx.moveTo(X + dx * r + k * r, cy + dy * r); ctx.arc(X + dx * r, cy + dy * r, k * r, 0, Math.PI * 2); });
        ctx.fillStyle = shade(base, -0.18); ctx.fill();
        ctx.save(); ctx.clip();
        ctx.fillStyle = base; ctx.beginPath(); ctx.arc(X - r * 0.25, cy - r * 0.2, r * 0.95, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = shade(base, 0.28, 0.85); ctx.beginPath(); ctx.arc(X - r * 0.5, cy - r * 0.55, r * 0.45, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.beginPath(); lobes.forEach(([dx, dy, k]) => { ctx.moveTo(X + dx * r + k * r, cy + dy * r); ctx.arc(X + dx * r, cy + dy * r, k * r, 0, Math.PI * 2); });
        outline(ctx, 0.6 * s);
    }
    // Draw at all wrapped positions so shapes crossing an edge tile seamlessly.
    function wrap(x, y, fn) {
        for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) fn(x + dx, y + dy);
    }
    function speckle(ctx, R, hex, count, amt, size) {
        for (let i = 0; i < count; i++) {
            const x = R() * S, y = R() * S, s = size * (0.5 + R());
            ctx.fillStyle = shade(hex, (R() - 0.5) * 2 * amt, 0.55);
            wrap(x, y, (X, Y) => ctx.fillRect(X, Y, s, s));
        }
    }
    // Stars of varied size/warmth; a few large ones get a soft halo and cross flare.
    function starfield(ctx, R, count, bright) {
        const cols = ['255,255,255', '255,244,214', '210,228,255', '255,226,190'];
        for (let i = 0; i < count; i++) {
            const x = R() * S, y = R() * S, k = R(), c = cols[Math.floor(R() * cols.length)];
            const r = k < 0.75 ? 0.5 + R() * 0.4 : k < 0.95 ? 0.9 + R() * 0.5 : 1.4 + R() * 0.6;
            const a = (0.35 + R() * 0.65) * bright;
            wrap(x, y, (X, Y) => {
                if (r > 1.3) {
                    const h = ctx.createRadialGradient(X, Y, 0, X, Y, r * 5); h.addColorStop(0, 'rgba(' + c + ',' + (0.35 * a) + ')'); h.addColorStop(1, 'rgba(' + c + ',0)');
                    ctx.fillStyle = h; ctx.fillRect(X - r * 5, Y - r * 5, r * 10, r * 10);
                    ctx.strokeStyle = 'rgba(' + c + ',' + (0.45 * a) + ')'; ctx.lineWidth = 0.6;
                    ctx.beginPath(); ctx.moveTo(X - r * 4, Y); ctx.lineTo(X + r * 4, Y); ctx.moveTo(X, Y - r * 4); ctx.lineTo(X, Y + r * 4); ctx.stroke();
                }
                ctx.fillStyle = 'rgba(' + c + ',' + a + ')';
                ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill();
            });
        }
    }
    function blotches(ctx, R, hex, count, amt, rad) {
        for (let i = 0; i < count; i++) {
            const x = R() * S, y = R() * S, r = rad * (0.5 + R());
            const g = (X, Y) => {
                const grad = ctx.createRadialGradient(X, Y, 0, X, Y, r);
                grad.addColorStop(0, shade(hex, (R() - 0.5) * 2 * amt, 0.5));
                grad.addColorStop(1, shade(hex, 0, 0));
                ctx.fillStyle = grad;
                ctx.fillRect(X - r, Y - r, r * 2, r * 2);
            };
            wrap(x, y, g);
        }
    }

    const G = {
        forest(ctx, R, hex) {
            ctx.fillStyle = shade(hex, -0.3); ctx.fillRect(0, 0, S, S);
            blotches(ctx, R, hex, 10, 0.15, 30);
            speckle(ctx, R, hex, 120, 0.25, 1.5);
            const trees = [];
            for (let i = 0; i < 30; i++) trees.push({ x: R() * S, y: R() * S, conifer: R() < 0.7, s: 0.8 + R() * 0.5, v: R() });
            trees.sort((a, b) => a.y - b.y);
            trees.forEach((tr) => wrap(tr.x, tr.y, (X, Y) => {
                if (tr.conifer) drawConifer(ctx, X, Y, tr.s, mix(hex, '#163a2c', 0.35 + tr.v * 0.3));
                else drawLeafy(ctx, X, Y, tr.s, mix(hex, '#5b8a2e', 0.3 + tr.v * 0.35));
            }));
        },
        grass(ctx, R, hex) {
            // gentle seamless hill shading underlay (light from upper-left)
            const lit = rgb(mix(hex, '#d6ea5c', 0.38)), mid = rgb(hex), dark = rgb(mix(hex, '#174d1e', 0.38));
            const a = R() * 6.28, b = R() * 6.28, T = Math.PI * 2;
            const H = (x, y) => Math.sin(T * (y / S + 0.35 * Math.sin(T * x / S + a))) + 0.25 * Math.sin(T * (x / S + y / S) + b);
            const img = ctx.createImageData(S, S), d = img.data;
            for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
                const L = Math.tanh(-(H(x, y + 1) - H(x, y - 1)) * 10 - (H(x + 1, y) - H(x - 1, y)) * 4 + H(x, y) * 0.15);
                const k = 0.5 + 0.5 * L;
                const [A, B, w] = k < 0.5 ? [dark, mid, k * 2] : [mid, lit, (k - 0.5) * 2];
                const i = (y * S + x) * 4;
                d[i] = A[0] + (B[0] - A[0]) * w; d[i + 1] = A[1] + (B[1] - A[1]) * w; d[i + 2] = A[2] + (B[2] - A[2]) * w; d[i + 3] = 255;
            }
            ctx.putImageData(img, 0, 0);
            blotches(ctx, R, hex, 12, 0.14, 26);
            ctx.lineCap = 'round';
            for (let i = 0; i < 220; i++) {
                const x = R() * S, y = R() * S, l = 3 + R() * 5, ang = -Math.PI / 2 + (R() - 0.5) * 0.9;
                ctx.strokeStyle = shade(hex, (R() - 0.45) * 0.6, 0.8);
                ctx.lineWidth = 1 + R() * 0.6;
                wrap(x, y, (X, Y) => { ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + Math.cos(ang) * l, Y + Math.sin(ang) * l); ctx.stroke(); });
            }
        },
        water(ctx, R, hex) {
            const grad = ctx.createLinearGradient(0, 0, 0, S);
            grad.addColorStop(0, shade(hex, -0.08)); grad.addColorStop(0.5, shade(hex, 0.04)); grad.addColorStop(1, shade(hex, -0.08));
            ctx.fillStyle = grad; ctx.fillRect(0, 0, S, S);
            blotches(ctx, R, hex, 10, 0.18, 34);
            ctx.lineCap = 'round';
            for (let row = 0; row < 8; row++) {
                for (let k = 0; k < 3; k++) {
                    const x = R() * S, y = row * 16 + 6 + R() * 6, w = 10 + R() * 12;
                    ctx.strokeStyle = shade(hex, 0.45, 0.75); ctx.lineWidth = 1.4;
                    wrap(x, y, (X, Y) => {
                        ctx.beginPath(); ctx.moveTo(X - w / 2, Y);
                        ctx.quadraticCurveTo(X - w / 4, Y - 3, X, Y); ctx.quadraticCurveTo(X + w / 4, Y + 3, X + w / 2, Y); ctx.stroke();
                    });
                }
            }
        },
        mountain(ctx, R, hex, opts = {}) {
            const rock = opts.rockTo ? mix(hex, opts.rockTo, 0.35) : mix(hex, '#56688a', 0.4);
            const haze = mix(rock, opts.hazeTo || '#c9d6e8', 0.55);
            const tall = opts.tall || 1, snowBase = opts.snowline == null ? 0.5 : opts.snowline;
            ctx.fillStyle = mix(rock, '#9fb0c8', 0.45); ctx.fillRect(0, 0, S, S);
            blotches(ctx, R, haze, 12, 0.12, 30);
            speckle(ctx, R, rock, 160, 0.25, 1.5);
            const jag = (pts, amp, iters) => {
                for (let it = 0; it < iters; it++) {
                    const out = [pts[0]];
                    for (let i = 1; i < pts.length; i++) {
                        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
                        out.push([(x0 + x1) / 2 + (R() - 0.5) * amp * 0.4, (y0 + y1) / 2 + (R() - 0.5) * amp]);
                        out.push(pts[i]);
                    }
                    pts = out; amp *= 0.55;
                }
                return pts;
            };
            const massifs = [];
            // background pass: small hazy massifs filling gaps
            for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
                const x = ((col + 0.5 + (R() - 0.5) * 0.5 + (row % 2 ? 0 : 0.5)) * S / 4) % S;
                const y = (row + 0.15 + R() * 0.25) * S / 3;
                massifs.push({ x, y, w: 14 + R() * 8, h: 14 + R() * 8, px: (R() - 0.5) * 0.5, bg: true });
            }
            for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
                const x = ((col + 0.2 + R() * 0.6 + (row % 2) * 0.5) * S / 3) % S;
                const y = (row + 0.55 + R() * 0.35) * S / 3;
                massifs.push({ x, y, w: (20 + R() * 10) / Math.sqrt(tall), h: (26 + R() * 12) * tall, px: (R() - 0.5) * 0.5 });
            }
            massifs.sort((a, b) => (a.bg === b.bg ? a.y - b.y : a.bg ? -1 : 1));
            massifs.forEach((M) => {
                const w = M.w, h = M.h, pkx = M.px * w;
                // ridge as (x, height); main summit stays highest
                let left = jag([[-w, 0], [pkx - w * 0.45, h * (0.45 + R() * 0.2)], [pkx, h]], h * 0.35, 3);
                let right = jag([[pkx, h], [pkx + w * 0.4, h * (0.5 + R() * 0.2)], [w, 0]], h * 0.35, 3);
                const clampH = (p, i, arr) => [p[0], (i === 0 && p === arr[0] && p[1] === 0) ? 0 : Math.max(0, Math.min(p[1], h * 0.93))];
                left = left.map((p, i) => i === left.length - 1 ? [pkx, h] : (i === 0 ? [-w, 0] : [p[0], Math.max(0, Math.min(p[1], h * 0.93))]));
                right = right.map((p, i) => i === 0 ? [pkx, h] : (i === right.length - 1 ? [w, 0] : [p[0], Math.max(0, Math.min(p[1], h * 0.93))]));
                const spine = jag([[pkx, h], [pkx + w * 0.12, h * 0.5], [pkx + w * 0.3, 0]], w * 0.18, 2).map((p) => [p[0], Math.max(0, p[1])]);
                const ribs = [];
                for (let k = 0; k < 4; k++) {
                    const src = (k % 2 ? right : left)[Math.floor(R() * ((k % 2 ? right : left).length))];
                    ribs.push(jag([src, [src[0] + (R() - 0.3) * w * 0.3, src[1] * 0.25]], w * 0.12, 2));
                }
                const snowline = h * (snowBase + R() * 0.12);
                const snowEdge = jag([[-w, snowline], [0, snowline + (R() - 0.5) * 6], [w, snowline]], h * 0.3, 4);
                wrap(M.x, M.y, (X, Y) => {
                    const P = (p) => [X + p[0], Y - p[1]];
                    const ridge = () => { ctx.beginPath(); ctx.moveTo(...P([-w, 0])); left.forEach((p) => ctx.lineTo(...P(p))); right.forEach((p) => ctx.lineTo(...P(p))); ctx.closePath(); };
                    ctx.fillStyle = 'rgba(20,30,50,0.2)';
                    ctx.beginPath(); ctx.ellipse(X + w * 0.3, Y + 0.5, w * 0.6, w * 0.16, 0, 0, Math.PI * 2); ctx.fill();
                    ridge(); ctx.fillStyle = mix(rock, '#ffffff', 0.12); ctx.fill();
                    ctx.save(); ridge(); ctx.clip();
                    // rock ribs / gullies
                    ctx.lineWidth = 0.8; ctx.strokeStyle = shade(rock, -0.3, 0.55);
                    ribs.forEach((rb) => { ctx.beginPath(); rb.forEach((p, i) => i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p))); ctx.stroke(); });
                    // snow above a jagged snowline, with streaks down gullies
                    ctx.beginPath(); ctx.moveTo(...P([-w, h + 2])); snowEdge.forEach((p) => ctx.lineTo(...P(p))); ctx.lineTo(...P([w, h + 2])); ctx.closePath();
                    ctx.fillStyle = 'rgba(246,249,253,0.95)'; ctx.fill();
                    ctx.strokeStyle = 'rgba(246,249,253,0.85)'; ctx.lineWidth = 1.1;
                    ribs.forEach((rb) => { ctx.beginPath(); rb.slice(0, Math.ceil(rb.length * 0.6)).forEach((p, i) => i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p))); ctx.stroke(); });
                    // shaded east face (right of the jagged spine)
                    ctx.beginPath(); spine.forEach((p, i) => i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p)));
                    ctx.lineTo(...P([w + 2, 0])); ctx.lineTo(...P([w + 2, h + 2])); ctx.closePath();
                    ctx.fillStyle = 'rgba(28,42,72,0.48)'; ctx.fill();
                    // atmospheric haze toward the base
                    const g = ctx.createLinearGradient(0, Y - h * 0.45, 0, Y);
                    g.addColorStop(0, shade(haze, 0, 0)); g.addColorStop(1, shade(haze, 0, 0.75));
                    ctx.fillStyle = g; ctx.fillRect(X - w - 2, Y - h * 0.45, w * 2 + 4, h * 0.45 + 1);
                    if (M.bg) { ctx.fillStyle = shade(haze, 0, 0.45); ctx.fillRect(X - w - 2, Y - h - 2, w * 2 + 4, h + 4); }
                    ctx.restore();
                    ctx.beginPath(); ctx.moveTo(...P([-w, 0])); left.forEach((p) => ctx.lineTo(...P(p))); right.forEach((p) => ctx.lineTo(...P(p)));
                    if (M.bg) { ctx.strokeStyle = 'rgba(40,55,80,0.25)'; ctx.lineWidth = 0.6; ctx.stroke(); } else outline(ctx, 0.7);
                });
            });
        },
        rock(ctx, R, hex) {
            ctx.fillStyle = hex; ctx.fillRect(0, 0, S, S);
            blotches(ctx, R, hex, 14, 0.22, 22);
            speckle(ctx, R, hex, 320, 0.35, 2);
            ctx.lineWidth = 1;
            for (let i = 0; i < 7; i++) {
                let x = R() * S, y = R() * S;
                ctx.strokeStyle = shade(hex, -0.4, 0.7);
                const pts = [[x, y]];
                for (let j = 0; j < 4; j++) { x += (R() - 0.5) * 22; y += (R() - 0.5) * 22; pts.push([x, y]); }
                wrap(0, 0, (dx, dy) => { ctx.beginPath(); pts.forEach(([px, py], j) => j ? ctx.lineTo(px + dx, py + dy) : ctx.moveTo(px + dx, py + dy)); ctx.stroke(); });
            }
        },
        desert(ctx, R, hex, opts = {}) {
            const sand = opts.base || mix(hex, '#e3965c', 0.3);
            const lit = opts.lit || mix(sand, '#f6c08a', 0.45);
            const shadow = opts.shadow || mix(sand, '#9b7486', 0.5);
            ctx.fillStyle = sand; ctx.fillRect(0, 0, S, S);
            blotches(ctx, R, sand, 10, 0.1, 34);
            // overlapping rows of dunes, back to front; lit warm windward faces, cool violet slip faces
            const dunes = [];
            const rows = 5;
            for (let r = 0; r < rows; r++) {
                const n = 3, off = R() * S;
                for (let k = 0; k < n; k++) {
                    const w = 26 + R() * 18;
                    dunes.push({ x: (off + k * (S / n) + (R() - 0.5) * 10) % S, y: (r + 0.6) * (S / rows) + (R() - 0.5) * 8, w, h: w * (0.3 + R() * 0.12), lean: 0.25 + R() * 0.25 });
                }
            }
            dunes.sort((a, b) => a.y - b.y);
            dunes.forEach((d) => wrap(d.x, d.y, (X, Y) => {
                const w = d.w, h = d.h, px = w * d.lean;
                const prof = (x) => x <= px ? h * Math.pow(Math.sin((Math.PI / 2) * (x + w) / (px + w)), 0.85) : h * Math.pow(Math.cos((Math.PI / 2) * (x - px) / (w - px)), 0.7);
                const path = () => { ctx.beginPath(); ctx.moveTo(X - w, Y); for (let x = -w; x <= w; x += 1.5) ctx.lineTo(X + x, Y - prof(x)); ctx.lineTo(X + w, Y); ctx.closePath(); };
                path();
                const gl = ctx.createLinearGradient(X - w, Y, X + px, Y - h);
                gl.addColorStop(0, sand); gl.addColorStop(1, lit);
                ctx.fillStyle = gl; ctx.fill();
                ctx.save(); path(); ctx.clip();
                // ripples across the lit face
                ctx.strokeStyle = shade(sand, -0.12, 0.35); ctx.lineWidth = 0.6;
                for (let k = 1; k < 5; k++) { ctx.beginPath(); for (let x = -w; x <= w; x += 1.5) { const y = Y - prof(x) * (1 - k * 0.18) + Math.sin(x * 0.7 + k * 1.3) * 0.5; x === -w ? ctx.moveTo(X + x, y) : ctx.lineTo(X + x, y); } ctx.stroke(); }
                // curved slip-face shadow: from crest sweeping down-right
                const cx0 = X + px, cy0 = Y - h;
                ctx.beginPath(); ctx.moveTo(cx0, cy0 - 1);
                ctx.quadraticCurveTo(cx0 - w * 0.05, Y - h * 0.35, cx0 + w * 0.45, Y + 1);
                ctx.lineTo(X + w + 1, Y + 1); ctx.lineTo(X + w + 1, cy0 - 1); ctx.closePath();
                const gs = ctx.createLinearGradient(cx0, 0, X + w, 0);
                gs.addColorStop(0, shade(shadow, -0.12)); gs.addColorStop(1, shadow);
                ctx.fillStyle = gs; ctx.fill();
                ctx.restore();
                // sharp sunlit crest edge
                ctx.strokeStyle = mix(lit, '#ffffff', 0.35); ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(X - w * 0.35, Y - prof(-w * 0.35)); for (let x = -w * 0.35; x <= px; x += 1.5) ctx.lineTo(X + x, Y - prof(x));
                ctx.quadraticCurveTo(cx0 - w * 0.05, Y - h * 0.35, cx0 + w * 0.45, Y); ctx.stroke();
            }));
            if (opts.snow) {
                // wind-blown sparkle instead of scrub and debris
                for (let i = 0; i < 90; i++) { const x = R() * S, y = R() * S; ctx.fillStyle = R() > 0.4 ? 'rgba(255,255,255,0.95)' : 'rgba(150,175,215,0.5)'; wrap(x, y, (X, Y) => ctx.fillRect(X, Y, 1.2, 1.2)); }
                return;
            }
            // sparse scrub bushes
            for (let i = 0; i < 4; i++) {
                const x = R() * S, y = R() * S, sz = 3 + R() * 2.5;
                const blobs = Array.from({ length: 6 }, () => [(R() - 0.5) * sz * 2.2, -R() * sz * 1.2, sz * (0.4 + R() * 0.4)]);
                wrap(x, y, (X, Y) => {
                    ctx.fillStyle = 'rgba(70,40,40,0.28)'; ctx.beginPath(); ctx.ellipse(X + sz * 1.2, Y + 0.5, sz * 1.6, sz * 0.45, 0, 0, Math.PI * 2); ctx.fill();
                    blobs.forEach(([dx, dy, r]) => { ctx.fillStyle = '#3f3a22'; ctx.beginPath(); ctx.arc(X + dx, Y + dy, r, 0, Math.PI * 2); ctx.fill(); });
                    blobs.slice(0, 3).forEach(([dx, dy, r]) => { ctx.fillStyle = 'rgba(120,120,70,0.7)'; ctx.beginPath(); ctx.arc(X + dx - r * 0.3, Y + dy - r * 0.3, r * 0.45, 0, Math.PI * 2); ctx.fill(); });
                });
            }
            // scattered debris specks + grain
            for (let i = 0; i < 40; i++) { const x = R() * S, y = R() * S; ctx.fillStyle = 'rgba(70,45,35,0.45)'; wrap(x, y, (X, Y) => ctx.fillRect(X, Y, 1.4, 0.8)); }
            speckle(ctx, R, sand, 220, 0.18, 1);
        },
        snowhills(ctx, R, hex) { G.desert(ctx, R, hex, { snow: true, base: mix(hex, '#c9d8ea', 0.55), lit: '#ffffff', shadow: mix(hex, '#a7b9da', 0.7) }); },
        snowymtn(ctx, R, hex) { G.mountain(ctx, R, hex, { snowline: 0.22, hazeTo: '#eef3fa' }); },
        icypeaks(ctx, R, hex) { G.mountain(ctx, R, hex, { snowline: 0.74, tall: 1.3, rockTo: '#2f3946', hazeTo: '#b9c8da' }); },
        seaice(ctx, R, hex) {
            // pack ice: raised floes split by dark leads, lit from the upper left
            const pts = [];
            for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 3; gx++) pts.push([(gx + 0.1 + R() * 0.8) * S / 3, (gy + 0.1 + R() * 0.8) * S / 3, (R() - 0.5) * 0.1, 1]);
            for (let k = 0; k < 7; k++) pts.push([R() * S, R() * S, (R() - 0.5) * 0.1, 0.55 + R() * 0.3]); // small broken floes
            const all = [];
            pts.forEach(([x, y, v, wgt], i) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) all.push([x + dx, y + dy, v, wgt]); });
            const ice = rgb(hex), lead = rgb('#163f5e'), leadEdge = rgb('#5d8fb0');
            const img = ctx.createImageData(S, S), d = img.data;
            for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
                let d1 = 1e9, d2 = 1e9, n1 = null;
                for (const p of all) { const dd = ((p[0] - x) ** 2 + (p[1] - y) ** 2) / (p[3] * p[3]); if (dd < d1) { d2 = d1; d1 = dd; n1 = p; } else if (dd < d2) d2 = dd; }
                const wob = Math.sin(x * 0.21 + y * 0.13) * 0.6 + Math.sin(x * 0.07 - y * 0.19) * 0.9;
                const gap = Math.sqrt(d2) - Math.sqrt(d1) + wob;
                const i = (y * S + x) * 4;
                let col;
                if (gap < 1.8) col = lead;
                else if (gap < 2.9) col = leadEdge;
                else {
                    const dirx = x - n1[0], diry = y - n1[1], toward = (dirx + diry) / (Math.abs(dirx) + Math.abs(diry) + 1e-6);
                    let k = n1[2];
                    if (gap < 5.5) k += toward > 0 ? -0.18 : 0.12; // shaded lower-right rims, bright upper-left rims
                    col = ice.map((c) => Math.max(0, Math.min(255, k >= 0 ? c + (255 - c) * k : c * (1 + k))));
                }
                d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
            }
            ctx.putImageData(img, 0, 0);
            // pressure ridges + snow dust
            ctx.lineCap = 'round';
            for (let i = 0; i < 5; i++) {
                const x = R() * S, y = R() * S, l = 10 + R() * 14, a = R() * Math.PI;
                wrap(x, y, (X, Y) => {
                    ctx.strokeStyle = 'rgba(120,150,175,0.55)'; ctx.lineWidth = 1.6;
                    ctx.beginPath(); ctx.moveTo(X, Y + 1); ctx.lineTo(X + Math.cos(a) * l, Y + Math.sin(a) * l + 1); ctx.stroke();
                    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.1;
                    ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + Math.cos(a) * l, Y + Math.sin(a) * l); ctx.stroke();
                });
            }
            speckle(ctx, R, '#ffffff', 120, 0, 1.2);
        },
        glacier(ctx, R, hex) {
            const g = ctx.createLinearGradient(0, 0, S, S);
            g.addColorStop(0, shade(hex, 0.35)); g.addColorStop(0.5, hex); g.addColorStop(1, shade(hex, 0.2));
            ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
            blotches(ctx, R, '#ffffff', 10, 0, 28);
            // flow bands
            ctx.lineWidth = 1;
            for (let row = 0; row < 6; row++) {
                const y0 = row * (S / 6) + R() * 6, amp = 3 + R() * 3, ph = R() * 6.28;
                ctx.strokeStyle = 'rgba(120,175,205,0.35)';
                ctx.beginPath(); for (let x = 0; x <= S; x += 2) { const y = y0 + Math.sin((x / S) * Math.PI * 2 + ph) * amp; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
            }
            // crevasse fields: a few groups of near-parallel cuts, bright upper lip, deep blue inner wall
            for (let f = 0; f < 4; f++) {
                const fx = R() * S, fy = R() * S, a = (R() - 0.5) * 0.5, n = 3 + Math.floor(R() * 3);
                for (let i = 0; i < n; i++) {
                    const l = 10 + R() * 12, w = 1.6 + R() * 1.6, ox = (R() - 0.5) * 8, oy = i * 7 + (R() - 0.5) * 2, bend = (R() - 0.5) * 4;
                    wrap(fx, fy, (X, Y) => {
                        ctx.save(); ctx.translate(X + ox, Y + oy); ctx.rotate(a);
                        ctx.beginPath(); ctx.moveTo(-l, bend); ctx.quadraticCurveTo(0, -w, l, -bend); ctx.quadraticCurveTo(0, w * 1.3, -l, bend); ctx.closePath();
                        const cg = ctx.createLinearGradient(0, -w, 0, w * 1.3); cg.addColorStop(0, '#0c4570'); cg.addColorStop(0.6, '#2f86b8'); cg.addColorStop(1, '#8fd0ec');
                        ctx.fillStyle = cg; ctx.fill();
                        ctx.beginPath(); ctx.moveTo(-l, bend); ctx.quadraticCurveTo(0, -w, l, -bend); ctx.strokeStyle = 'rgba(30,80,120,0.55)'; ctx.lineWidth = 0.7; ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(-l * 0.92, bend + 0.7); ctx.quadraticCurveTo(0, w * 1.3 + 0.7, l * 0.92, -bend + 0.7); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1; ctx.stroke();
                        ctx.restore();
                    });
                }
            }
            speckle(ctx, R, '#ffffff', 90, 0, 1.2);
        },
        icebergs(ctx, R, hex) {
            G.water(ctx, R, hex);
            const bergs = [];
            for (let i = 0; i < 3; i++) bergs.push({ x: (i + 0.2 + R() * 0.6) * S / 3, y: 26 + R() * (S - 34), w: 13 + R() * 9, h: 12 + R() * 12, tab: R() < 0.45 });
            bergs.sort((a, b) => a.y - b.y);
            bergs.forEach((b) => {
                // silhouette as (x, height) from left waterline to right waterline
                const w = b.w, h = b.h;
                const top = b.tab
                    ? [[-w, 0], [-w * 0.92, h * 0.7], [-w * 0.6, h * 0.74], [w * 0.4, h * 0.72], [w * 0.88, h * 0.66], [w, 0]]
                    : [[-w, 0], [-w * 0.7, h * 0.35], [-w * 0.35, h * 0.55], [-w * 0.1, h * (1.05 + R() * 0.2)], [w * 0.15, h * 0.7], [w * 0.4, h * 0.8], [w * 0.7, h * 0.3], [w, 0]];
                const ridge = b.tab ? w * 0.15 : -w * 0.1;
                wrap(b.x, b.y, (X, Y) => {
                    const P = ([px, py]) => [X + px, Y - py];
                    ctx.beginPath(); ctx.ellipse(X + 2, Y + h * 0.16, w * 1.2, h * 0.28, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(110,205,220,0.5)'; ctx.fill();
                    const body = () => { ctx.beginPath(); top.forEach((p, k) => (k ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p)))); ctx.closePath(); };
                    body(); ctx.fillStyle = '#f6fafd'; ctx.fill();
                    ctx.save(); body(); ctx.clip();
                    // shaded right face from the ridge down
                    ctx.beginPath(); ctx.moveTo(X + ridge, Y - h * 1.4); ctx.lineTo(X + ridge + w * 0.18, Y + 1); ctx.lineTo(X + w + 2, Y + 1); ctx.lineTo(X + w + 2, Y - h * 1.4); ctx.closePath();
                    ctx.fillStyle = 'rgba(105,155,195,0.6)'; ctx.fill();
                    if (b.tab) { ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(X - w, Y - h * 0.78, w * 2, h * 0.12); for (let s = 1; s < 4; s++) { ctx.fillStyle = 'rgba(150,190,215,0.35)'; ctx.fillRect(X - w, Y - h * 0.62 + s * h * 0.14, w * 2, 0.8); } }
                    ctx.fillStyle = 'rgba(140,200,225,0.55)'; ctx.fillRect(X - w, Y - h * 0.14, w * 2, h * 0.14);
                    ctx.restore();
                    body(); outline(ctx, 0.7);
                    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1; ctx.lineCap = 'round';
                    ctx.beginPath(); ctx.moveTo(X - w * 1.3, Y + 1.5); ctx.lineTo(X - w * 0.7, Y + 1.5); ctx.moveTo(X + w * 0.75, Y + 2.2); ctx.lineTo(X + w * 1.35, Y + 2.2); ctx.stroke();
                });
            });
        },
        snow(ctx, R, hex) {
            ctx.fillStyle = hex; ctx.fillRect(0, 0, S, S);
            blotches(ctx, R, '#c9d3ea', 14, 0.1, 30);
            blotches(ctx, R, '#ffffff', 10, 0.0, 24);
            for (let i = 0; i < 70; i++) {
                const x = R() * S, y = R() * S;
                ctx.fillStyle = R() > 0.5 ? 'rgba(255,255,255,0.95)' : shade(hex, -0.14, 0.6);
                wrap(x, y, (X, Y) => ctx.fillRect(X, Y, 1.5, 1.5));
            }
        },
        ice(ctx, R, hex) {
            const grad = ctx.createLinearGradient(0, 0, S, S);
            grad.addColorStop(0, shade(hex, 0.12)); grad.addColorStop(1, shade(hex, -0.08));
            ctx.fillStyle = grad; ctx.fillRect(0, 0, S, S);
            ctx.lineWidth = 1;
            for (let i = 0; i < 10; i++) {
                let x = R() * S, y = R() * S;
                const pts = [[x, y]];
                for (let j = 0; j < 3; j++) { x += (R() - 0.5) * 40; y += (R() - 0.5) * 40; pts.push([x, y]); }
                ctx.strokeStyle = R() > 0.5 ? 'rgba(255,255,255,0.7)' : shade(hex, -0.3, 0.5);
                wrap(0, 0, (dx, dy) => { ctx.beginPath(); pts.forEach(([px, py], j) => j ? ctx.lineTo(px + dx, py + dy) : ctx.moveTo(px + dx, py + dy)); ctx.stroke(); });
            }
        },
        village(ctx, R, hex) {
            ctx.fillStyle = mix(hex, '#8a8a4a', 0.35); ctx.fillRect(0, 0, S, S);
            blotches(ctx, R, mix(hex, '#7a8a3a', 0.5), 14, 0.2, 26);
            speckle(ctx, R, hex, 260, 0.3, 1.6);
        },
        volcanic(ctx, R, hex) {
            ctx.fillStyle = '#2b1d18'; ctx.fillRect(0, 0, S, S);
            blotches(ctx, R, '#3d2a22', 14, 0.25, 24);
            speckle(ctx, R, '#3d2a22', 260, 0.35, 1.6);
            for (let i = 0; i < 6; i++) {
                let x = R() * S, y = R() * S;
                const pts = [[x, y]];
                for (let j = 0; j < 4; j++) { x += (R() - 0.5) * 26; y += (R() - 0.5) * 26; pts.push([x, y]); }
                [[4, shade(hex, 0, 0.25)], [1.4, shade(hex, 0.1, 0.8)]].forEach(([lw, col]) => {
                    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                    wrap(0, 0, (dx, dy) => { ctx.beginPath(); pts.forEach(([px, py], j) => j ? ctx.lineTo(px + dx, py + dy) : ctx.moveTo(px + dx, py + dy)); ctx.stroke(); });
                });
            }
        },
        lava(ctx, R, hex) {
            ctx.fillStyle = '#2a1a14'; ctx.fillRect(0, 0, S, S);
            blotches(ctx, R, '#3b2620', 12, 0.2, 26);
            for (let i = 0; i < 9; i++) {
                let x = R() * S, y = R() * S;
                const pts = [[x, y]];
                for (let j = 0; j < 5; j++) { x += (R() - 0.5) * 30; y += (R() - 0.5) * 30; pts.push([x, y]); }
                [[7, shade(hex, 0, 0.35)], [3.2, hex], [1.2, '#ffcf6b']].forEach(([lw, col]) => {
                    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                    wrap(0, 0, (dx, dy) => { ctx.beginPath(); pts.forEach(([px, py], j) => j ? ctx.lineTo(px + dx, py + dy) : ctx.moveTo(px + dx, py + dy)); ctx.stroke(); });
                });
            }
            blotches(ctx, R, hex, 5, 0.2, 18);
        },
        bricks(ctx, R, hex) {
            ctx.fillStyle = shade(hex, -0.35); ctx.fillRect(0, 0, S, S);
            const bh = 16, bw = 32;
            for (let row = 0; row < S / bh; row++) for (let c = -1; c < S / bw + 1; c++) {
                const x = c * bw + (row % 2 ? bw / 2 : 0), y = row * bh;
                ctx.fillStyle = shade(hex, (R() - 0.5) * 0.25);
                ctx.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
            }
            speckle(ctx, R, hex, 200, 0.2, 1.5);
        },
        flagstone(ctx, R, hex) {
            ctx.fillStyle = shade(hex, -0.3); ctx.fillRect(0, 0, S, S);
            const n = 4, c = S / n;
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
                ctx.fillStyle = shade(hex, (R() - 0.5) * 0.2);
                ctx.fillRect(i * c + 1.5, j * c + 1.5, c - 3, c - 3);
            }
            speckle(ctx, R, hex, 260, 0.25, 1.5);
        },
        planks(ctx, R, hex) {
            ctx.fillStyle = shade(hex, -0.35); ctx.fillRect(0, 0, S, S);
            const pw = 16;
            for (let i = 0; i < S / pw; i++) {
                ctx.fillStyle = shade(hex, (R() - 0.5) * 0.2); ctx.fillRect(i * pw + 1, 0, pw - 2, S);
                ctx.strokeStyle = shade(hex, -0.25, 0.5); ctx.lineWidth = 0.8;
                for (let k = 0; k < 3; k++) { const x = i * pw + 3 + R() * (pw - 6); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (R() - 0.5) * 3, S); ctx.stroke(); }
            }
        },
        stars(ctx, R, hex) {
            ctx.fillStyle = hex; ctx.fillRect(0, 0, S, S);
            blotches(ctx, R, hex, 8, 0.2, 34);
            for (let i = 0; i < 60; i++) {
                const x = R() * S, y = R() * S, s = R() < 0.1 ? 2 : 1;
                ctx.fillStyle = `rgba(255,255,255,${0.4 + R() * 0.6})`;
                wrap(x, y, (X, Y) => ctx.fillRect(X, Y, s, s));
            }
        },
        deepspace(ctx, R, hex) {
            ctx.fillStyle = hex; ctx.fillRect(0, 0, S, S);
            // faint dust bands
            for (let i = 0; i < 5; i++) {
                const x = R() * S, y = R() * S, r = 30 + R() * 30;
                wrap(x, y, (X, Y) => { const g = ctx.createRadialGradient(X, Y, 0, X, Y, r); g.addColorStop(0, shade(hex, 0.12, 0.5)); g.addColorStop(1, shade(hex, 0.12, 0)); ctx.fillStyle = g; ctx.fillRect(X - r, Y - r, r * 2, r * 2); });
            }
            starfield(ctx, R, 70, 1);
        },
        nebula(ctx, R, hex) {
            ctx.fillStyle = shade(hex, -0.55); ctx.fillRect(0, 0, S, S);
            const tints = [hex, mix(hex, '#ff5fa2', 0.45), mix(hex, '#4cc9f0', 0.4), shade(hex, 0.25)];
            for (let i = 0; i < 16; i++) {
                const x = R() * S, y = R() * S, r = 18 + R() * 34, col = tints[i % tints.length], a = 0.25 + R() * 0.3;
                wrap(x, y, (X, Y) => { const g = ctx.createRadialGradient(X, Y, 0, X, Y, r); g.addColorStop(0, shade(col, 0.1, a)); g.addColorStop(0.6, shade(col, 0, a * 0.4)); g.addColorStop(1, shade(col, 0, 0)); ctx.fillStyle = g; ctx.fillRect(X - r, Y - r, r * 2, r * 2); });
            }
            // bright wisps (blurred so they read as gas, not strokes)
            ctx.save(); ctx.filter = 'blur(3px)';
            ctx.lineCap = 'round';
            for (let i = 0; i < 6; i++) {
                const x = R() * S, y = R() * S, len = 20 + R() * 30, ang = R() * Math.PI, bend = (R() - 0.5) * 24;
                wrap(x, y, (X, Y) => {
                    ctx.strokeStyle = shade(hex, 0.55, 0.22); ctx.lineWidth = 6 + R() * 6;
                    ctx.beginPath(); ctx.moveTo(X, Y); ctx.quadraticCurveTo(X + Math.cos(ang) * len / 2 - Math.sin(ang) * bend, Y + Math.sin(ang) * len / 2 + Math.cos(ang) * bend, X + Math.cos(ang) * len, Y + Math.sin(ang) * len); ctx.stroke();
                });
            }
            ctx.restore();
            starfield(ctx, R, 40, 0.9);
        },
        void(ctx, R) {
            ctx.fillStyle = '#030306'; ctx.fillRect(0, 0, S, S);
            starfield(ctx, R, 5, 0.55);
        },
        belt(ctx, R) {
            ctx.fillStyle = '#0b0f1a'; ctx.fillRect(0, 0, S, S);
            starfield(ctx, R, 22, 0.6);
            // fine dust haze
            for (let i = 0; i < 6; i++) {
                const x = R() * S, y = R() * S, r = 22 + R() * 22;
                wrap(x, y, (X, Y) => { const g = ctx.createRadialGradient(X, Y, 0, X, Y, r); g.addColorStop(0, 'rgba(150,130,110,0.12)'); g.addColorStop(1, 'rgba(150,130,110,0)'); ctx.fillStyle = g; ctx.fillRect(X - r, Y - r, r * 2, r * 2); });
            }
            const rock = (X, Y, r, rot, n, jit) => {
                ctx.save(); ctx.translate(X, Y); ctx.rotate(rot);
                ctx.beginPath();
                for (let k = 0; k < n; k++) { const ang = (k / n) * Math.PI * 2, rr = r * jit[k]; const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr * 0.82; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
                ctx.closePath();
                const g = ctx.createRadialGradient(-r * 0.4, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
                g.addColorStop(0, '#9c9286'); g.addColorStop(0.6, '#625b53'); g.addColorStop(1, '#2f2b27');
                ctx.fillStyle = g; ctx.fill();
                ctx.strokeStyle = 'rgba(10,8,6,0.6)'; ctx.lineWidth = 0.7; ctx.stroke();
                if (r > 4) { ctx.beginPath(); ctx.arc(r * 0.2, r * 0.15, r * 0.25, 0, Math.PI * 2); ctx.fillStyle = 'rgba(30,26,22,0.5)'; ctx.fill(); }
                ctx.restore();
            };
            for (let i = 0; i < 26; i++) {
                const x = R() * S, y = R() * S, k = R();
                const r = k < 0.6 ? 1.2 + R() * 1.6 : k < 0.9 ? 3 + R() * 2.5 : 6 + R() * 3;
                const rot = R() * Math.PI * 2, n = 7, jit = Array.from({ length: n }, () => 0.75 + R() * 0.4);
                wrap(x, y, (X, Y) => rock(X, Y, r, rot, n, jit));
            }
        },
        glow(ctx, R, hex) {
            ctx.fillStyle = hex; ctx.fillRect(0, 0, S, S);
            blotches(ctx, R, hex, 16, 0.35, 26);
            for (let i = 0; i < 18; i++) {
                const x = R() * S, y = R() * S, r = 2 + R() * 2;
                wrap(x, y, (X, Y) => {
                    ctx.fillStyle = shade(hex, 0.6, 0.9);
                    ctx.beginPath(); ctx.moveTo(X, Y - r * 2); ctx.lineTo(X + r * 0.4, Y); ctx.lineTo(X, Y + r * 2); ctx.lineTo(X - r * 0.4, Y); ctx.closePath(); ctx.fill();
                    ctx.beginPath(); ctx.moveTo(X - r * 2, Y); ctx.lineTo(X, Y + r * 0.4); ctx.lineTo(X + r * 2, Y); ctx.lineTo(X, Y - r * 0.4); ctx.closePath(); ctx.fill();
                });
            }
        },
        hazard(ctx, R, hex) {
            ctx.fillStyle = hex; ctx.fillRect(0, 0, S, S);
            ctx.fillStyle = shade(hex, -0.45);
            for (let k = -S; k < S * 2; k += 32) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + 16, 0); ctx.lineTo(k + 16 - S, S); ctx.lineTo(k - S, S); ctx.closePath(); ctx.fill(); }
            speckle(ctx, R, hex, 160, 0.2, 1.5);
        },
        panel(ctx, R, hex) {
            ctx.fillStyle = hex; ctx.fillRect(0, 0, S, S);
            const c = S / 2;
            ctx.strokeStyle = shade(hex, -0.3, 0.8); ctx.lineWidth = 2;
            for (let i = 0; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * c, 0); ctx.lineTo(i * c, S); ctx.moveTo(0, i * c); ctx.lineTo(S, i * c); ctx.stroke(); }
            ctx.fillStyle = shade(hex, -0.35);
            for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) [[6, 6], [c - 6, 6], [6, c - 6], [c - 6, c - 6]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(i * c + x, j * c + y, 1.6, 0, Math.PI * 2); ctx.fill(); });
            speckle(ctx, R, hex, 120, 0.12, 1.5);
        },
        generic(ctx, R, hex) {
            ctx.fillStyle = hex; ctx.fillRect(0, 0, S, S);
            blotches(ctx, R, hex, 12, 0.15, 26);
            speckle(ctx, R, hex, 220, 0.2, 1.5);
        }
    };

    // Single-tile features drawn centered in each polygon (256px design space).
    const F = {
        village(ctx, R, hex) {
            const C = 128;
            ctx.fillStyle = mix(hex, '#c9b48a', 0.55);
            ctx.globalAlpha = 0.9;
            ctx.lineCap = 'round';
            [[0, 1], [Math.PI * 0.62, 0.9], [Math.PI * 1.25, 0.95], [Math.PI * 1.7, 0.8]].forEach(([a, l]) => {
                ctx.strokeStyle = mix(hex, '#c9b48a', 0.5); ctx.lineWidth = 9;
                ctx.beginPath(); ctx.moveTo(C, C); ctx.quadraticCurveTo(C + Math.cos(a + 0.3) * 60, C + Math.sin(a + 0.3) * 60, C + Math.cos(a) * 128 * l, C + Math.sin(a) * 128 * l); ctx.stroke();
            });
            ctx.beginPath(); ctx.ellipse(C, C + 4, 30, 22, 0, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
            const items = [];
            const spots = [[-46, -38], [0, -54], [44, -40], [-62, 6], [60, 4], [-38, 46], [8, 52], [50, 44], [-14, -16], [22, 14]];
            spots.forEach(([dx, dy], i) => items.push({ x: C + dx + (R() - 0.5) * 8, y: C + dy + (R() - 0.5) * 8, house: i !== 9 || R() < 0.5, w: 22 + R() * 10 }));
            for (let i = 0; i < 9; i++) { const a = R() * Math.PI * 2, r = 82 + R() * 24; items.push({ x: C + Math.cos(a) * r, y: C + Math.sin(a) * r * 0.85, tree: true, s: 0.8 + R() * 0.5 }); }
            items.push({ x: C, y: C + 2, well: true });
            items.sort((a, b) => a.y - b.y);
            const roofs = [mix(hex, '#8b2e1e', 0.55), mix(hex, '#5a3a2a', 0.4), mix(hex, '#9a4a2a', 0.5)];
            items.forEach((it) => {
                if (it.tree) {
                    if (it.s > 1.1) drawConifer(ctx, it.x, it.y, it.s * 1.5, '#2f5a36');
                    else drawLeafy(ctx, it.x, it.y, it.s * 1.6, '#4f7f2a');
                } else if (it.well) {
                    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(it.x + 2, it.y + 3, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#8d8a83'; ctx.beginPath(); ctx.ellipse(it.x, it.y, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#2f4a6a'; ctx.beginPath(); ctx.ellipse(it.x, it.y, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
                } else if (it.house) {
                    const w = it.w, h = w * 0.55, X = it.x - w / 2, Y = it.y - h / 2, rh = h * 0.95;
                    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(X + w * 0.5 + w * 0.3, Y + h, w * 0.65, h * 0.35, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#efe3c8'; ctx.fillRect(X, Y, w, h);
                    ctx.fillStyle = '#d8c7a4'; ctx.fillRect(X + w * 0.62, Y, w * 0.38, h);
                    ctx.beginPath(); ctx.rect(X, Y, w, h); outline(ctx, 1);
                    const roof = roofs[Math.floor(R() * roofs.length)];
                    ctx.fillStyle = roof;
                    ctx.beginPath(); ctx.moveTo(X - 3, Y + 2); ctx.lineTo(X + w * 0.5, Y - rh); ctx.lineTo(X + w + 3, Y + 2); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = shade(roof, -0.3);
                    ctx.beginPath(); ctx.moveTo(X + w * 0.5, Y - rh); ctx.lineTo(X + w + 3, Y + 2); ctx.lineTo(X + w * 0.5, Y + 2); ctx.closePath(); ctx.fill();
                    ctx.beginPath(); ctx.moveTo(X - 3, Y + 2); ctx.lineTo(X + w * 0.5, Y - rh); ctx.lineTo(X + w + 3, Y + 2); ctx.closePath(); outline(ctx, 1);
                    ctx.fillStyle = '#4a3020'; ctx.fillRect(X + w * 0.4, Y + h * 0.4, w * 0.2, h * 0.6);
                    ctx.fillStyle = '#f2c46a'; ctx.fillRect(X + w * 0.12, Y + h * 0.3, w * 0.14, h * 0.25);
                }
            });
        },
        volcano(ctx, R, hex) {
            const C = 128, base = 196, top = 92;
            const glow = ctx.createRadialGradient(C, top, 4, C, top, 90);
            glow.addColorStop(0, 'rgba(255,140,40,0.55)'); glow.addColorStop(1, 'rgba(255,90,20,0)');
            ctx.fillStyle = glow; ctx.fillRect(0, 0, 256, 256);
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(C + 30, base + 3, 104, 20, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#5a3a2e';
            ctx.beginPath(); ctx.moveTo(C - 104, base); ctx.quadraticCurveTo(C - 50, base - 30, C - 24, top); ctx.lineTo(C + 2, top + 2); ctx.lineTo(C - 4, base + 6); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#34221b';
            ctx.beginPath(); ctx.moveTo(C - 4, base + 6); ctx.lineTo(C + 2, top + 2); ctx.lineTo(C + 24, top); ctx.quadraticCurveTo(C + 50, base - 30, C + 104, base); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(C - 104, base); ctx.quadraticCurveTo(C - 50, base - 30, C - 24, top); ctx.lineTo(C + 24, top); ctx.quadraticCurveTo(C + 50, base - 30, C + 104, base); outline(ctx, 2);
            ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5;
            for (let i = 0; i < 7; i++) { const x = C - 70 + i * 22 + (R() - 0.5) * 8; ctx.beginPath(); ctx.moveTo(C + (x - C) * 0.25, top + 12); ctx.lineTo(x, base - 4); ctx.stroke(); }
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            [[-12, -60, 1], [6, 40, 0.9], [14, 78, 0.7]].forEach(([sx, ex, l]) => {
                const pts = [[C + sx, top + 4], [C + sx + (ex - sx) * 0.3 + (R() - 0.5) * 10, top + 40], [C + sx + (ex - sx) * 0.7, top + 70 * l], [C + ex, top + 96 * l]];
                [[10, shade(hex, 0, 0.35)], [5, hex], [2, '#ffd27a']].forEach(([lw, col]) => {
                    ctx.strokeStyle = col; ctx.lineWidth = lw;
                    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.bezierCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1]); ctx.stroke();
                });
            });
            ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.ellipse(C, top + 1, 24, 6, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.ellipse(C, top + 1, 14, 3.2, 0, 0, Math.PI * 2); ctx.fill();
            for (let i = 0; i < 16; i++) {
                const x = C + (R() - 0.5) * 50 + (i * 2), y = top - 30 - i * 4.5 - R() * 10, r = 10 + i * 1.4 + R() * 6;
                ctx.fillStyle = `rgba(${70 + i * 3},${62 + i * 3},${60 + i * 3},${0.75 - i * 0.03})`;
                ctx.beginPath(); ctx.arc(x, Math.max(y, r * 0.6), r, 0, Math.PI * 2); ctx.fill();
            }
            for (let i = 0; i < 26; i++) {
                const a = -Math.PI / 2 + (R() - 0.5) * 1.6, d = 10 + R() * 46;
                const x = C + Math.cos(a) * d, y = top - 4 + Math.sin(a) * d;
                ctx.fillStyle = R() > 0.4 ? '#ffb347' : '#ff5a1a';
                ctx.beginPath(); ctx.arc(x, y, 1.2 + R() * 2.2, 0, Math.PI * 2); ctx.fill();
            }
            const fount = ctx.createRadialGradient(C, top - 6, 0, C, top - 6, 18);
            fount.addColorStop(0, 'rgba(255,230,140,0.95)'); fount.addColorStop(1, 'rgba(255,120,30,0)');
            ctx.fillStyle = fount; ctx.beginPath(); ctx.arc(C, top - 6, 18, 0, Math.PI * 2); ctx.fill();
        }
    };
    function featureKind(label) {
        if (/village/.test(label || '')) return 'village';
        if (/volcan/.test(label || '')) return 'volcano';
        return null;
    }

    function generatorFor(label) {
        const l = label || '';
        const pick = [
            [/asteroid belt/, 'belt'], [/frozen ocean|sea ice|pack ice/, 'seaice'], [/iceberg/, 'icebergs'], [/glacier/, 'glacier'],
            [/snowy mountain/, 'snowymtn'], [/snow hill|snowfield|snow dune/, 'snowhills'], [/icy peak|rocky peak/, 'icypeaks'], [/ocean/, 'water'], [/forest/, 'forest'], [/grass|life support/, 'grass'], [/snow/, 'snow'], [/glacier|deep ice|^ice$|frozen/, 'ice'],
            [/water|planet/, 'water'], [/mountain/, 'mountain'], [/desert|sand/, 'desert'], [/village/, 'village'],
            [/volcan/, 'volcanic'], [/lava|engine/, 'lava'], [/wall/, 'bricks'], [/stone floor|corridor|storage/, 'flagstone'],
            [/door/, 'planks'], [/rock|cave|asteroid|hull/, 'rock'], [/deep space/, 'deepspace'], [/nebula/, 'nebula'], [/void/, 'void'],
            [/star|treasure|energy|secret|control/, 'glow'], [/trap|danger|airlock/, 'hazard']
        ];
        const hit = pick.find(([re]) => re.test(l));
        return hit ? hit[1] : 'generic';
    }

    function tileFor(hex) {
        const key = String(hex || '').toLowerCase();
        if (!key || key === String(Config.DEFAULT_FILL).toLowerCase()) return null;
        if (cache.has(key)) return cache.get(key);
        if (customTiles.has(key)) { const e = { canvas: customTiles.get(key), feature: null, url: null, patterns: new WeakMap() }; cache.set(key, e); return e; }
        const label = getLabel(key);
        if (!label) return null; // not cached: the palettes may gain this colour later (custom themes)
        const canvas = document.createElement('canvas');
        canvas.width = S; canvas.height = S;
        const ctx = canvas.getContext('2d');
        const R = rng(hashStr(key + label));
        const kind = generatorFor(label);
        G[kind](ctx, R, hex, { snowcap: /mountain/.test(label) });
        let feature = null;
        const fk = featureKind(label);
        if (fk) {
            feature = document.createElement('canvas');
            feature.width = 256; feature.height = 256;
            F[fk](feature.getContext('2d'), rng(hashStr(key + fk)), hex);
        }
        const entry = { canvas, feature, url: null, patterns: new WeakMap() };
        cache.set(key, entry);
        return entry;
    }

    // Colours-only view: terrain textures and single-tile features are switched off, flat colours stay.
    let flatView = false;
    function setFlat(on) { flatView = Boolean(on); }
    function isFlat() { return flatView; }

    function patternFor(ctx, hex) {
        if (flatView) return null;
        const t = tileFor(hex);
        if (!t) return null;
        let p = t.patterns.get(ctx);
        if (!p) { p = ctx.createPattern(t.canvas, 'repeat'); t.patterns.set(ctx, p); }
        return p;
    }

    function dataUrlFor(hex) {
        const t = tileFor(hex);
        if (!t) return null;
        if (!t.url) {
            if (t.feature) {
                const c = document.createElement('canvas'); c.width = 160; c.height = 160;
                const x = c.getContext('2d');
                x.fillStyle = x.createPattern(t.canvas, 'repeat'); x.fillRect(0, 0, 160, 160);
                x.drawImage(t.feature, 4, 4, 152, 152);
                t.url = c.toDataURL('image/png');
            } else t.url = t.canvas.toDataURL('image/png');
        }
        return t.url;
    }


    // Object URL (no ';' in it) so it can be interpolated into inline style strings.
    function toObjectUrl(dataUrl) {
        const [head, b64] = dataUrl.split(',');
        const bin = atob(b64), arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return URL.createObjectURL(new Blob([arr], { type: head.slice(5).split(';')[0] }));
    }
    const objUrls = new Map();
    /** Forgets a cached object URL and frees the blob behind it. */
    function dropUrl(key) {
        const url = objUrls.get(key);
        if (url) URL.revokeObjectURL(url);
        objUrls.delete(key);
    }
    function urlFor(hex) {
        if (flatView) return null;
        if (objUrls.has(String(hex).toLowerCase())) return objUrls.get(String(hex).toLowerCase());
        const d = dataUrlFor(hex);
        if (!d) return null; // not cached, like tileFor
        const u = toObjectUrl(d);
        objUrls.set(String(hex).toLowerCase(), u);
        return u;
    }
    function isFeature(hex) { const t = tileFor(hex); return !!(t && t.feature); }

    /** Draws a centered single-tile feature clipped to the polygon. Call after the base fill path is set. */
    function drawFeature(ctx, hex, polygon) {
        if (flatView) return false;
        const t = tileFor(hex);
        if (!t || !t.feature || !polygon?.vertices?.length) return false;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, cx = 0, cy = 0;
        polygon.vertices.forEach((v) => { minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); cx += v.x; cy += v.y; });
        cx /= polygon.vertices.length; cy /= polygon.vertices.length;
        const size = Math.min(maxX - minX, maxY - minY) * 0.95;
        ctx.save();
        ctx.clip();
        ctx.drawImage(t.feature, cx - size / 2, cy - size / 2, size, size);
        ctx.restore();
        return true;
    }

    return { registerImage, unregister, resetLabels, patternFor, dataUrlFor, urlFor, isFeature, drawFeature, setFlat, isFlat, TILE_SIZE: S };
})();
