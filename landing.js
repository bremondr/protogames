'use strict';
// Two jobs, both on the landing page only:
//  1. Share links made before the app moved to app/ point at this page (".../#b=..."). Forward them to the app
//     with the hash intact; every other visit, including the #features and #how anchors, stays here.
//  2. List the projects saved in this browser (see app/js/projectLibrary.js, loaded before this script), each a link
//     that opens it in the app, with a delete button that asks twice.
(function () {
    if (/^#b=/.test(location.hash)) {
        location.replace('app/' + location.search + location.hash);
        return;
    }

    if (typeof document === 'undefined' || typeof ProjectLibrary === 'undefined') return;

    const section = document.getElementById('projects');
    const listElement = document.getElementById('projectList');
    if (!section || !listElement) return;
    const nav = document.getElementById('navProjects');
    const note = document.getElementById('projectsNote');

    function say(text) {
        if (note) note.textContent = text;
    }

    function render() {
        const entries = ProjectLibrary.list();
        listElement.textContent = '';
        section.hidden = entries.length === 0;
        if (nav) nav.hidden = entries.length === 0;
        const now = Date.now();
        for (const entry of entries) {
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
                    timer = setTimeout(() => { del.classList.remove('sure'); del.textContent = 'Delete'; }, 4000);
                    return;
                }
                clearTimeout(timer);
                ProjectLibrary.remove(entry.id);
                say(`Deleted "${entry.name}".`);
                render();
            });

            item.append(open, del);
            listElement.appendChild(item);
        }
    }

    // Autosaves of older versions become projects first, so people find their work here.
    ProjectLibrary.importLegacy();
    render();
    // Another tab changed the library (a project saved, deleted): keep the list true.
    window.addEventListener('storage', (event) => {
        if (!event.key || event.key.startsWith(ProjectLibrary.KEY_PREFIX)) render();
    });
})();
