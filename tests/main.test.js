'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load');
const { makeUI } = require('./support/fakes');

/**
 * Start-up opens, in this order: a shared link, a showcase, the project the address names, and otherwise a new
 * project that has to be named. Each step that opens something ends the start-up.
 */
function fresh({ hasLink = false, linkResult = true, showcase = null, showcaseResult = true, projectId = null, projectResult = true } = {}) {
    const log = [];
    const app = loadApp(['app/js/main.js'], {
        document: { addEventListener() {} },
        window: { addEventListener() {} },
        Utils: { debounce: (fn) => fn },
        Renderer: {},
        Interactions: { generateBoard: () => log.push('generate') },
        AppState: { getState: () => ({ boardConfig: {}, polygons: [] }) },
        UI: makeUI({ updateCanvasMessage() {} }),
        ProjectLibrary: { importLegacy: () => log.push('import') },
        ShareLink: {
            hasLink: () => hasLink,
            openFromHash: async () => { log.push('link'); if (linkResult instanceof Error) throw linkResult; return linkResult; }
        },
        FileManager: {
            setupAutoSave() {},
            showcaseFromUrl: () => showcase,
            openShowcase: async (id) => { log.push('showcase:' + id); return showcaseResult; },
            projectIdFromUrl: () => projectId,
            openStoredProject: (id) => { log.push('project:' + id); return projectResult; },
            startNewProject: () => log.push('new')
        }
    });
    return { log, Main: app.run('Main') };
}

test('older autosaves are turned into projects before anything is opened', async () => {
    const env = fresh();
    await env.Main.startBoard();
    assert.equal(env.log[0], 'import');
});

test('a share link that opens is the whole start-up', async () => {
    const env = fresh({ hasLink: true, linkResult: true, showcase: 'x', projectId: 'abcdef-1' });
    await env.Main.startBoard();
    assert.deepEqual(env.log, ['import', 'link']);
});

test('a share link that fails (or throws) carries on with the rest of the address, and finally a new project', async () => {
    for (const linkResult of [false, new Error('boom')]) {
        const env = fresh({ hasLink: true, linkResult });
        await env.Main.startBoard();
        assert.deepEqual(env.log, ['import', 'link', 'new']);
    }
    const env = fresh({ hasLink: true, linkResult: false, projectId: 'abcdef-1' });
    await env.Main.startBoard();
    assert.deepEqual(env.log, ['import', 'link', 'project:abcdef-1']);
});

test('a showcase in the address opens as a project; the project id is not even looked at', async () => {
    const env = fresh({ showcase: 'fantasy-landscape', projectId: 'abcdef-1' });
    await env.Main.startBoard();
    assert.deepEqual(env.log, ['import', 'showcase:fantasy-landscape']);
});

test('a project in the address opens', async () => {
    const env = fresh({ projectId: 'abcdef-1' });
    await env.Main.startBoard();
    assert.deepEqual(env.log, ['import', 'project:abcdef-1']);
});

test('a showcase or project that cannot be opened ends in a new project, which has to be named', async () => {
    const showcase = fresh({ showcase: 'x', showcaseResult: false });
    await showcase.Main.startBoard();
    assert.deepEqual(showcase.log, ['import', 'showcase:x', 'new']);
    const project = fresh({ projectId: 'abcdef-1', projectResult: false });
    await project.Main.startBoard();
    assert.deepEqual(project.log, ['import', 'project:abcdef-1', 'new']);
});

test('with nothing to open start-up asks for a new project', async () => {
    const env = fresh();
    await env.Main.startBoard();
    assert.deepEqual(env.log, ['import', 'new']);
});
