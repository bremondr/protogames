/**
 * PROTOGAMES REPO PROJECTS (the part without a page)
 * --------------------------------------------------------------
 * Projects kept in GitHub repos with git-store-kit (vendor/git-store-kit/, a copy of a web-kit release: see
 * vendor.json, and do not edit it here). Each project is one file, `projects/<id>.json`, in the same format as a
 * project file export (ProjectFormat), written as indented JSON so that GitHub's history shows what changed. Every
 * "Save to repo" is one commit.
 *
 * This file has no DOM, so the tests run it in Node against the kit's fake GitHub; repo.js puts it on the page.
 * ProjectFormat and the name cleaner are passed in (they are classic scripts of app/js, globals on the page).
 *
 * The link between a project of this browser and its file in a repo is kept next to the library, under one
 * localStorage key: {<project id>: {repo, id, sha, created, content, commit, at, saved}}. `sha` is the version of the
 * file the project was opened at or last saved as (what the next save says it replaces), `content` a fingerprint of
 * the board then, to tell whether it has been edited since; `at` is when (ms), `saved` whether it was a save (with its
 * `commit`) rather than an opening.
 */
import { createGitStore } from './vendor/git-store-kit/store.js';
import { checkRepo, ID } from './vendor/git-store-kit/sources.js';

/** The link parameter: app/#repo=owner/name follows that repo. */
export const PARAM = 'repo';
/** Where the projects are in every repo. */
export const FOLDER = 'projects';
/**
 * The largest file "Save to repo" writes. Indented, a board takes about 1 KB a tile, so the kit's default of 1 MB would
 * already refuse a 30 × 30 board. 5 MB is about 5,000 tiles: more than the browser's own storage (about 5 MB for every
 * project together, kept compact) holds for one project in practice, and still a quick request to GitHub.
 */
export const MAX_BYTES = 5 * 1024 * 1024;
export const LINKS_KEY = 'protogames_repo_links';

const PROJECT_ID = /^[A-Za-z0-9_-]{6,64}$/;
const SHA = /^[0-9a-f]{40}$/;

/** A believable creation time from a file, in ms, or null. */
export function createdTime(value) {
    if (typeof value !== 'string' || value.length > 40) return null;
    const time = Date.parse(value);
    return Number.isFinite(time) && time > 0 ? time : null;
}

/**
 * The store's `read` and `write` for projects. `read` runs every file through ProjectFormat.parse, which upgrades older
 * formats and checks everything (a repo's files were written by someone else); a file it refuses is left out. `write`
 * gives the payload of a project file export, keeping the file's creation time so that a save changes only the board.
 */
export function projectCodec(ProjectFormat, cleanName) {
    function read(json) {
        const project = ProjectFormat.parse(json);
        const name = cleanName(project.projectName) || 'Untitled project';
        const created = createdTime(project.created);
        return { id: undefined, name, project: { ...project, projectName: name, created: created === null ? undefined : new Date(created).toISOString() } };
    }
    function write(item) {
        const created = createdTime(item.project && item.project.created);
        return ProjectFormat.createProject({ projectName: item.name, appState: item.project.appState, now: created === null ? Date.now() : created });
    }
    return { read, write };
}

/** A file name for a project: its name in lower case, letters and digits joined by '-' ("Île de Ré" → "ile-de-re"). */
export function slugify(name) {
    const slug = String(name == null ? '' : name)
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        .slice(0, 48).replace(/-+$/, '');
    return slug || 'project';
}

/** A file id for a new project that no file in `taken` has: the slug, then slug-2, slug-3 … */
export function uniqueId(name, taken) {
    const used = new Set([...taken].map((id) => String(id).toLowerCase()));
    const base = slugify(name);
    if (!used.has(base)) return base;
    for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

const isPaintedTile = (tile, blank) => Boolean(tile.object || tile.start || (tile.color && String(tile.color).toLowerCase() !== blank));

function sorted(value) {
    if (Array.isArray(value)) return value.map(sorted);
    if (value && typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value).sort()) if (value[key] !== undefined && value[key] !== null) out[key] = sorted(value[key]);
        return out;
    }
    return value;
}

/**
 * What a person made on a board, as text: name, board settings, palette, players, dice and the painted tiles. Left out
 * on purpose: where the tiles are drawn (the grid is laid out again for every window), blank tiles, the selected
 * colour and the eraser. Two payloads with the same key are the same design.
 */
