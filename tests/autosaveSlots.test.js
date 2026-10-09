'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('./support/load');

const app = loadApp(['js/config.js', 'js/autosaveSlots.js']);
const Slots = app.run('AutosaveSlots');

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

const slot = (id, ageMs, valid = true) => ({
    key: id === 'legacy' ? 'protogames_autosave' : `protogames_autosave:${id}`,
    id,
    timestamp: valid ? NOW - ageMs : 0,
    valid
});
const choose = (entries, options) => plain(Slots.choose(entries, { now: NOW, ...options }));

test('a tab restores its own slot after a reload, even when other slots are newer', () => {
    const result = choose([slot('me', 3 * DAY), slot('crashed', MIN)], { ownId: 'me' });
    assert.equal(result.offer.id, 'me');
});

test('slots of tabs that are still open are never offered and never deleted', () => {
    const entries = [slot('other', 60 * DAY), slot('another', 90 * DAY)];
    const result = choose(entries, { ownId: 'me', liveIds: ['other', 'another'] });
    assert.equal(result.offer, null);
    assert.deepEqual(result.remove, []);
});

test('a new tab is offered the newest orphan, not an older one', () => {
    const result = choose([slot('old', 2 * DAY), slot('new', 5 * MIN), slot('mid', DAY)], { ownId: 'me' });
    assert.equal(result.offer.id, 'new');
    assert.deepEqual(result.remove, [], 'the others are kept for now');
});

test('the single autosave key of older versions is adopted like an orphan', () => {
    const result = choose([slot('legacy', DAY)], { ownId: 'me' });
    assert.equal(result.offer.id, 'legacy');
    assert.equal(result.offer.key, 'protogames_autosave');
    // ...but a newer orphan wins over it.
    assert.equal(choose([slot('legacy', DAY), slot('crashed', MIN)], { ownId: 'me' }).offer.id, 'crashed');
});

test('orphans older than a week are deleted, the offered one is never deleted', () => {
    const result = choose([slot('ancient', 30 * DAY), slot('older', 8 * DAY)], { ownId: 'me' });
    assert.equal(result.offer.id, 'older', 'even an old orphan is offered when it is the newest');
    assert.deepEqual(result.remove, ['protogames_autosave:ancient']);
});

test('only the newest few orphans are kept', () => {
    const entries = Array.from({ length: 9 }, (_, i) => slot(`t${i}`, (i + 1) * 60 * MIN));
    const result = choose(entries, { ownId: 'me' });
    assert.equal(result.offer.id, 't0');
    // offered + 5 kept = 6 slots survive, the 3 oldest go
    assert.deepEqual(result.remove.sort(), ['protogames_autosave:t6', 'protogames_autosave:t7', 'protogames_autosave:t8']);
});

test('unreadable slots are deleted and never offered, unless they are the tab\'s own', () => {
    const result = choose([slot('broken', MIN, false), slot('good', DAY)], { ownId: 'me' });
    assert.equal(result.offer.id, 'good');
    assert.deepEqual(result.remove, ['protogames_autosave:broken']);
    const own = choose([slot('me', MIN, false)], { ownId: 'me' });
    assert.equal(own.offer.id, 'me', 'the own slot is left to the caller, which reports the problem');
    assert.deepEqual(own.remove, []);
});

test('nothing stored means nothing to offer', () => {
    assert.deepEqual(choose([], { ownId: 'me' }), { offer: null, remove: [] });
});

test('live tabs do not count against the orphan limit', () => {
    const live = Array.from({ length: 8 }, (_, i) => slot(`live${i}`, i * MIN));
    const result = choose([...live, slot('orphan', DAY)], { ownId: 'me', liveIds: live.map((e) => e.id) });
    assert.equal(result.offer.id, 'orphan');
    assert.deepEqual(result.remove, []);
});

// ---- claim() and takeRestorable(): the browser side, with Web Locks and storage faked -------------------

const { makeStorage } = require('./support/fakes');

