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
    const calls = { confirms: [], restores: [], replaced: [], newProjects: 0 };
    const location = { hash, pathname: '/app/', search: '' };
    const document = { querySelectorAll: () => modals.filter((m) => !m.hidden && !m.removed) };
    const app = loadApp([...GEOMETRY_SCRIPTS, 'app/js/projectFormat.js', 'app/js/shareLink.js'], {
        btoa, atob, TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response, Blob,
        location,
        document,
        history: { replaceState: (...args) => { calls.replaced.push(args); location.hash = ''; } },
        FileManager: {
            hasUserWork: () => hasWork,
            showAsNewProject: (show) => { calls.newProjects += 1; show(); },
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

/** Opening a link decodes it asynchronously; wait for the restore instead of guessing a delay (a slow runner needs longer than 50 ms). */
async function untilRestored(env) {
    for (let waited = 0; env.calls.restores.length === 0 && waited < 5000; waited += 10) {
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

test('a link arriving after start-up opens as a new project, whether or not work is open: nothing is replaced, so nothing is asked', async () => {
    for (const hasWork of [false, true]) {
        const env = fresh({ hasWork });
        env.location.hash = `#b=${await linkFor(env)}`;
        env.ShareLink.onHashChange();
        assert.equal(env.calls.confirms.length, 0, 'no confirmation dialog');
        await untilRestored(env);
        assert.equal(env.calls.restores.length, 1);
        assert.equal(env.calls.newProjects, 1, 'the board went in as a project of its own');
    }
});

test('opening a link removes the dialogs made on the fly but only hides the ones that live in the page', async () => {
    const prompt = makeModal(undefined);
    const printDialog = makeModal('printDialog');
    const themeEditor = makeModal('themeEditor');
    const alreadyHidden = makeModal('shareDialog');
    alreadyHidden.hidden = true;
    const env = fresh({ modals: [prompt, printDialog, themeEditor, alreadyHidden] });
    env.location.hash = `#b=${await linkFor(env)}`;
    assert.equal(await env.ShareLink.openFromHash(), true);
    assert.equal(prompt.removed, true);
    for (const kept of [printDialog, themeEditor]) {
        assert.equal(kept.removed, false, `${kept.id} stays in the page`);
        assert.equal(kept.hidden, true, `${kept.id} is hidden`);
    }
    assert.equal(alreadyHidden.removed, false);
});

test('a link that fails reports false and leaves the open dialogs alone', async () => {
    const prompt = makeModal(undefined);
    const env = fresh({ modals: [prompt] });
    env.location.hash = '#b=AAAA';
    assert.equal(await env.ShareLink.openFromHash(), false);
    assert.equal(prompt.removed, false);
    assert.equal(await env.ShareLink.openFromHash(), false, 'and with no link at all');
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
