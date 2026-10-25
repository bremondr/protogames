'use strict';
/**
 * Print.toPdf end to end with stand-ins for the browser: canvases whose 2D context takes any call and whose
 * toBlob hands back a few JPEG bytes. It checks the wiring (one image per page, progress, errors); what the
 * pages look like is checked by hand in a browser.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, GEOMETRY_SCRIPTS } = require('./support/load');

const JPEG = Uint8Array.from([0xff, 0xd8, 9, 8, 7, 0xff, 0xd9]);

function fresh({ encode = true } = {}) {
    const surfaces = [];
    const context = () => new Proxy({ calls: 0 }, {
        get: (target, key) => (key in target ? target[key] : key === 'measureText' ? (str) => ({ width: String(str).length * 2 }) : () => { target.calls++; }),
        set: (target, key, value) => { target[key] = value; return true; }
    });
    const document = {
        createElement: () => {
            const ctx = context();
            const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: (done) => done(encode ? new Blob([JPEG]) : null) };
            surfaces.push(canvas);
            return canvas;
        }
    };
    const app = loadApp([...GEOMETRY_SCRIPTS, 'app/js/viewMath.js', 'app/js/state.js', 'app/js/renderer.js', 'app/js/print.js'], { TextEncoder, Blob, document, setTimeout });
    const AppState = app.run('AppState');
    const Config = app.run('Config');
    const config = { ...Config.DEFAULT_BOARD_CONFIG };
    const state = AppState.getState();
    state.canvas = { width: 1200, height: 800 };
    const polygons = app.context.Geometry.generateGrid(config, state.canvas, null);
    polygons[0].color = '#1976D2';
    AppState.setPolygons(polygons);
    AppState.updateBoardConfig(config);
    return { Print: app.run('Print'), surfaces, AppState };
}

const pagesOf = async (blob) => Number(/\/Count (\d+)/.exec(Buffer.from(await blob.arrayBuffer()).toString('latin1'))[1]);

test('toPdf makes one JPEG page per planned page, reports each one, and releases the page canvases', async () => {
    const { Print, surfaces } = fresh();
    const settings = { mode: 'tiled', tileMm: 30, legend: true, objects: 'board' };
    const expected = Print.plan(settings).pageCount;
    assert.ok(expected >= 2, 'a board that needs several pages');
    const steps = [];
    const blob = await Print.toPdf(settings, (done, total) => steps.push([done, total]));
    assert.equal(blob.type, 'application/pdf');
    assert.equal(await pagesOf(blob), expected);
    assert.deepEqual(steps.map(([done]) => done), Array.from({ length: expected }, (_, i) => i + 1));
    assert.ok(steps.every(([, total]) => total === expected));
    assert.ok(Buffer.from(await blob.arrayBuffer()).includes(Buffer.from(JPEG)), 'the encoded page is in the file');
    assert.ok(surfaces.filter((canvas) => canvas.width === 0 && canvas.height === 0).length >= expected, 'finished pages are shrunk so their memory is freed');
});

test('toPdf of a single sheet is one page', async () => {
    const { Print } = fresh();
    assert.equal(await pagesOf(await Print.toPdf({ mode: 'sheet', paper: 'A4', legend: false })), 1);
});

test('toPdf refuses a print the plan blocks, with the reason', async () => {
    const { Print, AppState } = fresh();
    AppState.setPolygons([]);
    assert.equal(Print.plan({}).blocked, true);
    await assert.rejects(() => Print.toPdf({}), /Generate a board first/);
});

test('toPdf says so when the browser cannot encode a page image', async () => {
    const { Print } = fresh({ encode: false });
    await assert.rejects(() => Print.toPdf({ mode: 'sheet', paper: 'A4', legend: false }), /could not encode a page image/);
});
