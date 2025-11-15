/**
 * PROTOGAMES EXPORTER
 * --------------------------------------------------------------
 * Provides download helpers for PNG, SVG, and PDF representations
 * of the current board. Buttons are wired during initialization.
 */
const Exporter = (() => {
    let ui = null;

    function init(uiRefs) {
        ui = uiRefs;
        ui?.exportPNGBtn?.addEventListener('click', exportToPNG);
        ui?.exportSVGBtn?.addEventListener('click', exportToSVG);
        ui?.exportPDFBtn?.addEventListener('click', exportToPDF);
    }

    function exportToPNG() {
        const state = AppState.getState();
        if (!state.canvas || !state.polygons.length) {
            alert('Generate a board before exporting.');
            return;
        }
        Renderer.renderBoard();
        const dataUrl = state.canvas.toDataURL('image/png');
        const base = state.currentProjectName || Config.DEFAULT_PROJECT_NAME;
        Utils.triggerDataUrlDownload(dataUrl, `${Utils.sanitizeFileName(base)}.png`);
        UI?.showNotification('PNG exported', 3000);
    }

    function exportToSVG() {
        const state = AppState.getState();
        if (!state.canvas || !state.polygons.length) {
            alert('Generate a board before exporting.');
            return;
        }
        const { width, height } = state.canvas;
        const paths = state.polygons
            .map((polygon) => {
                const commands = polygon.vertices
                    .map((vertex, index) => `${index === 0 ? 'M' : 'L'} ${vertex.x.toFixed(2)} ${vertex.y.toFixed(2)}`)
                    .join(' ');
                const fill = polygon.color || Config.DEFAULT_FILL;
                return `<path d="${commands} Z" fill="${fill}" stroke="${Config.GRID_STROKE}" stroke-width="1" />`;
            })
            .join('');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${paths}</svg>`;
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const base = state.currentProjectName || Config.DEFAULT_PROJECT_NAME;
        Utils.triggerBlobDownload(blob, `${Utils.sanitizeFileName(base)}.svg`);
        UI?.showNotification('SVG exported', 3000);
    }

    function exportToPDF() {
        const state = AppState.getState();
        if (!state.canvas || !state.polygons.length) {
            alert('Generate a board before exporting.');
            return;
        }
        Renderer.renderBoard();
        const dataUrl = state.canvas.toDataURL('image/png');
        const base = state.currentProjectName || Config.DEFAULT_PROJECT_NAME;
        const win = window.open('', '_blank');
        if (!win) {
            alert('Please allow pop-ups to export to PDF.');
            return;
        }
        win.document.write(`
            <!DOCTYPE html>
            <html>
            <head><title>${base}</title></head>
            <body style="margin:0;display:flex;align-items:center;justify-content:center;background:#f5f5f5;">
                <img src="${dataUrl}" style="max-width:100%;height:auto;" alt="Protogames board snapshot">
            </body>
            </html>
        `);
        win.document.close();
        win.focus();
        win.onload = () => win.print();
        UI?.showNotification('PDF export ready (use browser print dialog)', 4000);
    }

    return {
        init,
        exportToPNG,
        exportToSVG,
        exportToPDF
    };
})();