export function contentKey(payload, blank = '#ffffff') {
    const state = (payload && payload.appState) || {};
    const tiles = (Array.isArray(state.polygons) ? state.polygons : [])
        .filter((tile) => tile && isPaintedTile(tile, blank))
        .map((tile) => [String(tile.id), String(tile.color || '').toLowerCase(), tile.object || null, tile.start || null])
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return JSON.stringify(sorted({
        name: payload && payload.projectName,
        board: state.boardConfig || {},
        palette: state.paletteId,
        players: state.players || [],
        dice: state.dice || [],
        tiles
    }));
}

/** A short fingerprint of contentKey (FNV-1a, 32 bits, and the length). */
export function contentHash(payload, blank) {
    const text = contentKey(payload, blank);
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `${hash.toString(16).padStart(8, '0')}-${text.length.toString(36)}`;
}

/**
 * The links between projects of this browser and files in repos, in `storage` under `key`. Every entry is checked
 * when it is read: what is in local storage may have been written by an older version, or by hand.
 */
export function createLinks(storage, key = LINKS_KEY) {
    function all() {
        let raw = null;
        try { raw = storage ? JSON.parse(storage.getItem(key)) : null; } catch (error) { raw = null; }
        const out = {};
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
        for (const [projectId, link] of Object.entries(raw)) {
            const clean = check(link);
            if (PROJECT_ID.test(projectId) && clean) out[projectId] = clean;
        }
        return out;
    }
    function check(link) {
        if (!link || typeof link !== 'object') return null;
        const repo = checkRepo(link.repo);
        if (!repo || typeof link.id !== 'string' || !ID.test(link.id)) return null;
        return {
            repo,
            id: link.id,
            sha: typeof link.sha === 'string' && SHA.test(link.sha) ? link.sha : null,
            created: createdTime(link.created) === null ? null : new Date(createdTime(link.created)).toISOString(),
            content: typeof link.content === 'string' && link.content.length <= 40 ? link.content : null,
            commit: typeof link.commit === 'string' && SHA.test(link.commit) ? link.commit : null,
            at: Number.isFinite(link.at) && link.at > 0 ? link.at : null,
            saved: link.saved === true
        };
    }
    function store(map) {
        try { storage.setItem(key, JSON.stringify(map)); return true; } catch (error) { return false; }
    }
    return {
        all,
        get: (projectId) => all()[projectId] || null,
        /** Keeps a link; false when the browser's storage refused it. */
        set(projectId, link) {
            const clean = check(link);
            if (!PROJECT_ID.test(projectId || '') || !clean) return false;
            return store({ ...all(), [projectId]: clean });
        },
        remove(projectId) {
            const map = all();
            if (!(projectId in map)) return;
            delete map[projectId];
            store(map);
        },
        /** The projects linked to one file of a repo: [[projectId, link]]. */
        find(repo, id) {
            const want = String(repo).toLowerCase();
            return Object.entries(all()).filter(([, link]) => link.repo.toLowerCase() === want && link.id === id);
        }
    };
}

/**
 * The store for projects. `practice` keeps a fake GitHub's repos, tokens and saved copies apart from the real ones
 * (another app name); `fetch`, `cache` and `storage` are for tests and the practice mode.
 */
export function createProjectStore({ ProjectFormat, cleanName, practice = false, fetch, cache, storage } = {}) {
    const codec = projectCodec(ProjectFormat, cleanName);
    let lastName = 'project';
    const random = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
    const verbs = { add: 'Add', update: 'Update', remove: 'Remove', copy: 'Add a copy of', restore: 'Restore' };
    return createGitStore({
        app: practice ? 'protogames-practice' : 'protogames',
        folder: FOLDER,
        param: PARAM,
        read: codec.read,
        // write is called before any copy is made, so the copy's file is named after the project being saved
        write: (item) => { lastName = item.name; return codec.write(item); },
        name: (item) => item.name,
        newId: () => `${slugify(lastName).slice(0, 40)}-copy-${random(4)}`,
        commitMessage: ({ op, name, note }) => note || `${verbs[op] || 'Update'} “${name}”`,
        maxBytes: MAX_BYTES,
        ...(fetch ? { fetch } : {}),
        ...(cache ? { cache } : {}),
        ...(storage !== undefined ? { storage } : {})
    });
}
