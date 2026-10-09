/**
 * PROTOGAMES FILE MANAGER
 * --------------------------------------------------------------
 * Handles persistence: auto-saving to localStorage, prompting the
 * user to save/load JSON project files, and restoring saved boards.
 */
const FileManager = (() => {
    let ui = null;
    let autoSaveIntervalId = null;
    // Set when startup could not restore the autosave; shown once the UI is ready.
    let pendingStartupMessage = null;

    function init(uiRefs) {
        ui = uiRefs;
        ui?.saveButton?.addEventListener('click', saveProjectFile);
        if (ui?.loadButton && ui?.loadInput) {
            ui.loadButton.addEventListener('click', () => ui.loadInput.click());
            ui.loadInput.addEventListener('change', handleFileUpload);
        }
        renderShowcases();
    }

    /** Builds the Showcase panel buttons from Config.SHOWCASES. */
    function renderShowcases() {
        const list = document.getElementById('showcaseList');
        if (!list) return;
        list.innerHTML = '';
        Config.SHOWCASES.forEach((entry) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'showcase-item';
            button.innerHTML = '<span class="showcase-name"></span><span class="showcase-desc"></span>';
            button.querySelector('.showcase-name').textContent = entry.name;
            button.querySelector('.showcase-desc').textContent = entry.description;
            button.addEventListener('click', () => openShowcase(entry));
            list.appendChild(button);
        });
    }

    /** True when the board holds painted tiles or placed objects the user could lose. */
    function hasUserWork() {
        return AppState.getState().polygons.some(
            (polygon) => polygon.object || (polygon.color && polygon.color !== Config.DEFAULT_TILE_COLOR)
        );
    }

    function openShowcase(entry) {
        if (hasUserWork()) {
            confirmReplace(() => loadShowcase(entry));
        } else {
            loadShowcase(entry);
        }
    }

    /**
     * Fetches a showcase project and shows it. The saved geometry belongs to
     * the author's canvas size, so the grid is regenerated for this canvas
     * with the showcase's colors and objects carried over by tile id.
     */
    async function loadShowcase(entry) {
        try {
            const response = await fetch(entry.file);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = ProjectFormat.parse(await response.text());
            restoreState(payload, { skipNotification: true });
            AppState.setProjectName(entry.id);
            Interactions.generateBoard(AppState.getState().boardConfig, {
                preserveColors: true,
                preserveHistory: true,
                skipDirtyFlag: true
            });
            autoSaveToLocalStorage(true);
            UI?.showNotification(`Showcase "${entry.name}" loaded`, 3500);
        } catch (error) {
            console.error('Showcase load error:', error);
            UI?.showNotification('Could not load showcase. Serve the app over http(s) to use showcases.', 5000);
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
        return ProjectFormat.createProject({
            projectName: state.currentProjectName || Config.DEFAULT_PROJECT_NAME,
            appState: serializeAppState()
        });
    }

    function serializeAppState() {
        const state = AppState.getState();
        return {
            boardConfig: { ...state.boardConfig },
            currentColor: state.currentColor,
            paletteId: state.currentPaletteId,
            isEraserActive: state.isEraserActive,
            autoSaveEnabled: state.autoSaveEnabled,
            // An infinite board is regenerated around the view; only the painted tiles need saving.
            polygons: Utils.clonePolygons(Infinite.isActive() ? Infinite.paintedTiles(state.polygons) : state.polygons)
        };
    }

    function autoSaveToLocalStorage(force = false) {
        const state = AppState.getState();
        if (!state.autoSaveEnabled) return;
        if (!state.polygons.length) return;
        if (!force && !state.isDirty) return;

        try {
            // Inside the try: with storage blocked, even reading window.localStorage throws.
            if (!window.localStorage) return;
            const payload = ProjectFormat.createAutosave({
                projectName: state.currentProjectName || Config.DEFAULT_PROJECT_NAME,
                appState: serializeAppState()
            });
            localStorage.setItem(AutosaveSlots.ownKey(), JSON.stringify(payload));
            AppState.clearDirty();
            quotaWarned = false;
        } catch (error) {
            // Every stroke and the 30 s timer retry the save, so the warning is shown once until a save works again.
            if (error && error.name === 'QuotaExceededError' && !quotaWarned) {
                quotaWarned = true;
                UI?.showNotification('Auto-save failed: browser storage is full. Save the project to a file so you do not lose work.', 8000);
            }
            console.error('Auto-save error:', error);
        }
    }

    let quotaWarned = false;

    /** The slot offered at start-up, so a choice in the prompt can clean it up. */
    let offeredSlot = null;

    /**
     * Looks for work to restore: this tab's own autosave (after a reload) or the newest one
     * left behind by a tab that is gone. Other open tabs' autosaves are never touched.
     */
    function loadAutoSave() {
        offeredSlot = null;
        const slot = AutosaveSlots.takeRestorable();
        if (!slot) return null;
        try {
            const project = ProjectFormat.parse(slot.raw);
            offeredSlot = slot;
            return project;
        } catch (error) {
            console.error('Could not restore the autosave.', error);
            if (error instanceof ProjectFormat.ProjectFormatError) {
                pendingStartupMessage = {
                    title: 'Auto-saved work could not be restored',
                    message: `${error.message} The next auto-save will replace it.`
                };
            }
            // A newer version's autosave is not damaged, this (older, cached) copy of the app just cannot read it.
            const unreadableHere = error instanceof ProjectFormat.ProjectFormatError && error.code === 'newer-version';
            if (!slot.own && !unreadableHere) AutosaveSlots.remove(slot.key);
            return null;
        }
    }

    /**
     * Presents a clear autosave prompt with load/discard actions.
     *
     * @param {Object} payload - Autosave payload.
     */
    function promptAutosaveRestore(payload) {
        const timestamp = Utils.formatTimestamp(payload.timestamp) || 'a previous session';
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
            const slot = offeredSlot;
            offeredSlot = null;
            if (action === 'load') {
                // Restoring writes this tab's own slot; an adopted orphan is then redundant.
                restoreState(payload, { skipNotification: true });
                if (slot && !slot.own) AutosaveSlots.remove(slot.key);
                UI?.showNotification('Autosave restored', 4000);
            } else {
                if (slot) AutosaveSlots.remove(slot.key);
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

    /** In-page replacement for window.alert: a titled message with an OK button. */
    function showMessage(title, message) {
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.innerHTML = `
            <div class="modal" role="alertdialog" aria-modal="true">
                <h3></h3>
                <p></p>
                <div class="modal-actions">
                    <button type="button" class="primary-button" data-action="ok">OK</button>
                </div>
            </div>
        `;
        modal.querySelector('h3').textContent = title;
        modal.querySelector('p').textContent = message;
        document.body.appendChild(modal);
        modal.querySelector('[data-action="ok"]').focus();
        const close = () => modal.remove();
        modal.addEventListener('click', (event) => {
            if (event.target === modal || event.target.closest('[data-action="ok"]')) close();
        });
        modal.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') close();
        });
    }

    /** Shows (once) the message recorded while trying to restore the autosave at startup. */
    function showStartupMessage() {
        if (!pendingStartupMessage) return;
        const { title, message } = pendingStartupMessage;
        pendingStartupMessage = null;
        showMessage(title, message);
    }

    /** In-page replacement for window.confirm when loading over an existing board. */
    function confirmReplace(onConfirm, options = {}) {
        const { message = 'Loading a project will replace your current board.', confirmLabel = 'Load', onCancel } = options;
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.innerHTML = `
            <div class="modal">
                <h3>Replace current board?</h3>
                <p></p>
                <div class="modal-actions">
                    <button type="button" class="secondary-button" data-action="cancel">Cancel</button>
                    <button type="button" class="primary-button" data-action="confirm"></button>
                </div>
            </div>
        `;
        modal.querySelector('p').textContent = message;
        modal.querySelector('[data-action="confirm"]').textContent = confirmLabel;
        document.body.appendChild(modal);
        modal.querySelector('[data-action="confirm"]').focus();
        const decide = (confirmed) => {
            modal.remove();
            if (confirmed) onConfirm(); else if (onCancel) onCancel();
        };
        modal.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button && event.target !== modal) return;
            decide(button?.dataset.action === 'confirm');
        });
        modal.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') decide(false);
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
                openProject(ProjectFormat.parse(loadEvent.target.result));
            } catch (error) {
                console.error('Load error:', error);
                showMessage('Could not open this file', error.message || 'Unable to load project file.');
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    }

    /**
     * Shows a parsed project, asking first when it would replace work. The restore runs from the
     * confirmation too, so a failure there is reported instead of vanishing into a click handler.
     */
    function openProject(payload) {
        const open = () => {
            try {
                restoreState(payload);
            } catch (error) {
                console.error('Load error:', error);
                showMessage('Could not open this file', error.message || 'Unable to load project file.');
            }
        };
        if (hasUserWork()) confirmReplace(open); else open();
    }

    function restoreState(payload, options = {}) {
        const statePayload = payload.appState;
        // Cloned before anything is changed, so a problem here cannot leave a half-loaded board.
        const polygons = Utils.clonePolygons(statePayload.polygons || []);
        // Replaces the settings: keys the file lacks fall back to defaults instead of the previous board's values.
        AppState.setBoardConfig(statePayload.boardConfig);
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
            setupAutoSave();
        }
        AppState.setPolygons(polygons);
        // An infinite board has no fixed outline to frame: show what was drawn instead of the origin.
        if (Infinite.isActive()) AppState.resetView();
        AppState.setProjectName(payload.projectName || Config.DEFAULT_PROJECT_NAME);

        UI?.updateBoardControls(AppState.getState().boardConfig);
        Renderer.renderBoard();

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
        openProject,
        hasUserWork,
        confirmReplace,
        saveProjectFile,
        promptAutosaveRestore,
        showStartupMessage
    };
})();
