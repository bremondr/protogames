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
    const { shade } = TextureUtils;
    const urls = TextureUtils.createUrlCache();
    const LINE = 'rgba(20,16,12,0.6)';

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

    // ---- Space set: floating bodies, lit from the upper left, no ground shadow ----
    function sun(ctx, p) {
        const cx = 64, cy = 60, r = p.r, hr = p.haloR || 62;
        const halo = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, hr);
        halo.addColorStop(0, 'rgba(' + p.halo[0] + ',0.55)'); halo.addColorStop(0.45, 'rgba(' + p.halo[1] + ',0.18)'); halo.addColorStop(1, 'rgba(' + p.halo[2] + ',0)');
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, hr, 0, Math.PI * 2); ctx.fill();
        if (p.rays && p.ray) {
            const [l1, l2] = p.rayLen || [40, 50];
            ctx.save(); ctx.translate(cx, cy);
            for (let i = 0; i < p.rays; i++) {
                const a = (i / p.rays) * Math.PI * 2 + 0.13, L = i % 2 ? l1 : l2, w = (i % 2 ? 1.2 : 1.7) / p.rays;
                ctx.beginPath(); ctx.moveTo(Math.cos(a - w) * (r - 3), Math.sin(a - w) * (r - 3)); ctx.lineTo(Math.cos(a) * L, Math.sin(a) * L); ctx.lineTo(Math.cos(a + w) * (r - 3), Math.sin(a + w) * (r - 3)); ctx.closePath();
                ctx.fillStyle = i % 2 ? p.ray[1] : p.ray[0]; ctx.fill();
            }
            ctx.restore();
        }
        const body = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.34, r * 0.1, cx, cy, r);
        body.addColorStop(0, p.body[0]); body.addColorStop(0.35, p.body[1]); body.addColorStop(0.8, p.body[2]); body.addColorStop(1, p.body[3]);
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = body; ctx.fill();
        [[0.34, 0.2, 0.14], [-0.28, 0.4, 0.1], [0.2, -0.34, 0.085], [-0.48, -0.06, 0.07]].forEach(([x, y, s]) => { ctx.beginPath(); ctx.arc(cx + x * r, cy + y * r, s * r, 0, Math.PI * 2); ctx.fillStyle = p.spot; ctx.fill(); });
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.strokeStyle = p.rim; ctx.lineWidth = 1.2; ctx.stroke();
    }
    // Day/night shading over a clipped sphere + thin atmosphere rim.
    function sphereShade(ctx, cx, cy, r, atmo) {
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
        const sh = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.12, cx, cy, r * 1.25);
        sh.addColorStop(0, 'rgba(255,255,255,0.35)'); sh.addColorStop(0.45, 'rgba(255,255,255,0)'); sh.addColorStop(0.8, 'rgba(5,10,25,0.4)'); sh.addColorStop(1, 'rgba(5,10,25,0.8)');
        ctx.fillStyle = sh; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        ctx.restore();
        if (atmo) { ctx.beginPath(); ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2); ctx.strokeStyle = atmo; ctx.lineWidth = 2.5; ctx.stroke(); }
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); stroke(ctx, 1.2);
    }
    Object.assign(G, {
        star(ctx) { sun(ctx, { r: 29, halo: ['255,214,90', '255,170,40', '255,140,20'], body: ['#fffbe6', '#ffe066', '#ffad1f', '#f07c12'], ray: ['rgba(255,220,110,0.75)', 'rgba(255,190,60,0.55)'], spot: 'rgba(230,110,20,0.35)', rim: 'rgba(190,90,10,0.55)', rays: 12 }); },
        redDwarf(ctx) { sun(ctx, { r: 20, halo: ['255,110,70', '230,60,40', '200,40,30'], body: ['#ffd2b8', '#ff7a4d', '#e0412a', '#a8231a'], ray: null, spot: 'rgba(120,20,10,0.4)', rim: 'rgba(110,20,10,0.6)', rays: 0, haloR: 44 }); },
        blueGiant(ctx) { sun(ctx, { r: 34, halo: ['170,210,255', '110,160,255', '80,120,255'], body: ['#ffffff', '#d6ecff', '#7fb6ff', '#3d6fe0'], ray: ['rgba(210,232,255,0.7)', 'rgba(140,185,255,0.5)'], spot: 'rgba(60,110,220,0.25)', rim: 'rgba(40,80,190,0.55)', rays: 16, haloR: 60, rayLen: [44, 54] }); },
        neutronStar(ctx) {
            const cx = 64, cy = 60;
            // pulsar beams
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.45);
            [-1, 1].forEach((d) => {
                const g = ctx.createLinearGradient(0, 0, 0, d * 62);
                g.addColorStop(0, 'rgba(200,235,255,0.9)'); g.addColorStop(1, 'rgba(150,200,255,0)');
                ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(-13, d * 62); ctx.lineTo(13, d * 62); ctx.lineTo(3, 0); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
            });
            // magnetic field loops
            ctx.strokeStyle = 'rgba(160,140,255,0.55)'; ctx.lineWidth = 1.4;
            [[22, 9], [32, 13]].forEach(([rx, ry]) => { [-1, 1].forEach((s) => { ctx.beginPath(); ctx.ellipse(s * rx * 0.62, 0, rx * 0.62, ry, 0, 0, Math.PI * 2); ctx.stroke(); }); });
            ctx.restore();
            const halo = ctx.createRadialGradient(cx, cy, 2, cx, cy, 30);
            halo.addColorStop(0, 'rgba(230,245,255,0.95)'); halo.addColorStop(0.3, 'rgba(160,210,255,0.45)'); halo.addColorStop(1, 'rgba(120,160,255,0)');
            ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(cx - 20, cy); ctx.lineTo(cx + 20, cy); ctx.moveTo(cx, cy - 20); ctx.lineTo(cx, cy + 20); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
            ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(120,170,255,0.8)'; ctx.lineWidth = 1.2; ctx.stroke();
        },
        planet(ctx) {
            const cx = 64, cy = 60, r = 30, tilt = -0.32;
            const ring = (front) => {
                ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt);
                ctx.beginPath();
                if (front) ctx.ellipse(0, 0, 54, 14, 0, 0, Math.PI); else ctx.ellipse(0, 0, 54, 14, 0, Math.PI, Math.PI * 2);
                ctx.strokeStyle = front ? '#e9cf9a' : '#a58c5f'; ctx.lineWidth = 7; ctx.stroke();
                ctx.beginPath();
                if (front) ctx.ellipse(0, 0, 45, 11, 0, 0, Math.PI); else ctx.ellipse(0, 0, 45, 11, 0, Math.PI, Math.PI * 2);
                ctx.strokeStyle = front ? 'rgba(255,240,205,0.8)' : 'rgba(170,150,110,0.7)'; ctx.lineWidth = 2.5; ctx.stroke();
                ctx.restore();
            };
            ring(false);
            ctx.save();
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
            ctx.fillStyle = '#2f8fc4'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
            // cloud bands
            ctx.translate(cx, cy); ctx.rotate(tilt);
            [[-18, 6, '#6cc3e8'], [-6, 4, '#1f6f9f'], [5, 7, '#58b0d8'], [17, 5, '#1a5d88']].forEach(([y, h, col]) => {
                ctx.beginPath(); ctx.moveTo(-r - 4, y - h / 2);
                for (let x = -r - 4; x <= r + 4; x += 8) ctx.quadraticCurveTo(x + 4, y - h / 2 + (x % 16 ? 2 : -2), x + 8, y - h / 2);
                ctx.lineTo(r + 4, y + h / 2); ctx.lineTo(-r - 4, y + h / 2); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
            });
            ctx.restore();
            // terminator shading + highlight
            ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
            const sh = ctx.createRadialGradient(cx - 12, cy - 12, 4, cx, cy, r * 1.25);
            sh.addColorStop(0, 'rgba(255,255,255,0.35)'); sh.addColorStop(0.45, 'rgba(255,255,255,0)'); sh.addColorStop(0.8, 'rgba(5,15,35,0.35)'); sh.addColorStop(1, 'rgba(5,15,35,0.75)');
            ctx.fillStyle = sh; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
            ctx.restore();
            ctx.beginPath(); ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(140,215,255,0.45)'; ctx.lineWidth = 2.5; ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); stroke(ctx, 1.2);
            ring(true);
        },
        rockyPlanet(ctx) {
            const cx = 64, cy = 60, r = 30;
            ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
            ctx.fillStyle = '#c4673a'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
            [[-10, -12, 16, '#d98652'], [14, 10, 18, '#a8502b'], [-16, 16, 12, '#b85b33'], [12, -18, 10, '#e09a66']].forEach(([x, y, s, c]) => { ctx.beginPath(); ctx.ellipse(cx + x, cy + y, s, s * 0.7, 0.5, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); });
            // canyon
            ctx.beginPath(); ctx.moveTo(cx - 26, cy + 2); ctx.quadraticCurveTo(cx - 6, cy - 4, cx + 8, cy + 4); ctx.quadraticCurveTo(cx + 18, cy + 8, cx + 28, cy + 2);
            ctx.strokeStyle = 'rgba(90,35,18,0.6)'; ctx.lineWidth = 2.2; ctx.stroke();
            [[-12, -2, 4], [10, -10, 3], [4, 16, 5], [-20, 12, 2.5], [18, 18, 3]].forEach(([x, y, cr]) => {
                ctx.beginPath(); ctx.arc(cx + x, cy + y, cr, 0, Math.PI * 2); ctx.fillStyle = 'rgba(80,30,15,0.45)'; ctx.fill();
                ctx.beginPath(); ctx.arc(cx + x + cr * 0.15, cy + y + cr * 0.15, cr, 0.1 * Math.PI, 0.9 * Math.PI); ctx.strokeStyle = 'rgba(255,200,160,0.5)'; ctx.lineWidth = 1; ctx.stroke();
            });
            // polar cap
            ctx.beginPath(); ctx.ellipse(cx - 4, cy - r + 3, 12, 5, -0.2, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,248,240,0.85)'; ctx.fill();
            ctx.restore();
            sphereShade(ctx, cx, cy, r, 'rgba(255,170,120,0.3)');
        },
        oceanPlanet(ctx) {
            const cx = 64, cy = 60, r = 31;
            ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
            const sea = ctx.createRadialGradient(cx - 10, cy - 10, 4, cx, cy, r);
            sea.addColorStop(0, '#3fb4e6'); sea.addColorStop(1, '#0d5aa7');
            ctx.fillStyle = sea; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
            // small islands with shallows
            [[-12, -6, 7, 4, 0.4], [10, 12, 5, 3, -0.3], [16, -14, 3.5, 2.2, 0.8], [-4, 18, 3, 2, 0]].forEach(([x, y, a, b, rot]) => {
                ctx.beginPath(); ctx.ellipse(cx + x, cy + y, a + 2.5, b + 2.5, rot, 0, Math.PI * 2); ctx.fillStyle = 'rgba(120,225,230,0.55)'; ctx.fill();
                ctx.beginPath(); ctx.ellipse(cx + x, cy + y, a, b, rot, 0, Math.PI * 2); ctx.fillStyle = '#4f9a4a'; ctx.fill();
            });
            // cloud swirls
            ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineCap = 'round';
            [[-20, -18, 16, 4, -0.2], [4, -2, 20, 3.5, 0.15], [-8, 24, 14, 3, -0.1], [20, 4, 10, 3, 0.5]].forEach(([x, y, len, w, rot]) => {
                ctx.save(); ctx.translate(cx + x, cy + y); ctx.rotate(rot); ctx.lineWidth = w;
                ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.quadraticCurveTo(0, -w * 1.6, len / 2, 0); ctx.stroke();
                ctx.restore();
            });
            ctx.restore();
            sphereShade(ctx, cx, cy, r, 'rgba(150,220,255,0.5)');
        },
        comet(ctx) {
            const nx = 84, ny = 78;
            // tail streams away from the light, toward the upper left -> drawn to the upper right for readability
            ctx.save(); ctx.translate(nx, ny); ctx.rotate(-2.35);
            const tail = (len, w, c0, c1) => {
                const g = ctx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, c0); g.addColorStop(1, c1);
                ctx.beginPath(); ctx.moveTo(0, -5); ctx.quadraticCurveTo(len * 0.5, -w, len, -w * 0.4); ctx.lineTo(len, w * 0.4); ctx.quadraticCurveTo(len * 0.5, w, 0, 5); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
            };
            tail(96, 26, 'rgba(150,210,255,0.55)', 'rgba(150,210,255,0)');
            tail(80, 12, 'rgba(235,248,255,0.85)', 'rgba(235,248,255,0)');
            ctx.restore();
            // ion tail (thin, slightly offset)
            ctx.save(); ctx.translate(nx, ny); ctx.rotate(-2.15);
            const ig = ctx.createLinearGradient(0, 0, 90, 0); ig.addColorStop(0, 'rgba(120,170,255,0.7)'); ig.addColorStop(1, 'rgba(120,170,255,0)');
            ctx.beginPath(); ctx.moveTo(0, -1.5); ctx.lineTo(90, -3); ctx.lineTo(90, 3); ctx.lineTo(0, 1.5); ctx.closePath(); ctx.fillStyle = ig; ctx.fill();
            ctx.restore();
            const coma = ctx.createRadialGradient(nx, ny, 1, nx, ny, 16);
            coma.addColorStop(0, 'rgba(255,255,255,1)'); coma.addColorStop(0.4, 'rgba(200,235,255,0.6)'); coma.addColorStop(1, 'rgba(160,210,255,0)');
            ctx.fillStyle = coma; ctx.beginPath(); ctx.arc(nx, ny, 16, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(nx, ny, 5.5, 4.5, 0.4, 0, Math.PI * 2); ctx.fillStyle = '#e9f4ff'; ctx.fill(); stroke(ctx, 1);
        },
        asteroid(ctx) {
            const cx = 64, cy = 62;
            const pts = [[-30, -6], [-24, -20], [-10, -27], [6, -25], [20, -18], [30, -6], [28, 8], [20, 20], [4, 25], [-12, 22], [-26, 14]];
            ctx.save(); ctx.translate(cx, cy);
            const body = () => { ctx.beginPath(); pts.forEach(([x, y], i) => { const [nx, ny] = pts[(i + 1) % pts.length]; const mx = (x + nx) / 2, my = (y + ny) / 2; if (!i) ctx.moveTo((pts[pts.length - 1][0] + x) / 2, (pts[pts.length - 1][1] + y) / 2); ctx.quadraticCurveTo(x, y, mx, my); }); ctx.closePath(); };
            body();
            const g = ctx.createRadialGradient(-12, -14, 4, 0, 0, 38);
            g.addColorStop(0, '#a39a8e'); g.addColorStop(0.55, '#6f6860'); g.addColorStop(1, '#3d3934');
            ctx.fillStyle = g; ctx.fill();
            ctx.save(); body(); ctx.clip();
            // craters: dark bowl + lit lower-right rim
            [[-10, -6, 7], [12, 4, 5.5], [2, 15, 4], [-18, 8, 3.5], [14, -12, 3.5]].forEach(([x, y, r]) => {
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(40,36,32,0.55)'; ctx.fill();
                ctx.beginPath(); ctx.arc(x + r * 0.15, y + r * 0.15, r, 0.1 * Math.PI, 0.9 * Math.PI); ctx.strokeStyle = 'rgba(200,190,175,0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
            });
            // left-lit rim
            ctx.beginPath(); ctx.arc(-6, -8, 34, Math.PI * 0.95, Math.PI * 1.55); ctx.strokeStyle = 'rgba(230,222,205,0.35)'; ctx.lineWidth = 3; ctx.stroke();
            ctx.restore();
            body(); stroke(ctx, 1.3);
            ctx.restore();
            // two small fragments
            [[100, 34, 6], [24, 96, 4.5]].forEach(([x, y, r]) => {
                ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x - r * 0.4, y - r); ctx.lineTo(x + r * 0.8, y - r * 0.6); ctx.lineTo(x + r, y + r * 0.3); ctx.lineTo(x + r * 0.1, y + r); ctx.lineTo(x - r * 0.8, y + r * 0.6); ctx.closePath();
                ctx.fillStyle = '#7a736a'; ctx.fill(); stroke(ctx, 1);
            });
        }
    });
    const SPACE = [
        { id: 'star', label: 'Yellow Star' },
        { id: 'redDwarf', label: 'Red Dwarf' },
        { id: 'blueGiant', label: 'Blue Giant' },
        { id: 'neutronStar', label: 'Neutron Star' },
        { id: 'planet', label: 'Gas Giant' },
        { id: 'rockyPlanet', label: 'Rocky Planet' },
        { id: 'oceanPlanet', label: 'Ocean Planet' },
        { id: 'asteroid', label: 'Asteroid' },
        { id: 'comet', label: 'Comet' }
    ];

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
        { id: 'medieval', name: 'Medieval', items: MEDIEVAL },
        { id: 'space', name: 'Space', items: SPACE }
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
        THEMES[i].items.forEach((it) => { custom.delete(it.id); cache.delete(it.id); urls.drop(it.id); });
        THEMES.splice(i, 1);
        ALL = THEMES.flatMap((t) => t.items);
    }

    function canvasFor(id) {
        if (custom.has(id)) { if (!cache.has(id)) cache.set(id, { canvas: custom.get(id), url: null }); return custom.get(id); }
        // Own keys only: ids come from files and links, and "__proto__" or "constructor" must not resolve.
        if (!Object.prototype.hasOwnProperty.call(G, id)) return null;
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


    function urlFor(key) {
        if (urls.has(key) && (custom.has(key) ? cache.has(key) : true)) return urls.get(key);
        urls.drop(key);
        const d = dataUrlFor(key);
        return urls.set(key, d ? TextureUtils.toObjectUrl(d) : null);
    }
    const themes = () => THEMES.map(({ id, name }) => ({ id, name }));
    const list = (themeId) => ((THEMES.find((t) => t.id === themeId) || THEMES[0]).items).slice();
    return { registerSet, removeSet, themes, list, dataUrlFor, urlFor, drawOnPolygon, labelFor: (id) => (ALL.find((o) => o.id === id) || {}).label };
})();
