#!/usr/bin/env node
// Prints what the "Format release" workflow needs: the project file format version the app writes
// (ProjectFormat.CURRENT_VERSION), the release tag for it, and the release notes taken from the
// History table in docs/SPECIFICATION.md.
//
//   node tools/format-release.mjs tag     -> format-v8
//   node tools/format-release.mjs notes   -> the notes, as Markdown
//   node tools/format-release.mjs         -> both, as JSON
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function currentVersion(source) {
    const match = /const CURRENT_VERSION = (\d+);/.exec(source);
    if (!match) throw new Error('CURRENT_VERSION not found in app/js/projectFormat.js');
    return Number(match[1]);
}

export function historyRow(spec, version) {
    const history = spec.split(/^### History\s*$/m)[1];
    if (!history) throw new Error('"### History" not found in docs/SPECIFICATION.md');
    const section = history.split(/^#{1,3} /m)[0];
    const row = section.split('\n').map(l => l.trim()).find(l => l.startsWith(`| ${version} |`));
    if (!row) throw new Error(`Version ${version} has no row in the History table of docs/SPECIFICATION.md`);
    return row.replace(/^\|\s*\d+\s*\|\s*/, '').replace(/\s*\|$/, '');
}

export function build(root = ROOT) {
    const version = currentVersion(readFileSync(path.join(root, 'app/js/projectFormat.js'), 'utf8'));
    const spec = readFileSync(path.join(root, 'docs/SPECIFICATION.md'), 'utf8');
    const tag = `format-v${version}`;
    const notes = [
        `Project file format **version ${version}** (\`ProjectFormat.CURRENT_VERSION\`).`,
        '',
        historyRow(spec, version),
        '',
        'Older files are migrated on load; a file with a higher version is refused by this app. ' +
        'See "Project file format" in docs/SPECIFICATION.md.'
    ].join('\n');
    return { version, tag, notes };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const result = build();
    const what = process.argv[2];
    console.log(what === 'tag' ? result.tag : what === 'notes' ? result.notes : JSON.stringify(result, null, 2));
}
