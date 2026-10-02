/**
 * PROTOGAMES PROJECT FILE FORMAT
 * --------------------------------------------------------------
 * Owns the shape of saved projects (`.protogames.json` files and the
 * localStorage autosave): the integer schema version, step-by-step migration
 * of older files, and validation with readable error messages.
 *
 * Pure functions only (no DOM), so everything here is unit-tested in Node.
 * See docs/SPECIFICATION.md for the format and how to add a migration.
 *
 * Adding a format change:
 *   1. bump CURRENT_VERSION
 *   2. add `MIGRATIONS[oldVersion] = (project) => project` that upgrades one step
 *   3. extend validate() if the new shape has new required fields
 *   4. add a fixture + test in tests/projectFormat.test.js and document it
 * Migrations are frozen history: never edit one after it has shipped, and do not
 * read live app config inside them.
 */
const ProjectFormat = (() => {
    const CURRENT_VERSION = 1;

    const GRID_TYPES = ['hexagon', 'square', 'triangle'];
    const BOARD_SHAPES = ['hexagon', 'square', 'rectangle', 'triangle', 'circle'];

    /** Raised for any file we cannot (or must not) load. `message` is user-readable. */
    class ProjectFormatError extends Error {
        constructor(message, code) {
            super(message);
            this.name = 'ProjectFormatError';
            this.code = code;
        }
    }

    const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
    const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
    const isPoint = (value) => isObject(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
    const clone = (value) => JSON.parse(JSON.stringify(value));

    // ---- Version detection ----------------------------------------------------

    /**
     * Files written before versioning had no `version` or the string "1.0"; both are v0.
     * Anything else must be a non-negative integer.
     */
    function detectVersion(project) {
        if (!('version' in project) || project.version === undefined) return 0;
        const { version } = project;
        if (version === '1.0') return 0;
        if (typeof version === 'number' && Number.isInteger(version) && version >= 0) return version;
        throw new ProjectFormatError(
            `This file has an unreadable version (${JSON.stringify(version)}). It does not look like a Protogames project.`,
            'bad-version'
        );
    }

    // ---- Migrations -----------------------------------------------------------

    /**
     * v0 -> v1
     *  - `version` becomes the integer 1 (v0 used a string or nothing)
     *  - fills fields that older builds sometimes omitted so v1 can require them
     *  - drops `object: null` placeholders from tiles
     */
    function migrateV0toV1(project) {
        const next = clone(project);
        next.version = 1;
        if (typeof next.projectName !== 'string' || !next.projectName.trim()) next.projectName = 'protogames-board';

        const state = isObject(next.appState) ? next.appState : null;
        if (state) {
            if (typeof state.paletteId !== 'string') state.paletteId = 'landscape';
            if (typeof state.isEraserActive !== 'boolean') state.isEraserActive = false;
            if (typeof state.autoSaveEnabled !== 'boolean') state.autoSaveEnabled = true;
            if (Array.isArray(state.polygons)) {
                for (const polygon of state.polygons) {
                    if (!isObject(polygon)) continue;
                    if (typeof polygon.color !== 'string') polygon.color = '#ffffff';
                    if (polygon.object === null || polygon.object === undefined) delete polygon.object;
                }
            }
        }
        return next;
    }

    /** MIGRATIONS[n] upgrades a version-n project to version n + 1. */
    const MIGRATIONS = {
        0: migrateV0toV1
    };

    /**
     * Upgrades a project one version at a time until it is current. Throws for
     * files from a newer app version instead of loading them partially.
     * The input is never mutated.
     */
    function migrate(project) {
        if (!isObject(project)) {
            throw new ProjectFormatError('This file does not look like a Protogames project.', 'not-a-project');
        }
        let version = detectVersion(project);
        if (version > CURRENT_VERSION) {
            throw new ProjectFormatError(
                `This project was saved by a newer version of Protogames (file format ${version}; this app understands up to ${CURRENT_VERSION}). Update Protogames to open it.`,
                'newer-version'
            );
        }
        let current = clone(project);
        while (version < CURRENT_VERSION) {
            const step = MIGRATIONS[version];
            if (!step) {
                throw new ProjectFormatError(`No migration is available from file format ${version}.`, 'no-migration');
            }
            current = step(current);
            version += 1;
            if (current.version !== version) {
                throw new ProjectFormatError(`Migration to file format ${version} did not set the version.`, 'bad-migration');
            }
        }
        return current;
    }

    // ---- Validation -----------------------------------------------------------

    function fail(message) {
        throw new ProjectFormatError(message, 'invalid');
    }

    function validateBoardConfig(config) {
        if (!isObject(config)) fail('The project has no board settings (appState.boardConfig is missing).');
        if (!GRID_TYPES.includes(config.gridType)) fail(`The board has an unknown tile shape (${JSON.stringify(config.gridType)}).`);
        if (!BOARD_SHAPES.includes(config.boardShape)) fail(`The board has an unknown board shape (${JSON.stringify(config.boardShape)}).`);
        for (const key of ['width', 'height']) {
            if (!isFiniteNumber(config[key]) || config[key] < 1) fail(`The board ${key} must be a positive number.`);
        }
    }

    function validatePolygon(polygon, index) {
        const label = `Tile ${index + 1}`;
        if (!isObject(polygon)) fail(`${label} is not an object.`);
        if (typeof polygon.id !== 'string' || !polygon.id) fail(`${label} has no id.`);
        const named = `${label} ("${polygon.id}")`;
        if (!Array.isArray(polygon.vertices) || polygon.vertices.length < 3 || !polygon.vertices.every(isPoint)) {
            fail(`${named} has invalid vertices.`);
        }
        if (!isPoint(polygon.center)) fail(`${named} has an invalid centre.`);
        if (typeof polygon.color !== 'string') fail(`${named} has no colour.`);
        if (polygon.object !== undefined && typeof polygon.object !== 'string') fail(`${named} has an invalid object.`);
    }

    /**
     * Checks a current-version project and throws a readable ProjectFormatError
     * for the first problem found. Returns the project when it is valid.
     */
    function validate(project) {
        if (!isObject(project)) fail('This file does not look like a Protogames project.');
        if (project.version !== CURRENT_VERSION) fail(`Unexpected file format version ${JSON.stringify(project.version)}.`);
        if (typeof project.projectName !== 'string') fail('The project has no name.');
        if (!isObject(project.appState)) fail('The project has no saved board (appState is missing).');
        const state = project.appState;
        validateBoardConfig(state.boardConfig);
        if (typeof state.currentColor !== 'string') fail('The project has no selected colour.');
        if (typeof state.paletteId !== 'string') fail('The project has no palette.');
        if (typeof state.isEraserActive !== 'boolean') fail('The eraser setting is not true/false.');
        if (typeof state.autoSaveEnabled !== 'boolean') fail('The auto-save setting is not true/false.');
        if (!Array.isArray(state.polygons)) fail('The project has no tile list (appState.polygons).');
        state.polygons.forEach(validatePolygon);
        const ids = new Set(state.polygons.map((p) => p.id));
        if (ids.size !== state.polygons.length) fail('Two tiles in the project share the same id.');
        return project;
    }

    // ---- Public API -----------------------------------------------------------

    /**
     * Turns file contents (JSON text) or an already parsed object into a valid,
     * current-version project. Throws ProjectFormatError with a readable message.
     */
    function parse(input) {
        let data = input;
        if (typeof input === 'string') {
            try {
                data = JSON.parse(input);
            } catch (error) {
                throw new ProjectFormatError('This file is not valid JSON, so it cannot be a Protogames project.', 'not-json');
            }
        }
        return validate(migrate(data));
    }

    /** The object written to a `.protogames.json` file. */
    function createProject({ projectName, appState, now }) {
        return {
            version: CURRENT_VERSION,
            projectName,
            created: (now === undefined ? new Date() : new Date(now)).toISOString(),
            appState
        };
    }

    /** The object written to the localStorage autosave. */
    function createAutosave({ projectName, appState, now }) {
        return {
            version: CURRENT_VERSION,
            timestamp: now === undefined ? Date.now() : now,
            projectName,
            appState
        };
    }

    return {
        CURRENT_VERSION,
        MIGRATIONS,
        ProjectFormatError,
        detectVersion,
        migrate,
        validate,
        parse,
        createProject,
        createAutosave
    };
})();
