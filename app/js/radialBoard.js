/**
 * PROTOGAMES RADIAL BOARD (controls)
 * --------------------------------------------------------------
 * Board shape "radial": concentric rings cut into spaces (the tiles are built in geometry/radial.js). This file is the
 * panel part: the rings / spaces / empty-middle fields that take the place of the tile shape, size and
 * width and height fields while the shape is chosen.
 *
 * The settings live in boardConfig (rings, sectors, hole, sectorsGrow). The tile shape is not used by this board, so
 * the config carries the defaults for it, and width and height hold the board's span in rings so that project
 * file validation and share links see a size like any other board.
 *
 * Hooks in by wrapping UI.getBoardConfig and UI.updateBoardControls, like country boards. Loaded after ui.js.
 */
const RadialBoard = (() => {
    const LIMITS = GeometryRadial.LIMITS;
    const $ = (id) => document.getElementById(id);
    // Fields of the plain panel that mean nothing for rings; the panel's own logic shows or hides them for the other shapes.
    const HIDDEN_FIELDS = ['orientationField', 'triangleOrientationField', 'centerField', 'radiusField', 'sizeField', 'rectangularFields'];
    const isRadial = () => document.querySelector('select[name="boardOutline"]')?.value === 'radial';

    const gridTypeField = () => document.querySelector('select[name="gridType"]')?.closest('label');

    function read(id, key) {
        const { min, max, fallback } = LIMITS[key];
        const n = Math.round(Number($(id)?.value));
        const value = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
        if ($(id) && String($(id).value) !== String(value)) $(id).value = value;
        return value;
    }

    function readSettings() {
        const rings = read('radialRings', 'rings');
        const sectors = read('radialSectors', 'sectors');
        const hole = read('radialHole', 'hole');
        return { rings, sectors, hole, sectorsGrow: Boolean($('radialGrow')?.checked) };
    }

    function applyVisibility() {
        const radial = isRadial();
        $('radialFields')?.classList.toggle('hidden', !radial);
        gridTypeField()?.classList.toggle('hidden', radial);
        if (radial) HIDDEN_FIELDS.forEach((id) => $(id)?.classList.add('hidden'));
    }

    function wrapUI() {
        const originalGet = UI.getBoardConfig;
        UI.getBoardConfig = function () {
            const config = originalGet.apply(this, arguments);
            if (!config || config.boardShape !== 'radial') return config;
            const settings = readSettings();
            const span = 2 * (settings.rings + settings.hole) + 1;
            return {
                ...config,
                ...settings,
                gridType: Config.DEFAULT_BOARD_CONFIG.gridType,
                orientation: Config.DEFAULT_BOARD_CONFIG.orientation,
                center: 'tile',
                width: span,
                height: span
            };
        };
        const originalUpdate = UI.updateBoardControls;
        UI.updateBoardControls = function (config) {
            originalUpdate.apply(this, arguments);
            if (config && config.boardShape === 'radial') {
                const settings = GeometryRadial.normalize(config);
                if ($('radialRings')) $('radialRings').value = String(settings.rings);
                if ($('radialSectors')) $('radialSectors').value = String(settings.sectors);
                if ($('radialHole')) $('radialHole').value = String(settings.hole);
                if ($('radialGrow')) $('radialGrow').checked = settings.grow;
            }
            applyVisibility();
        };
    }

    function init() {
        wrapUI();
        // After UI's own handler, which would otherwise show the fields of the plain panel.
        document.querySelector('select[name="boardOutline"]')?.addEventListener('change', () => setTimeout(applyVisibility, 0));
        document.querySelector('select[name="gridType"]')?.addEventListener('change', () => setTimeout(applyVisibility, 0));
        applyVisibility();
    }

    document.addEventListener('DOMContentLoaded', init);

    return { readSettings, applyVisibility };
})();
