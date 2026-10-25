'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, loadApp, plain } = require('./support/load');

const app = loadApp(['app/js/projectFormat.js']);
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
    assert.deepEqual(loaded.appState.boardConfig, { ...legacy.appState.boardConfig, center: 'tile' }, 'the board is untouched, the centre written down');
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
    const text = fs.readFileSync(path.join(ROOT, 'app', 'showcases', 'fantasy-landscape.protogames.json'), 'utf8');
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

test('a v0 file migrates through every step in order', () => {
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

// ---- v2 -> v3: the infinite board shape ----------------------------------------------------------

const v2Project = () => fixture('v2-space-arctic.protogames.json');

test('v2 to v3 changes nothing but the version number', () => {
    const source = v2Project();
    const migrated = plain(PF.MIGRATIONS[2](source));
    assert.equal(migrated.version, 3);
    const expected = JSON.parse(JSON.stringify(source));
    expected.version = 3;
    assert.deepEqual(migrated, expected);
    assert.equal(source.version, 2, 'the input is not mutated');
});

test('a v2 file loads through parse() as a current project', () => {
    const loaded = plain(PF.parse(JSON.stringify(v2Project())));
    assert.equal(loaded.version, PF.CURRENT_VERSION);
    assert.equal(loaded.appState.polygons.length, v2Project().appState.polygons.length);
});

test('the infinite board shape is valid, and a file that uses it needs the current version', () => {
    const project = plain(PF.parse(JSON.stringify(v2Project())));
    project.appState.boardConfig.boardShape = 'infinite';
    assert.doesNotThrow(() => PF.validate(project));
    project.appState.boardConfig.boardShape = 'spiral';
    assert.throws(() => PF.validate(project), /unknown board shape/);
    // An app that predates version 3 refuses it as "newer", which is the point of the bump.
    const future = { ...plain(PF.parse(JSON.stringify(v2Project()))), version: PF.CURRENT_VERSION + 1 };
    assert.throws(() => PF.parse(JSON.stringify(future)), (error) => error.code === 'newer-version');
});

// ---- Hostile and out-of-range input (no format change: nothing here rejects a file the app writes) ----

const hostile = () => JSON.parse(JSON.stringify(plain(PF.parse(JSON.stringify(v2Project())))));

test('every existing fixture and showcase still loads under the stricter rules', () => {
    const files = [
        ...fs.readdirSync(path.join(__dirname, 'fixtures')).map((name) => path.join(__dirname, 'fixtures', name)),
        ...fs.readdirSync(path.join(ROOT, 'app', 'showcases')).filter((name) => name.endsWith('.json')).map((name) => path.join(ROOT, 'app', 'showcases', name))
    ];
    assert.ok(files.length >= 5);
    for (const file of files) assert.doesNotThrow(() => PF.parse(fs.readFileSync(file, 'utf8')), file);
});

test('hostile files are refused with a readable reason', () => {
    const cases = [
        ['non-numeric bounds', (p) => (p.appState.polygons[0].bounds = { minX: 'a', maxX: 1, minY: 0, maxY: 1 }), 'bounds'],
        ['bounds not an object', (p) => (p.appState.polygons[0].bounds = 5), 'bounds'],
        ['radius 1e6', (p) => (p.appState.boardConfig.radius = 1e6), 'radius'],
        ['negative radius', (p) => (p.appState.boardConfig.radius = -3), 'radius'],
        ['radius as text', (p) => (p.appState.boardConfig.radius = '5'), 'radius'],
        ['size 1e6', (p) => (p.appState.boardConfig.size = 1e6), 'size'],
        ['width 1e9', (p) => (p.appState.boardConfig.width = 1e9), 'width'],
        ['height as text', (p) => (p.appState.boardConfig.height = 'Infinity'), 'height'],
        ['unknown orientation', (p) => (p.appState.boardConfig.orientation = 'sideways'), 'orientation'],
        ['unknown triangle orientation', (p) => (p.appState.boardConfig.triangleOrientation = {}), 'orientation'],
        ['markup in colour', (p) => (p.appState.polygons[0].color = 'red" onload="alert(1)'), 'colour'],
        ['url() as colour', (p) => (p.appState.polygons[0].color = 'url(https://example.com/x)'), 'colour'],
        ['named colour', (p) => (p.appState.polygons[0].color = 'red'), 'colour'],
        ['empty object id', (p) => (p.appState.polygons[0].object = ''), 'object'],
        ['huge object id', (p) => (p.appState.polygons[0].object = 'x'.repeat(5000)), 'object'],
        ['thousands of vertices', (p) => (p.appState.polygons[0].vertices = Array.from({ length: 5000 }, () => ({ x: 0, y: 0 }))), 'vertices'],
        ['infinite board with no tiles', (p) => { p.appState.boardConfig.boardShape = 'infinite'; p.appState.polygons = []; }, 'tile']
    ];
    for (const [label, mutate, word] of cases) {
        const project = hostile();
        mutate(project);
        assert.throws(() => PF.parse(JSON.stringify(project)), (error) => {
            assert.equal(error.code, 'invalid', label);
            assert.match(error.message, new RegExp(word, 'i'), label);
            return true;
        }, label);
    }
});

test('"__proto__" as an object id is a plain string to the format (the renderer must look it up safely)', () => {
    const project = hostile();
    project.appState.polygons[0].object = '__proto__';
    const loaded = plain(PF.parse(JSON.stringify(project)));
    assert.equal(loaded.appState.polygons[0].object, '__proto__');
});

test('a file without bounds gets them from the vertices instead of crashing the renderer', () => {
    const project = hostile();
    const polygon = project.appState.polygons[0];
    const expected = plain(polygon.bounds);
    delete polygon.bounds;
    const loaded = plain(PF.parse(JSON.stringify(project)));
    assert.deepEqual(loaded.appState.polygons[0].bounds, expected);
});

test('disagreeing bounds are recomputed from the vertices (a huge box would exhaust the point locator)', () => {
    const project = hostile();
    const polygon = project.appState.polygons[0];
    const expected = plain(polygon.bounds);
    polygon.bounds = { minX: -3e6, maxX: 3e6, minY: -3e6, maxY: 3e6 };
    const loaded = plain(PF.parse(JSON.stringify(project)));
    assert.deepEqual(loaded.appState.polygons[0].bounds, expected);
});

test('coordinates beyond what a board can hold are refused, not looped over', () => {
    const far = (project, value) => {
        const polygon = project.appState.polygons[0];
        polygon.vertices = polygon.vertices.map((v) => ({ x: v.x + value, y: v.y + value }));
        polygon.center = { x: polygon.center.x + value, y: polygon.center.y + value };
    };
    const finite = hostile();
    far(finite, 1e18);
    throwsFormatError(() => PF.parse(JSON.stringify(finite)), 'invalid', /too far/);
    const justOver = hostile();
    far(justOver, 2e7);
    throwsFormatError(() => PF.parse(JSON.stringify(justOver)), 'invalid', /too far/);

    const infinite = hostile();
    infinite.appState.boardConfig.boardShape = 'infinite';
    far(infinite, 1e18);
    throwsFormatError(() => PF.parse(JSON.stringify(infinite)), 'invalid', /too far/);
    const farButFine = hostile();
    farButFine.appState.boardConfig.boardShape = 'infinite';
    far(farButFine, 5e9); // an infinite board panned very far stays valid
    assert.doesNotThrow(() => PF.parse(JSON.stringify(farButFine)));
});

test('an infinite tile id near 2^53 is refused', () => {
    for (const id of ['inf_s_9007199254740991_0', 'inf_t_0_-9007199254740991_up', 'inf_hp_1000000001_0']) {
        const project = hostile();
        project.appState.boardConfig.boardShape = 'infinite';
        project.appState.polygons[0].id = id;
        throwsFormatError(() => PF.parse(JSON.stringify(project)), 'invalid', /too large/);
    }
    const ok = hostile();
    ok.appState.boardConfig.boardShape = 'infinite';
    ok.appState.polygons[0].id = 'inf_s_1000000_-1000000';
    assert.doesNotThrow(() => PF.parse(JSON.stringify(ok)));
});

test('values at the edge of the allowed range, and three-digit colours, are still accepted', () => {
    const project = hostile();
    Object.assign(project.appState.boardConfig, { radius: 100, size: 100, width: 201, height: 201, orientation: 'flat-top', triangleOrientation: 'point-down' });
    project.appState.polygons[0].color = '#FfF';
    assert.doesNotThrow(() => PF.parse(JSON.stringify(project)));
    delete project.appState.boardConfig.orientation;
    delete project.appState.boardConfig.radius;
    assert.doesNotThrow(() => PF.parse(JSON.stringify(project)), 'optional settings may be absent');
});

test('an empty board is still accepted unless it is infinite', () => {
    const project = hostile();
    project.appState.polygons = [];
    assert.doesNotThrow(() => PF.parse(JSON.stringify(project)));
});

// ---- v3 -> v4: the country board shape ---------------------------------------------------------------

const v3Project = () => fixture('v3-space-arctic.protogames.json');

test('v3 to v4 changes nothing but the version number', () => {
    const source = v3Project();
    const migrated = plain(PF.MIGRATIONS[3](source));
    assert.equal(migrated.version, 4);
    const expected = JSON.parse(JSON.stringify(source));
    expected.version = 4;
    assert.deepEqual(migrated, expected);
    assert.equal(source.version, 3, 'the input is not mutated');
});

test('a v3 file loads through parse() as a current project', () => {
    const loaded = plain(PF.parse(JSON.stringify(v3Project())));
    assert.equal(loaded.version, PF.CURRENT_VERSION);
    assert.equal(loaded.appState.polygons.length, v3Project().appState.polygons.length);
});

test('a country board needs a country; its other settings are checked when present', () => {
    const base = () => {
        const project = plain(PF.parse(JSON.stringify(v3Project())));
        project.appState.boardConfig.boardShape = 'country';
        project.appState.boardConfig.country = 'Czechia';
        return project;
    };
    assert.doesNotThrow(() => PF.validate(base()));
    const ok = base();
    ok.appState.boardConfig.countryParts = 'all';
    ok.appState.boardConfig.countryBorders = false;
    ok.appState.boardConfig.countryMain = true;
    assert.doesNotThrow(() => PF.validate(ok));

    const reject = (mutate, pattern) => {
        const project = base();
        mutate(project.appState.boardConfig);
        assert.throws(() => PF.validate(project), pattern);
    };
    reject((c) => { delete c.country; }, /no valid country/);
    reject((c) => { c.country = '   '; }, /no valid country/);
    reject((c) => { c.country = 7; }, /no valid country/);
    reject((c) => { c.country = 'x'.repeat(101); }, /no valid country/);
    reject((c) => { c.countryParts = 'everything'; }, /islands setting/);
    reject((c) => { c.countryBorders = 'yes'; }, /countryBorders is not true\/false/);
    reject((c) => { c.countryMain = 1; }, /countryMain is not true\/false/);
});

test('country settings on other board shapes are ignored, not validated', () => {
    const project = plain(PF.parse(JSON.stringify(v3Project())));
    project.appState.boardConfig.country = 12345;
    project.appState.boardConfig.countryParts = 'nonsense';
    assert.doesNotThrow(() => PF.validate(project), 'a hexagon board that once was a country board still loads');
});

// ---- v4 -> v5: square and rectangle boards united ----------------------------------------------------------

const v4Project = () => fixture('v4-square-board.protogames.json');

test('v4 to v5 turns a square board into a rectangle of size x size and leaves the tiles alone', () => {
    const source = v4Project();
    assert.equal(source.appState.boardConfig.boardShape, 'square');
    const size = source.appState.boardConfig.size;
    const migrated = plain(PF.MIGRATIONS[4](source));
    assert.equal(migrated.version, 5);
    assert.equal(migrated.appState.boardConfig.boardShape, 'rectangle');
    assert.equal(migrated.appState.boardConfig.width, size);
    assert.equal(migrated.appState.boardConfig.height, size);
    assert.deepEqual(migrated.appState.polygons, plain(source.appState.polygons), 'the tiles are untouched');
    assert.equal(source.appState.boardConfig.boardShape, 'square', 'the input is not mutated');
});

test('v4 to v5 only touches square boards, and copes with a missing size', () => {
    const rectangle = v4Project();
    rectangle.appState.boardConfig = { ...rectangle.appState.boardConfig, boardShape: 'rectangle', width: 7, height: 3 };
    const kept = plain(PF.MIGRATIONS[4](rectangle)).appState.boardConfig;
    assert.deepEqual([kept.boardShape, kept.width, kept.height], ['rectangle', 7, 3]);
    for (const shape of ['hexagon', 'triangle', 'circle', 'infinite', 'country']) {
        const project = v4Project();
        project.appState.boardConfig = { ...project.appState.boardConfig, boardShape: shape, width: 9, height: 4, size: 5 };
        const config = plain(PF.MIGRATIONS[4](project)).appState.boardConfig;
        assert.deepEqual([config.boardShape, config.width, config.height], [shape, 9, 4], shape);
    }
    const noSize = v4Project();
    delete noSize.appState.boardConfig.size;
    noSize.appState.boardConfig.width = 6;
    const migrated = plain(PF.MIGRATIONS[4](noSize)).appState.boardConfig;
    assert.deepEqual([migrated.width, migrated.height], [6, 6], 'the width stands in for a missing size');
    assert.equal(plain(PF.MIGRATIONS[4]({ version: 4 })).version, 5, 'incomplete data does not throw');
    assert.equal(plain(PF.MIGRATIONS[4]({ version: 4, appState: { boardConfig: null } })).version, 5);
});

test('a v4 square-board file loads through parse() as a valid rectangle board', () => {
    const loaded = plain(PF.parse(JSON.stringify(v4Project())));
    assert.equal(loaded.version, PF.CURRENT_VERSION);
    assert.equal(loaded.appState.boardConfig.boardShape, 'rectangle');
    assert.doesNotThrow(() => PF.validate(loaded));
});

test('a current project can no longer be a "square" board; it is a rectangle', () => {
    const project = plain(PF.parse(JSON.stringify(v4Project())));
    project.appState.boardConfig.boardShape = 'square';
    assert.throws(() => PF.validate(project), /unknown board shape/);
});

test('older files that name the square board go through every step to a rectangle', () => {
    const old = plain(PF.parse(JSON.stringify(v3Project())));
    const legacy = { ...old, version: 3, appState: { ...old.appState, boardConfig: { ...old.appState.boardConfig, boardShape: 'square', size: 5, width: 11, height: 11 } } };
    const loaded = plain(PF.parse(JSON.stringify(legacy)));
    assert.equal(loaded.appState.boardConfig.boardShape, 'rectangle');
    assert.equal(loaded.appState.boardConfig.width, 5);
    assert.equal(loaded.appState.boardConfig.height, 5);
});

// ---- v5 -> v6: players, start markers and dice ------------------------------------------------------------

const v5Project = () => fixture('v5-space-arctic.protogames.json');
const v6Project = () => fixture('v6-space-arctic.protogames.json');
const STANDARD_DICE = [3, 4, 6, 8, 10, 12, 20].map((sides) => ({ sides }));
const RED = '#c62828';
const BLUE = '#1565c0';

/** A current project with the given players (and dice, by default the standard set). */
function withPlayers(players, dice = STANDARD_DICE) {
    const project = plain(PF.parse(JSON.stringify(v5Project())));
    project.appState.players = players;
    project.appState.dice = dice;
    return project;
}
const twoPlayers = () => [
    { color: RED, seat: 'bottom', pieces: [{ kind: 'pawn', count: 4 }, { kind: 'cube', count: 12 }] },
    { color: BLUE, seat: 'top', pieces: [{ kind: 'meeple', count: 2 }] }
];

test('v5 to v6 adds no players and the standard dice, and changes nothing else', () => {
    const source = v5Project();
    const migrated = plain(PF.MIGRATIONS[5](source));
    assert.equal(migrated.version, 6);
    assert.deepEqual(migrated.appState.players, []);
    assert.deepEqual(migrated.appState.dice, STANDARD_DICE);
    const expected = JSON.parse(JSON.stringify(source));
    expected.version = 6;
    expected.appState.players = [];
    expected.appState.dice = STANDARD_DICE;
    assert.deepEqual(migrated, expected);
    assert.equal(source.version, 5, 'the input is not mutated');
    assert.equal(source.appState.players, undefined);
});

test('v5 to v6 keeps players and dice a file already has', () => {
    const source = v5Project();
    source.appState.players = twoPlayers();
    source.appState.dice = [{ sides: 6 }];
    const migrated = plain(PF.MIGRATIONS[5](source));
    assert.deepEqual(migrated.appState.players, twoPlayers());
    assert.deepEqual(migrated.appState.dice, [{ sides: 6 }]);
});

test('a v5 file loads through parse() as a current project with the standard dice', () => {
    const loaded = plain(PF.parse(JSON.stringify(v5Project())));
    assert.equal(loaded.version, PF.CURRENT_VERSION);
    assert.equal(PF.CURRENT_VERSION, 7);
    assert.deepEqual(loaded.appState.players, []);
    assert.deepEqual(loaded.appState.dice, STANDARD_DICE);
});

test('older fixtures also arrive with players and dice', () => {
    for (const name of ['v0-legacy-project.protogames.json', 'v1-space-arctic.protogames.json', 'v2-space-arctic.protogames.json', 'v3-space-arctic.protogames.json', 'v4-space-arctic.protogames.json', 'v4-square-board.protogames.json', 'v5-space-arctic.protogames.json']) {
        const loaded = plain(PF.parse(JSON.stringify(fixture(name))));
        assert.deepEqual(loaded.appState.players, [], name);
        assert.deepEqual(loaded.appState.dice, STANDARD_DICE, name);
    }
});

test('players, start markers and dice survive saving and loading', () => {
    const project = withPlayers(twoPlayers(), [{ sides: 6 }, { sides: 20 }]);
    project.appState.polygons[0].start = RED;
    project.appState.polygons[1].start = BLUE;
    const saved = plain(PF.createProject({ projectName: 'game', appState: project.appState, now: 0 }));
    const loaded = plain(PF.parse(JSON.stringify(saved)));
    assert.deepEqual(loaded, saved);
    assert.equal(loaded.appState.polygons[0].start, RED);
    const autosave = plain(PF.createAutosave({ projectName: 'game', appState: project.appState, now: 7 }));
    assert.deepEqual(plain(PF.parse(JSON.stringify(autosave))), autosave);
});

test('a project from a newer app than this one is still refused', () => {
    const project = withPlayers(twoPlayers());
    project.version = PF.CURRENT_VERSION + 1;
    throwsFormatError(() => PF.parse(JSON.stringify(project)), 'newer-version');
});

test('a tile start marker must be a colour', () => {
    const reject = (value) => {
        const project = withPlayers([]);
        project.appState.polygons[0].start = value;
        throwsFormatError(() => PF.validate(project), 'invalid', /invalid start marker/);
    };
    [7, null, '', 'red', '#12', '#gggggg', '<script>', { color: RED }].forEach(reject);
    const ok = withPlayers([]);
    ok.appState.polygons[0].start = '#abc';
    ok.appState.polygons[1].start = '#C62828';
    assert.doesNotThrow(() => PF.validate(ok));
});

test('players are checked: count, colours, seats and pieces', () => {
    const reject = (mutate, pattern) => {
        const players = twoPlayers();
        mutate(players);
        throwsFormatError(() => PF.validate(withPlayers(players)), 'invalid', pattern);
    };
    assert.doesNotThrow(() => PF.validate(withPlayers(twoPlayers())));
    assert.doesNotThrow(() => PF.validate(withPlayers([])));
    reject((p) => { p[0].color = 'red'; }, /invalid colour/);
    reject((p) => { p[0].color = 12; }, /invalid colour/);
    reject((p) => { p[1].color = RED.toUpperCase(); }, /share the colour/);
    reject((p) => { p[0].seat = 'diagonal'; }, /unknown seat/);
    reject((p) => { p[0].seat = undefined; }, /unknown seat/);
    reject((p) => { p[0].pieces = 'many'; }, /invalid piece set/);
    reject((p) => { p[0].pieces = [{ kind: 'pawn', count: 1 }, { kind: 'disc', count: 1 }, { kind: 'cube', count: 1 }, { kind: 'meeple', count: 1 }, { kind: 'pawn', count: 1 }]; }, /invalid piece set/);
    reject((p) => { p[0].pieces[0].kind = 'dragon'; }, /unknown kind/);
    reject((p) => { p[0].pieces[1].kind = 'pawn'; }, /pawn twice/);
    reject((p) => { p[0].pieces[0].count = 0; }, /invalid number of pawn/);
    reject((p) => { p[0].pieces[0].count = 1.5; }, /invalid number of pawn/);
    reject((p) => { p[0].pieces[0].count = '4'; }, /invalid number of pawn/);
    reject((p) => { p[0].pieces[0].count = 501; }, /invalid number of pawn/);
    reject((p) => { p[0] = 'player one'; }, /is not an object/);
    reject((p) => { p[0].pieces = [{ kind: 'pawn', count: 300 }]; p[1].pieces = [{ kind: 'meeple', count: 201 }]; }, /too many pieces/);
    const many = Array.from({ length: 9 }, (_, i) => ({ color: `#00000${i}`, seat: 'bottom', pieces: [] }));
    throwsFormatError(() => PF.validate(withPlayers(many)), 'invalid', /too many players/);
    const project = withPlayers(twoPlayers());
    delete project.appState.players;
    throwsFormatError(() => PF.validate(project), 'invalid', /no player list/);
    project.appState.players = {};
    throwsFormatError(() => PF.validate(project), 'invalid', /no player list/);
});

test('exactly 500 pieces and 8 players are allowed', () => {
    const colors = ['#000001', '#000002', '#000003', '#000004', '#000005', '#000006', '#000007', '#000008'];
    const players = colors.map((color, i) => ({ color, seat: 'left', pieces: [{ kind: 'cube', count: i === 0 ? 493 : 1 }] }));
    assert.doesNotThrow(() => PF.validate(withPlayers(players)));
});

test('dice are checked: a list of different dice with 2 to 1000 sides', () => {
    const reject = (dice, pattern) => throwsFormatError(() => PF.validate(withPlayers([], dice)), 'invalid', pattern);
    assert.doesNotThrow(() => PF.validate(withPlayers([], [])), 'no dice at all is a valid design');
    assert.doesNotThrow(() => PF.validate(withPlayers([], [{ sides: 2 }, { sides: 1000 }])));
    reject([{ sides: 1 }], /whole number of sides/);
    reject([{ sides: 1001 }], /whole number of sides/);
    reject([{ sides: 6.5 }], /whole number of sides/);
    reject([{ sides: '6' }], /whole number of sides/);
    reject([{}], /whole number of sides/);
    reject([6], /whole number of sides/);
    reject([{ sides: 6 }, { sides: 6 }], /two dice with 6 sides/);
    reject(Array.from({ length: 21 }, (_, i) => ({ sides: i + 2 })), /too many dice/);
    const project = withPlayers([]);
    delete project.appState.dice;
    throwsFormatError(() => PF.validate(project), 'invalid', /no dice list/);
    assert.doesNotThrow(() => PF.validate(withPlayers([], Array.from({ length: 20 }, (_, i) => ({ sides: i + 2 })))));
});

// ---- v6 -> v7: the centre of a board -----------------------------------------------------------------------------

const withBoard = (patch) => {
    const project = v6Project();
    project.appState.boardConfig = { ...project.appState.boardConfig, ...patch };
    return project;
};

test('v6 to v7 writes down the centre a board always had: triangles around a point, everything else around a tile', () => {
    const centerOf = (patch) => plain(PF.MIGRATIONS[6](withBoard(patch))).appState.boardConfig.center;
    assert.equal(centerOf({ boardShape: 'hexagon', gridType: 'hexagon' }), 'tile');
    assert.equal(centerOf({ boardShape: 'circle', gridType: 'hexagon' }), 'tile');
    assert.equal(centerOf({ boardShape: 'circle', gridType: 'square' }), 'tile');
    assert.equal(centerOf({ boardShape: 'hexagon', gridType: 'triangle' }), 'point');
    assert.equal(centerOf({ boardShape: 'circle', gridType: 'triangle' }), 'point');
    // other shapes have no centre to choose; they get the plain default
    for (const boardShape of ['rectangle', 'triangle', 'infinite', 'country']) {
        for (const gridType of ['hexagon', 'square', 'triangle']) assert.equal(centerOf({ boardShape, gridType }), 'tile', `${boardShape} ${gridType}`);
    }
});

test('v6 to v7 changes nothing else, keeps a centre a file already has, and does not mutate its input', () => {
    const source = withBoard({ boardShape: 'hexagon', gridType: 'triangle', radius: 4 });
    const migrated = plain(PF.MIGRATIONS[6](source));
    assert.equal(migrated.version, 7);
    const expected = JSON.parse(JSON.stringify(source));
    expected.version = 7;
    expected.appState.boardConfig.center = 'point';
    assert.deepEqual(migrated, expected);
    assert.equal(source.version, 6, 'the input is not mutated');
    assert.equal(source.appState.boardConfig.center, undefined);
    assert.equal(plain(PF.MIGRATIONS[6](withBoard({ boardShape: 'hexagon', gridType: 'triangle', center: 'tile' }))).appState.boardConfig.center, 'tile');
    assert.equal(plain(PF.MIGRATIONS[6]({ version: 6 })).version, 7, 'incomplete data does not throw');
    assert.equal(plain(PF.MIGRATIONS[6]({ version: 6, appState: { boardConfig: null } })).version, 7);
});

test('every older fixture arrives with a centre', () => {
    for (const name of ['v0-legacy-project.protogames.json', 'v1-space-arctic.protogames.json', 'v2-space-arctic.protogames.json', 'v3-space-arctic.protogames.json', 'v4-space-arctic.protogames.json', 'v4-square-board.protogames.json', 'v5-space-arctic.protogames.json', 'v6-space-arctic.protogames.json']) {
        const loaded = plain(PF.parse(JSON.stringify(fixture(name))));
        assert.equal(loaded.version, PF.CURRENT_VERSION, name);
        assert.ok(['tile', 'point'].includes(loaded.appState.boardConfig.center), name);
    }
});

test('the centre is checked', () => {
    const project = plain(PF.parse(JSON.stringify(v6Project())));
    for (const center of ['tile', 'point']) {
        project.appState.boardConfig.center = center;
        assert.doesNotThrow(() => PF.validate(project), center);
    }
    for (const bad of ['middle', '', null, 3, undefined]) {
        project.appState.boardConfig.center = bad;
        throwsFormatError(() => PF.validate(project), 'invalid', /unknown centre/);
    }
});

test('a legacy triangle hexagon board keeps its tiles: the file loads and its tile count still matches the saved board', () => {
    const loaded = plain(PF.parse(JSON.stringify(withBoard({ boardShape: 'hexagon', gridType: 'triangle' }))));
    assert.equal(loaded.appState.boardConfig.center, 'point');
    assert.equal(loaded.appState.polygons.length, v6Project().appState.polygons.length, 'the tiles are untouched');
});
