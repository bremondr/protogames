'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load');

/** Utils with a recording document, URL and timer, so a download can be watched without a browser. */
function fresh() {
    const log = { clicks: [], appended: [], removed: [], revoked: [], timers: [] };
    const anchor = { click: () => log.clicks.push({ href: anchor.href, download: anchor.download }) };
    const globals = {
        document: {
            createElement: () => anchor,
            body: { appendChild: (el) => log.appended.push(el), removeChild: (el) => log.removed.push(el) }
        },
        URL: { createObjectURL: () => 'blob:fake-1', revokeObjectURL: (url) => log.revoked.push(url) },
        setTimeout: (fn, ms) => { log.timers.push({ fn, ms }); return log.timers.length; }
    };
    const app = loadApp(['app/js/config.js', 'app/js/utils.js'], globals);
    return { log, Utils: app.run('Utils'), Config: app.run('Config') };
}

test('sanitizeFileName drops the characters Windows and macOS refuse and falls back to the default name', () => {
    const { Utils, Config } = fresh();
    assert.equal(Utils.sanitizeFileName('My board'), 'My board');
    assert.equal(Utils.sanitizeFileName('a<b>c:d"e/f\g|h?i*j'), 'abcdefghij');
    assert.equal(Utils.sanitizeFileName('  padded  '), 'padded');
    assert.equal(Utils.sanitizeFileName('../../etc/passwd'), '....etcpasswd', 'no path separators survive');
    assert.equal(Utils.sanitizeFileName('???'), Config.DEFAULT_PROJECT_NAME, 'nothing left: the default');
    assert.equal(Utils.sanitizeFileName(''), Config.DEFAULT_PROJECT_NAME);
    assert.equal(Utils.sanitizeFileName(), Config.DEFAULT_PROJECT_NAME);
    assert.equal(Utils.sanitizeFileName('Čeština ✓ ok'), 'Čeština ✓ ok', 'other characters are kept');
});

test('a blob download clicks a temporary link and keeps the blob URL alive for 10 seconds before revoking it', () => {
    const { Utils, log } = fresh();
    Utils.triggerBlobDownload({}, 'board.protogames.json');
    assert.deepEqual(log.clicks, [{ href: 'blob:fake-1', download: 'board.protogames.json' }]);
    assert.equal(log.appended.length, 1, 'the link is in the page while it is clicked');
    assert.equal(log.removed.length, 1, 'and gone afterwards');
    assert.deepEqual(log.revoked, [], 'not revoked at once: Safari and older Firefox would cancel the download');
    assert.equal(log.timers.length, 1);
    assert.ok(log.timers[0].ms >= 10000, 'a generous delay');
    log.timers[0].fn();
    assert.deepEqual(log.revoked, ['blob:fake-1'], 'revoked when the timer fires');
});

test('a data URL download clicks a temporary link and removes it', () => {
    const { Utils, log } = fresh();
    Utils.triggerDataUrlDownload('data:text/plain,hi', 'a.txt');
    assert.deepEqual(log.clicks, [{ href: 'data:text/plain,hi', download: 'a.txt' }]);
    assert.equal(log.removed.length, 1);
});

test('debounce runs the last call once the quiet time has passed', () => {
    const timers = [];
    const app = loadApp(['app/js/config.js', 'app/js/utils.js'], {
        window: { setTimeout: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length - 1; } },
        clearTimeout: (id) => { if (timers[id]) timers[id].live = false; }
    });
    const calls = [];
    const later = app.run('Utils').debounce((value) => calls.push(value), 50);
    later(1); later(2); later(3);
    timers.filter((t) => t.live).forEach((t) => { assert.equal(t.ms, 50); t.fn(); });
    assert.deepEqual(Array.from(calls), [3]);
});
