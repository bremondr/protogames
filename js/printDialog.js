/**
 * PROTOGAMES PRINT DIALOG
 * --------------------------------------------------------------
 * The "Print…" dialog: settings on the left, a live preview of how the board
 * sits on the paper on the right, and a button that downloads the PDF made by
 * Print.toPdf. All layout maths lives in print.js; this file only reads the
 * controls, shows what Print.plan says and runs the export.
 *
 * Controls are plain markup in index.html:
 *   [data-pr="<setting>"]            number input, select or checkbox bound to a setting
 *   [data-pr-group="<setting>"]      segmented buttons, each with data-value
 */
const PrintDialog = (() => {
    const STORAGE_KEY = 'protogames_print';
    const BLOCKING = /no room|limit is|do not fit|first/;
    const $ = (id) => document.getElementById(id);

    let el = {};
    let settings = null;
    let busy = false;
    let previewFrame = 0;
    let lastFocus = null;

    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    // ---- Settings ---------------------------------------------------------------------------------

    function loadSaved() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (e) { return {}; }
    }

    /** Remembers the settings between sessions; textures follow the board view instead. */
    function persist() {
        try {
            const { textures, ...keep } = settings;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(keep));
        } catch (e) { /* storage unavailable */ }
    }

    function set(patch) {
        if (!settings) return;
        settings = Print.normalize({ ...settings, ...patch });
        persist();
        status('');
        sync();
    }

    // ---- Open and close ---------------------------------------------------------------------------

    function isOpen() {
        return Boolean(el.root) && !el.root.classList.contains('hidden');
    }

    function open() {
        if (!el.root) return;
        // Textures start from what the board shows: colours-only view means no textures on paper either.
        settings = Print.normalize({ ...Print.DEFAULTS, ...loadSaved(), textures: !Textures.isFlat() });
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
        cancelAnimationFrame(previewFrame);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function status(text, isError = false) {
        if (!el.status) return;
        el.status.textContent = text;
        el.status.classList.toggle('error', isError);
    }

    // ---- Showing the plan -------------------------------------------------------------------------

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

    function sync() {
        if (!settings || !el.root) return;
        const p = Print.plan(settings);
        const s = p.settings;
        const hasObjects = Boolean(p.board && p.board.tokens.length);
        const sheet = s.mode === 'sheet';

        el.root.querySelectorAll('[data-pr-group]').forEach((group) => {
            const key = group.dataset.prGroup;
            group.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(s[key] === button.dataset.value)));
        });
        el.root.querySelectorAll('[data-pr]').forEach((control) => {
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
        p.warnings.forEach((text) => {
            const note = document.createElement('div');
            note.className = 'print-warning';
            note.setAttribute('role', 'status');
            note.textContent = text;
            el.warnings.appendChild(note);
        });

        const blocked = !p.board || !p.layout || p.warnings.some((w) => BLOCKING.test(w));
        el.download.disabled = blocked || busy;
        el.download.textContent = busy ? 'Preparing…' : 'Download PDF';
        schedulePreview();
    }

    function schedulePreview() {
        cancelAnimationFrame(previewFrame);
        previewFrame = requestAnimationFrame(() => {
            if (!settings || !isOpen()) return;
            try { Print.drawPreview(el.canvas, settings); } catch (e) { console.error('Print preview failed:', e); }
        });
    }

    // ---- Download ---------------------------------------------------------------------------------

    async function download() {
        if (!settings || busy) return;
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

    // ---- Wiring -----------------------------------------------------------------------------------

    function init() {
        el = {
            root: $('printDialog'),
            close: $('printClose'),
            cancel: $('printCancel'),
            download: $('printDownload'),
            canvas: $('printCanvas'),
            status: $('printStatus'),
            warnings: $('printWarnings')
        };
        if (!el.root) return;

        $('printButton')?.addEventListener('click', open);
        el.close.addEventListener('click', close);
        el.cancel.addEventListener('click', close);
        el.download.addEventListener('click', download);
        el.root.addEventListener('pointerdown', (event) => { if (event.target === el.root) close(); });
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && isOpen()) close(); });
        window.addEventListener('resize', () => { if (isOpen()) schedulePreview(); });

        el.root.querySelectorAll('[data-pr-group]').forEach((group) => {
            group.addEventListener('click', (event) => {
                const button = event.target.closest('button[data-value]');
                if (button) set({ [group.dataset.prGroup]: button.dataset.value });
            });
        });
        el.root.querySelectorAll('[data-pr]').forEach((control) => {
            control.addEventListener('change', () => {
                const key = control.dataset.pr;
                set({ [key]: control.type === 'checkbox' ? control.checked : control.value });
                // Show the value that was actually used (numbers are kept within their limits).
                if (control.type === 'number' && settings) control.value = String(settings[key]);
            });
        });
    }

    return { init, open, close, isOpen };
})();
