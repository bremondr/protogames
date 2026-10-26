'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('./support/load');
const { makeStorage, quotaError } = require('./support/fakes');

function fresh(initial = {}) {
    const storage = makeStorage(initial);
    const app = loadApp(['app/js/projectLibrary.js'], { localStorage: storage });
    return { storage, Library: app.run('ProjectLibrary'), app };
}

const payload = (name, extra = {}) => ({
    version: 7,
    timestamp: 1000,
    projectName: name,
    appState: { boardConfig: { boardShape: 'hexagon', gridType: 'hexagon' }, polygons: [{}, {}, {}] },
    ...extra
});
const ID_A = 'aaaaaa-1111';
const ID_B = 'bbbbbb-2222';

test('a project is written, read back and removed under its own key', () => {
    const { Library, storage } = fresh();
    Library.write(ID_A, payload('First'));
    assert.deepEqual(Object.keys(storage.dump()), [`protogames_project:${ID_A}`]);
    assert.equal(JSON.parse(Library.read(ID_A)).projectName, 'First');
    assert.equal(Library.read(ID_B), null);
    Library.remove(ID_A);
    assert.equal(Library.read(ID_A), null);
    assert.deepEqual(storage.dump(), {});
});

test('ids are checked, so a made-up key or a hostile address cannot reach other storage entries', () => {
    const { Library } = fresh({ other: 'x' });
    for (const bad of ['', 'a', 'has space-1', '../../x', 'x'.repeat(65), null, undefined, 5, '<script>']) {
        assert.equal(Library.isValidId(bad), false, String(bad));
        assert.equal(Library.read(bad), null);
    }
    assert.throws(() => Library.write('../x', payload('x')), /Not a project id/);
    assert.equal(Library.isValidId(Library.newId()), true, 'a new id is valid');
    assert.notEqual(Library.newId(), Library.newId());
});

test('the list is newest edit first, and tells what each project is', () => {
    const { Library } = fresh();
    Library.write(ID_A, payload('Old', { timestamp: 1000 }));
    Library.write(ID_B, payload('New', { timestamp: 5000, appState: { boardConfig: { boardShape: 'circle', gridType: 'square' }, polygons: [{}] } }));
    const list = plain(Library.list());
    assert.deepEqual(list.map((entry) => entry.name), ['New', 'Old']);
    assert.deepEqual(list[0], { id: ID_B, readable: true, name: 'New', timestamp: 5000, tiles: 1, boardShape: 'circle', gridType: 'square' });
    assert.equal(list[1].tiles, 3);
});

test('an unreadable entry is listed so it can be deleted, other keys are ignored', () => {
    const { Library } = fresh({ [`protogames_project:${ID_A}`]: '{nope', unrelated: '1', 'protogames_project:bad id': '{}' });
    const list = plain(Library.list());
    assert.equal(list.length, 1);
    assert.equal(list[0].readable, false);
    assert.equal(list[0].id, ID_A);
    Library.remove(ID_A);
    assert.deepEqual(plain(Library.list()), []);
});

test('summarize reads a payload without trusting it', () => {
    const { Library } = fresh();
    assert.equal(Library.summarize('not json'), null);
    assert.equal(Library.summarize('[]'), null);
    assert.equal(Library.summarize('{"projectName":"x"}'), null, 'a project has an appState');
    const odd = plain(Library.summarize(JSON.stringify({ projectName: '   ', timestamp: 'soon', appState: { boardConfig: 7, polygons: 'many' } })));
    assert.deepEqual(odd, { name: 'Untitled project', timestamp: 0, tiles: 0, boardShape: '', gridType: '' });
});

test('names are tidied: whitespace collapsed, empty stays empty, long ones cut', () => {
    const { Library } = fresh();
    assert.equal(Library.cleanName('  My   big\n board '), 'My big board');
    assert.equal(Library.cleanName('   '), '');
    assert.equal(Library.cleanName(null), '');
    assert.equal(Library.cleanName('x'.repeat(200)).length, Library.MAX_NAME_LENGTH);
    assert.equal(Array.from(Library.cleanName('🎲'.repeat(200))).length, Library.MAX_NAME_LENGTH, 'cut by characters, not by halves of one');
});

test('a full storage makes write throw, so the editor can tell the person', () => {
    const { Library, storage } = fresh();
    storage.failWith = quotaError();
    assert.throws(() => Library.write(ID_A, payload('x')), (error) => error.name === 'QuotaExceededError');
});

test('blocked storage gives an empty library instead of an error', () => {
    const blocked = new Error('denied');
    blocked.name = 'SecurityError';
    const app = loadApp(['app/js/projectLibrary.js'], {});
    Object.defineProperty(app.context, 'localStorage', { get() { throw blocked; } });
    const Library = app.run('ProjectLibrary');
    assert.deepEqual(plain(Library.list()), []);
    assert.equal(Library.read(ID_A), null);
    assert.equal(Library.importLegacy(), 0);
    assert.doesNotThrow(() => Library.remove(ID_A));
    assert.throws(() => Library.write(ID_A, payload('x')), /does not allow/);
});

