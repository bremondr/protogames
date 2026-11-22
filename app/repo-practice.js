/**
 * PROTOGAMES PRACTICE GITHUB (dev only)
 * --------------------------------------------------------------
 * app/?fake-github runs the GitHub repos feature (repo.js) against git-store-kit's fake GitHub, inside this tab, so it
 * can be tried without a data repo or a token: nothing is sent anywhere. Turned on for the tab (sessionStorage) until
 * app/?fake-github=off. Loaded only then.
 *
 * Two sample repos, made from the showcases: practice/game-design (public, three projects, one with a history) and
 * practice/class-library (private). The tokens to paste are shown in the "Practice GitHub" dialog. What is saved is
 * replayed after a reload (kept in sessionStorage), so opening another project, which reloads the page, keeps it.
 */
import { createFakeGitHub } from './vendor/git-store-kit/fake-github.js';
import { fromBase64 } from './vendor/git-store-kit/github.js';

export const PUBLIC = 'practice/game-design';
export const PRIVATE = 'practice/class-library';
export const WRITE_TOKEN = 'github_pat_PRACTICE_write_token_for_both_practice_repos';
export const READ_TOKEN = 'github_pat_PRACTICE_read_only_token_for_class_library';
const LOG_KEY = 'protogames_fake_github_log';

const text = (json) => JSON.stringify(json, null, 2) + '\n';

async function showcase(id, name) {
    const response = await fetch(`showcases/${id}.protogames.json`);
    if (!response.ok) throw new Error(`showcase ${id}: HTTP ${response.status}`);
    const project = await response.json();
    return { ...project, projectName: name };
}

/** A copy of a project with a few painted tiles in another colour of the same board (a believable edit). */
function recolour(project, count, seed = 0) {
    const copy = JSON.parse(JSON.stringify(project));
    const painted = copy.appState.polygons.filter((p) => p.color && p.color.toLowerCase() !== '#ffffff');
    const colours = [...new Set(painted.map((p) => p.color))];
    if (colours.length < 2) return copy;
    for (let k = 0; k < Math.min(count, painted.length); k++) {
        const tile = painted[(k * 7 + seed) % painted.length];
        tile.color = colours[(colours.indexOf(tile.color) + 1) % colours.length];
    }
    return copy;
}

function readLog() {
    try { const log = JSON.parse(sessionStorage.getItem(LOG_KEY)); return Array.isArray(log) ? log : []; } catch (error) { return []; }
}
function appendLog(entry) {
    const log = readLog();
    log.push(entry);
    try { sessionStorage.setItem(LOG_KEY, JSON.stringify(log)); return true; } catch (error) { return false; }
}

export async function startPractice() {
    const fake = createFakeGitHub();
    const [landscape, settlers, checkers, chess, pegs] = await Promise.all([
        showcase('fantasy-landscape', 'Fantasy landscape'),
        showcase('island-settlers', 'Island settlers'),
        showcase('chinese-checkers', 'Star race'),
        showcase('chess', 'Chess variant'),
        showcase('peg-solitaire', 'Peg solitaire')
    ]);
    await fake.addRepo(PUBLIC, { files: {
        'README.md': '# Game design\n\nProjects of Protogames, one file each in projects/.\n',
        'projects/fantasy-landscape.json': text(landscape),
        'projects/island-settlers.json': text(settlers),
        'projects/star-race.json': text(checkers)
    } });
    await fake.edit(PUBLIC, 'projects/island-settlers.json', text(recolour(settlers, 3)), { author: 'designer', message: 'More forest in the north' });
    await fake.edit(PUBLIC, 'projects/island-settlers.json', text(recolour(recolour(settlers, 3), 2, 5)), { author: 'designer', message: 'Swap two harbours after the playtest' });
    await fake.addRepo(PRIVATE, { private: true, files: {
        'projects/chess-variant.json': text(chess),
        'projects/peg-solitaire.json': text(pegs)
    } });
    fake.addToken(WRITE_TOKEN, PUBLIC, 'write');
    fake.addToken(WRITE_TOKEN, PRIVATE, 'write');
    fake.addToken(READ_TOKEN, PRIVATE, 'read');

    // what was saved before a reload
    let keeps = true;
    for (const entry of readLog()) {
        try { await fake.edit(entry.repo, entry.path, entry.text, { author: entry.author, message: entry.message }); } catch (error) { /* the seed changed */ }
    }
    // and from now on: every save and removal that GitHub (the fake) accepted
    const answer = fake.fetch;
    fake.fetch = async (input, init = {}) => {
        const res = await answer(input, init);
        const method = (init.method || 'GET').toUpperCase();
        if ((method === 'PUT' || method === 'DELETE') && res.ok) {
            const m = /^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/.exec(new URL(typeof input === 'string' ? input : input.url).pathname);
            const body = JSON.parse(init.body || '{}');
            if (m) keeps = appendLog({
                repo: `${decodeURIComponent(m[1])}/${decodeURIComponent(m[2])}`,
                path: m[3].split('/').map(decodeURIComponent).join('/'),
                text: method === 'PUT' ? fromBase64(body.content) : null,
                author: 'owner',
                message: body.message
            }) && keeps;
        }
        return res;
    };

    return { fake, mount: (app) => mount(fake, app, () => keeps) };
}

