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
        elements.paletteGrid = document.querySelector('.palette-grid');
        elements.paletteSelect = document.getElementById('paletteSelect');
        elements.paletteButtons = [];
        elements.gridTypeSelect = document.querySelector('select[name="gridType"]');
        elements.orientationSelect = document.querySelector('select[name="gridOrientation"]');
        elements.orientationField = document.getElementById('orientationField');
        elements.boardShapeSelect = document.querySelector('select[name="boardOutline"]');
        elements.widthInput = document.querySelector('input[name="boardWidth"]');
        elements.heightInput = document.querySelector('input[name="boardHeight"]');
        elements.widthLabel = document.getElementById('widthLabel');
        elements.heightLabel = document.getElementById('heightLabel');
        elements.radiusInput = document.querySelector('input[name="boardRadius"]');
        elements.radiusField = document.getElementById('radiusField');
        elements.radiusLabel = document.getElementById('radiusLabel');
        elements.sizeInput = document.querySelector('input[name="boardSize"]');
        elements.sizeField = document.getElementById('sizeField');
        elements.sizeLabel = document.getElementById('sizeLabel');
        elements.triangleOrientationSelect = document.querySelector('select[name="triangleOrientation"]');
        elements.triangleOrientationField = document.getElementById('triangleOrientationField');
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

        elements.boardShapeSelect?.addEventListener('change', () => {
            applyBoardShapeVisibility();
            applyGridTypeRestrictions();
        });
        elements.gridTypeSelect?.addEventListener('change', applyGridTypeVisibility);

        applyBoardShapeVisibility();
        applyGridTypeRestrictions();
        applyGridTypeVisibility();
    }

    /**
     * Populates the palette selector with available palettes.
     *
     * @param {string} selectedPaletteId - Palette id to select after rendering options.
     */
    function initializePaletteSelector(selectedPaletteId) {
        if (!elements.paletteSelect) return;
        const palettes = Config.getAllPalettes();
        elements.paletteSelect.innerHTML = '';
        palettes.forEach((palette) => {
            const option = document.createElement('option');
            option.value = palette.id;
            option.textContent = palette.name;
            option.title = palette.description;
            elements.paletteSelect.appendChild(option);
        });
        elements.paletteSelect.value = selectedPaletteId || Config.DEFAULT_PALETTE_ID;
    }

    /**
     * Renders swatches for the requested palette and returns the color that
     * should be considered selected (ensures the color exists in the palette).
     *
     * @param {string} paletteId - Palette identifier.
     * @param {string} preferredColor - Hex color to keep selected when possible.
     * @returns {{paletteId:string,color:string}} Resolved palette and color.
     */
    function renderColorPalette(paletteId, preferredColor) {
        if (!elements.paletteGrid) return { paletteId, color: preferredColor };
        const palette = Config.getPaletteById(paletteId) || Config.getDefaultPalette();
        const resolvedColor = resolvePaletteColor(palette, preferredColor);

        elements.paletteGrid.innerHTML = '';
        palette.colors.forEach((swatch) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'palette-swatch';
            button.dataset.color = swatch.hex;
            button.style.setProperty('--swatch-color', swatch.hex);
            button.setAttribute('aria-pressed', 'false');

            const swatchSpan = document.createElement('span');
            swatchSpan.className = 'swatch';
            swatchSpan.setAttribute('aria-hidden', 'true');

            const labelSpan = document.createElement('span');
            labelSpan.className = 'swatch-label';
            labelSpan.textContent = swatch.label;

            button.appendChild(swatchSpan);
            button.appendChild(labelSpan);
            elements.paletteGrid.appendChild(button);
        });

        elements.paletteButtons = Array.from(elements.paletteGrid.querySelectorAll('.palette-swatch'));
        setPaletteByColor(resolvedColor);

        if (elements.paletteSelect) {
            elements.paletteSelect.value = palette.id;
        }

        return { paletteId: palette.id, color: resolvedColor };
    }

    function resolvePaletteColor(palette, preferredColor) {
        const normalizedPreferred = preferredColor?.toLowerCase() || '';
        const match = palette.colors.find((entry) => entry.hex.toLowerCase() === normalizedPreferred);
        if (match) return match.hex;
        return palette.colors[0]?.hex || preferredColor || Config.DEFAULT_FILL;
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
        const gridType = elements.gridTypeSelect?.value || Config.DEFAULT_BOARD_CONFIG.gridType;
        const orientation = elements.orientationSelect?.value || Config.DEFAULT_BOARD_CONFIG.orientation;
        const radius = parseInt(elements.radiusInput?.value, 10) || Config.DEFAULT_BOARD_CONFIG.radius;
        const size = parseInt(elements.sizeInput?.value, 10) || Config.DEFAULT_BOARD_CONFIG.size;
        let width = parseInt(elements.widthInput?.value, 10) || Config.DEFAULT_BOARD_CONFIG.width;
        let height = parseInt(elements.heightInput?.value, 10) || Config.DEFAULT_BOARD_CONFIG.height;

        switch (boardShape) {
            case 'square':
                width = size;
                height = size;
                break;
            case 'triangle':
                width = size;
                height = size;
                break;
            case 'hexagon':
            case 'circle':
                width = radius * 2 + 1;
                height = radius * 2 + 1;
                break;
            default:
                break;
        }

        return {
            gridType,
            orientation,
            boardShape,
            width,
            height,
            radius,
            size,
            triangleOrientation: elements.triangleOrientationSelect?.value || Config.DEFAULT_BOARD_CONFIG.triangleOrientation
        };
    }

    function updateBoardControls(config) {
        if (elements.gridTypeSelect) elements.gridTypeSelect.value = config.gridType;
        if (elements.orientationSelect) elements.orientationSelect.value = config.orientation;
        if (elements.boardShapeSelect) elements.boardShapeSelect.value = config.boardShape;
        if (elements.widthInput) elements.widthInput.value = config.width;
        if (elements.heightInput) elements.heightInput.value = config.height;
        if (elements.radiusInput) elements.radiusInput.value = config.radius ?? Config.DEFAULT_BOARD_CONFIG.radius;
        if (elements.sizeInput) elements.sizeInput.value = config.size ?? Config.DEFAULT_BOARD_CONFIG.size;
        if (elements.triangleOrientationSelect) {
            elements.triangleOrientationSelect.value = config.triangleOrientation || Config.DEFAULT_BOARD_CONFIG.triangleOrientation;
        }
        applyBoardShapeVisibility();
        applyGridTypeRestrictions();
        applyGridTypeVisibility();
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
     * Toggles visibility of board-parameter inputs (radius, size, rectangle dimensions, etc.)
     * whenever the board outline changes, updating labels so the user always knows
     * what each control represents.
     */
    function applyBoardShapeVisibility() {
        const boardShape = elements.boardShapeSelect?.value || Config.DEFAULT_BOARD_CONFIG.boardShape;
        const showRadius = boardShape === 'hexagon' || boardShape === 'circle';
        const showSize = boardShape === 'square' || boardShape === 'triangle';
        const showTriangleOrientation = boardShape === 'triangle';

        elements.radiusField?.classList.toggle('hidden', !showRadius);
        elements.sizeField?.classList.toggle('hidden', !showSize);
        elements.rectangularFields?.classList.toggle('hidden', showRadius || showSize || boardShape === 'square');
        elements.triangleOrientationField?.classList.toggle('hidden', !showTriangleOrientation);

        if (elements.radiusLabel) {
            elements.radiusLabel.textContent =
                boardShape === 'hexagon'
                    ? 'Radius (number of hexagons from center to edge, try 3-10)'
                    : 'Radius (tiles from center to edge)';
        }
        if (elements.radiusInput) {
            if (boardShape === 'hexagon') {
                elements.radiusInput.placeholder = 'e.g., 3-10';
            } else {
                elements.radiusInput.removeAttribute('placeholder');
            }
        }
        if (elements.sizeLabel) {
            elements.sizeLabel.textContent =
                boardShape === 'triangle' ? 'Base Size (tiles along bottom edge)' : 'Size (tiles per side)';
        }
        if (elements.widthLabel) {
            elements.widthLabel.textContent = 'Width (columns)';
        }
        if (elements.heightLabel) {
            elements.heightLabel.textContent = 'Height (rows)';
        }
    }

    /**
     * Shows the grid-orientation dropdown only for hexagon grids, keeping the
     * controls minimal for other grid types.
     */
    function applyGridTypeVisibility() {
        const gridType = elements.gridTypeSelect?.value || Config.DEFAULT_BOARD_CONFIG.gridType;
        const showOrientation = gridType === 'hexagon';
        elements.orientationField?.classList.toggle('hidden', !showOrientation);
    }

    /**
     * Restricts grid type choices for specific board shapes (e.g., hex outline)
     * to prevent unsupported combinations and automatically switches to an
     * allowed option if the current value becomes invalid.
     */
    function applyGridTypeRestrictions() {
        const boardShape = elements.boardShapeSelect?.value || Config.DEFAULT_BOARD_CONFIG.boardShape;
        const allowedForHexOutline = ['hexagon', 'triangle'];
        const options = Array.from(elements.gridTypeSelect?.options || []);
        let selectionChanged = false;

        options.forEach((option) => {
            if (boardShape === 'hexagon') {
                const disabled = !allowedForHexOutline.includes(option.value);
                option.disabled = disabled;
                if (disabled && option.selected) {
                    selectionChanged = true;
                }
            } else {
                option.disabled = false;
            }
        });

        if (selectionChanged) {
            elements.gridTypeSelect.value = allowedForHexOutline[0];
        }
        applyGridTypeVisibility();
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
        applyBoardShapeVisibility,
        applyGridTypeVisibility,
        applyGridTypeRestrictions,
        initializePaletteSelector,
        renderColorPalette
    };
})();
