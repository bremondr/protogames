/**
 * PROTOGAMES GITHUB REPOS
 * --------------------------------------------------------------
 * Projects kept in GitHub repos, in git-store-kit's "working folder" mode (vendor/git-store-kit/, a copy of a web-kit
 * release: see vendor.json, and do not edit it here):
 *
 *  - Follow a repo with a link (app/#repo=owner/name) or in the repo panel. The Load dialog lists its projects.
 *  - Opening one makes it a project of this browser, linked to its file. It is edited and autosaved as any project.
 *  - "Save to repo" (Project panel) writes it back as one commit, with an optional note, only when asked. If the file
 *    changed meanwhile, the kit's panel asks: overwrite, keep theirs, or save a copy.
 *  - "History" lists the versions of the file: one can be looked at (a picture, read only), opened as a new project,
 *    or restored.
 *
 * Reading a public repo needs nothing; a private repo, and every save, needs a fine-grained token for that repo, pasted
 * once per device in the kit's panel. The part without a page is repo-projects.js (tested in Node).
 *
 * Dev only: app/?fake-github runs all of this against a fake GitHub in the tab (repo-practice.js), with sample repos.
 *
 * It is a module (the kit is made of ES modules) and sits outside app/js, whose files are the classic scripts that
 * index.html lists in order. It uses the app's globals (AppState, ProjectFormat, ProjectLibrary, FileManager,
 * LoadDialog, Exporter, FocusUtils, UI, Config), which are defined by then: module scripts run after the deferred ones,
 * before DOMContentLoaded. Everything Main.startBoard reads (window.RepoProjects) is set before the first await.
 */
import { GitStoreConflict, tokenNeed } from './vendor/git-store-kit/store.js';
import { createPanel } from './vendor/git-store-kit/panel.js';
import { hashValue, hashWithout } from './vendor/git-store-kit/sources.js';
import { contentHash, createLinks, createProjectStore, FOLDER, LINKS_KEY, MAX_BYTES, PARAM, uniqueId } from './repo-projects.js';

const PRACTICE_KEY = 'protogames_fake_github';

/* ---- practice mode (dev only): ?fake-github turns it on for this tab, ?fake-github=off turns it off ---- */
function practiceWanted() {
    const value = new URLSearchParams(location.search).get('fake-github');
    try {
        if (value === 'off' || value === '0') sessionStorage.removeItem(PRACTICE_KEY);
        else if (value !== null) sessionStorage.setItem(PRACTICE_KEY, '1');
        return sessionStorage.getItem(PRACTICE_KEY) === '1';
    } catch (error) {
        return value !== null && value !== 'off' && value !== '0';
    }
}
const practice = practiceWanted();
const fakeReady = practice ? import('./repo-practice.js').then((m) => m.startPractice()) : null;

const local = (() => { try { return localStorage; } catch (error) { return null; } })();
const store = createProjectStore({
    ProjectFormat,
    cleanName: ProjectLibrary.cleanName,
    practice,
    ...(practice ? { fetch: async (...args) => (await fakeReady).fake.fetch(...args) } : {})
});
const links = createLinks(local, practice ? `${LINKS_KEY}_practice` : LINKS_KEY);
const panel = createPanel(store, { title: practice ? 'GitHub repos (practice)' : 'GitHub repos', noun: 'project', sourceLabel: 'repo' });

/* ---- following from a link: app/#repo=owner/name ---- */
function followFromAddress() {
    const value = hashValue(location.hash, PARAM);
    if (value === null) return null;
    const repo = store.follow(value);
    try { history.replaceState(history.state, '', location.pathname + location.search + hashWithout(location.hash, PARAM)); } catch (error) { /* sandboxed frame */ }
    if (!repo) UI?.showNotification('That link does not name a GitHub repo (it should be #repo=owner/name).', 6000);
    return repo;
}
const followedFromLink = followFromAddress();

window.RepoProjects = {
    followedFromLink,
    /** At start-up after a link to a repo: its projects to open, and the name of a new project only if none is chosen. */
    offerOnStart(askName) {
        LoadDialog.open({ onClose: () => { if (!AppState.getState().currentProjectId) askName(); } });
    }
};

