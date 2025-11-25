/**
 * PROTOGAMES CONFIGURATION
 * --------------------------------------------------------------
 * Central repository for shared constants: board defaults, palette
 * and texture definitions, auto-save tuning, and UI styling helpers.
 * Tweaking values here keeps feature toggles and visuals consistent.
 */
const Config = (() => {
    const VERSION = '1.0';
    const CANVAS_PADDING = 48;
    const HISTORY_LIMIT = 50;
    /**
     * Baseline tile color used for blank/erased cells.
     * Shared by the eraser tool and board resets.
     */
    const DEFAULT_TILE_COLOR = '#ffffff';
    const DEFAULT_FILL = DEFAULT_TILE_COLOR;
    const GRID_STROKE = '#333741';
    const HOVER_OUTLINE = '#2f6fed';
    const AUTO_SAVE_KEY = 'protogames_autosave';
    const AUTO_SAVE_INTERVAL = 30000;
    const DEFAULT_PROJECT_NAME = 'protogames-board';
    const NOTIFICATION_DURATION = 3000;
    /**
     * Baseline board configuration used on first load and resets. Covers
     * grid type, board outline, sizing knobs, and triangle orientation.
     */
    const DEFAULT_BOARD_CONFIG = {
        gridType: 'hexagon',
        orientation: 'pointy-top',
        boardShape: 'hexagon',
        width: 11,
        height: 11,
        radius: 5,
        size: 10,
        triangleOrientation: 'point-up'
    };
    /**
     * Image textures that can be used as fills; palette entries can reference
     * them via `textureId` to render pattern-backed swatches.
     *
     * @type {Array<{id:string,name:string,src:string,fallback?:string}>}
     */
    const TEXTURES = [
        {
            id: 'stone-tiles',
            name: 'Stone Tiles',
            src: 'images/textures/stone-tiles.png',
            fallback: '#b6b7ba'
        },
        {
            id: 'grass-tiles',
            name: 'Grass Tiles',
            src: 'images/textures/grass-tiles.png',
            fallback: '#7cb342'
        },
        {
            id: 'rocky-terrain',
            name: 'Rocky Terrain',
            src: 'images/textures/rocky_terrain_02_diff_4k.jpg',
            fallback: '#4e4a44'
        },
        {
            id: 'aerial-rocks',
            name: 'Aerial Rocks',
            src: 'images/textures/aerial_rocks_02_diff_4k.jpg',
            fallback: '#6d6a62'
        },
        {
            id: 'coast-rocks',
            name: 'Coast Rocks',
            src: 'images/textures/coast_land_rocks_01_diff_4k.jpg',
            fallback: '#6b5a4a'
        },
        {
            id: 'coast-sand',
            name: 'Coast Sand',
            src: 'images/textures/coast_sand_01_diff_4k.jpg',
            fallback: '#d1b88f'
        },
        {
            id: 'snow-aerial',
            name: 'Snow Aerial',
            src: 'images/textures/snow_01_diff_4k.jpg',
            fallback: '#f2f4f6'
        },
        {
            id: 'snow-field-color',
            name: 'Snow Field (Color)',
            src: 'images/textures/snow_field_aerial_col_4k.jpg',
            fallback: '#e7ecf4'
        },
        {
            id: 'snow-field-rough',
            name: 'Snow Field (Rough)',
            src: 'images/textures/snow_field_aerial_rough_4k.jpg',
            fallback: '#dfe3ea'
        }
    ];

    /**
     * Themeable color palettes (some include texture-backed swatches). Each
     * palette carries an id, a human-friendly name/description, and labeled
     * swatches so the UI can render tooltips and legends accurately.
     *
     * @type {Array<{id:string,name:string,description:string,colors:Array<{label:string,hex:string,textureId?:string}>}>}
     */
    const COLOR_PALETTES = [
        {
            id: 'landscape',
            name: 'Landscape',
            description: 'Classic terrain tones for natural maps.',
            colors: [
                { label: 'Forest', hex: '#2D5016' },
                { label: 'Grassland', hex: '#7CB342' },
                { label: 'Water', hex: '#1976D2' },
                { label: 'Mountain', hex: '#757575' },
                { label: 'Desert', hex: '#D4A574' },
                { label: 'Snow', hex: '#E8EAF6' },
                { label: 'Village', hex: '#795548' },
                { label: 'Volcanic', hex: '#BF360C' }
            ]
        },
        {
            id: 'space',
            name: 'Space',
            description: 'Cosmic palette for sci-fi starfields and planets.',
            colors: [
                { label: 'Deep Space', hex: '#0D1B2A' },
                { label: 'Nebula', hex: '#7B2CBF' },
                { label: 'Star', hex: '#FFD60A' },
                { label: 'Planet', hex: '#118AB2' },
                { label: 'Asteroid', hex: '#495057' },
                { label: 'Ice', hex: '#06FFA5' },
                { label: 'Energy', hex: '#90E0EF' },
                { label: 'Void', hex: '#240046' }
            ]
        },
        {
        "id": "dungeon",
        "name": "Dungeon",
        "description": "Underground dungeon and cave environments",
        "colors": [
        { "hex": "#4A4A4A", "label": "Stone Floor" },
        { "hex": "#2C2C2C", "label": "Wall" },
        { "hex": "#5D4037", "label": "Door" },
        { "hex": "#C62828", "label": "Trap" },
        { "hex": "#FFD700", "label": "Treasure" },
        { "hex": "#1565C0", "label": "Water" },
        { "hex": "#D84315", "label": "Lava" },
        { "hex": "#7B1FA2", "label": "Secret" }
        ]
        },
        {
        "id": "spaceship",
        "name": "Spaceship",
        "description": "Interior of spaceships and space stations",
        "colors": [
        { "hex": "#ECEFF1", "label": "Corridor" },
        { "hex": "#455A64", "label": "Hull" },
        { "hex": "#00BCD4", "label": "Control Room" },
        { "hex": "#FF5722", "label": "Engine Room" },
        { "hex": "#C62828", "label": "Danger Zone" },
        { "hex": "#4CAF50", "label": "Life Support" },
        { "hex": "#9E9E9E", "label": "Storage" },
        { "hex": "#FFC107", "label": "Airlock" }
        ]
        },
        {
        "id": "arctic",
        "name": "Arctic",
        "description": "Frozen tundra and polar environments",
        "colors": [
        { "hex": "#FFFFFF", "label": "Snow" },
        { "hex": "#B3E5FC", "label": "Ice" },
        { "hex": "#0288D1", "label": "Deep Ice" },
        { "hex": "#01579B", "label": "Frozen Water" },
        { "hex": "#546E7A", "label": "Rock" },
        { "hex": "#37474F", "label": "Cave" },
        { "hex": "#BBDEFB", "label": "Glacier" },
        { "hex": "#E0F7FA", "label": "Fresh Snow" }
        ]
        }
        ,
        {
            id: 'textures',
            name: 'Textures',
            description: 'Image-based fills for textured boards.',
            colors: [
                { label: 'Stone Tiles', hex: '#b6b7ba', textureId: 'stone-tiles' },
                { label: 'Grass Tiles', hex: '#7cb342', textureId: 'grass-tiles' },
                { label: 'Rocky Terrain', hex: '#4e4a44', textureId: 'rocky-terrain' },
                { label: 'Aerial Rocks', hex: '#6d6a62', textureId: 'aerial-rocks' },
                { label: 'Coast Rocks', hex: '#6b5a4a', textureId: 'coast-rocks' },
                { label: 'Coast Sand', hex: '#d1b88f', textureId: 'coast-sand' },
                { label: 'Snow Aerial', hex: '#f2f4f6', textureId: 'snow-aerial' },
                { label: 'Snow Field (Color)', hex: '#e7ecf4', textureId: 'snow-field-color' },
                { label: 'Snow Field (Rough)', hex: '#dfe3ea', textureId: 'snow-field-rough' }
            ]
        }        
    ];
    const DEFAULT_PALETTE_ID = 'landscape';

    /**
     * Returns a palette by id or null when not found.
     *
     * @param {string} id - Palette identifier.
     * @returns {Object|null} Matching palette or null.
     */
    function getPaletteById(id) {
        return COLOR_PALETTES.find((palette) => palette.id === id) || null;
    }

    /**
     * Returns every palette definition.
     *
     * @returns {Array<Object>} All palettes.
     */
    function getAllPalettes() {
        return COLOR_PALETTES.slice();
    }

    /**
     * Resolves the default palette (falls back to the first entry).
     *
     * @returns {Object} Default palette definition.
     */
    function getDefaultPalette() {
        return getPaletteById(DEFAULT_PALETTE_ID) || COLOR_PALETTES[0];
    }

    /**
     * Finds a texture definition by id.
     *
     * @param {string} id - Texture identifier.
     * @returns {{id:string,src:string,fallback?:string,name?:string}|null}
     */
    function getTextureById(id) {
        return TEXTURES.find((entry) => entry.id === id) || null;
    }

    return {
        VERSION,
        CANVAS_PADDING,
        HISTORY_LIMIT,
        DEFAULT_FILL,
        GRID_STROKE,
        HOVER_OUTLINE,
        AUTO_SAVE_KEY,
        AUTO_SAVE_INTERVAL,
        DEFAULT_PROJECT_NAME,
        NOTIFICATION_DURATION,
        DEFAULT_BOARD_CONFIG,
        COLOR_PALETTES,
        DEFAULT_PALETTE_ID,
        getPaletteById,
        getAllPalettes,
        getDefaultPalette,
        getTextureById
    };
})();
