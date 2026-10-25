/**
 * PROTOGAMES MAIN ENTRY POINT
 * --------------------------------------------------------------
 * Coordinates module initialization and bootstraps the application
 * once the DOM is ready.
 */
const Main = (() => {
    /**
     * The canvas follows its container. Only a canvas of a new size needs the board laid out again; the
     * synthetic resize that playtest and focus mode dispatch (and a resize that changes nothing) just
     * redraws, so zoom and pan stay. The regeneration is not a user edit, so an unsaved change stays unsaved.
     */
    function handleResize() {
        const size = Renderer.resizeCanvas();
        if (size && !size.changed) {
            Renderer.renderBoard();
            return;
        }
        const wasDirty = AppState.getState().isDirty;
        Interactions.generateBoard(AppState.getState().boardConfig, {
            preserveColors: true,
            preserveHistory: true,
            skipDirtyFlag: true
        });
        if (wasDirty) AppState.markDirty();
    }
    const debouncedResize = Utils.debounce(handleResize, 250);

    function initializeApp() {
        UI.init();
        BoardPicker.init();
        Panels.init();
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
        PlayersPanel.init();
        PlaytestTray.init();
        PlaytestDrag.init();
        Playtest.init();
        ShareLink.init();
        ExportDialog.init();
        LoadDialog.init(uiRefs);
        Shortcuts.init();
        ThemeEditor.init();
        ThemeManager.init()
            .catch((error) => console.error('Theme restore failed:', error))
            .finally(() => startBoard().catch((error) => console.error('Start-up failed:', error)));
    }

    async function startBoard() {
        FileManager.setupAutoSave();

        window.addEventListener('resize', debouncedResize);

        // Autosaves of older versions (one per tab) become projects.
        ProjectLibrary.importLegacy();

        // A shared link wins over everything else: the person opened it on purpose. It opens as a new project.
        if (ShareLink.hasLink()) {
            let opened = false;
            try { opened = await ShareLink.openFromHash(); } catch (error) { console.error('Share link failed:', error); }
            if (opened) return;
            // The link was bad (the reason is already on screen): carry on as if there had been none.
        }
        // A showcase opens as a new project named after it.
        const showcase = FileManager.showcaseFromUrl();
        if (showcase && await FileManager.openShowcase(showcase)) return;
        // A project of the library.
        const projectId = FileManager.projectIdFromUrl();
        if (projectId && FileManager.openStoredProject(projectId)) return;

        // Nothing to open: a new project, which has to be named.
        FileManager.startNewProject();
    }

    document.addEventListener('DOMContentLoaded', initializeApp);

    return {
        startBoard,
        handleResize
    };
})();
