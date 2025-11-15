/**
 * PROTOGAMES MAIN ENTRY POINT
 * --------------------------------------------------------------
 * Coordinates module initialization and bootstraps the application
 * once the DOM is ready.
 */
const Main = (() => {
    function initializeApp() {
        UI.init();
        const uiRefs = UI.getElements();
        Renderer.initializeCanvas(uiRefs.canvas);

        Interactions.init(uiRefs);
        FileManager.init(uiRefs);
        Exporter.init(uiRefs);
        FileManager.setupAutoSave();

        UI.setPaletteByColor(AppState.getState().currentColor);

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

        window.addEventListener('resize', handleResize);
    }

    function handleResize() {
        const uiRefs = UI.getElements();
        Renderer.initializeCanvas(uiRefs.canvas);
        Interactions.generateBoard(AppState.getState().boardConfig, {
            preserveColors: true,
            preserveHistory: true,
            skipDirtyFlag: true
        });
    }

    document.addEventListener('DOMContentLoaded', initializeApp);

    return {
        initializeApp
    };
})();