/** The "Practice GitHub" pill in the header and its dialog: the tokens, a change "on another device", reset, off. */
function mount(fake, { store, currentLink, h, dialog, head, notify }, keeps) {
    if (!store.following().length) { store.follow(PUBLIC); store.follow(PRIVATE); store.load(); }
    const pill = h('button', { type: 'button', class: 'secondary-button practice-pill', title: 'Practice GitHub: a fake GitHub in this tab, for trying the repo features' },
        'Practice', h('span', { class: 'practice-wide', text: ' GitHub' }));
    document.getElementById('feedbackButton')?.before(pill);
    const code = (value) => h('code', { class: 'practice-code', text: value });
    pill.addEventListener('click', async () => {
        const link = currentLink();
        const practiceLink = link && (link.repo === PUBLIC || link.repo === PRIVATE) ? link : null;
        const action = await dialog((close) => [
            head('Practice GitHub', close),
            h('p', { class: 'modal-note', text: `A fake GitHub inside this tab, with two repos: ${PUBLIC} (public) and ${PRIVATE} (private). Nothing is sent anywhere.${keeps() ? '' : ' This tab’s storage is full: saves are lost on reload.'}` }),
            h('p', { class: 'modal-note', text: 'Token that can save to both (paste it in the repo panel):' }), code(WRITE_TOKEN),
            h('p', { class: 'modal-note', text: `Token that can only read ${PRIVATE}:` }), code(READ_TOKEN),
            h('div', { class: 'practice-actions' },
                h('button', { type: 'button', class: 'secondary-button', 'data-focus': true, text: 'Use the saving token here', onclick: () => close('token') }),
                h('button', { type: 'button', class: 'secondary-button', text: 'Change the open project on another device', disabled: !practiceLink, title: practiceLink ? '' : 'Open a project from a practice repo first', onclick: () => close('elsewhere') }),
                h('button', { type: 'button', class: 'secondary-button', text: 'Use up the 60 reads without a token', onclick: () => close('limit') }),
                h('button', { type: 'button', class: 'secondary-button', text: 'Reset the practice repos', onclick: () => close('reset') }),
                h('button', { type: 'button', class: 'secondary-button', text: 'Turn practice off', onclick: () => close('off') }))
        ], { label: 'Practice GitHub' });
        if (action === 'token') {
            store.setToken(PUBLIC, WRITE_TOKEN);
            store.setToken(PRIVATE, WRITE_TOKEN);
            await store.load();
            notify('This device can now save to both practice repos.');
        } else if (action === 'elsewhere' && practiceLink) {
            const path = `projects/${practiceLink.id}.json`;
            const now = fake.file(practiceLink.repo, path);
            if (!now) { notify('That project is not in the repo any more.'); return; }
            const edited = recolour(now, 4, Date.now() % 11);
            await fake.edit(practiceLink.repo, path, text(edited), { author: 'another device', message: 'Changed on the laptop' });
            appendLog({ repo: practiceLink.repo, path, text: text(edited), author: 'another device', message: 'Changed on the laptop' });
            await store.load();
            notify('Changed on “another device”. Save to repo now to see the question.', 5000);
        } else if (action === 'limit') {
            fake.used = fake.limit;
            await store.load();
            notify('The 60 reads an hour without a token are used up: repos without a token show their saved copy.', 5000);
        } else if (action === 'reset') {
            try { sessionStorage.removeItem(LOG_KEY); } catch (error) { /* nothing kept */ }
            location.reload();
        } else if (action === 'off') {
            location.assign(`${location.pathname}?fake-github=off`);
        }
    });
}
