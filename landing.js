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

    const MINUTE = 60 * 1000;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;

    /** "just now", "5 minutes ago", "yesterday", "3 days ago"; an old one becomes its date. */
    function describeAge(timestamp, now) {
        if (!timestamp) return 'Never saved';
        const age = Math.max(0, now - timestamp);
        const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
        if (age < MINUTE) return 'Edited just now';
        if (age < HOUR) return `Edited ${plural(Math.floor(age / MINUTE), 'minute')}`;
        if (age < DAY) return `Edited ${plural(Math.floor(age / HOUR), 'hour')}`;
        if (age < 2 * DAY) return 'Edited yesterday';
        if (age < 30 * DAY) return `Edited ${plural(Math.floor(age / DAY), 'day')}`;
        return `Edited ${new Date(timestamp).toISOString().slice(0, 10)}`;
    }

    const BOARD_NAMES = { hexagon: 'Hexagon', rectangle: 'Rectangle', triangle: 'Triangle', circle: 'Circle', infinite: 'Infinite', country: 'Country' };
    const TILE_NAMES = { hexagon: 'hexagon', square: 'square', triangle: 'triangle' };

    /** "Hexagon board, 91 hexagon tiles" for a library entry. */
    function describeBoard(entry) {
        if (!entry.readable) return 'This project cannot be read';
        const board = BOARD_NAMES[entry.boardShape];
        const tile = TILE_NAMES[entry.gridType] ? `${TILE_NAMES[entry.gridType]} tile` : 'tile';
        const tiles = `${entry.tiles} ${tile}${entry.tiles === 1 ? '' : 's'}`;
        return board ? `${board} board, ${tiles}` : tiles;
    }

    if (typeof module !== 'undefined' && module.exports) module.exports = { describeAge, describeBoard };
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
            for (const [tag, text] of [['strong', entry.name], ['span', describeBoard(entry)], ['span', describeAge(entry.timestamp, now)]]) {
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
