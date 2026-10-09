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
        PrintDialog.init();
        Shortcuts.init();
        ThemeEditor.init();
        ThemeManager.init()
            .catch((error) => console.error('Theme restore failed:', error))
            .then(() => AutosaveSlots.claim())
            .catch((error) => console.error('Autosave slot setup failed:', error))
            .finally(() => startBoard().catch((error) => console.error('Start-up failed:', error)));
    }

    async function startBoard() {
        FileManager.setupAutoSave();

        window.addEventListener('resize', debouncedResize);

        const autoSaved = FileManager.loadAutoSave();
        // A shared link wins over a saved autosave: the person opened it on purpose.
        if (ShareLink.hasLink()) {
            let opened = false;
            try { opened = await ShareLink.openFromHash(); } catch (error) { console.error('Share link failed:', error); }
            if (opened) return;
            // The link was bad (the reason is already on screen): carry on as if there had been none,
            // so the person gets their autosave offered or a fresh board instead of an empty canvas.
        }
        FileManager.showStartupMessage();
        if (autoSaved) {
            FileManager.promptAutosaveRestore(autoSaved);
            return;
        }

        Interactions.generateBoard(AppState.getState().boardConfig, { skipDirtyFlag: true });
    }

    document.addEventListener('DOMContentLoaded', initializeApp);

    return {
        startBoard
    };
})();