/* ---- small helpers ---- */
const $ = (id) => document.getElementById(id);
function h(tag, props = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
    }
    e.append(...kids.flat().filter((k) => k != null && k !== false));
    return e;
}
const notify = (text, ms = 4000) => UI?.showNotification(text, ms);
const short = (sha) => (sha ? sha.slice(0, 7) : '');
const fileOf = (link) => `${FOLDER}/${link.id}.json`;
const fileUrl = (link) => `https://github.com/${link.repo}/blob/HEAD/${fileOf(link)}`;
const blank = () => String(Config.DEFAULT_TILE_COLOR).toLowerCase();
const hashOf = (payload) => contentHash(payload, blank());
const sourceOf = (repo) => store.sources().find((s) => s.repo.toLowerCase() === String(repo).toLowerCase()) || null;
const ago = (time) => ProjectLibrary.describeAge(time, Date.now()).replace(/^Edited /, '');
const message = (error) => (error && error.message) || 'Something went wrong.';

/** A dialog in the app's style. `build(close)` returns its contents; resolves with what close() was given. */
function dialog(build, { label, className = '' } = {}) {
    return new Promise((resolve) => {
        const opener = document.activeElement;
        const card = h('div', { class: `modal repo-dialog ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': label });
        const backdrop = h('div', { class: 'modal-backdrop repo-backdrop', role: 'presentation' }, card);
        let stopKeys = () => {};
        const close = (value = null) => {
            stopKeys();
            backdrop.remove();
            if (opener && opener.isConnected && opener.focus) opener.focus();
            resolve(value);
        };
        card.append(...build(close));
        backdrop.addEventListener('pointerdown', (event) => { if (event.target === backdrop) close(null); });
        document.body.append(backdrop);
        stopKeys = FocusUtils.modalKeys(backdrop, { Escape: () => close(null) });
        (card.querySelector('[data-focus]') || FocusUtils.tabbables(backdrop)[0])?.focus();
    });
}
function head(title, close) {
    const x = h('button', { type: 'button', class: 'icon-close', 'aria-label': 'Close', onclick: () => close(null) });
    x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
    return h('div', { class: 'theme-editor-head repo-head' }, h('h3', { text: title }), x);
}

/** Two answers that are both actions; resolves to 'primary', 'secondary' or null. */
const choose = (title, text, primary, secondary) => new Promise((resolve) => FileManager.presentChoice({
    title, message: text, primaryLabel: primary, secondaryLabel: secondary,
    onPrimary: () => resolve('primary'), onSecondary: () => resolve('secondary'), onDismiss: () => resolve(null)
}));

/* ---- the open project and its link ---- */
const currentId = () => AppState.getState().currentProjectId;
function currentLink() {
    const id = currentId();
    return id ? links.get(id) : null;
}
/** The open board as an item for the store, under the link's file id (or `id`). */
function boardItem(link, id = link && link.id) {
    const payload = FileManager.projectData();
    return { id, name: payload.projectName, project: { ...payload, created: (link && link.created) || payload.created } };
}
/** The board of a stored project of this browser, or null. */
function storedPayload(projectId) {
    try { return ProjectFormat.parse(ProjectLibrary.read(projectId)); } catch (error) { return null; }
}
/** True when the project was edited since it was opened from, or saved to, its repo. */
function editedSince(projectId, link) {
    if (!link.content) return true;
    const payload = projectId === currentId() ? FileManager.projectData() : storedPayload(projectId);
    return !payload || hashOf(payload) !== link.content;
}
function linkCurrent(fields) {
    const id = currentId();
    if (!id) return;
    const kept = links.set(id, { saved: false, commit: null, ...(links.get(id) || {}), ...fields, content: hashOf(FileManager.projectData()), at: Date.now() });
    if (!kept) notify('This browser could not remember the link to the repo (storage is full or off).', 6000);
    renderProject();
}

/* ---- opening a project from a repo ---- */
async function openFromRepo(repo, id, button) {
    if (button) { button.disabled = true; button.querySelector('.load-detail')?.replaceChildren('Opening the newest version…'); }
    let opened;
    try { opened = await store.open(repo, id); }
    catch (error) { notify(`Could not open it: ${message(error)}`, 6000); renderLoad(); return; }
    if (!opened) { notify('That project is not in the repo any more.', 5000); renderLoad(); return; }
    const { item, sha } = opened;
    const existing = links.find(repo, id).find(([projectId]) => ProjectLibrary.read(projectId) !== null);
    if (!existing) { openAsNew(item, { repo, id, sha }); return; }
    const [projectId, link] = existing;
    if (link.sha === sha) { goTo(projectId); return; }
    if (editedSince(projectId, link)) {
        const answer = await choose('Your copy has edits that are not in the repo',
            `“${item.name}” is in this browser already, with edits that were not saved to ${repo}, and the repo has a newer version. Open your copy (Save to repo then asks what to keep), or replace it with the newest version from the repo.`,
            'Open my copy', 'Replace it with the newest');
        if (answer === 'primary') goTo(projectId);
        if (answer !== 'secondary') return;
    }
    replaceProject(projectId, item, { repo, id, sha });
    goTo(projectId);
}

/** Shows a project from a repo as a new project of this browser (the open one is saved and stays as it was). */
function openAsNew(item, link) {
    FileManager.guardReplace(() => {
        try {
            FileManager.showAsNewProject(() => FileManager.restoreState(item.project, { skipNotification: true }), item.name);
        } catch (error) {
            FileManager.showMessage('Could not open this project', message(error));
            return;
        }
        if (link) {
            linkCurrent({ ...link, created: item.project.created || null, saved: false, commit: null });
            notify(`Opened “${item.name}” from ${link.repo}. Save to repo (Project panel) writes it back.`, 5000);
        } else notify(`Opened “${item.name}” as a new project of this browser.`, 4000);
        LoadDialog.close();
    });
}

/** Puts a version from the repo into a project of this browser, which stays linked to the file. */
function replaceProject(projectId, item, link) {
    if (projectId === currentId()) {
        FileManager.restoreState(item.project, { skipNotification: true });
        linkCurrent({ ...link, created: item.project.created || null, saved: false, commit: null });
        return;
    }
    const payload = ProjectFormat.createAutosave({ projectName: item.name, appState: item.project.appState });
    try { ProjectLibrary.write(projectId, payload); }
    catch (error) { notify('Browser storage is full: the newest version could not be kept.', 6000); return; }
    links.set(projectId, { ...link, created: item.project.created || null, content: hashOf(payload), saved: false, commit: null, at: Date.now() });
}

function goTo(projectId) {
    if (projectId === currentId()) { LoadDialog.close(); renderProject(); return; }
    FileManager.openProjectById(projectId);
}

/* ---- saving ---- */
let busy = false;

async function saveToRepo() {
    if (busy) return;
    const link = currentLink();
    if (!AppState.getState().polygons.length || !currentId()) { notify('Generate a board before saving it to a repo.'); return; }
    if (link) return saveLinked(link);
    return saveNew();
}

/** Why this device cannot save to a repo, with the way to fix it; true when it was said. */
async function cannotSave(repo) {
    const source = sourceOf(repo);
    if (source && source.canWrite) return false;
    const has = source && source.hasToken;
    const answer = await choose(has ? 'This device can only read the repo' : 'Saving needs a GitHub token',
        has ? `The token on this device can read ${repo} but not save to it. Make one with Contents: Read and write, and paste it in its place.`
            : `Anyone can read a public repo, but saving to ${repo} needs a token for it, pasted once on this device. The panel shows how to make one.`,
        has ? 'Replace the token' : 'Add a token', 'Not now');
    if (answer === 'primary') panel.open({ token: repo });
    return true;
}

async function saveLinked(link) {
    // the repo may have been removed from the list (the panel's Remove) since the project was opened from it
    if (!sourceOf(link.repo)) { store.follow(link.repo); await store.load(link.repo); }
    if (await cannotSave(link.repo)) return;
    const unchanged = !editedSince(currentId(), link);
    const note = await dialog((close) => {
        const input = h('input', { type: 'text', class: 'modal-input', maxlength: '200', 'data-focus': true, placeholder: 'What changed? (optional)', 'aria-label': 'Note for this version' });
        const form = h('form', { class: 'repo-form', onsubmit: (event) => { event.preventDefault(); close(input.value); } },
            h('p', { class: 'modal-note', text: `A new version of ${fileOf(link)} in ${link.repo}, as one commit.` }),
            unchanged ? h('p', { class: 'modal-note', text: 'Nothing has changed since the last save to the repo.' }) : null,
            h('label', { class: 'repo-label' }, h('span', { text: 'Note' }), input),
            h('div', { class: 'modal-actions' },
                h('button', { type: 'button', class: 'secondary-button', text: 'Cancel', onclick: () => close(null) }),
                h('button', { type: 'submit', class: 'primary-button', text: 'Save' })));
        return [head('Save to repo', close), form];
    }, { label: 'Save to repo' });
    if (note === null) return;
    await runSave(link.repo, boardItem(link), { base: link.sha, note });
}

async function saveNew() {
    const writable = store.sources().filter((s) => s.canWrite);
    if (!writable.length) {
        const followed = store.sources();
        if (followed.length === 1) { await cannotSave(followed[0].repo); return; }
        const answer = await choose('Save to a GitHub repo', followed.length
            ? 'None of the repos you follow can be saved to from this device yet: it needs a token for one with Contents: Read and write.'
            : 'Follow the repo first (owner/name), then add a token for it. The panel shows how to make one.', 'Open the repo panel', 'Not now');
        if (answer === 'primary') panel.open(followed.length === 1 ? { token: followed[0].repo } : {});
        return;
    }
    const name = AppState.getState().currentProjectName || 'project';
    const fileFor = (repo) => uniqueId(name, (sourceOf(repo)?.items || []).map((i) => i.id));
    const chosen = await dialog((close) => {
        const select = h('select', { class: 'repo-select', 'aria-label': 'Repo' }, writable.map((s) => h('option', { value: s.repo, text: s.repo })));
        const file = h('p', { class: 'modal-note repo-file' });
        const showFile = () => { file.textContent = `Saved as ${FOLDER}/${fileFor(select.value)}.json, as one commit.`; };
        select.addEventListener('change', showFile);
        showFile();
        const input = h('input', { type: 'text', class: 'modal-input', maxlength: '200', 'data-focus': true, placeholder: 'What is it? (optional)', 'aria-label': 'Note for this version' });
        const form = h('form', { class: 'repo-form', onsubmit: (event) => { event.preventDefault(); close({ repo: select.value, note: input.value }); } },
            h('p', { class: 'modal-note', text: `“${name}” is not in a repo yet. Choose where to keep it; after that, Save to repo writes new versions there.` }),
            h('label', { class: 'repo-label' }, h('span', { text: 'Repo' }), select),
            file,
            h('label', { class: 'repo-label' }, h('span', { text: 'Note' }), input),
            h('div', { class: 'modal-actions' },
                h('button', { type: 'button', class: 'secondary-button', text: 'Cancel', onclick: () => close(null) }),
                h('button', { type: 'submit', class: 'primary-button', text: 'Save' })));
        return [head('Save to a repo', close), form];
    }, { label: 'Save to a repo' });
    if (!chosen) return;
    await runSave(chosen.repo, boardItem(null, fileFor(chosen.repo)), { base: null, note: chosen.note });
}

/** One save through the panel (which asks about conflicts), and what it did to the board and the link. */
async function runSave(repo, item, options) {
    busy = true;
    renderProject('Saving to the repo…');
    try {
        const result = await panel.save(repo, item, options);
        if (!result) { notify('Not saved. Your edits are still here.'); return; }
        if (result.kept === 'theirs') {
            if (result.item) {
                FileManager.restoreState(result.item.project, { skipNotification: true });
                linkCurrent({ repo, id: result.id, sha: result.sha, created: result.item.project.created || null, saved: false, commit: null });
                notify('Took the version from the repo instead of yours.', 5000);
            } else {
                notify('The project was removed from the repo. Your board stays here; Save to repo adds it again.', 6000);
                linkCurrent({ repo, id: result.id, sha: null });
            }
            return;
        }
        linkCurrent({ repo, id: result.id, sha: result.sha, created: item.project.created || null, saved: true, commit: result.commit || null });
        notify(result.kept === 'copy'
            ? `Saved as a copy, ${fileOf({ id: result.id })}, in ${repo} (commit ${short(result.commit)}). This project now saves there.`
            : `Saved to ${repo} (commit ${short(result.commit)}).`, 5000);
    } catch (error) {
        if (error && (error.code === 'no-token' || error.code === 'auth' || error.code === 'forbidden')) {
            const source = sourceOf(repo);
            const need = source && tokenNeed({ ...source, error: { code: error.code } });
            const answer = await choose('Not saved', `${message(error)}${need ? ' ' + need.reason : ''}`, need && need.action === 'replace' ? 'Replace the token' : 'Add a token', 'Not now');
            if (answer === 'primary') panel.open({ token: repo });
        } else if (error && error.code === 'too-big') {
            FileManager.showMessage('Too big for the repo', `This board is over ${MAX_BYTES / 1024 / 1024} MB as a file, the most Save to repo writes. Keep it as a project file (Export…, Project file) instead.`);
        } else {
            FileManager.showMessage('Not saved to the repo', `${message(error)} Your edits are still here.`);
        }
    } finally {
        busy = false;
        renderProject();
    }
}

/* ---- history ---- */
function showHistory() {
    const link = currentLink();
    if (!link) return;
    historyOpen = true;
    panel.showHistory(link.repo, link.id, { name: AppState.getState().currentProjectName, onOpen: (version) => showVersion(link, version) });
}

/** One version, read only: a picture of the board, and what can be done with it. */
async function showVersion(link, { item, commit, date }) {
    const canWrite = Boolean(sourceOf(link.repo)?.canWrite);
    const when = date ? new Date(date).toLocaleString() : '';
    const action = await dialog((close) => [
        head(`“${item.name}” as it was`, close),
        h('p', { class: 'modal-note', text: `${when}${when ? ' · ' : ''}commit ${short(commit)} · ${link.repo}. Read only: nothing here changes your board.` }),
        h('div', { class: 'repo-picture' }, picture(item.project)),
        h('div', { class: 'modal-actions repo-actions' },
            h('button', { type: 'button', class: 'secondary-button', text: 'Close', onclick: () => close(null) }),
            h('button', { type: 'button', class: 'secondary-button', text: 'Open as a new project', onclick: () => close('copy') }),
            canWrite ? h('button', { type: 'button', class: 'primary-button', text: 'Restore this version', onclick: () => close('restore') }) : null)
    ], { label: 'An earlier version', className: 'repo-version' });
    if (action === 'copy') openAsNew({ ...item, name: ProjectLibrary.cleanName(`${item.name} (${short(commit)})`) }, null);
    if (action === 'restore') restoreVersion(link, commit);
}

/** The board of a payload as an SVG picture (as drawn when it was saved), for looking at without opening it. */
function picture(project) {
    const tiles = (project.appState.polygons || []).filter((p) => p.vertices && p.vertices.length);
    if (!tiles.length) return h('p', { class: 'modal-note', text: 'This version has no tiles to show.' });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of tiles) for (const v of p.vertices) { minX = Math.min(minX, v.x); minY = Math.min(minY, v.y); maxX = Math.max(maxX, v.x); maxY = Math.max(maxY, v.y); }
    const pad = 4, width = Math.ceil(maxX - minX + 2 * pad), height = Math.ceil(maxY - minY + 2 * pad);
    let svg;
    try {
        svg = Exporter.buildSvg(tiles, { width, height, viewBox: `${(minX - pad).toFixed(2)} ${(minY - pad).toFixed(2)} ${width} ${height}`, grid: true, objects: true });
    } catch (error) {
        return h('p', { class: 'modal-note', text: 'This version could not be drawn.' });
    }
    return h('img', { alt: `The board of “${project.projectName}” in this version`, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` });
}

async function restoreVersion(link, commit) {
    if (editedSince(currentId(), link)) {
        const answer = await choose('Replace your board with this version?',
            'Your board has edits that are not in the repo. Restoring makes this version the newest one in the repo and puts it on your board; the edits here are replaced.',
            'Restore it', 'Cancel');
        if (answer !== 'primary') return;
    }
    busy = true;
    try {
        let result;
        try { result = await store.restore(link.repo, link.id, commit); }
        catch (error) {
            if (!(error instanceof GitStoreConflict)) throw error;
            const choice = await panel.askConflict(error);
            if (!choice) return;
            result = await store.resolve(error, choice);
        }
        if (result.item) FileManager.restoreState(result.item.project, { skipNotification: true });
        linkCurrent({ repo: link.repo, id: result.id, sha: result.sha, created: result.item?.project.created || link.created, saved: true, commit: result.commit || null });
        notify(`Restored: the version of ${short(commit)} is the newest in ${link.repo} and on your board.`, 5000);
    } catch (error) {
        FileManager.showMessage('Not restored', message(error));
    } finally {
        busy = false;
        renderProject();
    }
}

/* The kit's history list has its own Restore button (shown to editors), which makes an older version the newest in the
   repo without telling the app. Seen here when the history closes: if the file's version changed meanwhile, the
   restored version is put on the board, as the version view's Restore does. */
let historyOpen = false;
function afterHistory() {
    if (!historyOpen || !panel.element.hidden) return;
    historyOpen = false;
    const link = currentLink();
    if (!link || busy) return;
    const item = sourceOf(link.repo)?.items.find((i) => i.id === link.id);
    if (item && item.sha !== link.sha) takeNewest(link, { restored: true });
}
new MutationObserver(afterHistory).observe(panel.element, { attributes: true, attributeFilter: ['hidden'] });

/** Puts the newest version from the repo on the board (asking first when the board has edits that are not there). */
async function takeNewest(link, { restored = false } = {}) {
    if (editedSince(currentId(), link)) {
        const answer = await choose(restored ? 'Put the restored version on your board?' : 'Open the newest version?',
            `Your board has edits that are not in ${link.repo}. ${restored ? 'The restored version' : 'The newest version'} replaces them here (Save to repo first to keep them as a version).`,
            restored ? 'Put it on my board' : 'Open the newest', 'Keep my board');
        if (answer !== 'primary') { renderProject(); return; }
    }
    let opened;
    try { opened = await store.open(link.repo, link.id); }
    catch (error) { notify(`Could not open it: ${message(error)}`, 6000); return; }
    if (!opened) { notify('The project is not in the repo any more.', 5000); renderProject(); return; }
    FileManager.restoreState(opened.item.project, { skipNotification: true });
    linkCurrent({ ...link, sha: opened.sha, created: opened.item.project.created || link.created, saved: false, commit: null });
    notify(restored ? 'The restored version is on your board.' : `The newest version from ${link.repo} is on your board.`, 4000);
}

/* ---- a link to give playtesters ---- */
async function copyRepoLink(repo, button) {
    const url = `${location.origin}${location.pathname}#${PARAM}=${repo}`;
    try { await navigator.clipboard.writeText(url); button.textContent = 'Link copied'; }
    catch (error) {
        FileManager.showMessage('A link to this repo', `Whoever opens this link follows ${repo} and can open its projects (a private repo also needs a token):\n${url}`);
    }
    setTimeout(() => { if (button.isConnected) button.textContent = 'Copy link'; }, 2500);
}

/* ---- the Project panel: where the open project is kept ---- */
function renderProject(working = '') {
    const block = $('repoBlock');
    if (!block) return;
    const link = currentLink();
    const following = store.following().length > 0;
    block.hidden = !link && !following && !practice;
    if (block.hidden) return;
    const where = $('repoWhere');
    const state = $('repoState');
    $('repoSaveBtn').textContent = link ? 'Save to repo' : 'Save to a repo…';
    $('repoSaveBtn').disabled = busy;
    $('repoHistoryBtn').hidden = !link;
    if (!link) {
        where.replaceChildren(h('span', { text: 'Not in a repo yet.' }));
        state.textContent = working;
        state.className = 'field-hint repo-state';
        return;
    }
    where.replaceChildren(h('span', { text: 'In ' }), h('a', { href: fileUrl(link), target: '_blank', rel: 'noopener', text: `${link.repo} › ${link.id}.json` }));
    const source = sourceOf(link.repo);
    const item = source?.items.find((i) => i.id === link.id);
    let text = working, warn = false, newest = false;
    if (!text) {
        if (source && source.loadedAt && !source.error && !item) { text = 'Not in the repo any more. Save to repo adds it again.'; warn = true; }
        else if (item && link.sha && item.sha !== link.sha && !busy && !source.stale && !source.loading) { text = 'A newer version is in the repo.'; warn = true; newest = true; }
        else if (source && !source.canWrite) text = source.hasToken ? 'Read only on this device.' : 'Read only on this device (no token).';
        else text = link.saved ? `Saved to the repo ${ago(link.at)}${link.commit ? ` (commit ${short(link.commit)})` : ''}.` : link.at ? `Opened from the repo ${ago(link.at)}.` : '';
    }
    state.replaceChildren(...[text ? h('span', { text }) : null, newest ? h('button', { type: 'button', class: 'link-button', text: 'Open it', onclick: () => takeNewest(link) }) : null].filter(Boolean));
    state.className = `field-hint repo-state${warn ? ' repo-warn' : ''}`;
}

/* ---- the Load dialog: the projects of the followed repos ---- */
function describeItem(item) {
    const state = item.project.appState;
    return ProjectLibrary.describeBoard({ readable: true, tiles: state.polygons.length, boardShape: state.boardConfig.boardShape, gridType: state.boardConfig.gridType });
}

function renderLoad() {
    const box = $('loadRepo');
    if (!box || !LoadDialog.isOpen()) return;
    const sources = store.sources();
    const kids = [];
    if (!sources.length) {
        kids.push(h('p', { class: 'field-hint', text: 'Keep projects in a GitHub repository: every save is a commit, with the history of every version. Follow a repo to open its projects.' }));
    }
    for (const s of sources) {
        const need = !s.loading && tokenNeed(s, { label: 'repo' });
        const status = s.loading && !s.loadedAt ? 'Loading…'
            : need ? need.reason
                : s.error ? `${s.error.message}${s.stale ? ' Showing the copy saved on this device.' : ''}`
                    : `${s.private ? 'Private' : 'Public'} · ${s.canWrite ? 'you can save' : 'read only'}${s.dropped ? ` · ${s.dropped} file${s.dropped === 1 ? '' : 's'} could not be read` : ''}`;
        kids.push(h('div', { class: 'repo-source', 'data-repo': s.repo },
            h('div', { class: 'repo-source-line' },
                h('a', { class: 'repo-source-name', href: `https://github.com/${s.repo}`, target: '_blank', rel: 'noopener', text: s.repo }),
                h('button', { type: 'button', class: 'link-button', text: 'Copy link', title: 'A link that follows this repo, for playtesters', onclick: (event) => copyRepoLink(s.repo, event.currentTarget) })),
            h('p', { class: `load-detail${s.error ? ' repo-warn' : ''}`, text: status }),
            need ? h('button', { type: 'button', class: 'secondary-button repo-token', text: need.action === 'replace' ? 'Replace the token' : 'Add a token', onclick: () => panel.open({ token: s.repo }) }) : null));
        if (s.loadedAt || s.stale) {
            if (!s.items.length) kids.push(h('p', { class: 'field-hint', text: `No projects in ${FOLDER}/ yet.` }));
            else kids.push(h('ul', { class: 'load-list repo-list' }, s.items.map((i) => {
                const mine = links.find(s.repo, i.id).some(([projectId]) => projectId === currentId());
                const here = !mine && links.find(s.repo, i.id).some(([projectId]) => ProjectLibrary.read(projectId) !== null);
                const button = h('button', { type: 'button', class: 'load-item' },
                    h('span', { class: 'load-name', text: i.name + (mine ? ' (open now)' : '') }),
                    h('span', { class: 'load-detail', text: describeItem(i.item) + (here ? ' · also in this browser' : '') }));
                button.disabled = mine;
                button.addEventListener('click', () => openFromRepo(s.repo, i.id, button));
                return h('li', {}, button);
            })));
        }
    }
    kids.push(h('div', { class: 'repo-buttons' },
        h('button', { type: 'button', class: 'secondary-button', text: sources.length ? 'Repos and tokens…' : 'Follow a repo…', onclick: () => panel.open() })));
    box.replaceChildren(...kids);
}

/* ---- wiring ---- */
$('repoSaveBtn')?.addEventListener('click', saveToRepo);
$('repoHistoryBtn')?.addEventListener('click', showHistory);
$('repoPanelBtn')?.addEventListener('click', () => panel.open());
window.addEventListener('pg:projectchange', () => renderProject());
window.addEventListener('pg:loaddialogopen', () => { renderLoad(); store.load(); });
store.subscribe(() => { renderLoad(); renderProject(); });
// A link pasted into an open tab changes only the hash.
window.addEventListener('hashchange', () => {
    const repo = followFromAddress();
    if (!repo) return;
    store.load(repo);
    LoadDialog.open();
    notify(`Following ${repo}. Its projects are listed here.`, 4000);
});
document.addEventListener('DOMContentLoaded', () => {
    renderProject();
    if (followedFromLink && FileManager.projectIdFromUrl()) notify(`Following ${followedFromLink}. Its projects are under Load…`, 5000);
});
if (practice) fakeReady.then((p) => p.mount({ store, panel, currentLink, h, dialog, head, notify })).catch((error) => notify(`Practice GitHub did not start: ${message(error)}`, 8000));
if (store.following().length) store.load();
