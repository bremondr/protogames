'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, loadApp, plain } = require('./support/load');

const app = loadApp(['js/projectFormat.js']);
const PF = app.run('ProjectFormat');
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
const legacyProject = () => fixture('v0-legacy-project.protogames.json');
const currentProject = () => plain(PF.migrate(legacyProject()));

const throwsFormatError = (fn, code, pattern) =>
    assert.throws(fn, (error) => {
        assert.equal(error.name, 'ProjectFormatError');
        if (code) assert.equal(error.code, code);
        if (pattern) assert.match(error.message, pattern);
        return true;
    });

// ---- Saving ---------------------------------------------------------------------

test('createProject writes the current integer version and a creation time', () => {
    const state = currentProject().appState;
    const project = plain(PF.createProject({ projectName: 'my board', appState: state, now: 0 }));
    assert.equal(project.version, PF.CURRENT_VERSION);
    assert.ok(Number.isInteger(project.version));
    assert.equal(project.projectName, 'my board');
    assert.equal(project.created, '1970-01-01T00:00:00.000Z');
    assert.deepEqual(project.appState, state);
});

test('createAutosave writes the current integer version and a timestamp', () => {
    const project = plain(PF.createAutosave({ projectName: 'a', appState: currentProject().appState, now: 1234 }));
    assert.equal(project.version, PF.CURRENT_VERSION);
    assert.equal(project.timestamp, 1234);
});

test('what we save loads back unchanged (round trip)', () => {
    const saved = plain(PF.createProject({ projectName: 'round trip', appState: currentProject().appState }));
    const loaded = plain(PF.parse(JSON.stringify(saved)));
    assert.deepEqual(loaded, saved);
    const autosave = plain(PF.createAutosave({ projectName: 'round trip', appState: saved.appState, now: 99 }));
    assert.deepEqual(plain(PF.parse(JSON.stringify(autosave))), autosave);
});

// ---- Loading existing files ---------------------------------------------------------

test('a legacy v0 project (string version "1.0") still loads and keeps its data', () => {
    const legacy = legacyProject();
    assert.equal(legacy.version, '1.0');
    const loaded = plain(PF.parse(JSON.stringify(legacy)));
    assert.equal(loaded.version, PF.CURRENT_VERSION);
    assert.equal(loaded.projectName, 'legacy-board');
    assert.equal(loaded.created, legacy.created);
    assert.equal(loaded.appState.polygons.length, legacy.appState.polygons.length);
    assert.deepEqual(loaded.appState.boardConfig, legacy.appState.boardConfig);
    assert.equal(loaded.appState.polygons[0].color, '#2D5016');
    assert.equal(loaded.appState.polygons[2].object, 'castle');
});

test('a legacy autosave (timestamp, string version) still loads', () => {
    const loaded = plain(PF.parse(JSON.stringify(fixture('v0-legacy-autosave.json'))));
    assert.equal(loaded.version, PF.CURRENT_VERSION);
    assert.equal(loaded.timestamp, 1763200000000);
    assert.equal(loaded.projectName, 'legacy-autosave');
});

test('a file without any version is treated as v0 and loads', () => {
    const legacy = legacyProject();
    delete legacy.version;
    assert.equal(PF.detectVersion(legacy), 0);
    assert.equal(plain(PF.parse(legacy)).version, PF.CURRENT_VERSION);
});

test('the bundled showcase board loads', () => {
    const text = fs.readFileSync(path.join(ROOT, 'showcases', 'fantasy-landscape.protogames.json'), 'utf8');
    const loaded = plain(PF.parse(text));
    assert.equal(loaded.version, PF.CURRENT_VERSION);
    assert.ok(loaded.appState.polygons.length > 0);
});

test('parse accepts JSON text and parsed objects alike', () => {
    const project = JSON.stringify(plain(PF.createProject({ projectName: 'x', appState: currentProject().appState })));
    assert.deepEqual(plain(PF.parse(project)), plain(PF.parse(JSON.parse(project))));
});

// ---- Migration steps ---------------------------------------------------------------------

