/**
 * PROTOGAMES EXPORTER
 * --------------------------------------------------------------
 * Provides download helpers for PNG and SVG representations of the
 * current board. Buttons are wired during initialization. PDF output
 * (real-world scale, paged) lives in print.js and printDialog.js.
 */
const Exporter = (() => {
    let ui = null;

    function init(uiRefs) {
        ui = uiRefs;
        ui?.exportPNGBtn?.addEventListener('click', exportToPNG);
        ui?.exportSVGBtn?.addEventListener('click', exportToSVG);
    }

    function exportToPNG() {
        const state = AppState.getState();
        if (!state.canvas || !state.polygons.length) {
            alert('Generate a board before exporting.');
            return;
        }
        // Painted at the identity view on a separate canvas, so exports ignore the current zoom/pan.
        const dataUrl = Renderer.createExportCanvas().toDataURL('image/png');
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
        let { width, height } = state.canvas;
        let polygons = state.polygons;
        let viewBox = `0 0 ${width} ${height}`;
        if (Infinite.isActive()) {
            // Frame what was drawn on an infinite board.
            const scene = Infinite.exportScene(width, height);
            polygons = scene.polygons;
            width = Math.ceil(scene.bounds.maxX - scene.bounds.minX);
            height = Math.ceil(scene.bounds.maxY - scene.bounds.minY);
            viewBox = `${scene.bounds.minX.toFixed(2)} ${scene.bounds.minY.toFixed(2)} ${width} ${height}`;
        }
        const paths = polygons
            .map((polygon) => {
                const commands = polygon.vertices
                    .map((vertex, index) => `${index === 0 ? 'M' : 'L'} ${vertex.x.toFixed(2)} ${vertex.y.toFixed(2)}`)
                    .join(' ');
                const fill = polygon.color || Config.DEFAULT_FILL;
                return `<path d="${commands} Z" fill="${fill}" stroke="${Config.GRID_STROKE}" stroke-width="1" />`;
            })
            .join('');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}">${paths}</svg>`;
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const base = state.currentProjectName || Config.DEFAULT_PROJECT_NAME;
        Utils.triggerBlobDownload(blob, `${Utils.sanitizeFileName(base)}.svg`);
        UI?.showNotification('SVG exported', 3000);
    }

    return {
        init,
        exportToPNG,
        exportToSVG
    };
})();
