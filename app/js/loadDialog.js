/**
 * PROTOGAMES LOAD DIALOG
 * --------------------------------------------------------------
 * "Load…" in the Project panel: open another project kept in this browser (the list comes from ProjectLibrary), or
 * import a project file (which opens as a new project, see FileManager.openProject). The dialog also starts a new
 * project and links to the home page, which lists the projects with their delete buttons.
 */
const LoadDialog = (() => {
    const $ = (id) => document.getElementById(id);
    let el = {};
    let ui = null;

    const isOpen = () => Boolean(el.root) && !el.root.classList.contains('hidden');

    /** One row per project, newest edit first. The open project is marked and cannot be opened over itself. */
    function renderList() {
        const currentId = AppState.getState().currentProjectId;
        const entries = ProjectLibrary.list();
        const now = Date.now();
        el.list.textContent = '';
        for (const entry of entries) {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'load-item';
            const isCurrent = entry.id === currentId;
            // One odd entry must not blank the whole list, so each row is built on its own.
            let lines;
            try {
                lines = [
                    ['load-name', String(entry.name) + (isCurrent ? ' (open now)' : '')],
                    ['load-detail', ProjectLibrary.describeBoard(entry)],
                    ['load-detail', ProjectLibrary.describeAge(entry.timestamp, now)]
                ];
            } catch (error) {
                console.error('Could not describe a project.', error);
                lines = [['load-name', 'Unreadable project'], ['load-detail', 'This project cannot be read']];
                entry.readable = false;
            }
            for (const [className, text] of lines) {
                const line = document.createElement('span');
                line.className = className;
                line.textContent = text;
                button.appendChild(line);
            }
            button.disabled = isCurrent || !entry.readable;
            button.addEventListener('click', () => FileManager.openProjectById(entry.id));
            item.appendChild(button);
            el.list.appendChild(item);
        }
        el.empty.hidden = entries.some((entry) => entry.id !== currentId);
    }

    let onDismiss = null;

    /** Shows the dialog. `onClose` runs when the person closes it without choosing (close button, Escape, outside). */
    function open({ onClose = null } = {}) {
        if (!el.root) return;
        // The open project is written first (only when it changed, so looking does not bump its time).
        FileManager.autoSaveToLocalStorage();
        renderList();
        onDismiss = onClose;
        el.root.classList.remove('hidden');
        el.close.focus();
        // repo.js lists the projects of the followed GitHub repos in the dialog.
        window.dispatchEvent?.(new CustomEvent('pg:loaddialogopen'));
    }

    function close(dismissed = false) {
        if (!isOpen()) return;
        el.root.classList.add('hidden');
        const then = onDismiss;
        onDismiss = null;
        if (dismissed && then) then();
    }

    function init(uiRefs) {
        ui = uiRefs;
        el = { root: $('loadDialog'), close: $('loadClose'), list: $('loadList'), empty: $('loadEmpty') };
        if (!el.root) return;
        $('loadProjectBtn')?.addEventListener('click', () => open());
        el.close.addEventListener('click', () => close(true));
        el.root.addEventListener('pointerdown', (event) => { if (event.target === el.root) close(true); });
        // An Escape the repo panel (git-store-kit, open over the dialog) used to close itself is not for the dialog.
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && isOpen() && !event.defaultPrevented) close(true); });
        $('loadImport')?.addEventListener('click', () => {
            close();
            ui?.loadInput?.click();
        });
        $('loadNew')?.addEventListener('click', () => FileManager.startAnotherProject());
    }

    return { init, open, close, isOpen };
})();
