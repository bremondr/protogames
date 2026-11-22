'use strict';
/**
 * GitHub repos (app/repo-projects.js): projects as files in repos through git-store-kit, run against the kit's fake
 * GitHub (vendor/git-store-kit/fake-github.js) and its memory cache, so nothing leaves the machine.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ROOT, loadApp, plain } = require('./support/load');

const app = loadApp(['app/js/config.js', 'app/js/projectFormat.js', 'app/js/projectLibrary.js']);
const ProjectFormat = app.run('ProjectFormat');
const ProjectLibrary = app.run('ProjectLibrary');

const load = (relative) => import(pathToFileURL(path.join(ROOT, relative)).href);
const modules = Promise.all([
    load('app/repo-projects.js'),
    load('app/vendor/git-store-kit/fake-github.js'),
    load('app/vendor/git-store-kit/cache.js'),
    load('app/vendor/git-store-kit/store.js')
]).then(([repo, fake, cache, store]) => ({ ...repo, ...fake, ...cache, ...store }));

const showcase = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'showcases', `${id}.protogames.json`), 'utf8'));
const REPO = 'designer/game-design';
const PRIVATE = 'designer/class-library';
const WRITE = 'github_pat_' + 'w'.repeat(30);
const READ = 'github_pat_' + 'r'.repeat(30);

function memoryStorage() {
    const map = new Map();
    return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

/** A fake GitHub with a public repo of two showcases (and files that are not projects) and a private one. */
async function setup({ token = null } = {}) {
    const m = await modules;
    const fake = m.createFakeGitHub();
    await fake.addRepo(REPO, { files: {
        'README.md': '# Designs\n',
        'projects/settlers.json': showcase('island-settlers'),
        'projects/chess.json': showcase('chess'),
        'projects/notes.json': { title: 'Not a project' },
        'projects/future.json': { ...showcase('chess'), version: 999 },
        'other/ignored.json': showcase('chess')
    } });
    await fake.addRepo(PRIVATE, { private: true, files: { 'projects/pegs.json': showcase('peg-solitaire') } });
    fake.addToken(WRITE, REPO, 'write');
    fake.addToken(WRITE, PRIVATE, 'write');
    fake.addToken(READ, REPO, 'read');
    const storage = memoryStorage();
    const store = m.createProjectStore({ ProjectFormat, cleanName: ProjectLibrary.cleanName, fetch: fake.fetch, cache: m.memoryCache(), storage });
    store.follow(REPO);
    if (token) store.setToken(REPO, token);
    return { m, fake, store, storage };
}

test('a repo lists its projects: every file goes through ProjectFormat, and what it refuses is left out', async () => {
    const { store } = await setup();
    const source = await store.load(REPO);
    assert.equal(source.error, null);
    assert.deepEqual(source.items.map((i) => [i.id, i.name]).sort(), [['chess', 'Chess'], ['settlers', 'Island settlers']].sort());
    assert.equal(source.dropped, 2, 'a JSON file that is not a project, and one from a newer version of the app');
    assert.equal(source.private, false);
    assert.equal(source.canWrite, false, 'no token: read only');
    const settlers = source.items.find((i) => i.id === 'settlers').item;
    assert.equal(settlers.project.version, ProjectFormat.CURRENT_VERSION);
    assert.ok(settlers.project.appState.polygons.length > 0);
});

test('a private repo needs a token to be read', async () => {
    const { m, store } = await setup();
    store.follow(PRIVATE);
    const source = await store.load(PRIVATE);
    assert.equal(source.error.code, 'not-found');
    assert.equal(m.tokenNeed(source).action, 'add');
    store.setToken(PRIVATE, WRITE);
    const again = await store.load(PRIVATE);
    assert.equal(again.error, null);
    assert.deepEqual(again.items.map((i) => i.id), ['pegs']);
});