/** A fresh module with its own tab. `held` is shared between "tabs" so one can find a lock taken. */
function tab({ held = new Set(), locks = true, session = makeStorage(), local = makeStorage() } = {}) {
    const navigator = locks
        ? { locks: {
            request: (name, options, callback) => {
                const taken = held.has(name);
                if (!taken) held.add(name);
                return Promise.resolve(callback(taken ? null : { name }));
            },
            query: async () => ({ held: [...held].map((name) => ({ name })) })
        } }
        : {};
    const loaded = loadApp(['js/config.js', 'js/autosaveSlots.js'], { navigator, sessionStorage: session, localStorage: local, crypto: { randomUUID: (() => { let n = 0; return () => `uuid-${++n}-${Math.random().toString(36).slice(2, 6)}`; })() } });
    loaded.context.window = { localStorage: local };
    return { Slots: loaded.run('AutosaveSlots'), held, session, local, loaded };
}

const stored = (timestamp) => JSON.stringify({ version: 3, timestamp, projectName: 'x', appState: {} });

test('claim gives a new tab an id, remembers it for reloads and takes the lock', async () => {
    const t = tab();
    const id = await t.Slots.claim();
    assert.ok(id);
    assert.equal(t.session.getItem('protogames_tab_id'), id);
    assert.ok(t.held.has(`protogames-tab:${id}`));
    assert.equal(t.Slots.ownKey(), `protogames_autosave:${id}`);
});

test('a reload keeps the tab id, because the lock of the old page is gone', async () => {
    const session = makeStorage({ protogames_tab_id: 'same-tab' });
    const t = tab({ session });
    assert.equal(await t.Slots.claim(), 'same-tab');
});

test('a duplicated tab (same stored id, lock already held) gets a new id and its own slot', async () => {
    const session = makeStorage({ protogames_tab_id: 'original' });
    const held = new Set(['protogames-tab:original']);
    const t = tab({ held, session });
    const id = await t.Slots.claim();
    assert.notEqual(id, 'original');
    assert.equal(session.getItem('protogames_tab_id'), id, 'the copy remembers its new id');
    assert.ok(held.has(`protogames-tab:${id}`));
});

test('without Web Locks every other slot counts as live: only the own slot is ever offered', async () => {
    const local = makeStorage({
        'protogames_autosave:me': stored(1000),
        'protogames_autosave:other': stored(2000),
        protogames_autosave: stored(3000)
    });
    const t = tab({ locks: false, session: makeStorage({ protogames_tab_id: 'me' }), local });
    await t.Slots.claim();
    const offer = t.Slots.takeRestorable();
    assert.equal(offer.key, 'protogames_autosave:me');
    assert.equal(offer.own, true);
    assert.ok('protogames_autosave:other' in local.dump(), 'nothing of another tab is deleted');
});

test('without Web Locks and without an own slot nothing is offered or taken over', async () => {
    const local = makeStorage({ 'protogames_autosave:other': stored(2000) });
    const t = tab({ locks: false, local });
    await t.Slots.claim();
    assert.equal(t.Slots.takeRestorable(), null);
    assert.ok('protogames_autosave:other' in local.dump());
});

test('with Web Locks a slot whose tab is gone is adopted, and one whose tab is alive is not', async () => {
    const held = new Set(['protogames-tab:alive']);
    const local = makeStorage({ 'protogames_autosave:alive': stored(5000), 'protogames_autosave:gone': stored(4000) });
    const t = tab({ held, local });
    await t.Slots.claim();
    const offer = t.Slots.takeRestorable();
    assert.equal(offer.key, 'protogames_autosave:gone');
    assert.equal(offer.own, false);
});

test('takeRestorable before claim offers nothing', () => {
    assert.equal(tab().Slots.takeRestorable(), null);
});

test('blocked storage does not stop start-up: nothing is offered and nothing throws', async () => {
    const t = tab();
    await t.Slots.claim();
    const blocked = new Error('denied');
    blocked.name = 'SecurityError';
    Object.defineProperty(t.loaded.context.window, 'localStorage', { get() { throw blocked; } });
    assert.equal(t.Slots.takeRestorable(), null);
});

test('claim still works when sessionStorage is blocked: the tab just gets a new slot after a reload', async () => {
    const session = makeStorage();
    session.failWith = new Error('denied');
    const t = tab({ session });
    assert.ok(await t.Slots.claim());
});
