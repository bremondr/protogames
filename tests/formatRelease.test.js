'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, loadApp } = require('./support/load');

const load = () => import(path.join(ROOT, 'tools/format-release.mjs'));

test('the release version is the one the app writes, and its notes come from the spec history', async () => {
    const { build } = await load();
    const app = loadApp(['app/js/config.js', 'app/js/projectFormat.js']);
    const { version, tag, notes } = build();
    assert.equal(version, app.run('ProjectFormat.CURRENT_VERSION'));
    assert.equal(tag, `format-v${version}`);
    assert.match(notes, new RegExp(`version ${version}\\*\\*`));
    const spec = fs.readFileSync(path.join(ROOT, 'docs/SPECIFICATION.md'), 'utf8');
    assert.match(spec, new RegExp(`current version is \\*\\*${version}\\*\\*`));
});

test('historyRow reads one row and fails clearly when a version has none', async () => {
    const { historyRow } = await load();
    const spec = '### History\n\n| Version | Change |\n|---|---|\n| 1 | First. |\n| 2 | Second, with `code`. |\n\nText.\n';
    assert.equal(historyRow(spec, 2), 'Second, with `code`.');
    assert.throws(() => historyRow(spec, 3), /no row/);
    assert.throws(() => historyRow('nothing', 1), /History/);
});
