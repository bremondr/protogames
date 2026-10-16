/**
 * PROTOGAMES PRINT
 * --------------------------------------------------------------
 * Print preparation: the board is printed at a real-world tile size (mm),
 * either split across home-printer pages (with overlap and page labels) or
 * as one large sheet, with objects drawn on the board and/or as separate
 * cut-out tokens. Produces a PDF in the browser (one JPEG image per page).
 *
 * plan(settings)            -> layout, sizes, page counts, warnings (no drawing)
 * drawPreview(canvas, s)    -> preview of how the board fits the paper
 * toPdf(settings, onStep)   -> Promise<Blob>
 */
const Print = (() => {
    const PAPERS = {
        A4: [210, 297],
        Letter: [215.9, 279.4],
        A3: [297, 420],
        A2: [420, 594],
        A1: [594, 841],
        A0: [841, 1189]
    };
    const DEFAULTS = {
        mode: 'tiled', // 'tiled' (home printer) | 'sheet' (one large sheet)
        tileMm: 25,
        paper: 'A4', // home printer paper, also used for token pages
        orientation: 'auto', // tiled pages: auto | portrait | landscape
        marginMm: 10,
        overlapMm: 5,
        sheet: 'fit', // 'fit' (sheet = board + margin) or a PAPERS key
        cropMarks: true,
        objects: 'board', // 'board' | 'tokens' | 'both'
        textures: true,
        labels: true,
        legend: false, // list the terrains (and objects) used, with their names
        legendPlace: 'sheet' // single sheet: 'sheet' (below the board) | 'page' (separate page)
    };
    const LEGEND = { colW: 64, rowH: 10, head: 11, swatch: 7 };
    const TOKEN_GAP_MM = 3;
    const PAGE_DPI = 200;
    const MAX_SHEET_PX = 9000;
    const MAX_CANVAS_PX = 16 * 1024 * 1024; // iOS Safari refuses canvases above ~16.7 million pixels
    const MAX_PAGES = 300;

    // ---- Board source and scale ---------------------------------------------------------

    function sourcePolygons() {
        const s = AppState.getState();
        if (!s.canvas || !s.polygons.length) return [];
        if (typeof Infinite !== 'undefined' && Infinite.isActive()) return Infinite.exportScene(s.canvas.width, s.canvas.height).polygons;
        return s.polygons;
    }

    /** The tile dimension the mm setting refers to (hex: across flats, square: side, triangle: side). */
    function tileMeasure(p) {
        const w = p.bounds.maxX - p.bounds.minX;
        const h = p.bounds.maxY - p.bounds.minY;
        if (p.type === 'hexagon') return Math.min(w, h);
        if (p.type === 'triangle') return Math.max(w, h);
        return w;
    }

    function measureLabel(type) {
        if (type === 'hexagon') return 'Hex size, across flats';
        if (type === 'triangle') return 'Triangle side';
        return 'Square side';
    }

    function board(settings) {
        const polygons = sourcePolygons();
        if (!polygons.length) return null;
        const bounds = ViewMath.boundsOf(polygons);
        const mmPerWorld = settings.tileMm / tileMeasure(polygons[0]);
        return {
            polygons,
            bounds,
            mmPerWorld,
            wMm: (bounds.maxX - bounds.minX) * mmPerWorld,
            hMm: (bounds.maxY - bounds.minY) * mmPerWorld,
            type: polygons[0].type,
            tokens: polygons.filter((p) => p.object).map((p) => p.object)
        };
    }

    // ---- Legend ---------------------------------------------------------------------------

    function terrainLabels() {
        const map = new Map();
        const palettes = typeof Config.getAllPalettes === 'function' ? Config.getAllPalettes() : Config.COLOR_PALETTES;
        (palettes || []).forEach((p) => (p.colors || []).forEach((c) => { const k = String(c.hex).toLowerCase(); if (!map.has(k)) map.set(k, c.label); }));
        return map;
    }

    /** Terrains and objects used on the board, most used first. */
    function legendEntries(b) {
        const blank = String(Config.DEFAULT_FILL).toLowerCase();
        const labels = terrainLabels();
        const terrain = new Map();
        const objects = new Map();
        b.polygons.forEach((p) => {
            const hex = String(p.color || '').toLowerCase();
            if (hex && hex !== blank) terrain.set(hex, (terrain.get(hex) || 0) + 1);
            if (p.object) objects.set(p.object, (objects.get(p.object) || 0) + 1);
        });
        const out = [...terrain].sort((a, c) => c[1] - a[1]).map(([hex, count]) => ({ kind: 'terrain', key: hex, name: labels.get(hex) || hex, count }));
        if (objects.size) {
            [...objects].sort((a, c) => c[1] - a[1]).forEach(([id, count]) => out.push({ kind: 'object', key: id, name: (typeof Objects !== 'undefined' && Objects.labelFor(id)) || id, count }));
        }
        return out;
    }

    /** Height a legend needs in a given width (mm). */
    function legendSize(n, widthMm) {
        const cols = Math.max(1, Math.floor(widthMm / LEGEND.colW));
        const rows = Math.ceil(n / cols);
        return { cols, rows, h: LEGEND.head + rows * LEGEND.rowH };
    }

    // ---- Layout -----------------------------------------------------------------------------

    function rowName(i) {
        let s = '';
        i += 1;
        while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
        return s;
    }

    function pagesAlong(length, printable, overlap) {
        if (length <= printable) return 1;
        return Math.ceil((length - printable) / (printable - overlap)) + 1;
    }

    function tiledLayout(b, s) {
        const [pw, ph] = PAPERS[s.paper] || PAPERS.A4;
        const options = s.orientation === 'portrait' ? [[pw, ph, 'portrait']] : s.orientation === 'landscape' ? [[ph, pw, 'landscape']] : [[pw, ph, 'portrait'], [ph, pw, 'landscape']];
        const mg = s.marginMm, ov = s.overlapMm;
        let best = null;
        for (const [w, h, orientation] of options) {
            const printW = w - mg * 2, printH = h - mg * 2;
            if (printW <= ov * 2 || printH <= ov * 2) continue;
            const cols = pagesAlong(b.wMm, printW, ov);
            const rows = pagesAlong(b.hMm, printH, ov);
            if (!best || cols * rows < best.cols * best.rows) best = { paperW: w, paperH: h, orientation, printW, printH, cols, rows };
        }
        if (!best) return null;
        const stepX = best.printW - ov, stepY = best.printH - ov;
        const offX = (best.printW + (best.cols - 1) * stepX - b.wMm) / 2;
        const offY = (best.printH + (best.rows - 1) * stepY - b.hMm) / 2;
        best.pages = [];
        for (let r = 0; r < best.rows; r++) {
            for (let c = 0; c < best.cols; c++) {
                best.pages.push({ row: r, col: c, label: `${rowName(r)}${c + 1}`, x0: c * stepX - offX, y0: r * stepY - offY });
            }
        }
        return best;
    }

    function sheetLayout(b, s, legendCount = 0) {
        const mg = s.marginMm;
        const band = legendCount ? legendSize(legendCount, Math.max(b.wMm, LEGEND.colW)).h + 4 : 0;
        let paperW, paperH, name;
        if (s.sheet === 'fit' || !PAPERS[s.sheet]) {
            paperW = Math.max(b.wMm, band ? LEGEND.colW : 0) + mg * 2; paperH = b.hMm + band + mg * 2; name = 'Custom';
        } else {
            const [w, h] = PAPERS[s.sheet];
            // Orientation that fits the board, or the one that crops least.
            const portraitFits = b.wMm <= w - mg * 2 && b.hMm + band <= h - mg * 2;
            const landscapeFits = b.wMm <= h - mg * 2 && b.hMm + band <= w - mg * 2;
            const landscape = landscapeFits && !portraitFits ? true : !portraitFits && !landscapeFits ? b.wMm > b.hMm : false;
            paperW = landscape ? h : w; paperH = landscape ? w : h; name = s.sheet;
        }
        const printW = paperW - mg * 2, printH = paperH - mg * 2;
        const fits = b.wMm <= printW + 0.01 && b.hMm + band <= printH + 0.01;
        const boardFits = b.wMm <= printW + 0.01 && b.hMm <= printH + 0.01;
        return { paperW, paperH, name, printW, printH, fits, boardFits, band, pages: [{ label: 'Sheet', x0: -(printW - b.wMm) / 2, y0: -(printH - band - b.hMm) / 2 }] };
    }

    function tokenLayout(b, s) {
        const [w, h] = PAPERS[s.paper] || PAPERS.A4;
        const printW = w - s.marginMm * 2, printH = h - s.marginMm * 2 - 6; // room for the page title
        const t = s.tileMm;
        const cols = Math.floor((printW + TOKEN_GAP_MM) / (t + TOKEN_GAP_MM));
        const rows = Math.floor((printH + TOKEN_GAP_MM) / (t + TOKEN_GAP_MM));
        const perPage = cols * rows;
        const count = b.tokens.length;
        return { paperW: w, paperH: h, cols, rows, perPage, count, pages: perPage > 0 ? Math.ceil(count / perPage) : 0 };
    }

    /** Resolution for a page of this size: PAGE_DPI, lowered so one canvas stays within the browser limits. */
    function pageDpi(wMm, hMm) {
        const bySide = (MAX_SHEET_PX * 25.4) / Math.max(wMm, hMm);
        const byArea = Math.sqrt(MAX_CANVAS_PX / (wMm * hMm)) * 25.4;
        return Math.min(PAGE_DPI, bySide, byArea);
    }

    const fmt = (mm) => (mm >= 1000 ? `${(mm / 10).toFixed(0)} cm` : `${Math.round(mm)} mm`);

    function normalize(settings) {
        const s = { ...DEFAULTS, ...(settings || {}) };
        // A cleared field ('' or null) is "no value", not 0; unknown strings (e.g. from old saved settings) fall back to the default.
        const num = (v, min, max, d) => (v === '' || v === null || v === undefined || !Number.isFinite(+v) ? d : Math.min(max, Math.max(min, +v)));
        const oneOf = (v, allowed, d) => (allowed.includes(v) ? v : d);
        s.mode = oneOf(s.mode, ['tiled', 'sheet'], DEFAULTS.mode);
        s.paper = oneOf(s.paper, Object.keys(PAPERS), DEFAULTS.paper);
        s.orientation = oneOf(s.orientation, ['auto', 'portrait', 'landscape'], DEFAULTS.orientation);
        s.sheet = oneOf(s.sheet, ['fit', ...Object.keys(PAPERS)], DEFAULTS.sheet);
        s.objects = oneOf(s.objects, ['board', 'tokens', 'both'], DEFAULTS.objects);
        s.legendPlace = oneOf(s.legendPlace, ['sheet', 'page'], DEFAULTS.legendPlace);
        for (const key of ['cropMarks', 'textures', 'labels', 'legend']) s[key] = Boolean(s[key]);
        s.tileMm = num(s.tileMm, 5, 200, DEFAULTS.tileMm);
        s.marginMm = num(s.marginMm, 0, 30, DEFAULTS.marginMm);
        s.overlapMm = num(s.overlapMm, 0, 30, DEFAULTS.overlapMm);
        return s;
    }

    /** A note for the dialog; blocking ones stop the PDF from being made. */
    const warning = (text, blocking = false) => ({ text, blocking });

    /** Everything the dialog shows, without drawing anything. */
    function plan(settings) {
        const s = normalize(settings);
        const b = board(s);
        if (!b) return { settings: s, board: null, warnings: [warning('Generate a board first.', true)], pageCount: 0, blocked: true };
        const warnings = [];
        const entries = s.legend ? legendEntries(b) : [];
        if (s.legend && !entries.length) warnings.push(warning('Nothing is painted yet, so the legend would be empty.'));
        let legendOnSheet = s.mode === 'sheet' && s.legendPlace === 'sheet' && entries.length > 0;
        let layout = s.mode === 'sheet' ? sheetLayout(b, s, legendOnSheet ? entries.length : 0) : tiledLayout(b, s);
        if (legendOnSheet && layout && !layout.fits && layout.boardFits === false) {
            // keep the board warning below
        } else if (legendOnSheet && layout && !layout.fits) {
            warnings.push(warning(`The legend does not fit on ${layout.name} below the board, so it goes on a separate page.`));
            legendOnSheet = false;
            layout = sheetLayout(b, s, 0);
        }
        if (!layout) warnings.push(warning('Margins and overlap leave no room on the page.', true));
        if (layout && s.mode === 'sheet' && !layout.fits) warnings.push(warning(`The board (${fmt(b.wMm)} × ${fmt(b.hMm)}) is larger than ${layout.name}. Pick a bigger sheet or smaller tiles; the edges would be cut off.`));
        let legend = null;
        if (entries.length) {
            if (legendOnSheet) legend = { entries, onSheet: true, pages: 0 };
            else {
                const [pw, ph] = PAPERS[s.paper] || PAPERS.A4;
                const size = legendSize(1, pw - s.marginMm * 2);
                const rowsPerPage = Math.max(1, Math.floor((ph - s.marginMm * 2 - LEGEND.head) / LEGEND.rowH));
                legend = { entries, onSheet: false, paperW: pw, paperH: ph, cols: size.cols, rowsPerPage, perPage: size.cols * rowsPerPage, pages: Math.ceil(entries.length / (size.cols * rowsPerPage)) };
            }
        }
        const wantTokens = s.objects !== 'board' && b.tokens.length > 0;
        const tokens = wantTokens ? tokenLayout(b, s) : null;
        if (tokens && tokens.perPage === 0) warnings.push(warning(`Tokens of ${s.tileMm} mm do not fit on ${s.paper}.`, true));
        const boardPages = layout ? layout.pages.length : 0;
        const pageCount = boardPages + (legend ? legend.pages : 0) + (tokens ? tokens.pages : 0);
        if (pageCount > MAX_PAGES) warnings.push(warning(`That would be ${pageCount} pages; the limit is ${MAX_PAGES}. Use smaller tiles.`, true));
        if (layout && s.mode === 'sheet') {
            const dpi = pageDpi(layout.paperW, layout.paperH);
            if (dpi < PAGE_DPI - 1) warnings.push(warning(`This sheet is too large to print at full resolution; it will be made at about ${Math.round(dpi)} dpi.`));
        }
        return { settings: s, board: b, layout, tokens, legend, boardPages, pageCount, warnings, blocked: warnings.some((w) => w.blocking), measureLabel: measureLabel(b.type), sizeText: `${fmt(b.wMm)} × ${fmt(b.hMm)}` };
    }

    // ---- Drawing ------------------------------------------------------------------------------

    function withTextures(on, fn) {
        const T = typeof Textures !== 'undefined' ? Textures : null;
        const was = T ? T.isFlat() : false;
        if (T) T.setFlat(!on);
        try { return fn(); } finally { if (T) T.setFlat(was); }
    }

    /** A canvas and its 2D context, or a clear error when the browser refuses (too large, out of memory). */
    function createSurface(w, h) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w));
        c.height = Math.max(1, Math.round(h));
        const ctx = c.getContext('2d');
        if (!ctx) throw new Error('The browser could not allocate a drawing surface this large. Pick a smaller sheet or smaller tiles.');
        return { c, ctx };
    }

    /** Paints a board region (in board mm, origin = board top-left) onto a new canvas. */
    function renderRegion(b, s, region, pxPerMm) {
        const { c, ctx } = createSurface(region.w * pxPerMm, region.h * pxPerMm);
        const view = {
            scale: b.mmPerWorld * pxPerMm,
            x: -(b.bounds.minX * b.mmPerWorld + region.x0) * pxPerMm,
            y: -(b.bounds.minY * b.mmPerWorld + region.y0) * pxPerMm
        };
        const polygons = s.objects === 'tokens' ? b.polygons.map((p) => (p.object ? { ...p, object: undefined } : p)) : b.polygons;
        withTextures(s.textures, () => Renderer.paint(ctx, { polygons, width: c.width, height: c.height, view }));
        return c;
    }

    function newPage(wMm, hMm, dpi) {
        const k = Math.min(dpi, pageDpi(wMm, hMm)) / 25.4;
        const { c, ctx } = createSurface(wMm * k, hMm * k);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.scale(k, k); // draw in mm from here on
        return { c, ctx, k };
    }

    function text(ctx, str, x, y, size, weight = 400, color = '#333', align = 'left') {
        ctx.font = `${weight} ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
        ctx.fillStyle = color;
        ctx.textAlign = align;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(str, x, y);
    }

    function tiledPage(p, b, s, layout, page, index) {
        const { c, ctx, k } = newPage(layout.paperW, layout.paperH, PAGE_DPI);
        const mg = s.marginMm, ov = s.overlapMm;
        const img = renderRegion(b, s, { x0: page.x0, y0: page.y0, w: layout.printW, h: layout.printH }, k);
        ctx.drawImage(img, mg, mg, layout.printW, layout.printH);
        ctx.save();
        ctx.lineWidth = 0.25;
        ctx.strokeStyle = 'rgba(30,30,30,0.7)';
        ctx.setLineDash([1.5, 1.2]);
        // Overlap guides: the strip beyond the dashed line repeats on the next page.
        if (page.col < layout.cols - 1) { const x = mg + layout.printW - ov; ctx.beginPath(); ctx.moveTo(x, mg); ctx.lineTo(x, mg + layout.printH); ctx.stroke(); }
        if (page.row < layout.rows - 1) { const y = mg + layout.printH - ov; ctx.beginPath(); ctx.moveTo(mg, y); ctx.lineTo(mg + layout.printW, y); ctx.stroke(); }
        ctx.restore();
        if (s.labels && mg >= 5) {
            const size = Math.min(3.2, mg * 0.4);
            text(ctx, page.label, mg, mg - size * 0.6, size * 1.25, 700, '#111');
            text(ctx, `Page ${index + 1} of ${p.pageCount} · row ${rowName(page.row)}, column ${page.col + 1} · tiles ${s.tileMm} mm`, mg + size * 4, mg - size * 0.6, size, 400, '#555');
            const right = page.col < layout.cols - 1 ? `${rowName(page.row)}${page.col + 2} →` : '';
            const below = page.row < layout.rows - 1 ? `↓ ${rowName(page.row + 1)}${page.col + 1}` : '';
            if (right) text(ctx, right, layout.paperW - mg, mg - size * 0.6, size, 600, '#555', 'right');
            if (below) text(ctx, below, mg, layout.paperH - mg + size * 1.6, size, 600, '#555');
        }
        return c;
    }

    function cropMarks(ctx, x, y, w, h, mg) {
        const len = Math.min(6, mg - 1), gap = 1.5;
        if (len <= 1) return;
        ctx.save();
        ctx.lineWidth = 0.2;
        ctx.strokeStyle = '#000';
        const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
        for (const [cx, cy, dx, dy] of [[x, y, -1, -1], [x + w, y, 1, -1], [x, y + h, -1, 1], [x + w, y + h, 1, 1]]) {
            line(cx + dx * gap, cy, cx + dx * (gap + len), cy);
            line(cx, cy + dy * gap, cx, cy + dy * (gap + len));
        }
        ctx.restore();
    }

    async function sheetPage(p, b, s, layout) {
        const images = p.legend && p.legend.onSheet ? await legendImages(p.legend.entries, s) : null;
        const { c, ctx, k } = newPage(layout.paperW, layout.paperH, PAGE_DPI);
        const mg = s.marginMm;
        const page = layout.pages[0];
        const img = renderRegion(b, s, { x0: page.x0, y0: page.y0, w: layout.printW, h: layout.printH }, k);
        ctx.drawImage(img, mg, mg, layout.printW, layout.printH);
        if (s.cropMarks) cropMarks(ctx, mg - page.x0, mg - page.y0, b.wMm, b.hMm, mg - page.x0);
        if (images) drawLegend(ctx, p.legend.entries, images, mg, mg + layout.printH - layout.band + 4, layout.printW, 'Legend');
        return c;
    }

    async function legendImages(entries, s) {
        const map = new Map();
        for (const e of entries) {
            let url = null;
            if (e.kind === 'object') url = typeof Objects !== 'undefined' ? Objects.dataUrlFor(e.key) : null;
            else if (s.textures && typeof Textures !== 'undefined') url = Textures.dataUrlFor(e.key);
            map.set(e.kind + ':' + e.key, await loadImage(url));
        }
        return map;
    }

    /** Draws legend entries in columns starting at (x, y) mm, within width w mm. */
    function drawLegend(ctx, entries, images, x, y, w, title) {
        const cols = Math.max(1, Math.floor(w / LEGEND.colW));
        const colW = w / cols;
        text(ctx, title, x, y + 5, 4, 700, '#111');
        ctx.strokeStyle = '#c8ccd2'; ctx.lineWidth = 0.2;
        ctx.beginPath(); ctx.moveTo(x, y + 7.5); ctx.lineTo(x + w, y + 7.5); ctx.stroke();
        const rows = Math.ceil(entries.length / cols);
        entries.forEach((e, i) => {
            const col = Math.floor(i / rows), row = i % rows; // fill down each column
            const ex = x + col * colW, ey = y + LEGEND.head + row * LEGEND.rowH;
            const sw = LEGEND.swatch;
            const img = images.get(e.kind + ':' + e.key);
            if (e.kind === 'terrain') {
                ctx.fillStyle = e.key; ctx.fillRect(ex, ey, sw, sw);
                if (img) ctx.drawImage(img, ex, ey, sw, sw);
                ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.2; ctx.strokeRect(ex, ey, sw, sw);
            } else if (img) ctx.drawImage(img, ex - 0.5, ey - 0.5, sw + 1, sw + 1);
            const name = e.name.length > 30 ? e.name.slice(0, 29) + '…' : e.name;
            text(ctx, name, ex + sw + 2.5, ey + sw * 0.66, 3.4, 500, '#222');
            text(ctx, '× ' + e.count, ex + colW - 4, ey + sw * 0.66, 2.8, 400, '#777', 'right');
        });
    }

    async function legendPages(p, s, legend, firstIndex) {
        const images = await legendImages(legend.entries, s);
        const pages = [];
        for (let i = 0; i < legend.pages; i++) {
            const { c, ctx } = newPage(legend.paperW, legend.paperH, PAGE_DPI);
            const slice = legend.entries.slice(i * legend.perPage, (i + 1) * legend.perPage);
            drawLegend(ctx, slice, images, s.marginMm, s.marginMm, legend.paperW - s.marginMm * 2, `Legend · page ${firstIndex + i + 1} of ${p.pageCount}`);
            pages.push(c);
        }
        return pages;
    }

    function loadImage(url) {
        return new Promise((resolve) => {
            if (!url) { resolve(null); return; }
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = url;
        });
    }

    async function tokenPages(p, b, s, tokens, firstIndex) {
        const ids = [...new Set(b.tokens)];
        const images = new Map();
        for (const id of ids) images.set(id, await loadImage(typeof Objects !== 'undefined' ? Objects.dataUrlFor(id) : null));
        const pages = [];
        const t = s.tileMm, mg = s.marginMm;
        for (let pi = 0; pi < tokens.pages; pi++) {
            const { c, ctx } = newPage(tokens.paperW, tokens.paperH, PAGE_DPI);
            text(ctx, `Tokens · page ${firstIndex + pi + 1} of ${p.pageCount} · ${t} mm · cut along the grey lines`, mg, mg + 3, 3.2, 600, '#333');
            const top = mg + 6;
            const slice = b.tokens.slice(pi * tokens.perPage, (pi + 1) * tokens.perPage);
            slice.forEach((id, i) => {
                const x = mg + (i % tokens.cols) * (t + TOKEN_GAP_MM);
                const y = top + Math.floor(i / tokens.cols) * (t + TOKEN_GAP_MM);
                const img = images.get(id);
                if (img) { const pad = t * 0.08; ctx.drawImage(img, x + pad, y + pad, t - pad * 2, t - pad * 2); }
                ctx.lineWidth = 0.25;
                ctx.strokeStyle = '#9aa0a6';
                ctx.strokeRect(x, y, t, t);
            });
            pages.push(c);
        }
        return pages;
    }

    // ---- PDF ------------------------------------------------------------------------------------

    async function jpegOf(canvas) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
        if (!blob) throw new Error('The browser could not encode a page image (the page may be too large for it).');
        return new Uint8Array(await blob.arrayBuffer());
    }

    /** A PDF with one full-page JPEG per page. pages: [{ wPt, hPt, pxW, pxH, jpeg: Uint8Array }]. */
    function buildPdf(pages) {
        const enc = new TextEncoder();
        const chunks = [];
        let length = 0;
        const offsets = [];
        const push = (d) => { const bytes = typeof d === 'string' ? enc.encode(d) : d; chunks.push(bytes); length += bytes.length; };
        const obj = (num, body) => { offsets[num] = length; push(`${num} 0 obj\n`); body(); push('\nendobj\n'); };
        push('%PDF-1.4\n%âãÏÓ\n');
        obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
        obj(2, () => push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] /Count ${pages.length} >>`));
        pages.forEach((p, i) => {
            const pn = 3 + i * 3, cn = pn + 1, im = pn + 2;
            const w = p.wPt.toFixed(2), h = p.hPt.toFixed(2);
            obj(pn, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${cn} 0 R >>`));
            const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
            obj(cn, () => { push(`<< /Length ${content.length} >>\nstream\n`); push(content); push('\nendstream'); });
            obj(im, () => {
                push(`<< /Type /XObject /Subtype /Image /Width ${p.pxW} /Height ${p.pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
                push(p.jpeg);
                push('\nendstream');
            });
        });
        const xref = length;
        const total = 3 + pages.length * 3;
        let table = `xref\n0 ${total}\n0000000000 65535 f \n`;
        for (let n = 1; n < total; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
        push(table);
        push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
        return new Blob(chunks, { type: 'application/pdf' });
    }

    const PT = 72 / 25.4;
    const tick = () => new Promise((r) => setTimeout(r, 0));

    async function toPdf(settings, onStep) {
        const p = plan(settings);
        if (!p.board || !p.layout || p.blocked) throw new Error((p.warnings.find((w) => w.blocking) || p.warnings[0])?.text || 'Nothing to print.');
        const { board: b, layout, settings: s } = p;
        const out = [];
        const add = async (canvas, wMm, hMm) => {
            out.push({ wPt: wMm * PT, hPt: hMm * PT, pxW: canvas.width, pxH: canvas.height, jpeg: await jpegOf(canvas) });
            canvas.width = canvas.height = 0;
            if (onStep) onStep(out.length, p.pageCount);
            await tick();
        };
        if (s.mode === 'sheet') await add(await sheetPage(p, b, s, layout), layout.paperW, layout.paperH);
        else for (let i = 0; i < layout.pages.length; i++) await add(tiledPage(p, b, s, layout, layout.pages[i], i), layout.paperW, layout.paperH);
        if (p.legend && p.legend.pages) {
            for (const c of await legendPages(p, s, p.legend, out.length)) await add(c, p.legend.paperW, p.legend.paperH);
        }
        if (p.tokens && p.tokens.pages) {
            for (const c of await tokenPages(p, b, s, p.tokens, out.length)) await add(c, p.tokens.paperW, p.tokens.paperH);
        }
        return buildPdf(out);
    }

    // ---- Preview --------------------------------------------------------------------------------

    function drawPreview(canvas, settings) {
        if (!canvas) return null;
        const p = plan(settings);
        const dpr = window.devicePixelRatio || 1;
        const cssW = canvas.clientWidth || 480, cssH = canvas.clientHeight || 360;
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);
        if (!p.board || !p.layout) return p;
        const { board: b, layout, settings: s } = p;
        const mg = s.marginMm;
        // Extent in board mm (paper rectangles included).
        let ext;
        if (s.mode === 'sheet') {
            const pg = layout.pages[0];
            ext = { x: pg.x0 - mg, y: pg.y0 - mg, w: layout.paperW, h: layout.paperH };
            ext = { x: Math.min(ext.x, 0), y: Math.min(ext.y, 0), w: Math.max(ext.x + ext.w, b.wMm) - Math.min(ext.x, 0), h: Math.max(ext.y + ext.h, b.hMm) - Math.min(ext.y, 0) };
        } else {
            const last = layout.pages[layout.pages.length - 1];
            const first = layout.pages[0];
            ext = { x: first.x0 - mg, y: first.y0 - mg, w: last.x0 + layout.printW + mg - (first.x0 - mg), h: last.y0 + layout.printH + mg - (first.y0 - mg) };
        }
        const pad = 16;
        const scale = Math.min((cssW - pad * 2) / ext.w, (cssH - pad * 2) / ext.h);
        const ox = (cssW - ext.w * scale) / 2 - ext.x * scale;
        const oy = (cssH - ext.h * scale) / 2 - ext.y * scale;
        const X = (mm) => ox + mm * scale, Y = (mm) => oy + mm * scale;

        if (s.mode === 'sheet') {
            const pg = layout.pages[0];
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(X(pg.x0 - mg), Y(pg.y0 - mg), layout.paperW * scale, layout.paperH * scale);
        } else {
            for (const pg of layout.pages) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(X(pg.x0 - mg), Y(pg.y0 - mg), layout.paperW * scale, layout.paperH * scale);
            }
        }
        const img = renderRegion(b, s, { x0: 0, y0: 0, w: b.wMm, h: b.hMm }, scale * dpr);
        ctx.drawImage(img, X(0), Y(0), b.wMm * scale, b.hMm * scale);

        if (s.mode === 'sheet') {
            const pg = layout.pages[0];
            ctx.strokeStyle = layout.fits ? 'rgba(47,111,237,0.9)' : '#d64545';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(X(pg.x0 - mg), Y(pg.y0 - mg), layout.paperW * scale, layout.paperH * scale);
            ctx.setLineDash([4, 3]);
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(47,111,237,0.6)';
            ctx.strokeRect(X(pg.x0), Y(pg.y0), layout.printW * scale, layout.printH * scale);
            ctx.setLineDash([]);
            if (p.legend && p.legend.onSheet && layout.band) {
                const by = pg.y0 + layout.printH - layout.band + 4;
                const bh = layout.band - 4;
                ctx.fillStyle = 'rgba(21,27,38,0.08)';
                ctx.fillRect(X(pg.x0), Y(by), layout.printW * scale, bh * scale);
                const rows = Math.ceil(p.legend.entries.length / Math.max(1, Math.floor(layout.printW / LEGEND.colW)));
                const cols = Math.max(1, Math.floor(layout.printW / LEGEND.colW));
                const colW = layout.printW / cols;
                p.legend.entries.forEach((e, i) => {
                    const col = Math.floor(i / rows), row = i % rows;
                    const ex = pg.x0 + col * colW, ey = by + LEGEND.head + row * LEGEND.rowH;
                    ctx.fillStyle = e.kind === 'terrain' ? e.key : '#6b7280';
                    ctx.fillRect(X(ex), Y(ey), LEGEND.swatch * scale, LEGEND.swatch * scale);
                    ctx.fillStyle = '#9aa0a6';
                    ctx.fillRect(X(ex + LEGEND.swatch + 2.5), Y(ey + LEGEND.swatch * 0.35), Math.min(colW - 16, e.name.length * 1.8) * scale, Math.max(1, 2.2 * scale));
                });
            }
        } else {
            ctx.lineWidth = 1.5;
            ctx.font = '600 12px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (const pg of layout.pages) {
                const x = X(pg.x0), y = Y(pg.y0), w = layout.printW * scale, h = layout.printH * scale;
                ctx.fillStyle = 'rgba(47,111,237,0.08)';
                ctx.fillRect(x, y, w, h);
                ctx.strokeStyle = 'rgba(47,111,237,0.9)';
                ctx.strokeRect(x, y, w, h);
                if (w > 26 && h > 18) {
                    const cx = x + w / 2, cy = y + h / 2;
                    ctx.fillStyle = 'rgba(21,27,38,0.78)';
                    const tw = ctx.measureText(pg.label).width + 10;
                    ctx.fillRect(cx - tw / 2, cy - 9, tw, 18);
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(pg.label, cx, cy + 0.5);
                }
            }
        }
        return p;
    }

    return { PAPERS, DEFAULTS, plan, drawPreview, toPdf, buildPdf, normalize, rowName };
})();
