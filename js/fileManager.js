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
        if (!AppState.getState().autoSaveEnabled) {
            return;
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
            autoSaveEnabled: state.autoSaveEnabled,
            polygons: Utils.clonePolygons(state.polygons)
        };
    }

    function autoSaveToLocalStorage(force = false) {
        const state = AppState.getState();
        if (!state.autoSaveEnabled) return;
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

    /**
     * Presents a clear autosave prompt with load/discard actions.
     *
     * @param {Object} payload - Autosave payload.
     */
    function promptAutosaveRestore(payload) {
        const timestamp = payload.timestamp ? new Date(payload.timestamp).toLocaleString() : 'a previous session';
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.innerHTML = `
            <div class="modal">
                <h3>Auto-saved work found</h3>
                <p>Auto-saved work found from ${timestamp}. What would you like to do?</p>
                <div class="modal-actions">
                    <button type="button" class="secondary-button" data-action="discard">Discard</button>
                    <button type="button" class="primary-button" data-action="load">Load</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const handleChoice = (action) => {
            modal.remove();
            if (action === 'load') {
                restoreState(payload, { skipNotification: true });
                UI?.showNotification('Autosave restored', 4000);
            } else {
                // discard
                localStorage.removeItem(Config.AUTO_SAVE_KEY);
                UI?.showNotification('Autosave discarded', 2500);
            }
        };

        modal.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button) return;
            const action = button.dataset.action;
            handleChoice(action);
        });
    }

    /**
     * In-page replacement for window.prompt (unsupported in some embedded
     * browsers, where it silently returns null).
     *
     * @param {string} title - Dialog heading.
     * @param {string} defaultValue - Pre-filled input value.
     * @param {Function} onConfirm - Called with the entered text.
     */
    function promptForText(title, defaultValue, onConfirm) {
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.innerHTML = `
            <form class="modal">
                <h3></h3>
                <input type="text" class="modal-input" aria-label="Project name">
                <div class="modal-actions">
                    <button type="button" class="secondary-button" data-action="cancel">Cancel</button>
                    <button type="submit" class="primary-button">Save</button>
                </div>
            </form>
        `;
        modal.querySelector('h3').textContent = title;
        const input = modal.querySelector('input');
        input.value = defaultValue;
        document.body.appendChild(modal);
        input.focus();
        input.select();

        const close = () => modal.remove();
        modal.addEventListener('click', (event) => {
            if (event.target === modal || event.target.closest('[data-action="cancel"]')) close();
        });
        modal.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') close();
        });
        modal.querySelector('form').addEventListener('submit', (event) => {
            event.preventDefault();
            const value = input.value.trim();
            close();
            onConfirm(value);
        });
    }

    /** In-page replacement for window.confirm when loading over an existing board. */
    function confirmReplace(onConfirm) {
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.innerHTML = `
            <div class="modal">
                <h3>Replace current board?</h3>
                <p>Loading a project will replace your current board.</p>
                <div class="modal-actions">
                    <button type="button" class="secondary-button" data-action="cancel">Cancel</button>
                    <button type="button" class="primary-button" data-action="confirm">Load</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('[data-action="confirm"]').focus();
        modal.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button && event.target !== modal) return;
            modal.remove();
            if (button?.dataset.action === 'confirm') onConfirm();
        });
        modal.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') modal.remove();
        });
    }

    function saveProjectFile() {
        const state = AppState.getState();
        if (!state.polygons.length) {
            UI?.showNotification('Generate a board before saving a project.');
            return;
        }
        const defaultName = state.currentProjectName || Config.DEFAULT_PROJECT_NAME;
        promptForText('Enter a project name', defaultName, (name) => {
            AppState.setProjectName(name || Config.DEFAULT_PROJECT_NAME);
            downloadProject();
        });
    }

    function downloadProject() {
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
                if (AppState.getState().polygons.length) {
                    confirmReplace(() => restoreState(payload));
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
        AppState.setObjectToolActive(false);
        window.dispatchEvent(new CustomEvent('pg:toolchange'));
        if (typeof statePayload.autoSaveEnabled === 'boolean') {
            AppState.setAutoSaveEnabled(statePayload.autoSaveEnabled);
            if (ui?.autoSaveToggle) {
                ui.autoSaveToggle.checked = statePayload.autoSaveEnabled;
            }
            setupAutoSave();
        }
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
        saveProjectFile,
        promptAutosaveRestore
    };
})();
