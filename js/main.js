/**
 * PROTOGAMES MAIN ENTRY POINT
 * --------------------------------------------------------------
 * Coordinates module initialization and bootstraps the application
 * once the DOM is ready.
 */
const Main = (() => {
    const debouncedResize = Utils.debounce(() => {
        Renderer.resizeCanvas();
        Interactions.generateBoard(AppState.getState().boardConfig, {
            preserveColors: true,
            preserveHistory: true,
            skipDirtyFlag: true
        });
    }, 250);

    function initializeApp() {
        UI.init();
        const uiRefs = UI.getElements();
        UI.initializePaletteSelector(Config.DEFAULT_PALETTE_ID);
        AppState.setAvailablePalettes(Config.getAllPalettes());
        const defaultPalette = Config.getDefaultPalette();
        const paletteRender = UI.renderColorPalette(defaultPalette.id, defaultPalette.colors[0]?.hex);
        AppState.setCurrentPaletteId(paletteRender.paletteId);
        AppState.setCurrentColor(paletteRender.color);
        AppState.setEraserActive(false);
        UI.setEraserActive(false);
        Renderer.initializeCanvas(uiRefs.canvas);

        Interactions.init(uiRefs);
        FileManager.init(uiRefs);
        Exporter.init(uiRefs);
        FileManager.setupAutoSave();

        const autoSaved = FileManager.loadAutoSave();
        if (autoSaved) {
            const label = Utils.formatTimestamp(autoSaved.timestamp) || 'a previous session';
            if (confirm(`An autosave from ${label} was found. Restore it?`)) {
                FileManager.restoreState(autoSaved, { skipNotification: true });
                UI.showNotification('Autosave restored', 4000);
                return;
            }
        }

        Interactions.generateBoard(AppState.getState().boardConfig, { skipDirtyFlag: true });
        UI.updateCanvasMessage(AppState.getState().polygons.length);

        window.addEventListener('resize', debouncedResize);
    }

    document.addEventListener('DOMContentLoaded', initializeApp);

    return {
        initializeApp
    };
})();