test('v0 to v1: sets the integer version and fills fields older builds omitted', () => {
    const legacy = legacyProject();
    delete legacy.projectName;
    delete legacy.appState.paletteId;
    delete legacy.appState.isEraserActive;
    delete legacy.appState.autoSaveEnabled;
    delete legacy.appState.polygons[1].color;
    legacy.appState.polygons[0].object = null;

    const migrated = plain(PF.MIGRATIONS[0](legacy));
    assert.equal(migrated.version, 1);
    assert.equal(migrated.projectName, 'protogames-board');
    assert.equal(migrated.appState.paletteId, 'landscape');
    assert.equal(migrated.appState.isEraserActive, false);
    assert.equal(migrated.appState.autoSaveEnabled, true);
    assert.equal(migrated.appState.polygons[1].color, '#ffffff');
    assert.ok(!('object' in migrated.appState.polygons[0]));
    assert.equal(migrated.appState.polygons[2].object, 'castle');
});

test('v0 to v1 keeps values that were already valid', () => {
    const legacy = legacyProject();
    legacy.appState.paletteId = 'space';
    legacy.appState.isEraserActive = true;
    legacy.appState.autoSaveEnabled = false;
    const migrated = plain(PF.MIGRATIONS[0](legacy));
    assert.equal(migrated.appState.paletteId, 'space');
    assert.equal(migrated.appState.isEraserActive, true);
    assert.equal(migrated.appState.autoSaveEnabled, false);
});

test('there is a migration for every version below the current one', () => {
    for (let v = 0; v < PF.CURRENT_VERSION; v++) {
        assert.equal(typeof PF.MIGRATIONS[v], 'function', `missing migration from v${v}`);
    }
    assert.equal(PF.MIGRATIONS[PF.CURRENT_VERSION], undefined, 'a migration exists for the current version');
});

test('every migration step produces the next version', () => {
    let project = legacyProject();
    for (let v = 0; v < PF.CURRENT_VERSION; v++) {
        project = plain(PF.MIGRATIONS[v](project));
        assert.equal(project.version, v + 1);
    }
});

test('migrating a current project changes nothing, and migrate never mutates its input', () => {
    const current = currentProject();
    assert.deepEqual(plain(PF.migrate(current)), current);
    const legacy = legacyProject();
    const before = JSON.stringify(legacy);
    PF.migrate(legacy);
    assert.equal(JSON.stringify(legacy), before);
});

// ---- Rejected files ----------------------------------------------------------------

test('files from a newer version are rejected with a clear message', () => {
    const newer = currentProject();
    newer.version = PF.CURRENT_VERSION + 1;
    throwsFormatError(() => PF.parse(newer), 'newer-version', new RegExp(`newer version.*${PF.CURRENT_VERSION + 1}.*up to ${PF.CURRENT_VERSION}`));
    newer.version = 999;
    throwsFormatError(() => PF.parse(JSON.stringify(newer)), 'newer-version');
});

test('unreadable version values are rejected', () => {
    for (const version of [1.5, -1, 'abc', '2.0', true, null, [], {}]) {
        const project = currentProject();
        project.version = version;
        throwsFormatError(() => PF.parse(project), 'bad-version', /unreadable version/);
    }
});

test('text that is not JSON is rejected', () => {
    throwsFormatError(() => PF.parse('this is not json'), 'not-json', /not valid JSON/);
    throwsFormatError(() => PF.parse(''), 'not-json');
    throwsFormatError(() => PF.parse('{"version": 1,'), 'not-json');
});

test('JSON that is not a project object is rejected', () => {
    for (const value of ['null', '[]', '42', '"text"', 'true']) {
        throwsFormatError(() => PF.parse(value), 'not-a-project');
    }
});

