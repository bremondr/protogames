/**
 * PROTOGAMES BOARD SHAPE PICKER
 * --------------------------------------------------------------
 * The "Board shape" list of the Board Setup panel, with a small picture of every layout. The pictures are the real
 * generator at work (Geometry.generateGrid on a small board), drawn for the tile shape, orientation and centre
 * currently chosen, so what the list shows is what Generate will build. On boards built from the middle outwards
 * (hexagon, circle) every layer from the centre has its own colour, the way the layers are counted by the size field:
 * purple is layer 1, green layer 2, yellow layer 3 and so on.
 *
 * The native <select name="boardOutline"> stays the single source of truth (the rest of the app reads and listens to it);
 * this list only sets its value and sends a `change` event. Square tiles cannot fill a hexagon, so that option is
 * disabled for them (the select's own `disabled` flag is followed).
 *
 * Pure part (`previewConfig`, `layersOf`, `previewMarkup`) works without the page and is unit-tested.
 */
const BoardPicker = (() => {
    const SHAPES = [
        { value: 'hexagon', name: 'Hexagon' },
        { value: 'rectangle', name: 'Rectangle' },
        { value: 'triangle', name: 'Triangle' },
        { value: 'circle', name: 'Circle' },
        { value: 'infinite', name: 'Infinite canvas' },
        { value: 'country', name: 'Country' }
    ];
    const LAYER_CLASSES = ['bp-l0', 'bp-l1', 'bp-l2', 'bp-l3', 'bp-l4', 'bp-l5'];
    const PREVIEW_CANVAS = { width: 600, height: 700 };
    const PREVIEW_LAYERS = 4;
    const isCentral = (shape) => shape === 'hexagon' || shape === 'circle';

    // ---- Pure: the layout of a picture ---------------------------------------------------------------------

    /**
     * The board config a picture is built from: the shape with a small size (four layers from the centre, or a
     * few tiles per side) for the tile shape, orientation and centre chosen. Infinite and country have no layout of
     * their own, so they are drawn from a rectangle (infinite) or not at all (country).
     */
    function previewConfig(shape, choice) {
        const gridType = choice.tile || 'hexagon';
        const center = isCentral(shape) && choice.center === 'point' ? 'point' : 'tile';
        // The saved radius counts layers from the first ring for hexagons and squares, as layers for triangles.
        const radius = gridType === 'triangle' ? PREVIEW_LAYERS : PREVIEW_LAYERS - 1;
        const width = isCentral(shape) ? radius * 2 + (center === 'point' ? 2 : 1) : shape === 'infinite' ? 7 : 5;
        const height = isCentral(shape) ? width : shape === 'infinite' ? 5 : 4;
        return {
            gridType,
            orientation: choice.orientation === 'flat-top' ? 'flat-top' : 'pointy-top',
            boardShape: shape === 'infinite' ? 'rectangle' : shape,
            radius,
            size: 4,
            width,
            height,
            triangleOrientation: choice.triangleOrientation === 'point-down' ? 'point-down' : 'point-up',
            center
        };
    }

    const cornerKey = (v) => `${Math.round(v.x * 2)},${Math.round(v.y * 2)}`;

    /**
     * The layer of every tile counted from the middle of the board, 0 for the innermost: the tiles at the middle (one tile,
     * or those meeting at the middle point) are layer 0 and each layer adds the tiles sharing a corner with the last.
     */
    function layersOf(polygons) {
        const layers = new Array(polygons.length).fill(-1);
        if (!polygons.length) return layers;
        const mid = {
            x: polygons.reduce((sum, p) => sum + p.center.x, 0) / polygons.length,
            y: polygons.reduce((sum, p) => sum + p.center.y, 0) / polygons.length
        };
        const distances = polygons.map((p) => Math.hypot(p.center.x - mid.x, p.center.y - mid.y));
        const reach = polygons[0].bounds.maxX - polygons[0].bounds.minX;
        const nearest = Math.min(...distances);
        const atCorner = new Map();
        polygons.forEach((p, i) => p.vertices.forEach((v) => {
            const key = cornerKey(v);
            if (!atCorner.has(key)) atCorner.set(key, []);
            atCorner.get(key).push(i);
        }));
        let frontier = [];
        distances.forEach((d, i) => { if (d < nearest + 0.3 * reach) { layers[i] = 0; frontier.push(i); } });
        for (let layer = 1; frontier.length; layer++) {
            const next = [];
            for (const i of frontier) {
                for (const v of polygons[i].vertices) {
                    for (const j of atCorner.get(cornerKey(v))) {
                        if (layers[j] < 0) { layers[j] = layer; next.push(j); }
                    }
                }
            }
            frontier = next;
        }
        return layers;
    }

    /** A made-up country outline for the Country option (it has no tile layout to show before a country is picked). */
    const COUNTRY_PATH = 'M12 38 L30 20 L52 24 L70 10 L96 22 L112 18 L124 40 L110 62 L82 66 L66 82 L40 74 L22 58 Z';

    /** The inner markup of one picture: the tiles as polygons, with the layers coloured on central shapes. */
    function previewMarkup(shape, choice, generate) {
        if (shape === 'country') {
            return '<svg class="bp-picture" viewBox="0 0 136 92" aria-hidden="true" focusable="false">'
                + `<path class="bp-country" d="${COUNTRY_PATH}"/><path class="bp-country-border" d="M52 24 L66 50 L82 66 M96 22 L82 66 M30 20 L40 74"/></svg>`;
        }
        const config = previewConfig(shape, choice);
        const polygons = generate(config, PREVIEW_CANVAS, null);
        if (!polygons.length) return '<svg class="bp-picture" viewBox="0 0 136 92" aria-hidden="true" focusable="false"></svg>';
        const xs = polygons.flatMap((p) => p.vertices.map((v) => v.x));
        const ys = polygons.flatMap((p) => p.vertices.map((v) => v.y));
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const pad = Math.max(maxX - minX, maxY - minY) * 0.04;
        const layers = isCentral(shape) ? layersOf(polygons) : null;
        const mid = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
        const far = Math.hypot(maxX - minX, maxY - minY) / 2;
        const shapes = polygons.map((p, i) => {
            const points = p.vertices.map((v) => `${(v.x - minX).toFixed(1)},${(v.y - minY).toFixed(1)}`).join(' ');
            const cls = layers ? LAYER_CLASSES[Math.min(layers[i], LAYER_CLASSES.length - 1)] : 'bp-n';
            // An infinite canvas fades out towards its edge: it goes on without end.
            const fade = shape === 'infinite' ? ` style="opacity:${(1 - 0.75 * (Math.hypot(p.center.x - mid.x, p.center.y - mid.y) / far)).toFixed(2)}"` : '';
            return `<polygon class="${cls}" points="${points}"${fade}/>`;
        }).join('');
        const view = `${(-pad).toFixed(1)} ${(-pad).toFixed(1)} ${(maxX - minX + 2 * pad).toFixed(1)} ${(maxY - minY + 2 * pad).toFixed(1)}`;
        return `<svg class="bp-picture" viewBox="${view}" aria-hidden="true" focusable="false">${shapes}</svg>`;
    }

    // ---- The list ----------------------------------------------------------------------------------------------

    let host = null;
    let select = null;
    let trigger = null;
    let list = null;
    let activeIndex = 0;
    const cache = new Map();

    const field = (name) => document.querySelector(`select[name="${name}"]`);
    const choiceNow = () => ({
        tile: field('gridType')?.value,
        orientation: field('gridOrientation')?.value,
        triangleOrientation: field('triangleOrientation')?.value,
        center: field('boardCenter')?.value
    });

    function markupFor(shape, choice) {
        const key = [shape, choice.tile, choice.orientation, choice.triangleOrientation, choice.center].join('|');
        if (!cache.has(key)) {
            cache.set(key, previewMarkup(shape, choice, (config, canvas, colors) => Geometry.generateGrid(config, canvas, colors)));
        }
        return cache.get(key);
    }

    const optionOf = (shape) => Array.from(select.options).find((o) => o.value === shape);
    const selectable = () => SHAPES.filter((s) => optionOf(s.value) && !optionOf(s.value).disabled);

    function setOpen(open) {
        if (!list) return;
        list.hidden = !open;
        trigger.setAttribute('aria-expanded', String(open));
        if (open) {
            activeIndex = Math.max(0, SHAPES.findIndex((s) => s.value === select.value));
            highlight();
            list.focus();
        }
    }

    function highlight() {
        Array.from(list.children).forEach((li, i) => li.classList.toggle('active', i === activeIndex));
        const current = list.children[activeIndex];
        if (current) list.setAttribute('aria-activedescendant', current.id);
    }

    function choose(shape) {
        const option = optionOf(shape);
        if (!option || option.disabled) return;
        if (select.value !== shape) {
            select.value = shape;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        setOpen(false);
        trigger.focus();
    }

    function move(step) {
        let i = activeIndex;
        for (let tries = 0; tries < SHAPES.length; tries++) {
            i = (i + step + SHAPES.length) % SHAPES.length;
            if (!optionOf(SHAPES[i].value)?.disabled) { activeIndex = i; break; }
        }
        highlight();
    }

    /** Redraws every picture for the current tile shape, orientation and centre, and marks the chosen and disabled ones. */
    function refresh() {
        if (!host || !select) return;
        const choice = choiceNow();
        const current = SHAPES.find((s) => s.value === select.value) || SHAPES[0];
        trigger.innerHTML = `<span class="bp-trigger-picture">${markupFor(current.value, choice)}</span><span class="bp-trigger-name">${current.name}</span><span class="bp-caret" aria-hidden="true"></span>`;
        list.textContent = '';
        SHAPES.forEach((shape, i) => {
            const option = optionOf(shape.value);
            const li = document.createElement('li');
            li.id = `boardShapeOption-${shape.value}`;
            li.className = 'bp-option';
            li.setAttribute('role', 'option');
            li.setAttribute('aria-selected', String(shape.value === select.value));
            if (option?.disabled) {
                li.setAttribute('aria-disabled', 'true');
                li.title = 'Square tiles cannot fill a hexagon.';
            }
            li.innerHTML = `${markupFor(shape.value, choice)}<span class="bp-option-name">${shape.name}</span>`;
            li.addEventListener('click', () => choose(shape.value));
            li.addEventListener('pointermove', () => { if (!option?.disabled && activeIndex !== i) { activeIndex = i; highlight(); } });
            list.appendChild(li);
        });
        highlight();
    }

    function onTriggerKey(event) {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
        }
    }

    function onListKey(event) {
        const keys = {
            ArrowDown: () => move(1),
            ArrowRight: () => move(1),
            ArrowUp: () => move(-1),
            ArrowLeft: () => move(-1),
            Home: () => { activeIndex = SHAPES.findIndex((s) => !optionOf(s.value)?.disabled); highlight(); },
            End: () => { activeIndex = SHAPES.length - 1 - [...SHAPES].reverse().findIndex((s) => !optionOf(s.value)?.disabled); highlight(); },
            Enter: () => choose(SHAPES[activeIndex].value),
            ' ': () => choose(SHAPES[activeIndex].value),
            Escape: () => { setOpen(false); trigger.focus(); },
            Tab: () => setOpen(false)
        };
        if (keys[event.key]) {
            if (event.key !== 'Tab') event.preventDefault();
            keys[event.key]();
        }
    }

    function init() {
        host = document.getElementById('boardShapePicker');
        select = document.querySelector('select[name="boardOutline"]');
        if (!host || !select) return;
        const labelId = host.dataset.labelledBy;
        trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.id = 'boardShapeTrigger';
        trigger.className = 'bp-trigger';
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('aria-labelledby', `${labelId} boardShapeTrigger`);
        list = document.createElement('ul');
        list.className = 'bp-list';
        list.setAttribute('role', 'listbox');
        list.setAttribute('aria-labelledby', labelId);
        list.tabIndex = -1;
        list.hidden = true;
        host.append(trigger, list);

        trigger.addEventListener('click', () => setOpen(list.hidden));
        trigger.addEventListener('keydown', onTriggerKey);
        list.addEventListener('keydown', onListKey);
        document.addEventListener('pointerdown', (event) => { if (!host.contains(event.target)) setOpen(false); });
        select.addEventListener('change', refresh);
        refresh();
    }

    return { init, refresh, previewConfig, layersOf, previewMarkup, SHAPES, selectable };
})();
