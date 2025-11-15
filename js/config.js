/**
 * PROTOGAMES CONFIGURATION
 * --------------------------------------------------------------
 * Central repository for constants that need to be shared across
 * modules. Keeping all values here makes it easier to tweak sizing,
 * colors, or default behaviors without digging through the codebase.
 */
const Config = (() => {
    const VERSION = '1.0';
    const CANVAS_PADDING = 48;
    const HISTORY_LIMIT = 50;
    const DEFAULT_FILL = '#ffffff';
    const GRID_STROKE = '#333741';
    const HOVER_OUTLINE = '#2f6fed';
    const AUTO_SAVE_KEY = 'protogames_autosave';
    const AUTO_SAVE_INTERVAL = 30000;
    const DEFAULT_PROJECT_NAME = 'protogames-board';
    const NOTIFICATION_DURATION = 3000;
    const DEFAULT_BOARD_CONFIG = {
        gridType: 'hexagon',
        orientation: 'pointy-top',
        boardShape: 'rectangle',
        width: 12,
        height: 12,
        radius: 5
    };

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
        DEFAULT_BOARD_CONFIG
    };
})();