test('the per-tab autosaves of older versions become projects, once, and are deleted', () => {
    const tab = JSON.stringify(payload('From a tab', { timestamp: 7000 }));
    const single = JSON.stringify(payload('Single key', { timestamp: 3000 }));
    const { Library, storage } = fresh({
        'protogames_autosave:tab-one-1234': tab,
        protogames_autosave: single,
        'protogames_autosave:broken-tab': '{nope',
        unrelated: 'keep'
    });
    assert.equal(Library.importLegacy(), 2);
    const dump = storage.dump();
    assert.deepEqual(Object.keys(dump).filter((key) => key.startsWith('protogames_autosave')), [], 'every old key is gone, the broken one too');
    assert.equal(dump.unrelated, 'keep');
    assert.deepEqual(plain(Library.list()).map((entry) => entry.name), ['From a tab', 'Single key']);
    assert.equal(Library.importLegacy(), 0, 'nothing is left to import');
    assert.equal(Library.list().length, 2, 'and no duplicates appear');
});

test('importing the same old autosave twice (two tabs starting together) makes one project', () => {
    const { Library, storage } = fresh({ 'protogames_autosave:tab-one-1234': JSON.stringify(payload('Once')) });
    Library.importLegacy();
    storage.setItem('protogames_autosave:tab-one-1234', JSON.stringify(payload('Once, written again by a tab that was still open')));
    assert.equal(Library.importLegacy(), 0);
    assert.deepEqual(plain(Library.list()).map((entry) => entry.name), ['Once'], 'the project already there is not overwritten');
});

test('ages are told in plain words', () => {
    const { Library } = fresh();
    const now = Date.UTC(2026, 9, 19, 12, 0, 0);
    assert.equal(Library.describeAge(0, now), 'Never saved');
    assert.equal(Library.describeAge(now - 20 * 1000, now), 'Edited just now');
    assert.equal(Library.describeAge(now - 60 * 1000, now), 'Edited 1 minute ago');
    assert.equal(Library.describeAge(now - 5 * 60 * 1000, now), 'Edited 5 minutes ago');
    assert.equal(Library.describeAge(now - 3 * 3600 * 1000, now), 'Edited 3 hours ago');
    assert.equal(Library.describeAge(now - 30 * 3600 * 1000, now), 'Edited yesterday');
    assert.equal(Library.describeAge(now - 4 * 86400 * 1000, now), 'Edited 4 days ago');
    assert.equal(Library.describeAge(Date.UTC(2026, 6, 1), now), 'Edited 2026-07-01');
    assert.equal(Library.describeAge(now + 5000, now), 'Edited just now', 'a clock that is off does not make negative ages');
});

test('a project is described by its board and tiles', () => {
    const { Library } = fresh();
    assert.equal(Library.describeBoard({ readable: true, boardShape: 'hexagon', gridType: 'hexagon', tiles: 91 }), 'Hexagon board, 91 hexagon tiles');
    assert.equal(Library.describeBoard({ readable: true, boardShape: 'rectangle', gridType: 'square', tiles: 1 }), 'Rectangle board, 1 square tile');
    assert.equal(Library.describeBoard({ readable: true, boardShape: '', gridType: '', tiles: 4 }), '4 tiles');
    assert.equal(Library.describeBoard({ readable: false }), 'This project cannot be read');
});

test('a legacy autosave newer than the project it was imported into replaces it; an older one does not', () => {
    const { Library, storage } = fresh({
        'protogames_autosave:tabx': JSON.stringify(payload('Newer', { timestamp: 5000 })),
        'protogames_project:recovered-tabx': JSON.stringify(payload('Imported', { timestamp: 2000 })),
        'protogames_autosave:taby': JSON.stringify(payload('Older', { timestamp: 1500 })),
        'protogames_project:recovered-taby': JSON.stringify(payload('Edited since', { timestamp: 3000 }))
    });
    assert.equal(Library.importLegacy(), 1);
    assert.equal(JSON.parse(Library.read('recovered-tabx')).projectName, 'Newer');
    assert.equal(JSON.parse(Library.read('recovered-taby')).projectName, 'Edited since');
    assert.deepEqual(Object.keys(storage.dump()).filter((key) => key.startsWith('protogames_autosave')), []);
});

test('a legacy autosave that cannot be copied is kept and reported', () => {
    const { Library, storage } = fresh({ 'protogames_autosave:tabz': JSON.stringify(payload('Big')) });
    storage.failWritesWith = quotaError();
    let reported = 0;
    assert.equal(Library.importLegacy((count) => { reported = count; }), 0);
    assert.equal(reported, 1);
    assert.ok('protogames_autosave:tabz' in storage.dump());
});

test('an absurd saved time reads as never saved, in the summary and in the age text', () => {
    const { Library } = fresh();
    const now = Date.now();
    for (const bad of [-1e20, 1e20, -5, now + 3 * 24 * 3600 * 1000, 'x', null]) {
        assert.equal(Library.summarize(JSON.stringify(payload('A', { timestamp: bad }))).timestamp, 0, String(bad));
        assert.equal(Library.describeAge(bad, now), 'Never saved', String(bad));
    }
    assert.equal(Library.describeAge(now - 1000, now), 'Edited just now');
    assert.equal(Library.summarize(JSON.stringify(payload('A', { timestamp: now + 1000 }))).timestamp, now + 1000, 'a clock a little ahead is believed');
});

test('readStrict tells a missing project from a storage that cannot be read', () => {
    const { Library, storage } = fresh();
    assert.equal(Library.readStrict(ID_A), null);
    storage.failWith = new Error('denied');
    assert.throws(() => Library.readStrict(ID_A), /denied/);
});
