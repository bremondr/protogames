'use strict';
// Two jobs, both on the landing page only:
//  1. Share links made before the app moved to app/ point at this page (".../#b=..."). Forward them to the app
//     with the hash intact; every other visit, including the #features and #how anchors, stays here.
//  2. List the projects saved in this browser (see app/js/projectLibrary.js, loaded before this script), each a link
//     that opens it in the app, with a delete button that asks twice.
(function () {
    // A link can also arrive after the page is open (pasted into the address bar of this tab: only the hash changes).
    function forwardShareLink() {
        if (!/^#b=/.test(location.hash)) return false;
        location.replace('app/' + location.search + location.hash);
        return true;
    }
    if (forwardShareLink()) return;
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('hashchange', forwardShareLink);

    if (typeof document === 'undefined' || typeof ProjectLibrary === 'undefined') return;

    const section = document.getElementById('projects');
    const listElement = document.getElementById('projectList');
    if (!section || !listElement) return;
    const nav = document.getElementById('navProjects');
    const note = document.getElementById('projectsNote');

    function say(text) {
        if (note) note.textContent = text;
    }

    function render(focusId, restoreFocus = false) {
        const entries = ProjectLibrary.list();
        listElement.textContent = '';
        section.hidden = entries.length === 0;
        if (nav) nav.hidden = entries.length === 0;
        const now = Date.now();
        for (const entry of entries) {
            // One entry that cannot be drawn must not hide the others.
            try {
                listElement.appendChild(renderEntry(entry, now));
            } catch (error) {
                console.error('Could not show a saved project:', error);
            }
        }
        if (restoreFocus) {
            const button = focusId ? listElement.children[entries.findIndex((entry) => entry.id === focusId)] : null;
            if (button) button.children[1].focus();
            else {
                const heading = document.getElementById('projects-title');
                if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus(); }
            }
        }
    }

    function renderEntry(entry, now) {
        const item = document.createElement('li');
        item.className = 'project';

        const open = document.createElement('a');
        open.className = 'project-open';
        open.href = `app/?project=${encodeURIComponent(entry.id)}`;
        for (const [tag, text] of [['strong', entry.name], ['span', ProjectLibrary.describeBoard(entry)], ['span', ProjectLibrary.describeAge(entry.timestamp, now)]]) {
            const line = document.createElement(tag);
            line.textContent = text;
            open.appendChild(line);
        }

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'project-delete';
        del.textContent = 'Delete';
        del.setAttribute('aria-label', `Delete ${entry.name}`);
        let timer = null;
        del.addEventListener('click', () => {
            if (!del.classList.contains('sure')) {
                // The first press only asks; it goes back by itself if nothing follows.
                del.classList.add('sure');
                del.textContent = 'Delete for good?';
                del.setAttribute('aria-label', `Delete ${entry.name} for good?`);
                say(`Press again to delete ${entry.name} for good.`);
                timer = setTimeout(() => {
                    del.classList.remove('sure');
                    del.textContent = 'Delete';
                    del.setAttribute('aria-label', `Delete ${entry.name}`);
                    say('');
                }, 4000);
                return;
            }
            clearTimeout(timer);
            const entries = ProjectLibrary.list();
            const index = entries.findIndex((project) => project.id === entry.id);
            const focusId = entries[index + 1]?.id || entries[index - 1]?.id;
            ProjectLibrary.remove(entry.id);
            say(`Deleted "${entry.name}".`);
            render(focusId, true);
        });

        item.append(open, del);
        return item;
    }

    // Autosaves of older versions become projects first, so people find their work here.
    ProjectLibrary.importLegacy();
    render();
    // Another tab changed the library (a project saved, deleted): keep the list true.
    // A preview keeps its keys under a prefix of its own (see scripts/preview-runtime.js), which the event shows as it is.
    const storagePrefix = (typeof PG_BUILD !== 'undefined' && PG_BUILD && PG_BUILD.storagePrefix) || '';
    window.addEventListener('storage', (event) => {
        if (!event.key) return render();
        if (event.key.startsWith(storagePrefix) && event.key.slice(storagePrefix.length).startsWith(ProjectLibrary.KEY_PREFIX)) render();
    });
})();
