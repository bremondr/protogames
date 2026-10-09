'use strict';
/**
 * The browser side of share links: what happens when an address with "#b=" is opened.
 * The pure half (pack, unpack, ...) is covered in shareLink.test.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, GEOMETRY_SCRIPTS } = require('./support/load');
const { makeUI } = require('./support/fakes');

/** An open dialog backdrop: static ones in index.html have an id, dynamically created ones do not. */
function makeModal(id) {
    const modal = { id, hidden: false, removed: false };
    modal.classList = { add: (name) => { if (name === 'hidden') modal.hidden = true; }, contains: (name) => name === 'hidden' && modal.hidden };
    modal.remove = () => { modal.removed = true; };
    return modal;
}

function fresh({ hasWork = false, hash = '#b=AAAA', modals = [] } = {}) {
    const calls = { confirms: [], restores: [], replaced: [] };
    const location = { hash, pathname: '/app/', search: '' };
    const document = { querySelectorAll: () => modals.filter((m) => !m.hidden && !m.removed) };
    const app = loadApp([...GEOMETRY_SCRIPTS, 'js/projectFormat.js', 'js/shareLink.js'], {
        btoa, atob, TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response, Blob,
        location,
        document,
        history: { replaceState: (...args) => { calls.replaced.push(args); location.hash = ''; } },
        FileManager: {
            hasUserWork: () => hasWork,
            confirmReplace: (onConfirm, options) => calls.confirms.push({ onConfirm, options }),
            restoreState: (project) => calls.restores.push(project)
        },
        UI: makeUI(),
        AppState: { getState: () => ({ canvas: { width: 1200, height: 800 } }) },
        ViewControls: { fit() {} },
        Infinite: { fromId: () => null }
    });
    return { app, calls, location, ShareLink: app.run('ShareLink'), Config: app.run('Config'), ui: app.run('UI') };
}

/** A real link for a small blank board, made with the app's own encoder. */
async function linkFor(env, mutate) {
    const { ShareLink, Config } = env;
    const config = { ...Config.DEFAULT_BOARD_CONFIG, radius: 1, width: 3, height: 3 };
    const polygons = env.app.context.Geometry.generateGrid(config, { width: 1200, height: 800 }, null);
    const payload = JSON.parse(JSON.stringify(ShareLink.pack({
        projectName: 'x', boardConfig: config, paletteId: 'landscape', polygons, formatVersion: env.app.run('ProjectFormat.CURRENT_VERSION')
    })));
    if (mutate) mutate(payload);
    return ShareLink.encode(payload);
}

test('a link arriving after start-up opens straight away when there is nothing to lose', async () => {
    const env = fresh({ hasWork: false });
    env.location.hash = `#b=${await linkFor(env)}`;
    env.ShareLink.onHashChange();
    assert.equal(env.calls.confirms.length, 0);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(env.calls.restores.length, 1);
});

test('a link arriving after start-up asks before replacing work, and cancelling drops the link', async () => {
    const env = fresh({ hasWork: true });
    env.location.hash = `#b=${await linkFor(env)}`;
    env.ShareLink.onHashChange();
    assert.equal(env.calls.confirms.length, 1);
    assert.equal(env.calls.restores.length, 0, 'nothing is replaced before the answer');
    env.calls.confirms[0].options.onCancel();
    assert.equal(env.location.hash, '', 'the address is cleaned so the link is not offered again');
    assert.equal(env.calls.restores.length, 0);
});

test('confirming the replacement opens the shared board', async () => {
    const env = fresh({ hasWork: true });
    env.location.hash = `#b=${await linkFor(env)}`;
    env.ShareLink.onHashChange();
    await env.calls.confirms[0].onConfirm();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(env.calls.restores.length, 1);
});

test('a deflate bomb is refused while inflating, before anything is built', async () => {
    const zlib = require('node:zlib');
    const env = fresh();
    const bomb = zlib.deflateRawSync(Buffer.alloc(64 * 1024 * 1024));
    assert.ok(bomb.length < 200 * 1024, 'the bomb itself is small');
    const text = env.ShareLink.toBase64Url(new Uint8Array(bomb));
    await assert.rejects(() => env.ShareLink.decode(text), /too large/);
    env.location.hash = `#b=${text}`;
    await env.ShareLink.openFromHash();
    assert.equal(env.calls.restores.length, 0);
    assert.match(env.ui.notes[0], /too large/);
});

test('the link is dropped from the address before it is decoded, so a crash cannot make a reload retry it', async () => {
    const env = fresh();
    env.location.hash = `#b=${await linkFor(env)}`;
    const pending = env.ShareLink.openFromHash();
    assert.equal(env.location.hash, '', 'cleared synchronously, before the first await finishes');
    await pending;
});

test('settings that ask for an absurd number of tiles are refused before the grid is generated', async () => {
    const env = fresh();
    // Triangle tiles on a hexagon board of the largest radius: within the per-setting caps, far over the tile limit.
    env.location.hash = `#b=${await linkFor(env, (d) => { d.c = { ...d.c, gridType: 'triangle', boardShape: 'hexagon', radius: 100, width: 100, height: 100 }; })}`;
    env.app.context.Geometry.generateGrid = () => { throw new Error('must not be generated'); };
    await env.ShareLink.openFromHash();
    assert.equal(env.calls.restores.length, 0);
    assert.match(env.ui.notes[0], /too large/);
});

test('an infinite link naming too many tiles is refused before they are rebuilt', async () => {
    const env = fresh();
    env.app.context.Infinite.fromId = () => { throw new Error('must not be rebuilt'); };
    const ids = Array.from({ length: 20001 }, (_, i) => `inf_s_${i}_0`).join('.');
    env.location.hash = `#b=${await linkFor(env, (d) => { d.v = 2; d.c = { ...d.c, boardShape: 'infinite' }; d.i = ids; })}`;
    await env.ShareLink.openFromHash();
    assert.equal(env.calls.restores.length, 0);
    assert.match(env.ui.notes[0], /too large/);
});

test('a hash change without a link is ignored', () => {
    const env = fresh({ hasWork: true, hash: '#something-else' });
    env.ShareLink.onHashChange();
    assert.equal(env.calls.confirms.length, 0);
    assert.equal(env.calls.restores.length, 0);
});
