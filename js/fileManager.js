/**
 * PROTOGAMES FILE MANAGER
 * --------------------------------------------------------------
 * Handles persistence: auto-saving to localStorage, prompting the
 * user to save/load JSON project files, and restoring saved boards.
 */
const FileManager = (() => {
    let ui = null;
    let autoSaveIntervalId = null;

    function init(uiRefs) {
        ui = uiRefs;
        ui?.saveButton?.addEventListener('click', saveProjectFile);
        if (ui?.loadButton && ui?.loadInput) {
            ui.loadButton.addEventListener('click', () => ui.loadInput.click());
            ui.loadInput.addEventListener('change', handleFileUpload);
        }
    }

    function setupAutoSave() {
        if (autoSaveIntervalId) {
            clearInterval(autoSaveIntervalId);
        }
        autoSaveIntervalId = window.setInterval(() => {
            autoSaveToLocalStorage();
        }, Config.AUTO_SAVE_INTERVAL);
    }

    function prepareProjectData() {
        const state = AppState.getState();
        return {
            version: Config.VERSION,
            projectName: state.currentProjectName || Config.DEFAULT_PROJECT_NAME,
            created: new Date().toISOString(),
            appState: serializeAppState()
        };
    }

    function serializeAppState() {
        const state = AppState.getState();
        return {
            boardConfig: { ...state.boardConfig },
            currentColor: state.currentColor,
            paletteId: state.currentPaletteId,
            isEraserActive: state.isEraserActive,
            polygons: Utils.clonePolygons(state.polygons)
        };
    }

    function autoSaveToLocalStorage(force = false) {
        const state = AppState.getState();
        if (!state.polygons.length) return;
        if (!force && !state.isDirty) return;
        if (!window.localStorage) return;

        try {
            const payload = {
                version: Config.VERSION,
                timestamp: Date.now(),
                projectName: state.currentProjectName || Config.DEFAULT_PROJECT_NAME,
                appState: serializeAppState()
            };
            localStorage.setItem(Config.AUTO_SAVE_KEY, JSON.stringify(payload));
            state.lastSaveTime = payload.timestamp;
            AppState.clearDirty();
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                alert('Auto-save failed: Browser storage quota exceeded.');
            }
            console.error('Auto-save error:', error);
        }
    }

    function loadAutoSave() {
        if (!window.localStorage) return null;
        try {
            const raw = localStorage.getItem(Config.AUTO_SAVE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (error) {
            console.error('Failed to parse autosave payload.', error);
            return null;
        }
    }

    function saveProjectFile() {
        const state = AppState.getState();
        if (!state.polygons.length) {
            alert('Generate a board before saving a project.');
            return;
        }
        const defaultName = state.currentProjectName || Config.DEFAULT_PROJECT_NAME;
        const input = prompt('Enter a project name', defaultName);
        if (!input) return;
        const trimmed = input.trim();
        AppState.setProjectName(trimmed || Config.DEFAULT_PROJECT_NAME);

        const payload = prepareProjectData();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const filename = `${Utils.sanitizeFileName(payload.projectName)}.protogames.json`;
        Utils.triggerBlobDownload(blob, filename);
        AppState.getState().lastSaveTime = Date.now();
        AppState.clearDirty();
        autoSaveToLocalStorage(true);
        UI?.showNotification('Project saved', 3500);
    }

    function handleFileUpload(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
            try {
                const payload = JSON.parse(loadEvent.target.result);
                if (!validateProjectFile(payload)) {
                    throw new Error('This file does not look like a Protogames project.');
                }
                if (
                    AppState.getState().polygons.length &&
                    !confirm('Loading a project will replace your current board. Continue?')
                ) {
                    return;
                }
                restoreState(payload);
            } catch (error) {
                console.error('Load error:', error);
                alert(error.message || 'Unable to load project file.');
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    }

    function validateProjectFile(data) {
        if (!data || typeof data !== 'object') return false;
        if (data.version !== Config.VERSION) return false;
        if (!data.appState || typeof data.appState !== 'object') return false;
        if (!Array.isArray(data.appState.polygons)) return false;
        if (!data.appState.boardConfig) return false;
        return true;
    }

    function restoreState(payload, options = {}) {
        const statePayload = payload.appState;
        AppState.updateBoardConfig(statePayload.boardConfig);
        const paletteId = statePayload.paletteId || Config.DEFAULT_PALETTE_ID;
        const palette = Config.getPaletteById(paletteId) || Config.getDefaultPalette();
        const resolved = UI.renderColorPalette(palette.id, statePayload.currentColor || AppState.getState().currentColor);
        AppState.setCurrentPaletteId(resolved.paletteId);
        AppState.setCurrentColor(resolved.color);
        AppState.setEraserActive(Boolean(statePayload.isEraserActive));
        UI.setEraserActive(statePayload.isEraserActive);
        AppState.setPolygons(Utils.clonePolygons(statePayload.polygons || []));
        AppState.setProjectName(payload.projectName || Config.DEFAULT_PROJECT_NAME);

        UI?.updateBoardControls(AppState.getState().boardConfig);
        Renderer.renderBoard();
        UI?.updateCanvasMessage(AppState.getState().polygons.length);

        AppState.resetHistory();
        AppState.recordHistory();
        AppState.clearDirty();

        if (!options.skipNotification) {
            UI?.showNotification('Project loaded', 3500);
        }
        autoSaveToLocalStorage(true);
    }

    return {
        init,
        setupAutoSave,
        autoSaveToLocalStorage,
        loadAutoSave,
        restoreState,
        saveProjectFile
    };
})();