test('write gives the payload of a project file export, kept creation time, and reads back the same', async () => {
    const { m } = await setup();
    const codec = m.projectCodec(ProjectFormat, ProjectLibrary.cleanName);
    const file = showcase('chess');
    const item = codec.read(file);
    const written = plain(codec.write(item));
    assert.deepEqual(Object.keys(written), ['version', 'projectName', 'created', 'appState']);
    assert.equal(written.version, ProjectFormat.CURRENT_VERSION);
    assert.equal(written.created, new Date(Date.parse(file.created)).toISOString());
    assert.deepEqual(plain(codec.read(written).project.appState), plain(item.project.appState));
    // a creation time that is not one is replaced, never passed on
    assert.equal(codec.read({ ...file, created: 'yesterday' }).project.created, undefined);
});

test('read refuses what ProjectFormat refuses (a tampered file)', async () => {
    const { m } = await setup();
    const codec = m.projectCodec(ProjectFormat, ProjectLibrary.cleanName);
    const bad = showcase('chess');
    bad.appState.polygons[0].vertices = 'not a list';
    assert.throws(() => codec.read(bad));
    assert.throws(() => codec.read({ version: 999, projectName: 'x', appState: {} }), /newer version/);
});

test('saving writes indented JSON as one commit with the note, and a stale base is a conflict', async () => {
    const { m, fake, store } = await setup({ token: WRITE });
    await store.load(REPO);
    const opened = await store.open(REPO, 'settlers');
    const edited = { ...opened.item, project: JSON.parse(JSON.stringify(opened.item.project)) };
    edited.project.appState.polygons[0].color = '#2a6fb5';
    const saved = await store.save(REPO, edited, { base: opened.sha, note: 'Bigger lake' });
    assert.equal(fake.commits(REPO)[0].message, 'Bigger lake');
    const text = fake.log.filter((e) => e.method === 'PUT').length;
    assert.equal(text, 1);
    assert.equal(fake.file(REPO, 'projects/settlers.json').appState.polygons[0].color, '#2a6fb5');
    // the file is indented: one property per line
    const res = await fake.fetch(`https://raw.githubusercontent.com/${REPO}/HEAD/projects/settlers.json`);
    const raw = await res.text();
    assert.match(raw, /^\{\n {2}"version": \d+,\n {2}"projectName": "Island settlers",/);
    assert.ok(raw.endsWith('\n'));
    // saving again from the version it was opened at: someone saved since, so it is refused with what is there now
    await assert.rejects(store.save(REPO, edited, { base: opened.sha, note: 'Again' }), (error) => {
        assert.ok(error instanceof m.GitStoreConflict);
        assert.equal(error.theirs.sha, saved.sha);
        return true;
    });
    // without a note the message names the project
    await store.save(REPO, edited, { base: saved.sha });
    assert.equal(fake.commits(REPO)[0].message, 'Update “Island settlers”');
});

test('a conflict is settled by overwriting, keeping theirs, or saving a copy named after the project', async () => {
    const { m, fake, store } = await setup({ token: WRITE });
    await store.load(REPO);
    const opened = await store.open(REPO, 'chess');
    await fake.edit(REPO, 'projects/chess.json', { ...showcase('chess'), projectName: 'Chess (laptop)' }, { message: 'Changed on the laptop' });
    const mine = { ...opened.item, name: 'Chess (iPad)' };
    let conflict;
    try { await store.save(REPO, mine, { base: opened.sha, note: 'From the iPad' }); } catch (error) { conflict = error; }
    assert.ok(conflict instanceof m.GitStoreConflict);
    assert.equal(conflict.theirs.item.name, 'Chess (laptop)');

    const theirs = await store.resolve(conflict, 'theirs');
    assert.equal(theirs.kept, 'theirs');
    assert.equal(theirs.item.name, 'Chess (laptop)');
    assert.equal(fake.file(REPO, 'projects/chess.json').projectName, 'Chess (laptop)', 'nothing was written');

    const copy = await store.resolve(conflict, 'copy');
    assert.equal(copy.kept, 'copy');
    assert.match(copy.id, /^chess-ipad-copy-[a-z0-9]{4}$/);
    assert.equal(fake.file(REPO, `projects/${copy.id}.json`).projectName, 'Chess (iPad)');

    const over = await store.resolve(conflict, 'overwrite');
    assert.equal(over.kept, 'mine');
    assert.equal(fake.file(REPO, 'projects/chess.json').projectName, 'Chess (iPad)');
});

test('a new project is saved under a file named after it, and must not replace a file that is there', async () => {
    const { m, fake, store } = await setup({ token: WRITE });
    const source = await store.load(REPO);
    const id = m.uniqueId('Chess', source.items.map((i) => i.id));
    assert.equal(id, 'chess-2');
    const item = { id, name: 'Chess', project: m.projectCodec(ProjectFormat, ProjectLibrary.cleanName).read(showcase('chess')).project };
    await store.save(REPO, item, { base: null, note: 'First version' });
    assert.ok(fake.file(REPO, 'projects/chess-2.json'));
    assert.equal(fake.commits(REPO)[0].message, 'First version');
    await assert.rejects(store.save(REPO, { ...item, id: 'chess' }, { base: null }), (error) => error instanceof m.GitStoreConflict);
});

test('a read-only token, or none, cannot save', async () => {
    const { store } = await setup({ token: READ });
    const source = await store.load(REPO);
    assert.equal(source.canWrite, false);
    const item = source.items[0].item;
    await assert.rejects(store.save(REPO, item, { base: source.items[0].sha }), (error) => error.code === 'forbidden');
    store.removeToken(REPO);
    await assert.rejects(store.save(REPO, item, { base: source.items[0].sha }), (error) => error.code === 'no-token');
});

test('a project is refused over the size limit, which is well above the kit\'s 1 MB default', async () => {
    const { m, store } = await setup({ token: WRITE });
    assert.equal(m.MAX_BYTES, 5 * 1024 * 1024);
    const source = await store.load(REPO);
    const item = source.items.find((i) => i.id === 'settlers').item;
    const huge = JSON.parse(JSON.stringify(item));
    huge.project.appState.polygons = Array.from({ length: 6500 }, (_, k) => ({ ...item.project.appState.polygons[k % item.project.appState.polygons.length], id: `t${k}` }));
    await assert.rejects(store.save(REPO, huge, { base: source.items[0].sha }), (error) => error.code === 'too-big');
    const medium = JSON.parse(JSON.stringify(item));
    medium.project.appState.polygons = Array.from({ length: 1500 }, (_, k) => ({ ...item.project.appState.polygons[k % item.project.appState.polygons.length], id: `t${k}` }));
    const sha = source.items.find((i) => i.id === 'settlers').sha;
    await store.save(REPO, medium, { base: sha }); // over 1 MB indented, under the limit
});

test('history lists the versions with their notes; an old one reads back and restores as the newest', async () => {
    const { fake, store } = await setup({ token: WRITE });
    await store.load(REPO);
    let { item, sha } = await store.open(REPO, 'settlers');
    for (const note of ['One', 'Two']) {
        item = { ...item, name: `Settlers ${note}` };
        ({ sha } = await store.save(REPO, item, { base: sha, note }));
    }
    const versions = await store.history(REPO, 'settlers');
    assert.deepEqual(versions.map((v) => v.message), ['Two', 'One', 'Add projects/settlers.json']);
    const old = await store.version(REPO, 'settlers', versions[1].commit);
    assert.equal(old.item.name, 'Settlers One');
    await store.restore(REPO, 'settlers', versions[1].commit);
    assert.equal(fake.file(REPO, 'projects/settlers.json').projectName, 'Settlers One');
    assert.match(fake.commits(REPO)[0].message, /^Restore Settlers One as it was in [0-9a-f]{7}$/);
});

test('following from a link: #repo=owner/name, and nothing that is not a repo name', async () => {
    const { m } = await setup();
    const store = m.createProjectStore({ ProjectFormat, cleanName: ProjectLibrary.cleanName, fetch: () => { throw new Error('no network'); }, cache: m.memoryCache(), storage: memoryStorage() });
    assert.equal(m.PARAM, 'repo');
    assert.equal(store.followFromHash('#repo=designer/game-design'), 'designer/game-design');
    assert.equal(store.followFromHash('#b=abc&repo=Designer/Class-Library'), 'Designer/Class-Library');
    assert.equal(store.followFromHash('#repo=../../evil'), null);
    assert.equal(store.followFromHash('#repo=javascript:alert(1)'), null);
    assert.equal(store.followFromHash('#b=xyz'), null);
    assert.deepEqual(store.following(), ['designer/game-design', 'Designer/Class-Library']);
});

test('slugify and uniqueId make file names a repo and the kit accept', async () => {
    const { m } = await setup();
    assert.equal(m.slugify('Île de Ré — v2!'), 'ile-de-re-v2');
    assert.equal(m.slugify('   '), 'project');
    assert.equal(m.slugify('日本'), 'project');
    assert.ok(m.slugify('x'.repeat(200)).length <= 48);
    assert.equal(m.uniqueId('Map', ['map', 'MAP-2']), 'map-3');
    assert.equal(m.uniqueId('Map', []), 'map');
});

test('the content fingerprint changes with the design, not with where the tiles are drawn', async () => {
    const { m } = await setup();
    const a = showcase('island-settlers');
    const moved = JSON.parse(JSON.stringify(a));
    for (const p of moved.appState.polygons) { p.vertices = p.vertices.map((v) => ({ x: v.x * 1.5 + 10, y: v.y * 1.5 })); p.center = { x: 0, y: 0 }; }
    moved.appState.currentColor = '#000000';
    moved.appState.isEraserActive = true;
    assert.equal(m.contentHash(moved), m.contentHash(a), 'layout, selected colour and eraser are not the design');
    const painted = JSON.parse(JSON.stringify(a));
    painted.appState.polygons[3].color = painted.appState.polygons[3].color === '#2a6fb5' ? '#c8553d' : '#2a6fb5';
    assert.notEqual(m.contentHash(painted), m.contentHash(a));
    assert.notEqual(m.contentHash({ ...a, projectName: 'Renamed' }), m.contentHash(a));
});

test('links between projects of this browser and repo files are checked when read', async () => {
    const { m } = await setup();
    const storage = memoryStorage();
    const links = m.createLinks(storage);
    const sha = 'a'.repeat(40);
    assert.equal(links.set('project-1', { repo: REPO, id: 'chess', sha, created: '2026-01-02T03:04:05.000Z', content: 'abc', saved: true, commit: 'b'.repeat(40), at: 5 }), true);
    assert.deepEqual(plain(links.get('project-1')), { repo: REPO, id: 'chess', sha, created: '2026-01-02T03:04:05.000Z', content: 'abc', commit: 'b'.repeat(40), at: 5, saved: true });
    assert.equal(links.set('project-2', { repo: 'not a repo', id: 'chess' }), false);
    assert.equal(links.set('p', { repo: REPO, id: 'chess' }), false, 'not a project id');
    // what was written by hand or by an older version is dropped or tidied, not trusted
    storage.setItem(m.LINKS_KEY, JSON.stringify({
        'project-3': { repo: '../x', id: 'chess' },
        'project-4': { repo: REPO, id: '../../etc', sha },
        'project-5': { repo: REPO, id: 'pegs', sha: 'nope', commit: 42 }
    }));
    assert.deepEqual(Object.keys(links.all()), ['project-5']);
    assert.equal(links.get('project-5').sha, null);
    assert.deepEqual(links.find(REPO.toUpperCase(), 'pegs').map(([id]) => id), ['project-5']);
    storage.setItem(m.LINKS_KEY, '{not json');
    assert.deepEqual(plain(links.all()), {});
});

test('the page allows the two GitHub hosts and loads the module and its stylesheet', () => {
    const html = fs.readFileSync(path.join(ROOT, 'app', 'index.html'), 'utf8');
    const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
    const connect = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith('connect-src')).split(/\s+/);
    assert.ok(connect.includes('https://api.github.com'));
    assert.ok(connect.includes('https://raw.githubusercontent.com'));
    assert.match(html, /<script type="module" src="repo\.js"><\/script>/);
    assert.match(html, /<link rel="stylesheet" href="vendor\/git-store-kit\/git-store-kit\.css">/);
    for (const id of ['repoBlock', 'repoSaveBtn', 'repoHistoryBtn', 'repoPanelBtn', 'loadRepo']) assert.match(html, new RegExp(`id="${id}"`));
    const vendor = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor.json'), 'utf8'));
    assert.equal(vendor.modules['git-store-kit'], '1.0.0');
});
