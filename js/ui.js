/**
 * PROTOGAMES UI MODULE
 * --------------------------------------------------------------
 * Centralizes DOM lookups, helper methods for updating controls,
 * and lightweight notifications so other modules can stay focused
 * on logic rather than DOM bookkeeping.
 */
const UI = (() => {
    const elements = {};
    let notificationTimerId = null;

    function init() {
        elements.canvas = document.getElementById('gameCanvas');
        elements.canvasPlaceholder = document.querySelector('.canvas-placeholder');
        elements.paletteButtons = Array.from(document.querySelectorAll('.palette-swatch'));
        elements.gridTypeSelect = document.querySelector('select[name="gridType"]');
        elements.orientationSelect = document.querySelector('select[name="gridOrientation"]');
        elements.boardShapeSelect = document.querySelector('select[name="boardOutline"]');
        elements.widthInput = document.querySelector('input[name="boardWidth"]');
        elements.heightInput = document.querySelector('input[name="boardHeight"]');
        elements.radiusInput = document.querySelector('input[name="boardRadius"]');
        elements.radiusField = document.getElementById('radiusField');
        elements.rectangularFields = document.getElementById('rectangularFields');
        elements.generateButton = document.querySelector('[data-action="generate-board"]');
        elements.undoButton = document.querySelector('[data-action="undo"]');
        elements.redoButton = document.querySelector('[data-action="redo"]');
        elements.clearButton = document.querySelector('[data-action="clear-board"]');
        elements.saveButton = document.getElementById('saveProjectBtn');
        elements.loadButton = document.getElementById('loadProjectBtn');
        elements.loadInput = document.getElementById('loadProject');
        elements.exportPNGBtn = document.getElementById('exportPNGBtn');
        elements.exportPDFBtn = document.getElementById('exportPDFBtn');
        elements.exportSVGBtn = document.getElementById('exportSVGBtn');
        elements.notificationBar = document.getElementById('notificationBar');
        elements.boardShapeSelect?.addEventListener('change', applyBoardShapeVisibility);
        applyBoardShapeVisibility();
    }

    function getElements() {
        return elements;
    }

    function showNotification(message, duration = Config.NOTIFICATION_DURATION) {
        if (!elements.notificationBar) return;
        elements.notificationBar.textContent = message;
        elements.notificationBar.classList.add('show');
        if (notificationTimerId) {
            clearTimeout(notificationTimerId);
        }
        notificationTimerId = window.setTimeout(() => {
            elements.notificationBar.classList.remove('show');
        }, duration);
    }

    function updateCanvasMessage(count) {
        if (!elements.canvasPlaceholder) return;
        elements.canvasPlaceholder.textContent = count
            ? 'Tap or click a tile to paint it. Use the palette to change colors.'
            : 'Configure a board and click Generate Board to begin.';
    }

    function getBoardConfig() {
        const boardShape = elements.boardShapeSelect?.value || Config.DEFAULT_BOARD_CONFIG.boardShape;
        return {
            gridType: elements.gridTypeSelect?.value || Config.DEFAULT_BOARD_CONFIG.gridType,
            orientation: elements.orientationSelect?.value || Config.DEFAULT_BOARD_CONFIG.orientation,
            boardShape,
            width: parseInt(elements.widthInput?.value, 10) || Config.DEFAULT_BOARD_CONFIG.width,
            height: parseInt(elements.heightInput?.value, 10) || Config.DEFAULT_BOARD_CONFIG.height,
            radius: parseInt(elements.radiusInput?.value, 10) || Config.DEFAULT_BOARD_CONFIG.radius
        };
    }

    function updateBoardControls(config) {
        if (elements.gridTypeSelect) elements.gridTypeSelect.value = config.gridType;
        if (elements.orientationSelect) elements.orientationSelect.value = config.orientation;
        if (elements.boardShapeSelect) elements.boardShapeSelect.value = config.boardShape;
        if (elements.widthInput) elements.widthInput.value = config.width;
        if (elements.heightInput) elements.heightInput.value = config.height;
        if (elements.radiusInput) elements.radiusInput.value = config.radius ?? Config.DEFAULT_BOARD_CONFIG.radius;
        applyBoardShapeVisibility();
    }

    function setPaletteSelection(button) {
        elements.paletteButtons?.forEach((btn) => {
            const isSelected = btn === button;
            btn.classList.toggle('selected', isSelected);
            btn.setAttribute('aria-pressed', String(isSelected));
        });
    }

    function setPaletteByColor(color) {
        if (!elements.paletteButtons?.length) return;
        const normalized = color?.toLowerCase();
        const match =
            elements.paletteButtons.find((btn) => {
                const btnColor = (btn.dataset.color || getComputedStyle(btn).getPropertyValue('--swatch-color')).trim().toLowerCase();
                return btnColor === normalized;
            }) || elements.paletteButtons[0];
        if (match) {
            setPaletteSelection(match);
        }
    }

    /**
     * Shows or hides the radius and width/height inputs depending on the selected board shape.
     */
    function applyBoardShapeVisibility() {
        const boardShape = elements.boardShapeSelect?.value || Config.DEFAULT_BOARD_CONFIG.boardShape;
        const showRadius = boardShape === 'hexagon';
        if (elements.radiusField) {
            elements.radiusField.classList.toggle('hidden', !showRadius);
        }
        if (elements.rectangularFields) {
            elements.rectangularFields.classList.toggle('hidden', showRadius);
        }
    }

    return {
        init,
        getElements,
        showNotification,
        updateCanvasMessage,
        getBoardConfig,
        updateBoardControls,
        setPaletteSelection,
        setPaletteByColor,
        applyBoardShapeVisibility
    };
})();
