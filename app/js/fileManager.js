/**
 * PROTOGAMES FILE MANAGER
 * --------------------------------------------------------------
 * Handles persistence: every board is a project in the browser's library
 * (ProjectLibrary), auto-saved as it changes; project files can be saved
 * and opened; saved boards are restored from either.
 */
const FileManager = (() => {
    const DEFAULT_NEW_NAME = 'Untitled board';
    let ui = null;
    let autoSaveIntervalId = null;
    function init(uiRefs) {
        ui = uiRefs;
        ui?.loadInput?.addEventListener('change', handleFileUpload);
        wireProjectPanel();
    }

    function wireProjectPanel() {
        const nameInput = document.getElementById('projectNameInput');
        nameInput?.addEventListener('change', () => renameProject(nameInput.value));
    }

    /** Shows the open project's name in the Project panel. */
    function syncProjectPanel() {
        const nameInput = document.getElementById('projectNameInput');
        if (nameInput) nameInput.value = AppState.getState().currentProjectName || '';
    }

    function renameProject(text) {
        const name = ProjectLibrary.cleanName(text);
        if (name) {
            AppState.setProjectName(name);
            autoSaveToLocalStorage(true);
            UI?.showNotification('Project renamed', 2500);
        }
        syncProjectPanel();
    }

    // ---- Which project is open -----------------------------------------------------------------------------------

    /** The project the address names (`?project=<id>`), or null. */
    function projectIdFromUrl() {
        const id = new URLSearchParams(location.search).get('project');
        return ProjectLibrary.isValidId(id) ? id : null;
    }

    /** The showcase the address asks for (`?showcase=<id>`), or null. */
    function showcaseFromUrl() {
        return new URLSearchParams(location.search).get('showcase') || null;
    }

    /** Puts the project id into the address (and drops everything else, a share link's hash included). */
    function setAddress(id) {
        try { history.replaceState(null, '', location.pathname + (id ? `?project=${encodeURIComponent(id)}` : '')); } catch (error) { /* sandboxed frame */ }
    }

    /** Saves the open project and lets go of it, so the board can be replaced without touching its saved copy. */
    function detachProject() {
        autoSaveToLocalStorage(true);
        AppState.setProjectId(null);
    }

    /** Makes the board on screen a project of its own in the library, named `name`, and saves it. Returns its id. */
    function registerNewProject(name) {
        const id = ProjectLibrary.newId();
        AppState.setProjectId(id);
        AppState.setProjectName(ProjectLibrary.cleanName(name) || DEFAULT_NEW_NAME);
        setAddress(id);
        syncProjectPanel();
        autoSaveToLocalStorage(true);
        return id;
    }

    /**
     * Shows a board as a new project: the open project is saved and stays as it was, `show` puts the board
     * on screen, and the new project takes its name from the board unless `name` is given. When `show`
     * fails, the open project stays open.
     */
    function showAsNewProject(show, name) {
        const previousId = AppState.getState().currentProjectId;
        detachProject();
        try {
            show();
        } catch (error) {
            AppState.setProjectId(previousId);
            throw error;
        }
        return registerNewProject(name === undefined ? AppState.getState().currentProjectName : name);
    }

    /** Shows a project from the library. Returns false (after saying why) when it cannot be opened. */
    function openStoredProject(id) {
        const raw = ProjectLibrary.read(id);
        if (raw === null) {
            showMessage('Project not found', 'This project is not in this browser any more. It may have been deleted, or it was made in another browser.');
            return false;
        }
        try {
            restoreState(ProjectFormat.parse(raw), { skipNotification: true });
        } catch (error) {
            console.error('Could not open the stored project.', error);
            showMessage('This project could not be opened', `${error.message || 'It is damaged.'} It stays in your browser; the home page can delete it.`);
            return false;
        }
        AppState.setProjectId(id);
        syncProjectPanel();
        return true;
    }

    /** A blank board and the question that every new project starts with: what is it called? */
    async function startNewProject() {
        Interactions.generateBoard(AppState.getState().boardConfig, { skipDirtyFlag: true });
        await messageClosed;
        promptForText('Name your project', DEFAULT_NEW_NAME, (name) => registerNewProject(name), {
            confirmLabel: 'Create',
            cancelLabel: 'Back to home',
            required: true,
            message: 'It is saved in this browser under this name; you can have as many projects as you like.',
            onCancel: () => location.assign('../')
        });
    }

    /** True when the board holds painted tiles, objects, start markers or players the user could lose. */
    function hasUserWork() {
        const state = AppState.getState();
        return state.players.length > 0 || state.polygons.some(
            (polygon) => polygon.object || polygon.start || (polygon.color && polygon.color !== Config.DEFAULT_TILE_COLOR)
        );
    }

    /**
     * Opens a showcase board (see Config.SHOWCASES) as a new project named after it. The saved geometry
     * belongs to the author's canvas size, so the grid is regenerated for this canvas with the showcase's
     * colors and objects carried over by tile id. Returns true when it opened.
     */
    async function openShowcase(id) {
        const entry = Config.SHOWCASES.find((item) => item.id === id);
        if (!entry) {
            showMessage('Showcase not found', 'There is no showcase board with this name.');
            return false;
        }
        try {
            const response = await fetch(entry.file);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = ProjectFormat.parse(await response.text());
            showAsNewProject(() => {
                restoreState(payload, { skipNotification: true });
                Interactions.generateBoard(AppState.getState().boardConfig, {
                    preserveColors: true,
                    preserveHistory: true,
                    skipDirtyFlag: true
                });
            }, entry.name);
            UI?.showNotification(`Showcase "${entry.name}" opened as a new project`, 3500);
            return true;
        } catch (error) {
            console.error('Showcase load error:', error);
            showMessage('Could not open the showcase', 'The example board could not be loaded. Serve the app over http(s) to use showcases.');
            return false;
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
            players: Utils.clone(state.players),
            dice: state.dice.map((die) => ({ sides: die.sides })),
            // An infinite board is regenerated around the view; only the painted tiles need saving.
            polygons: Utils.clonePolygons(Infinite.isActive() ? Infinite.paintedTiles(state.polygons) : state.polygons)
        };
    }

    function autoSaveToLocalStorage(force = false) {
        const state = AppState.getState();
        if (!state.autoSaveEnabled) return;
        if (!state.polygons.length) return;
        // Nothing is saved before the project has a name and an id (see startNewProject).
        if (!state.currentProjectId) return;
        if (!force && !state.isDirty) return;

        try {
            // Inside the try: with storage blocked, even reading window.localStorage throws.
            if (!window.localStorage) return;
            const payload = ProjectFormat.createAutosave({
                projectName: state.currentProjectName || Config.DEFAULT_PROJECT_NAME,
                appState: serializeAppState()
            });
            ProjectLibrary.write(state.currentProjectId, payload);
            AppState.clearDirty();
            quotaWarned = false;
        } catch (error) {
            // Every stroke and the 30 s timer retry the save, so the warning is shown once until a save works again.
            if (error && error.name === 'QuotaExceededError' && !quotaWarned) {
                quotaWarned = true;
                UI?.showNotification('Auto-save failed: browser storage is full. Delete projects you no longer need on the home page, or save this one to a file so you do not lose work.', 8000);
            }
            console.error('Auto-save error:', error);
        }
    }

    let quotaWarned = false;

    let modalCount = 0;
    /** Settles when the message on screen (if any) is dismissed, so a follow-up dialog does not stack on top of it. */
    let messageClosed = Promise.resolve();

    /**
     * Makes a freshly built backdrop a proper modal dialog: role and label, Tab kept inside, focus
     * moved in (to `initialFocus`, else the first control), Escape routed to `onEscape`. Returns a
     * function that removes the backdrop and puts focus back where it was.
     */
    function presentModal(backdrop, { initialFocus, onEscape, role = 'dialog' } = {}) {
        const opener = document.activeElement;
        const dialog = backdrop.querySelector('.modal');
        const heading = backdrop.querySelector('h3');
        dialog.setAttribute('role', role);
        dialog.setAttribute('aria-modal', 'true');
        if (heading) {
            heading.id = heading.id || `fileManagerModalTitle${++modalCount}`;
            dialog.setAttribute('aria-labelledby', heading.id);
        }
        document.body.appendChild(backdrop);
        FocusUtils.trapTab(backdrop);
        backdrop.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || !onEscape) return;
            event.preventDefault(); // so playtest/popover Escape handlers leave their own state alone
            onEscape();
        });
        (initialFocus || FocusUtils.tabbables(backdrop)[0])?.focus();
        return () => {
            backdrop.remove();
            if (opener && opener.isConnected && opener.focus) opener.focus();
        };
    }

    /**
     * In-page replacement for window.prompt (unsupported in some embedded
     * browsers, where it silently returns null).
     *
     * @param {string} title - Dialog heading.
     * @param {string} defaultValue - Pre-filled input value.
     * @param {Function} onConfirm - Called with the entered text.
     * @param {{confirmLabel?:string,cancelLabel?:string,message?:string,required?:boolean,onCancel?:Function}} [options]
     *   `required` keeps the dialog open until the text is not empty.
     */
    function promptForText(title, defaultValue, onConfirm, options = {}) {
        const { confirmLabel = 'Save', cancelLabel = 'Cancel', message = '', required = false, onCancel } = options;
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.innerHTML = `
            <form class="modal">
                <h3></h3>
                <p class="modal-note" hidden></p>
                <input type="text" class="modal-input" aria-label="Project name" maxlength="${ProjectLibrary.MAX_NAME_LENGTH}">
                <div class="modal-actions">
                    <button type="button" class="secondary-button" data-action="cancel"></button>
                    <button type="submit" class="primary-button"></button>
                </div>
            </form>
        `;
        modal.querySelector('h3').textContent = title;
        const note = modal.querySelector('.modal-note');
        if (message) { note.textContent = message; note.hidden = false; }
        modal.querySelector('[data-action="cancel"]').textContent = cancelLabel;
        modal.querySelector('[type="submit"]').textContent = confirmLabel;
        const input = modal.querySelector('input');
        input.value = defaultValue;
        let close = () => {};
        const cancel = () => { close(); if (onCancel) onCancel(); };
        close = presentModal(modal, { initialFocus: input, onEscape: cancel });
        input.select();

        modal.addEventListener('click', (event) => {
            if (event.target === modal || event.target.closest('[data-action="cancel"]')) cancel();
        });
        modal.querySelector('form').addEventListener('submit', (event) => {
            event.preventDefault();
            const value = ProjectLibrary.cleanName(input.value);
            if (required && !value) {
                input.setAttribute('aria-invalid', 'true');
                input.focus();
                return;
            }
            close();
            onConfirm(value);
        });
    }

    /** In-page replacement for window.alert: a titled message with an OK button. */
    function showMessage(title, message) {
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.innerHTML = `
            <div class="modal">
                <h3></h3>
                <p></p>
                <div class="modal-actions">
                    <button type="button" class="primary-button" data-action="ok">OK</button>
                </div>
            </div>
        `;
        modal.querySelector('h3').textContent = title;
        modal.querySelector('p').textContent = message;
        let resolveClosed = () => {};
        messageClosed = new Promise((resolve) => { resolveClosed = resolve; });
        const dismiss = () => { close(); resolveClosed(); };
        const close = presentModal(modal, { initialFocus: modal.querySelector('[data-action="ok"]'), onEscape: () => dismiss(), role: 'alertdialog' });
        modal.addEventListener('click', (event) => {
            if (event.target === modal || event.target.closest('[data-action="ok"]')) dismiss();
        });
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
        const closeModal = presentModal(modal, { initialFocus: modal.querySelector('[data-action="confirm"]'), onEscape: () => decide(false) });
        function decide(confirmed) {
            closeModal();
            if (confirmed) onConfirm(); else if (onCancel) onCancel();
        }
        modal.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button && event.target !== modal) return;
            decide(button?.dataset.action === 'confirm');
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
            syncProjectPanel();
            downloadProject();
        });
    }

    /** Goes to a blank board that asks for a name (the open project is saved first). */
    function startAnotherProject() {
        autoSaveToLocalStorage(true);
        location.assign(location.pathname);
    }

    /** Opens another project of the library in this tab; the open one is saved first. */
    function openProjectById(id) {
        if (!ProjectLibrary.isValidId(id)) return;
        if (id === AppState.getState().currentProjectId) return;
        autoSaveToLocalStorage(true);
        location.assign(`${location.pathname}?project=${encodeURIComponent(id)}`);
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
     * Shows a parsed project file as a new project of its own: the open one is saved and stays as it was, so
     * nothing is asked and nothing is lost. A failure is reported instead of vanishing into a click handler.
     */
    function openProject(payload) {
        try {
            showAsNewProject(() => restoreState(payload), payload.projectName || 'Opened project');
        } catch (error) {
            console.error('Load error:', error);
            showMessage('Could not open this file', error.message || 'Unable to load project file.');
        }
    }

    /** True when the tile has something a person did to it: a colour other than blank, an object or a start marker. */
    const isPainted = (polygon) => Boolean(polygon.object || polygon.start || (polygon.color && polygon.color !== Config.DEFAULT_TILE_COLOR));

    /**
     * Lays a restored board out for the canvas it is shown on. The saved tiles carry the pixel coordinates of the
     * canvas they were drawn on, so on a smaller or larger window they would run off the screen or float in a corner
     * until the next resize. The grid is generated again for this canvas and the colours, objects and start markers
     * are carried over by tile id (the same step a window resize takes).
     *
     * Left as saved: an infinite board (its tiles do not depend on the canvas), and a board whose painted tiles
     * would not all be found again by id (boards saved by older versions have other ids; regenerating would lose their
     * colours). A country board waits for its outlines, which may still have to be downloaded.
     */
    function refitToCanvas(saved) {
        const state = AppState.getState();
        const config = state.boardConfig;
        if (typeof Geometry === 'undefined' || typeof Interactions === 'undefined' || !state.canvas || !config) return;
        if (Infinite.isActive()) return;
        const regenerate = () => {
            const fresh = new Set(Geometry.generateGrid(AppState.getState().boardConfig, AppState.getState().canvas, null).map((p) => p.id));
            if (!saved.every((polygon) => fresh.has(polygon.id) || !isPainted(polygon))) return;
            Interactions.generateBoard(AppState.getState().boardConfig, { preserveColors: true, preserveHistory: true, skipDirtyFlag: true });
        };
        if (config.boardShape === 'country') {
            if (typeof CountryBoard === 'undefined' || !CountryBoard.ready) return;
            CountryBoard.ready().then((ok) => {
                // Only if nothing has replaced the restored board in the meantime.
                if (ok && AppState.getState().polygons === saved) regenerate();
            });
            return;
        }
        regenerate();
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
        AppState.setStartToolActive(false);
        AppState.setPlayers(Utils.clone(statePayload.players || []));
        AppState.setDice(Utils.clone(statePayload.dice || Config.STANDARD_DICE));
        window.dispatchEvent(new CustomEvent('pg:toolchange'));
        if (typeof statePayload.autoSaveEnabled === 'boolean') {
            AppState.setAutoSaveEnabled(statePayload.autoSaveEnabled);
            setupAutoSave();
        }
        AppState.setPolygons(polygons);
        // A loaded board is shown whole, whatever pan and zoom the board before it had (an infinite board has no
        // outline to frame: what was drawn is shown instead of the origin).
        AppState.resetView();
        AppState.setProjectName(payload.projectName || Config.DEFAULT_PROJECT_NAME);

        syncProjectPanel();
        UI?.updateBoardControls(AppState.getState().boardConfig);
        Renderer.renderBoard();

        AppState.resetHistory();
        AppState.recordHistory();
        AppState.clearDirty();
        refitToCanvas(AppState.getState().polygons);
        // A new design starts a new game: the running playtest (if any) belonged to the old one. Told last,
        // so the players panel and its hints see the new tiles.
        if (typeof Playtest !== 'undefined') Playtest.designChanged();

        if (!options.skipNotification) {
            UI?.showNotification('Project loaded', 3500);
        }
        autoSaveToLocalStorage(true);
    }

    return {
        init,
        setupAutoSave,
        autoSaveToLocalStorage,
        projectIdFromUrl,
        showcaseFromUrl,
        openStoredProject,
        startNewProject,
        registerNewProject,
        showAsNewProject,
        openShowcase,
        restoreState,
        openProject,
        hasUserWork,
        confirmReplace,
        saveProjectFile,
        startAnotherProject,
        downloadProject,
        openProjectById,
        showMessage
    };
})();
