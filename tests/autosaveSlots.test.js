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
