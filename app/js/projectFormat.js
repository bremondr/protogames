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
    const CURRENT_VERSION = 8;

    const GRID_TYPES = ['hexagon', 'square', 'triangle'];
    const BOARD_SHAPES = ['hexagon', 'rectangle', 'triangle', 'circle', 'infinite', 'country'];
    const COUNTRY_PARTS = ['main', 'nearby', 'all'];
    const MAX_COUNTRY_NAME = 100;
    const ORIENTATIONS = ['pointy-top', 'flat-top', 'orthogonal', 'diagonal'];
    const TRIANGLE_ORIENTATIONS = ['point-up', 'point-down'];
    const BOARD_CENTERS = ['tile', 'point'];
    const MAX_BOARD_DIMENSION = 100; // same cap as share links
    const MAX_BOARD_SPAN = 2 * MAX_BOARD_DIMENSION + 1;
    const MAX_VERTICES = 64;
    const MAX_OBJECT_ID = 200;
    // Playtest: players (a colour and a seat, with a piece set) and the dice of the design.
    const PIECE_KIND_IDS = ['pawn', 'disc', 'cube', 'meeple'];
    const SEATS = ['bottom', 'top', 'left', 'right'];
    const MAX_PLAYERS = 8;
    const MAX_PIECES = 500;
    const MAX_DICE = 20;
    const MIN_SIDES = 2;
    const MAX_SIDES = 1000;
    // #rgb or #rrggbb: what palettes and the colour pickers produce. Anything else could end up in markup or CSS.
    const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
    const BOUND_KEYS = ['minX', 'maxX', 'minY', 'maxY'];
    // Coordinate labels: the same limits as labels.js, which cleans up user input; here a file that breaks them is refused.
    const LABEL_SYMBOL_SETS = ['letters', 'numbers', 'roman', 'greek', 'custom'];
    const LABEL_PLACEMENTS = ['auto', 'straight', 'outline'];
    const LABEL_SCHEMES = ['auto', 'grid', 'triangles', 'offset', 'doubled', 'axial'];
    const MAX_LABEL_CUSTOM_TEXT = 200;
    const MAX_LABEL_ENTRIES = 100;
    const MAX_LABEL_ENTRY = 4;
    const MAX_LABEL_SKIP = 26;
    const MIN_LABEL_START = -100;
    const MAX_LABEL_START = 1000;

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

    /**
     * v1 -> v2: the Space and Arctic palettes were redesigned, and a tile's colour is its
     * identity (it selects the texture and label), so tiles painted with a retired colour
     * would turn into flat, unlabeled tiles. Each retired colour is mapped to its successor.
     *
     *  - Star and Planet became placeable objects: the tile becomes Deep Space and gets the
     *    matching object (unless it already has one).
     *  - Everything else maps to the closest terrain of the new palette.
     *  - Pure white (#ffffff) is left alone: it was Arctic "Snow" but is also the blank tile
     *    colour, so the two cannot be told apart.
     *
     * The table is frozen history: it deliberately does not read the live palettes.
     */
    const V1_TO_V2_COLORS = {
        // Space
        '#240046': { color: '#05040A' }, // Void
        '#495057': { color: '#3A3530' }, // Asteroid -> Asteroid Belt
        '#ffd60a': { color: '#0D1B2A', object: 'star' }, // Star
        '#118ab2': { color: '#0D1B2A', object: 'planet' }, // Planet -> Gas Giant
        '#06ffa5': { color: '#7B2CBF' }, // Ice -> Nebula
        '#90e0ef': { color: '#7B2CBF' }, // Energy -> Nebula
        // Arctic
        '#b3e5fc': { color: '#D6E8F2' }, // Ice -> Frozen Ocean
        '#0288d1': { color: '#1F5E86' }, // Deep Ice -> Ocean
        '#01579b': { color: '#1F5E86' }, // Frozen Water -> Ocean
        '#546e7a': { color: '#5E6B7A' }, // Rock -> Icy Peaks
        '#37474f': { color: '#5E6B7A' }, // Cave -> Icy Peaks
        '#bbdefb': { color: '#BFE3F2' }, // Glacier
        '#e0f7fa': { color: '#E4ECF5' } // Fresh Snow -> Snow Hills
    };

    function migrateV1toV2(project) {
        const next = clone(project);
        next.version = 2;
        const state = isObject(next.appState) ? next.appState : null;
        if (!state) return next;

        const mapped = (color) => (typeof color === 'string' ? V1_TO_V2_COLORS[color.toLowerCase()] : undefined);
        const selected = mapped(state.currentColor);
        if (selected) state.currentColor = selected.color;

        if (Array.isArray(state.polygons)) {
            for (const polygon of state.polygons) {
                if (!isObject(polygon)) continue;
                const target = mapped(polygon.color);
                if (!target) continue;
                polygon.color = target.color;
                if (target.object && !polygon.object) polygon.object = target.object;
            }
        }
        return next;
    }

    /**
     * v2 -> v3: the board shape "infinite" was added. Nothing in an existing project changes;
     * the bump makes an older app say "saved by a newer version" instead of a confusing
     * "unknown board shape" when it meets an infinite board.
     */
    function migrateV2toV3(project) {
        const next = clone(project);
        next.version = 3;
        return next;
    }

    /**
     * v3 -> v4: the board shape "country" was added (boardConfig.country, countryParts, countryBorders).
     * Nothing in an existing project changes; the bump makes an older app say "saved by a newer
     * version" instead of "unknown board shape" when it meets a country board.
     */
    function migrateV3toV4(project) {
        const next = clone(project);
        next.version = 4;
        return next;
    }

    /**
     * v4 -> v5: the board shapes "square" and "rectangle" were united; a square is a rectangle whose
     * width and height are equal. A square board of size n becomes a rectangle of n x n tiles (the tiles
     * themselves are unchanged). Frozen history: it does not read the live app configuration.
     */
    function migrateV4toV5(project) {
        const next = clone(project);
        next.version = 5;
        const config = isObject(next.appState) && isObject(next.appState.boardConfig) ? next.appState.boardConfig : null;
        if (config && config.boardShape === 'square') {
            const side = isFiniteNumber(config.size) && config.size >= 1 ? config.size : config.width;
            config.boardShape = 'rectangle';
            config.width = side;
            config.height = side;
        }
        return next;
    }

    /**
     * v5 -> v6: playtest. A design now lists its players (colour, seat, piece set), tiles may carry a
     * start marker (`start`, a player colour) and the design holds its dice. Existing projects get no
     * players and the standard dice. The list is a frozen copy: it must not follow later changes to
     * the app's own standard set.
     */
    function migrateV5toV6(project) {
        const next = clone(project);
        next.version = 6;
        const state = isObject(next.appState) ? next.appState : null;
        if (state) {
            if (!Array.isArray(state.players)) state.players = [];
            if (!Array.isArray(state.dice)) state.dice = [3, 4, 6, 8, 10, 12, 20].map((sides) => ({ sides }));
        }
        return next;
    }

    /**
     * v6 -> v7: coordinate labels. A design now carries the settings for the column and row labels drawn
     * outside the board and on the tiles, with the indexing ("auto" lets the board decide). Existing projects get them switched off. The settings are a frozen copy: they
     * must not follow later changes to the app's own defaults.
     */
    function migrateV6toV7(project) {
        const next = clone(project);
        next.version = 7;
        const state = isObject(next.appState) ? next.appState : null;
        if (state && !isObject(state.labels)) {
            state.labels = {
                enabled: false,
                onTiles: false,
                scheme: 'auto',
                columns: { symbols: 'letters', custom: '', skip: '', start: 1, reverse: false, top: false, bottom: true },
                rows: { symbols: 'numbers', custom: '', skip: '', start: 1, reverse: true, left: true, right: false },
                placement: 'auto'
            };
        }
        return next;
    }

    /**
     * v7 -> v8: the centre of a hexagon or circle board. A board is built around a tile or around the point where tiles
     * meet; before, the choice was fixed by the tile shape (triangles around a point, everything else around a tile), so
     * existing boards get exactly that, written down. The tiles are not touched.
     */
    function migrateV7toV8(project) {
        const next = clone(project);
        next.version = 8;
        const config = isObject(next.appState) && isObject(next.appState.boardConfig) ? next.appState.boardConfig : null;
        if (config && config.center === undefined) {
            const central = config.boardShape === 'hexagon' || config.boardShape === 'circle';
            config.center = central && config.gridType === 'triangle' ? 'point' : 'tile';
        }
        return next;
    }

    /** MIGRATIONS[n] upgrades a version-n project to version n + 1. */
    const MIGRATIONS = {
        0: migrateV0toV1,
        1: migrateV1toV2,
        2: migrateV2toV3,
        3: migrateV3toV4,
        4: migrateV4toV5,
        5: migrateV5toV6,
        6: migrateV6toV7,
        7: migrateV7toV8
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
        // Upper limits match what the board controls and share links can produce (a hexagon board of
        // radius 100 is 201 tiles wide); anything bigger would hang the tab when the board is rebuilt.
        for (const key of ['width', 'height']) {
            if (!isFiniteNumber(config[key]) || config[key] < 1) fail(`The board ${key} must be a positive number.`);
            if (config[key] > MAX_BOARD_SPAN) fail(`The board ${key} is too large (at most ${MAX_BOARD_SPAN}).`);
        }
        for (const key of ['radius', 'size']) {
            if (config[key] === undefined) continue;
            if (!isFiniteNumber(config[key]) || config[key] < 0 || config[key] > MAX_BOARD_DIMENSION) {
                fail(`The board ${key} must be a number from 0 to ${MAX_BOARD_DIMENSION}.`);
            }
        }
        if (config.orientation !== undefined && !ORIENTATIONS.includes(config.orientation)) {
            fail(`The board has an unknown orientation (${JSON.stringify(config.orientation)}).`);
        }
        if (!BOARD_CENTERS.includes(config.center)) fail(`The board has an unknown centre (${JSON.stringify(config.center)}).`);
        if (config.triangleOrientation !== undefined && !TRIANGLE_ORIENTATIONS.includes(config.triangleOrientation)) {
            fail(`The board has an unknown triangle orientation (${JSON.stringify(config.triangleOrientation)}).`);
        }
        if (config.boardShape === 'country') {
            if (typeof config.country !== 'string' || !config.country.trim() || config.country.length > MAX_COUNTRY_NAME) {
                fail('The country board has no valid country (boardConfig.country).');
            }
            if (config.countryParts !== undefined && !COUNTRY_PARTS.includes(config.countryParts)) {
                fail(`The country board has an unknown islands setting (${JSON.stringify(config.countryParts)}).`);
            }
            for (const key of ['countryBorders', 'countryMain']) {
                if (config[key] !== undefined && typeof config[key] !== 'boolean') fail(`The board setting ${key} is not true/false.`);
            }
        }
    }

    function validatePolygon(polygon, index) {
        const label = `Tile ${index + 1}`;
        if (!isObject(polygon)) fail(`${label} is not an object.`);
        if (typeof polygon.id !== 'string' || !polygon.id) fail(`${label} has no id.`);
        const named = `${label} ("${polygon.id}")`;
        if (!Array.isArray(polygon.vertices) || polygon.vertices.length < 3 || polygon.vertices.length > MAX_VERTICES || !polygon.vertices.every(isPoint)) {
            fail(`${named} has invalid vertices.`);
        }
        if (!isPoint(polygon.center)) fail(`${named} has an invalid centre.`);
        // The renderer intersects every tile's bounds with the view on every frame.
        if (!isObject(polygon.bounds) || !BOUND_KEYS.every((key) => isFiniteNumber(polygon.bounds[key]))) fail(`${named} has invalid bounds.`);
        if (typeof polygon.color !== 'string') fail(`${named} has no colour.`);
        if (!HEX_COLOR.test(polygon.color)) fail(`${named} has an invalid colour (${JSON.stringify(polygon.color.slice(0, 40))}).`);
        if (polygon.object !== undefined && (typeof polygon.object !== 'string' || !polygon.object || polygon.object.length > MAX_OBJECT_ID)) {
            fail(`${named} has an invalid object.`);
        }
        if (polygon.start !== undefined && (typeof polygon.start !== 'string' || !HEX_COLOR.test(polygon.start))) {
            fail(`${named} has an invalid start marker.`);
        }
    }

    /**
     * Players: at most MAX_PLAYERS, each with a unique colour, a seat and a piece set (each kind once,
     * a count from 1 up, MAX_PIECES in total).
     */
    function validatePlayers(players) {
        if (!Array.isArray(players)) fail('The project has no player list (appState.players).');
        if (players.length > MAX_PLAYERS) fail(`The project has too many players (at most ${MAX_PLAYERS}).`);
        const colors = new Set();
        let total = 0;
        players.forEach((player, index) => {
            const label = `Player ${index + 1}`;
            if (!isObject(player)) fail(`${label} is not an object.`);
            if (typeof player.color !== 'string' || !HEX_COLOR.test(player.color)) fail(`${label} has an invalid colour.`);
            const color = player.color.toLowerCase();
            if (colors.has(color)) fail(`Two players share the colour ${player.color}.`);
            colors.add(color);
            if (!SEATS.includes(player.seat)) fail(`${label} has an unknown seat (${JSON.stringify(player.seat)}).`);
            if (!Array.isArray(player.pieces) || player.pieces.length > PIECE_KIND_IDS.length) fail(`${label} has an invalid piece set.`);
            const kinds = new Set();
            for (const entry of player.pieces) {
                if (!isObject(entry) || !PIECE_KIND_IDS.includes(entry.kind)) fail(`${label} has a piece of an unknown kind.`);
                if (kinds.has(entry.kind)) fail(`${label} lists the piece kind ${entry.kind} twice.`);
                kinds.add(entry.kind);
                if (!Number.isInteger(entry.count) || entry.count < 1 || entry.count > MAX_PIECES) {
                    fail(`${label} has an invalid number of ${entry.kind} pieces (1 to ${MAX_PIECES}).`);
                }
                total += entry.count;
            }
        });
        if (total > MAX_PIECES) fail(`The project has too many pieces (at most ${MAX_PIECES} in total).`);
    }

    /** One axis of the coordinate labels: a symbol set, a custom list, letters to skip, a start, a direction and the sides it is drawn on. */
    function validateLabelAxis(axis, name, sides) {
        const label = `The ${name} labels`;
        if (!isObject(axis)) fail(`${label} are missing.`);
        if (!LABEL_SYMBOL_SETS.includes(axis.symbols)) fail(`${label} use an unknown symbol set (${JSON.stringify(axis.symbols)}).`);
        if (typeof axis.custom !== 'string' || Array.from(axis.custom).length > MAX_LABEL_CUSTOM_TEXT) fail(`${label} have a custom list over ${MAX_LABEL_CUSTOM_TEXT} characters.`);
        const entries = axis.custom.split(/[\s,]+/).filter(Boolean);
        if (entries.length > MAX_LABEL_ENTRIES || entries.some((entry) => Array.from(entry).length > MAX_LABEL_ENTRY)) {
            fail(`${label} have a custom list with more than ${MAX_LABEL_ENTRIES} entries or an entry over ${MAX_LABEL_ENTRY} characters.`);
        }
        if (typeof axis.skip !== 'string' || Array.from(axis.skip).length > MAX_LABEL_SKIP) fail(`${label} have a skip list over ${MAX_LABEL_SKIP} characters.`);
        if (!Number.isInteger(axis.start) || axis.start < MIN_LABEL_START || axis.start > MAX_LABEL_START) fail(`${label} start outside ${MIN_LABEL_START} to ${MAX_LABEL_START}.`);
        if (typeof axis.reverse !== 'boolean') fail(`The direction of the ${name} labels is not true/false.`);
        for (const side of sides) if (typeof axis[side] !== 'boolean') fail(`The ${side} setting of the ${name} labels is not true/false.`);
    }

    /** Coordinate labels: an on/off switch, one setting per axis, and where they are placed. */
    function validateLabels(labels) {
        if (!isObject(labels)) fail('The project has no coordinate label settings (appState.labels).');
        if (typeof labels.enabled !== 'boolean') fail('The coordinate labels on/off setting is not true/false.');
        if (typeof labels.onTiles !== 'boolean') fail('The setting for coordinates on the tiles is not true/false.');
        if (!LABEL_SCHEMES.includes(labels.scheme)) fail(`The coordinate labels use an unknown indexing (${JSON.stringify(labels.scheme)}).`);
        if (!LABEL_PLACEMENTS.includes(labels.placement)) fail(`The coordinate labels have an unknown placement (${JSON.stringify(labels.placement)}).`);
        validateLabelAxis(labels.columns, 'column', ['top', 'bottom']);
        validateLabelAxis(labels.rows, 'row', ['left', 'right']);
    }

    /** Dice: at most MAX_DICE entries, each a whole number of sides from MIN_SIDES to MAX_SIDES, no repeats. An empty list means no dice. */
    function validateDice(dice) {
        if (!Array.isArray(dice)) fail('The project has no dice list (appState.dice).');
        if (dice.length > MAX_DICE) fail(`The project has too many dice (at most ${MAX_DICE}).`);
        const seen = new Set();
        for (const die of dice) {
            if (!isObject(die) || !Number.isInteger(die.sides) || die.sides < MIN_SIDES || die.sides > MAX_SIDES) {
                fail(`A die must have a whole number of sides from ${MIN_SIDES} to ${MAX_SIDES}.`);
            }
            if (seen.has(die.sides)) fail(`The dice list has two dice with ${die.sides} sides.`);
            seen.add(die.sides);
        }
    }

    /**
     * Older builds may have left out a tile's bounds; they follow from the vertices, so they are filled
     * in rather than refusing a file that used to load. Runs on a copy, before validation.
     */
    function fillBounds(project) {
        const polygons = isObject(project.appState) && Array.isArray(project.appState.polygons) ? project.appState.polygons : [];
        for (const polygon of polygons) {
            if (!isObject(polygon) || polygon.bounds !== undefined) continue;
            if (!Array.isArray(polygon.vertices) || polygon.vertices.length < 1 || !polygon.vertices.every(isPoint)) continue;
            const xs = polygon.vertices.map((v) => v.x);
            const ys = polygon.vertices.map((v) => v.y);
            polygon.bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
        }
        return project;
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
        validatePlayers(state.players);
        validateDice(state.dice);
        validateLabels(state.labels);
        // Infinite files keep at least one tile (the board type survives in it), see the specification.
        if (state.boardConfig.boardShape === 'infinite' && !state.polygons.length) fail('An infinite board needs at least one tile.');
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
        return validate(fillBounds(migrate(data)));
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