test('missing or malformed required parts are rejected with a readable reason', () => {
    const cases = [
        ['no appState', (p) => delete p.appState, /no saved board/],
        ['appState not an object', (p) => (p.appState = 5), /no saved board/],
        ['no boardConfig', (p) => delete p.appState.boardConfig, /no board settings/],
        ['unknown tile shape', (p) => (p.appState.boardConfig.gridType = 'pentagon'), /unknown tile shape/],
        ['unknown board shape', (p) => (p.appState.boardConfig.boardShape = 'blob'), /unknown board shape/],
        ['bad width', (p) => (p.appState.boardConfig.width = 'wide'), /width must be a positive number/],
        ['zero height', (p) => (p.appState.boardConfig.height = 0), /height must be a positive number/],
        ['no colour', (p) => delete p.appState.currentColor, /no selected colour/],
        ['no palette', (p) => delete p.appState.paletteId, /no palette/],
        ['eraser not boolean', (p) => (p.appState.isEraserActive = 'yes'), /eraser setting/],
        ['no polygons', (p) => delete p.appState.polygons, /no tile list/],
        ['polygons not array', (p) => (p.appState.polygons = {}), /no tile list/],
        ['tile not an object', (p) => (p.appState.polygons[0] = 7), /Tile 1 is not an object/],
        ['tile without id', (p) => delete p.appState.polygons[0].id, /Tile 1 has no id/],
        ['tile without vertices', (p) => delete p.appState.polygons[1].vertices, /Tile 2 \("[^"]+"\) has invalid vertices/],
        ['too few vertices', (p) => (p.appState.polygons[1].vertices = p.appState.polygons[1].vertices.slice(0, 2)), /invalid vertices/],
        ['NaN coordinate', (p) => (p.appState.polygons[1].vertices[0].x = null), /invalid vertices/],
        ['bad centre', (p) => (p.appState.polygons[2].center = { x: 'a', y: 1 }), /invalid centre/],
        ['non-string colour', (p) => (p.appState.polygons[2].color = 42), /Tile 3 \("[^"]+"\) has no colour/],
        ['bad object', (p) => (p.appState.polygons[2].object = 12), /invalid object/],
        ['duplicate ids', (p) => (p.appState.polygons[1].id = p.appState.polygons[0].id), /share the same id/],
        ['no project name', (p) => delete p.projectName, /no name/]
    ];
    for (const [label, mutate, pattern] of cases) {
        const project = currentProject();
        mutate(project);
        // Case-specific: a legacy project would be repaired for the omitted fields, so test the current format.
        assert.throws(() => PF.parse(project), (error) => {
            assert.equal(error.name, 'ProjectFormatError', label);
            assert.equal(error.code, 'invalid', label);
            assert.match(error.message, pattern, label);
            return true;
        });
    }
});

test('a legacy file that cannot be repaired is also rejected readably', () => {
    const legacy = legacyProject();
    legacy.appState.polygons = 'oops';
    throwsFormatError(() => PF.parse(legacy), 'invalid', /no tile list/);
    const noState = legacyProject();
    delete noState.appState;
    throwsFormatError(() => PF.parse(noState), 'invalid', /no saved board/);
});

test('errors are ProjectFormatError instances with a name and code', () => {
    try {
        PF.parse('nope');
        assert.fail('should have thrown');
    } catch (error) {
        // Errors come from the vm context's realm, so compare against its own class.
        assert.ok(error instanceof PF.ProjectFormatError);
        assert.equal(typeof error.message, 'string');
        assert.equal(error.name, 'ProjectFormatError');
        assert.equal(error.code, 'not-json');
    }
});

// ---- v1 -> v2: Space and Arctic palette redesign ------------------------------------------------

const v1Project = () => fixture('v1-space-arctic.protogames.json');
const colorOf = (project, index) => project.appState.polygons[index].color;

test('v1 to v2 maps every retired Space and Arctic colour to its successor', () => {
    const migrated = plain(PF.MIGRATIONS[1](v1Project()));
    assert.equal(migrated.version, 2);
    const expected = {
        '#240046': '#05040A', '#495057': '#3A3530', '#06FFA5': '#7B2CBF', '#90E0EF': '#7B2CBF',
        '#B3E5FC': '#D6E8F2', '#0288D1': '#1F5E86', '#01579B': '#1F5E86', '#546E7A': '#5E6B7A',
        '#37474F': '#5E6B7A', '#BBDEFB': '#BFE3F2', '#E0F7FA': '#E4ECF5'
    };
    const source = v1Project();
    source.appState.polygons.forEach((polygon, i) => {
        if (expected[polygon.color]) assert.equal(colorOf(migrated, i), expected[polygon.color], `tile ${i} (${polygon.color})`);
    });
});

test('v1 to v2: Star and Planet tiles become Deep Space with the matching object, keeping an existing object', () => {
    const source = v1Project();
    const migrated = plain(PF.MIGRATIONS[1](source));
    const index = (hex) => source.appState.polygons.findIndex((p) => p.color === hex && !p.object);
    const star = index('#FFD60A');
    const planet = index('#118AB2');
    assert.equal(colorOf(migrated, star), '#0D1B2A');
    assert.equal(migrated.appState.polygons[star].object, 'star');
    assert.equal(colorOf(migrated, planet), '#0D1B2A');
    assert.equal(migrated.appState.polygons[planet].object, 'planet');
    // The fixture has a tower on a Star tile: the colour is mapped, the object stays.
    const withTower = source.appState.polygons.findIndex((p) => p.object === 'tower');
    assert.equal(source.appState.polygons[withTower].color, '#FFD60A');
    assert.equal(colorOf(migrated, withTower), '#0D1B2A');
    assert.equal(migrated.appState.polygons[withTower].object, 'tower');
});

test('v1 to v2 leaves current colours, blank/white tiles and other palettes alone', () => {
    const source = v1Project();
    const migrated = plain(PF.MIGRATIONS[1](source));
    source.appState.polygons.forEach((polygon, i) => {
        if (['#0D1B2A', '#7B2CBF', '#FFFFFF', '#2D5016', '#7CB342', '#1976D2'].includes(polygon.color)) {
            assert.equal(colorOf(migrated, i), polygon.color, `tile ${i}`);
            if (!polygon.object) assert.equal(migrated.appState.polygons[i].object, undefined);
        }
    });
});

test('v1 to v2 also remaps the selected colour, ignoring case', () => {
    const project = v1Project();
    project.appState.currentColor = '#ffd60a';
    assert.equal(plain(PF.MIGRATIONS[1](project)).appState.currentColor, '#0D1B2A');
    project.appState.currentColor = '#7cb342';
    assert.equal(plain(PF.MIGRATIONS[1](project)).appState.currentColor, '#7cb342', 'a current colour is not touched');
    const lower = v1Project();
    lower.appState.polygons[2].color = lower.appState.polygons[2].color.toLowerCase();
    assert.equal(colorOf(plain(PF.MIGRATIONS[1](lower)), 2), '#05040A', 'lower-case hex still matches');
});

test('v1 to v2 tolerates incomplete data and does not mutate its input', () => {
    assert.equal(plain(PF.MIGRATIONS[1]({ version: 1 })).version, 2);
    assert.equal(plain(PF.MIGRATIONS[1]({ version: 1, appState: { polygons: [null, 7, { color: 5 }] } })).version, 2);
    const source = v1Project();
    const before = JSON.stringify(source);
    PF.MIGRATIONS[1](source);
    assert.equal(JSON.stringify(source), before);
});

test('a v1 file loads through parse() and every colour is a current palette colour', () => {
    const loaded = plain(PF.parse(JSON.stringify(v1Project())));
    assert.equal(loaded.version, PF.CURRENT_VERSION);
    const palette = new Set(['#0D1B2A', '#7B2CBF', '#05040A', '#3A3530', '#1F5E86', '#D6E8F2', '#BFE3F2', '#2A6E96', '#E4ECF5', '#A9BCD0', '#5E6B7A', '#FFFFFF', '#2D5016', '#7CB342', '#1976D2']);
    for (const polygon of loaded.appState.polygons) assert.ok(palette.has(polygon.color), `${polygon.color} is not a current colour`);
});

test('a v0 file migrates through both steps in order', () => {
    const legacy = legacyProject();
    legacy.appState.currentColor = '#FFD60A';
    legacy.appState.polygons[0].color = '#118AB2';
    const loaded = plain(PF.parse(JSON.stringify(legacy)));
    assert.equal(loaded.version, PF.CURRENT_VERSION);
    assert.equal(loaded.appState.currentColor, '#0D1B2A');
    assert.equal(loaded.appState.polygons[0].color, '#0D1B2A');
    assert.equal(loaded.appState.polygons[0].object, 'planet');
});

test('the retired colours are gone from the live palettes (the migration table matches reality)', () => {
    const { Config } = require('./support/load').loadGeometry();
    const live = new Set(Config.COLOR_PALETTES.flatMap((p) => p.colors.map((c) => c.hex.toLowerCase())));
    for (const hex of ['#ffd60a', '#118ab2', '#06ffa5', '#90e0ef', '#b3e5fc', '#0288d1', '#01579b', '#546e7a', '#37474f', '#bbdefb', '#e0f7fa', '#495057', '#240046']) {
        assert.ok(!live.has(hex), `${hex} is still in a live palette, so it should not be migrated away`);
    }
    for (const hex of ['#05040a', '#3a3530', '#1f5e86', '#d6e8f2', '#bfe3f2', '#e4ecf5', '#5e6b7a']) {
        assert.ok(live.has(hex), `${hex} (a migration target) must be in a live palette`);
    }
});
