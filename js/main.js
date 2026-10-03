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

        // Registered before the painting handlers so pan/zoom gestures can claim pointer events first.
        ViewControls.init();
        Interactions.init(uiRefs);
        FileManager.init(uiRefs);
        Exporter.init(uiRefs);
        Toolbar.init();
        Playtest.init();
        ShareLink.init();
        Shortcuts.init();
        ThemeEditor.init();
        ThemeManager.init().catch((error) => console.error('Theme restore failed:', error)).finally(startBoard);
    }

    function startBoard() {
        FileManager.setupAutoSave();

        window.addEventListener('resize', debouncedResize);

        const autoSaved = FileManager.loadAutoSave();
        // A shared link wins over a saved autosave: the person opened it on purpose.
        if (ShareLink.hasLink()) {
            ShareLink.openFromHash();
            return;
        }
        FileManager.showStartupMessage();
        if (autoSaved) {
            FileManager.promptAutosaveRestore(autoSaved);
            return;
        }

        Interactions.generateBoard(AppState.getState().boardConfig, { skipDirtyFlag: true });
        UI.updateCanvasMessage(AppState.getState().polygons.length);
    }

    document.addEventListener('DOMContentLoaded', initializeApp);

    return {
        initializeApp
    };
})();
