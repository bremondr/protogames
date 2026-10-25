/**
 * PROTOGAMES EXPORT DIALOG
 * --------------------------------------------------------------
 * One dialog for everything that leaves the editor as a file, in four tabs:
 *   Print         the PDF made by Print.toPdf: settings on the left, a live preview of how the board sits on
 *                 the paper on the right. All layout maths lives in print.js.
 *   PNG           a picture; options for size, textures, objects, grid lines and background (Exporter.pngCanvas).
 *   SVG           a flat-colour vector picture; options for objects, grid lines and background (Exporter.svgForBoard).
 *   Project file  the .protogames.json file (FileManager.downloadProject).
 * Every tab shows what the file will be before it is downloaded. The primary button downloads the open tab.
 *
 * Controls are plain markup in index.html:
 *   [data-pr="<setting>"]            print: number input, select or checkbox bound to a setting
 *   [data-pr-group="<setting>"]      print: segmented buttons, each with data-value
 *   [data-ex="<option>"]             PNG / SVG: checkbox bound to an option of the open tab
 *   [data-ex-group="<option>"]       PNG / SVG: segmented buttons, each with data-value
 */
const ExportDialog = (() => {
    const PRINT_KEY = 'protogames_print';
    const EXPORT_KEY = 'protogames_export';
    const TABS = ['print', 'png', 'svg', 'file'];
    const DOWNLOAD_LABEL = { print: 'Download PDF', png: 'Download PNG', svg: 'Download SVG', file: 'Download file' };
    const $ = (id) => document.getElementById(id);

    let el = {};
    let settings = null;          // print settings
    let picture = null;           // { png, svg } options
    let tab = 'print';
    let busy = false;
    let previewFrame = 0;
    let svgPreviewToken = 0;
    let lastFocus = null;

    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    // ---- Settings ---------------------------------------------------------------------------------

    function loadSaved(key) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || '{}');
            return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
        } catch (e) { return {}; }
    }

    /** Remembers the print settings between sessions; textures follow the board view instead. */
    function persistPrint() {
        try {
            const { textures, ...keep } = settings;
            localStorage.setItem(PRINT_KEY, JSON.stringify(keep));
        } catch (e) { /* storage unavailable */ }
    }

    /** Remembers the picture options and the open tab; PNG textures follow the board view instead. */
    function persistExport() {
        try {
            const { textures, ...png } = picture.png;
            localStorage.setItem(EXPORT_KEY, JSON.stringify({ tab, png, svg: picture.svg }));
        } catch (e) { /* storage unavailable */ }
    }

    function set(patch) {
        if (!settings) return;
        settings = Print.normalize({ ...settings, ...patch });
        persistPrint();
        status('');
        sync();
    }

    function setPicture(patch) {
        if (!picture || (tab !== 'png' && tab !== 'svg')) return;
        picture[tab] = tab === 'png' ? Exporter.normalizePng({ ...picture.png, ...patch }) : Exporter.normalizeSvg({ ...picture.svg, ...patch });
        persistExport();
        status('');
        sync();
    }

    // ---- Open and close ---------------------------------------------------------------------------

    function isOpen() {
        return Boolean(el.root) && !el.root.classList.contains('hidden');
    }

    /** Opens the dialog on `which` (print, png, svg or file); without it, on the tab used last. */
    function open(which) {
        if (!el.root) return;
        const saved = loadSaved(EXPORT_KEY);
        // Textures start from what the board shows: colours-only view means no textures on paper or in the picture either.
        const textures = !Textures.isFlat();
        settings = Print.normalize({ ...Print.DEFAULTS, ...loadSaved(PRINT_KEY), textures });
        picture = { png: Exporter.normalizePng({ ...saved.png, textures }), svg: Exporter.normalizeSvg(saved.svg) };
        tab = TABS.includes(which) ? which : (TABS.includes(saved.tab) ? saved.tab : 'print');
        busy = false;
        lastFocus = document.activeElement;
        status('');
        sync();
        el.root.classList.remove('hidden');
        el.close.focus();
        schedulePreview();
    }

    function close() {
        if (busy || !isOpen()) return;
        el.root.classList.add('hidden');
        settings = null;
        picture = null;
        cancelAnimationFrame(previewFrame);
        svgPreviewToken += 1;
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function selectTab(which) {
        if (!TABS.includes(which) || which === tab || busy) return;
        tab = which;
        if (picture) persistExport();
        status('');
        sync();
    }

    function status(text, isError = false) {
        if (!el.status) return;
        el.status.textContent = text;
        el.status.classList.toggle('error', isError);
    }

    // ---- Print tab: showing the plan --------------------------------------------------------------

    function summaryOf(p) {
        const s = p.settings;
        const L = p.layout;
        if (!p.board || !L) return 'Generate a board first.';
        if (s.mode === 'sheet') {
            const paper = L.name === 'Custom' ? `a ${Math.round(L.paperW)} × ${Math.round(L.paperH)} mm sheet` : `${L.name} (${Math.round(L.paperW)} × ${Math.round(L.paperH)} mm)`;
            return `Board ${p.sizeText} on ${paper}`;
        }
        return `Board ${p.sizeText} · ${plural(L.pages.length, `${s.paper} page`)} (${L.cols} × ${L.rows}, ${L.orientation})`;
    }

    function objectHint(s, hasObjects) {
        if (!hasObjects) return 'There are no objects on this board.';
        if (s.objects === 'board') return 'Objects are printed on their tiles.';
        if (s.objects === 'tokens') return 'Objects are left off the board and printed as cut-out tokens the size of a tile.';
        return 'Objects are printed on the board and again as cut-out tokens.';
    }

    /** Fills the print controls, the summary and the warnings. Returns whether the PDF can be made. */
    function syncPrint() {
        const panel = $('exportPanel-print');
        const p = Print.plan(settings);
        const s = p.settings;
        const hasObjects = Boolean(p.board && p.board.tokens.length);
        const sheet = s.mode === 'sheet';

        panel.querySelectorAll('[data-pr-group]').forEach((group) => {
            const key = group.dataset.prGroup;
            group.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(s[key] === button.dataset.value)));
        });
        panel.querySelectorAll('[data-pr]').forEach((control) => {
            const value = s[control.dataset.pr];
            if (control.type === 'checkbox') control.checked = Boolean(value);
            else if (document.activeElement !== control) control.value = String(value);
        });

        $('printModeHint').textContent = sheet ? 'The whole board on one large sheet, for a print shop or plotter.' : 'Split across pages with an overlap strip to trim and glue.';
        $('printMeasureLabel').textContent = p.measureLabel || 'Tile size';
        $('printTiledOnly').hidden = sheet;
        $('printSheetOnly').hidden = !sheet;
        $('printObjectsGroup').hidden = !hasObjects;
        $('printObjectHint').textContent = objectHint(s, hasObjects);
        $('printTokenPaper').hidden = !(hasObjects && sheet && s.objects !== 'board');
        $('printLegendPlace').hidden = !(s.legend && sheet);
        $('printLegendHint').textContent = s.legend ? 'Lists every terrain and object used on the board, with its swatch, name and count.' : '';

        $('printSummary').textContent = summaryOf(p);
        const legend = $('printLegendSummary');
        legend.hidden = !p.legend;
        if (p.legend) {
            const n = p.legend.entries.length;
            legend.textContent = `Legend: ${n === 1 ? '1 entry' : `${n} entries`}${p.legend.onSheet ? ' · below the board' : ` · ${plural(p.legend.pages, `${s.paper} page`)}`}`;
        }
        const tokens = $('printTokenSummary');
        tokens.hidden = !(p.tokens && p.tokens.count);
        if (p.tokens) tokens.textContent = `${plural(p.tokens.count, 'token')} · ${plural(p.tokens.pages, `${s.paper} page`)}`;
        $('printTotal').textContent = p.pageCount ? `${plural(p.pageCount, 'page')} in total` : '';

        el.warnings.innerHTML = '';
        p.warnings.forEach(({ text }) => {
            const note = document.createElement('div');
            note.className = 'print-warning';
            note.setAttribute('role', 'status');
            note.textContent = text;
            el.warnings.appendChild(note);
        });
        return !(!p.board || !p.layout || p.blocked);
    }

    // ---- PNG and SVG tabs -------------------------------------------------------------------------

    const hasBoard = () => {
        const state = AppState.getState();
        return Boolean(state.canvas && state.polygons.length);
    };

    /** Fills the options of the PNG or SVG tab from `picture`. Returns whether there is something to export. */
    function syncPicture(which) {
        const panel = $(`exportPanel-${which}`);
        const options = picture[which];
        panel.querySelectorAll('[data-ex-group]').forEach((group) => {
            const key = group.dataset.exGroup;
            group.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(String(options[key]) === button.dataset.value)));
        });
        panel.querySelectorAll('[data-ex]').forEach((control) => { control.checked = Boolean(options[control.dataset.ex]); });
        const board = hasBoard();
        if (which === 'png') {
            const size = board ? Exporter.pngSize(options) : null;
            $('exportPngSize').textContent = size ? `${size.width} × ${size.height} px${size.scale < options.scale ? ` (the largest size that fits: ${size.scale}×)` : ''}` : '';
            $('exportPngSummary').textContent = board ? `PNG, ${size.width} × ${size.height} px` : 'Generate a board first.';
            $('exportPngSummaryNote').textContent = board ? (options.background === 'transparent' ? 'Transparent where there is no tile.' : 'On a white background.') : '';
        } else {
            $('exportSvgSummary').textContent = board ? (options.textures ? 'SVG, with textures' : 'SVG, flat colours') : 'Generate a board first.';
            $('exportSvgSummaryNote').textContent = board ? [options.textures ? 'Textures are embedded pictures.' : '', options.objects ? 'Objects and start markers are included.' : ''].filter(Boolean).join(' ') || 'Tiles only.' : '';
        }
        return board;
    }

    function syncFile() {
        const state = AppState.getState();
        const name = state.currentProjectName || Config.DEFAULT_PROJECT_NAME;
        $('exportFileName').textContent = `${Utils.sanitizeFileName(name)}.protogames.json`;
        $('exportFileNote').textContent = state.polygons.length ? `${plural(state.polygons.length, 'tile')}${state.players.length ? `, ${plural(state.players.length, 'player')}` : ''}` : 'Generate a board first.';
        return state.polygons.length > 0;
    }

    /** Draws `source` (a canvas or an image) as large as it fits into the preview canvas, keeping its proportions. */
    function drawFitted(target, source, sourceWidth, sourceHeight) {
        const box = target.parentElement ? target.parentElement.getBoundingClientRect() : { width: 400, height: 300 };
        const maxW = Math.max(120, Math.floor(box.width || 400)), maxH = Math.max(120, Math.floor(box.height || 300));
        const k = Math.min(maxW / sourceWidth, maxH / sourceHeight, 1);
        target.width = Math.max(1, Math.round(sourceWidth * k));
        target.height = Math.max(1, Math.round(sourceHeight * k));
        const ctx = target.getContext('2d');
        ctx.clearRect(0, 0, target.width, target.height);
        ctx.drawImage(source, 0, 0, target.width, target.height);
    }

    function drawPngPreview() {
        const canvas = $('exportPngCanvas');
        if (!hasBoard()) { canvas.width = canvas.height = 1; return; }
        // The preview is painted at 1×: the scale only changes how sharp the file is, not how it looks.
        const made = Exporter.pngCanvas({ ...picture.png, scale: 1 });
        drawFitted(canvas, made, made.width, made.height);
    }

    function drawSvgPreview() {
        const canvas = $('exportSvgCanvas');
        const made = Exporter.svgForBoard(picture.svg);
        if (!made) { canvas.width = canvas.height = 1; return; }
        const token = ++svgPreviewToken;
        const image = new Image();
        image.onload = () => {
            if (token !== svgPreviewToken || !isOpen() || tab !== 'svg') return;
            drawFitted(canvas, image, made.width, made.height);
        };
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(made.svg)}`;
    }

    // ---- The whole dialog -------------------------------------------------------------------------

    function sync() {
        if (!el.root || (!settings && !picture)) return;
        el.root.querySelectorAll('[data-tab]').forEach((button) => {
            const on = button.dataset.tab === tab;
            button.setAttribute('aria-selected', String(on));
            button.tabIndex = on ? 0 : -1;
        });
        TABS.forEach((name) => { $(`exportPanel-${name}`).hidden = name !== tab; });

        let ready = false;
        if (tab === 'print') ready = syncPrint();
        else if (tab === 'png' || tab === 'svg') ready = syncPicture(tab);
        else ready = syncFile();

        el.download.disabled = !ready || busy;
        el.download.textContent = busy ? 'Preparing…' : DOWNLOAD_LABEL[tab];
        schedulePreview();
    }

    function schedulePreview() {
        cancelAnimationFrame(previewFrame);
        previewFrame = requestAnimationFrame(() => {
            if (!isOpen()) return;
            try {
                if (tab === 'print' && settings) Print.drawPreview(el.canvas, settings);
                else if (tab === 'png' && picture) drawPngPreview();
                else if (tab === 'svg' && picture) drawSvgPreview();
            } catch (e) { console.error('Export preview failed:', e); }
        });
    }

    // ---- Download ---------------------------------------------------------------------------------

    async function downloadPdf() {
        busy = true;
        sync();
        status('Preparing pages…');
        try {
            const blob = await Print.toPdf(settings, (n, total) => status(`Rendering page ${n} of ${total}…`));
            const base = AppState.getState().currentProjectName || Config.DEFAULT_PROJECT_NAME;
            Utils.triggerBlobDownload(blob, `${Utils.sanitizeFileName(base)}-print.pdf`);
            UI?.showNotification('Print PDF downloaded', 3000);
            busy = false;
            close();
        } catch (err) {
            busy = false;
            status(`Could not create the PDF: ${err.message}`, true);
            sync();
        }
    }

    async function download() {
        if (busy || !isOpen()) return;
        if (tab === 'print') {
            if (settings) await downloadPdf();
            return;
        }
        try {
            if (tab === 'png') Exporter.exportToPNG(picture.png);
            else if (tab === 'svg') Exporter.exportToSVG(picture.svg);
            else FileManager.downloadProject();
            close();
        } catch (err) {
            status(`Could not export: ${err.message}`, true);
        }
    }

    // ---- Wiring -----------------------------------------------------------------------------------

    function bindGroups(root, attribute, apply) {
        root.querySelectorAll(`[${attribute}]`).forEach((group) => {
            group.addEventListener('click', (event) => {
                const button = event.target.closest('button[data-value]');
                if (button) apply(group.getAttribute(attribute), button.dataset.value);
            });
        });
    }

    function init() {
        el = {
            root: $('exportDialog'),
            close: $('exportClose'),
            cancel: $('exportCancel'),
            download: $('exportDownload'),
            canvas: $('printCanvas'),
            status: $('exportStatus'),
            warnings: $('printWarnings')
        };
        if (!el.root) return;

        $('exportButton')?.addEventListener('click', () => open());
        el.close.addEventListener('click', close);
        el.cancel.addEventListener('click', close);
        el.download.addEventListener('click', download);
        el.root.addEventListener('pointerdown', (event) => { if (event.target === el.root) close(); });
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && isOpen()) close(); });
        window.addEventListener('resize', () => { if (isOpen()) schedulePreview(); });

        const tabList = el.root.querySelector('[role="tablist"]');
        tabList.addEventListener('click', (event) => {
            const button = event.target.closest('[data-tab]');
            if (button) selectTab(button.dataset.tab);
        });
        // Arrow keys move between the tabs, as in any tab list.
        tabList.addEventListener('keydown', (event) => {
            const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
            if (!step && event.key !== 'Home' && event.key !== 'End') return;
            event.preventDefault();
            const from = Math.max(0, TABS.indexOf(event.target.dataset ? event.target.dataset.tab : tab));
            const index = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (from + step + TABS.length) % TABS.length;
            selectTab(TABS[index]);
            $(`exportTab-${tab}`).focus();
        });

        bindGroups(el.root, 'data-pr-group', (key, value) => set({ [key]: value }));
        bindGroups(el.root, 'data-ex-group', (key, value) => setPicture({ [key]: key === 'scale' ? Number(value) : value }));
        el.root.querySelectorAll('[data-pr]').forEach((control) => {
            control.addEventListener('change', () => {
                const key = control.dataset.pr;
                set({ [key]: control.type === 'checkbox' ? control.checked : control.value });
                // Show the value that was actually used (numbers are kept within their limits).
                if (control.type === 'number' && settings) control.value = String(settings[key]);
            });
        });
        el.root.querySelectorAll('[data-ex]').forEach((control) => {
            control.addEventListener('change', () => setPicture({ [control.dataset.ex]: control.checked }));
        });
    }

    return { init, open, close, isOpen };
})();
