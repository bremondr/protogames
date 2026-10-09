'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load');
const { makeUI } = require('./support/fakes');

function fresh({ hasLink = false, linkResult = true, autosave = null } = {}) {
    const log = [];
    const app = loadApp(['js/main.js'], {
        document: { addEventListener() {} },
        window: { addEventListener() {} },
        Utils: { debounce: (fn) => fn },
        Renderer: {},
        Interactions: { generateBoard: () => log.push('generate') },
        AppState: { getState: () => ({ boardConfig: {}, polygons: [] }) },
        UI: makeUI({ updateCanvasMessage() {} }),
        ShareLink: {
            hasLink: () => hasLink,
            openFromHash: async () => { log.push('link'); if (linkResult instanceof Error) throw linkResult; return linkResult; }
        },
        FileManager: {
            setupAutoSave() {},
            loadAutoSave: () => autosave,
            showStartupMessage: () => log.push('message'),
            promptAutosaveRestore: () => log.push('offer')
        }
    });
    return { log, Main: app.run('Main') };
}

test('a share link that opens is the whole start-up', async () => {
    const env = fresh({ hasLink: true, linkResult: true, autosave: { x: 1 } });
    await env.Main.startBoard();
    assert.deepEqual(env.log, ['link']);
});

test('a share link that fails falls back to offering the autosave', async () => {
    const env = fresh({ hasLink: true, linkResult: false, autosave: { x: 1 } });
    await env.Main.startBoard();
    assert.deepEqual(env.log, ['link', 'message', 'offer']);
});

test('a share link that fails, with nothing saved, gets a fresh board instead of an empty canvas', async () => {
    const env = fresh({ hasLink: true, linkResult: false });
    await env.Main.startBoard();
    assert.deepEqual(env.log, ['link', 'message', 'generate']);
});

test('a share link that throws is treated like a failed one', async () => {
    const env = fresh({ hasLink: true, linkResult: new Error('boom') });
    await env.Main.startBoard();
    assert.deepEqual(env.log, ['link', 'message', 'generate']);
});

test('without a link start-up is unchanged: autosave offer, else a new board', async () => {
    const offer = fresh({ autosave: { x: 1 } });
    await offer.Main.startBoard();
    assert.deepEqual(offer.log, ['message', 'offer']);
    const blank = fresh();
    await blank.Main.startBoard();
    assert.deepEqual(blank.log, ['message', 'generate']);
});
