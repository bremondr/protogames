/**
 * PROTOGAMES VIEW CONTROLS
 * --------------------------------------------------------------
 * Pan, zoom and the minimap.
 *
 * Gesture set (painting and navigating never share a gesture):
 *   mouse     wheel = zoom at the pointer, Space + drag or middle-button drag = pan
 *   touch     one finger = paint, two fingers = pan + pinch-zoom (an in-progress
 *             stroke is rolled back when the second finger lands)
 *   stylus    paints; navigate with the wheel / Space+drag / the on-screen controls
 *   buttons   zoom out / in, "100%" actual size, fit to screen, minimap toggle
 *
 * The view lives in AppState.view and is applied by the Renderer; exports ignore it.
 * The pure maths is in ViewMath (unit-tested).
 */
const ViewControls = (() => {
    const BUTTON_ZOOM_STEP = 1.25;
    const MINIMAP_REFRESH_MS = 200;

    let canvas = null;
    let spaceDown = false;
    let pan = null; // { id, x, y } while dragging with Space / middle button
    let gesture = null; // { startView, startPoints, ids } during a two-finger gesture
    const touches = new Map(); // pointerId -> canvas-space position
    const ignored = new Set(); // pointer ids that must not paint after a gesture ended

    const elements = {};
    let minimapEnabled = true;
    let minimapTimer = null;
    let minimapBitmap = null; // cached rendering of the board for the minimap
    let minimapBitmapFor = null; // polygons array the bitmap belongs to
    let minimapSignature = ''; // content fingerprint the bitmap was drawn from
    let minimapDrag = false;

    // ---- Helpers --------------------------------------------------------------------

    const state = () => AppState.getState();

    /** Pointer position in canvas pixels (accounts for CSS scaling). */
    function toCanvas(event) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left) * (canvas.width / rect.width),
            y: (event.clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    const boundsCache = new WeakMap();
    function boardBounds() {
        const polygons = state().polygons;
        if (!boundsCache.has(polygons)) boundsCache.set(polygons, ViewMath.boundsOf(polygons));
        return boundsCache.get(polygons);
    }

    const tileSizeCache = new WeakMap();
    function tileSize() {
        const polygons = state().polygons;
        if (!tileSizeCache.has(polygons)) tileSizeCache.set(polygons, ViewMath.typicalTileSize(polygons));
        return tileSizeCache.get(polygons);
    }

    /** Applies a new view, kept within sensible bounds, and redraws. */
    function setView(view) {
        const clamped = ViewMath.clampToBounds(view, canvas.width, canvas.height, boardBounds());
        AppState.setView(clamped);
        Renderer.requestRender();
        updateControls();
    }

    function zoomAt(factor, point) {
        setView(ViewMath.zoomAt(state().view, factor, point.x, point.y, Config.ZOOM_MIN, Config.ZOOM_MAX));
    }

    const center = () => ({ x: canvas.width / 2, y: canvas.height / 2 });

    // ---- Public actions (also used by keyboard shortcuts) ------------------------------

    function zoomIn() {
        if (state().polygons.length) zoomAt(BUTTON_ZOOM_STEP, center());
    }

    function zoomOut() {
        if (state().polygons.length) zoomAt(1 / BUTTON_ZOOM_STEP, center());
    }

    /** Whole board in view (the layout the board was generated with). */
    function fit() {
        AppState.resetView();
        Renderer.requestRender();
        updateControls();
    }

    /** Zoom so a typical tile is Config.ACTUAL_TILE_PX wide, around the middle of the view. */
    function actualSize() {
        if (!state().polygons.length) return;
        const target = ViewMath.scaleForTileSize(tileSize(), Config.ACTUAL_TILE_PX);
        const c = center();
        setView(ViewMath.setScaleAt(state().view, target, c.x, c.y, Config.ZOOM_MIN, Config.ZOOM_MAX));
    }

    /** Zoom as the percentage shown in the UI (100% = Config.ACTUAL_TILE_PX per tile). */
    function zoomPercent() {
        const size = tileSize();
        return size ? Math.round(((state().view.scale * size) / Config.ACTUAL_TILE_PX) * 100) : 100;
    }

    // ---- Wheel ------------------------------------------------------------------------

    function onWheel(event) {
        if (!state().polygons.length) return;
        event.preventDefault();
        let delta = event.deltaY;
        if (event.deltaMode === 1) delta *= 16; // lines
        else if (event.deltaMode === 2) delta *= 400; // pages
        // Trackpad pinch arrives as ctrl+wheel with small deltas, so it gets a larger gain.
        const gain = event.ctrlKey ? 0.01 : 0.0015;
        zoomAt(Math.exp(-delta * gain), toCanvas(event));
    }

    // ---- Space key -----------------------------------------------------------------------

    /**
     * Targets that keep the Space key: text entry (the shared rule), or a button or link focused
     * with the keyboard, which Space should still press. After a mouse click a button has focus
     * but not :focus-visible, so Space pans instead of pressing it.
     */
    function ownsSpace(target) {
        if (FocusUtils.isTypingTarget(target)) return true;
        try { return Boolean(target && target.matches && target.matches('button:focus-visible, a:focus-visible')); } catch (e) { return false; }
    }

    function setSpace(down) {
        if (spaceDown === down) return;
        spaceDown = down;
        canvas.classList.toggle('pan-ready', down);
        if (!down && !pan) canvas.classList.remove('panning');
    }

    function onKeyDown(event) {
        if (event.code !== 'Space' || ownsSpace(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
        // Space must not scroll the page or click a focused control while navigating.
        event.preventDefault();
        setSpace(true);
    }

    function onKeyUp(event) {
        if (event.code === 'Space') setSpace(false);
    }

    // ---- Pointer handling (capture phase, ahead of the painting handlers) --------------------

    function consume(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    function startPan(event) {
        pan = { id: event.pointerId, ...toCanvas(event) };
        canvas.classList.add('panning');
        try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* synthetic events */ }
    }

    function startGesture() {
        const ids = [...touches.keys()].slice(0, 2);
        Interactions.cancelStroke();
        gesture = {
            startView: { ...state().view },
            startPoints: ids.map((id) => ({ ...touches.get(id) })),
            ids
        };
    }

    function onPointerDown(event) {
        if (!state().polygons.length) return;

        if (event.pointerType === 'touch') {
            touches.set(event.pointerId, toCanvas(event));
            if (touches.size === 2) {
                startGesture();
                consume(event);
                return;
            }
            if (touches.size > 2 || gesture) {
                ignored.add(event.pointerId);
                consume(event);
            }
            return; // a single finger paints
        }

        const middle = event.button === 1;
        if (middle || (spaceDown && event.button === 0)) {
            startPan(event);
            consume(event);
        }
    }

    function onPointerMove(event) {
        if (event.pointerType === 'touch' && touches.has(event.pointerId)) {
            touches.set(event.pointerId, toCanvas(event));
            if (gesture && gesture.ids.includes(event.pointerId)) {
                const now = gesture.ids.map((id) => touches.get(id));
                setView(ViewMath.gestureView(gesture.startView, gesture.startPoints, now, Config.ZOOM_MIN, Config.ZOOM_MAX));
                consume(event);
                return;
            }
        }
        if (ignored.has(event.pointerId)) {
            consume(event);
            return;
        }
        if (pan && pan.id === event.pointerId) {
            const point = toCanvas(event);
            setView(ViewMath.panBy(state().view, point.x - pan.x, point.y - pan.y));
            pan.x = point.x;
            pan.y = point.y;
            consume(event);
        }
    }

    function onPointerEnd(event) {
        const wasIgnored = ignored.delete(event.pointerId);
        if (event.pointerType === 'touch') {
            touches.delete(event.pointerId);
            if (gesture && gesture.ids.includes(event.pointerId)) {
                // The remaining finger must lift before it can paint again.
                gesture.ids.filter((id) => id !== event.pointerId && touches.has(id)).forEach((id) => ignored.add(id));
                gesture = null;
                consume(event);
                return;
            }
        }
        if (pan && pan.id === event.pointerId) {
            pan = null;
            canvas.classList.remove('panning');
            consume(event);
            return;
        }
        if (wasIgnored) consume(event);
    }

    // ---- Zoom controls + minimap ---------------------------------------------------------------

    function updateControls() {
        if (elements.zoomLabel) elements.zoomLabel.textContent = `${zoomPercent()}%`;
        drawMinimap();
    }

    function refreshMinimapBitmap() {
        const polygons = state().polygons;
        const bounds = boardBounds();
        const { minimapCanvas } = elements;
        if (!minimapCanvas || !bounds) return;
        const w = minimapCanvas.width;
        const h = minimapCanvas.height;
        if (!minimapBitmap) {
            minimapBitmap = document.createElement('canvas');
            minimapBitmap.width = w;
            minimapBitmap.height = h;
        }
        const mapping = minimapMapping();
        const ctx = minimapBitmap.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = 'rgba(51, 55, 65, 0.35)';
        for (const polygon of polygons) {
            ctx.beginPath();
            polygon.vertices.forEach((v, i) => {
                const x = (v.x - bounds.minX) * mapping.scale + mapping.offsetX;
                const y = (v.y - bounds.minY) * mapping.scale + mapping.offsetY;
                if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
            });
            ctx.closePath();
            ctx.fillStyle = polygon.color || Config.DEFAULT_FILL;
            ctx.fill();
            ctx.stroke();
            if (polygon.object) {
                ctx.fillStyle = 'rgba(20, 16, 12, 0.7)';
                ctx.beginPath();
                ctx.arc((polygon.center.x - bounds.minX) * mapping.scale + mapping.offsetX, (polygon.center.y - bounds.minY) * mapping.scale + mapping.offsetY, 1.6, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        minimapBitmapFor = polygons;
        minimapSignature = contentSignature();
    }

    const colorCodes = new Map();

    /**
     * Cheap fingerprint of what the minimap shows (tile colours and objects), so
     * pan/zoom/hover redraws do not rebuild it but painting does.
     */
    function contentSignature() {
        const polygons = state().polygons;
        let hash = polygons.length;
        for (let i = 0; i < polygons.length; i++) {
            const polygon = polygons[i];
            let code = colorCodes.get(polygon.color);
            if (code === undefined) {
                code = colorCodes.size + 1;
                colorCodes.set(polygon.color, code);
            }
            hash = (Math.imul(hash, 33) + code * 7 + (polygon.object ? 13 : 0) + i) | 0;
        }
        return `${polygons.length}:${hash}`;
    }

    /** How board (world) coordinates map into the minimap canvas. */
    function minimapMapping() {
        const bounds = boardBounds();
        const { minimapCanvas } = elements;
        const pad = 6;
        const w = minimapCanvas.width - pad * 2;
        const h = minimapCanvas.height - pad * 2;
        const bw = Math.max(1, bounds.maxX - bounds.minX);
        const bh = Math.max(1, bounds.maxY - bounds.minY);
        const scale = Math.min(w / bw, h / bh);
        return {
            scale,
            offsetX: pad + (w - bw * scale) / 2,
            offsetY: pad + (h - bh * scale) / 2
        };
    }

    function drawMinimap() {
        const { minimapCanvas, minimap } = elements;
        if (!minimapCanvas || !minimap) return;
        const visible = minimapEnabled && state().polygons.length > 0;
        minimap.classList.toggle('hidden', !visible);
        if (!visible) return;
        if (!minimapBitmap || minimapBitmapFor !== state().polygons) refreshMinimapBitmap();

        const ctx = minimapCanvas.getContext('2d');
        ctx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
        ctx.drawImage(minimapBitmap, 0, 0);

        const bounds = boardBounds();
        const mapping = minimapMapping();
        const view = ViewMath.visibleWorldRect(state().view, canvas.width, canvas.height);
        const x = (view.minX - bounds.minX) * mapping.scale + mapping.offsetX;
        const y = (view.minY - bounds.minY) * mapping.scale + mapping.offsetY;
        const w = (view.maxX - view.minX) * mapping.scale;
        const h = (view.maxY - view.minY) * mapping.scale;
        ctx.fillStyle = 'rgba(47, 111, 237, 0.12)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#2f6fed';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, h);
    }

    /** After painting, undo or loading, rebuild the minimap picture once things settle. */
    function scheduleMinimapRebuild() {
        if (minimapTimer) return;
        minimapTimer = setTimeout(() => {
            minimapTimer = null;
            if (minimapEnabled && minimapSignature !== contentSignature()) refreshMinimapBitmap();
            drawMinimap();
        }, MINIMAP_REFRESH_MS);
    }

    function minimapPointToView(event) {
        const rect = elements.minimapCanvas.getBoundingClientRect();
        const bounds = boardBounds();
        const mapping = minimapMapping();
        const mx = (event.clientX - rect.left) * (elements.minimapCanvas.width / rect.width);
        const my = (event.clientY - rect.top) * (elements.minimapCanvas.height / rect.height);
        const wx = (mx - mapping.offsetX) / mapping.scale + bounds.minX;
        const wy = (my - mapping.offsetY) / mapping.scale + bounds.minY;
        setView(ViewMath.centerOn(state().view, canvas.width, canvas.height, wx, wy));
    }

    function bindMinimap() {
        const { minimapCanvas } = elements;
        if (!minimapCanvas) return;
        minimapCanvas.addEventListener('pointerdown', (event) => {
            minimapDrag = true;
            try { minimapCanvas.setPointerCapture(event.pointerId); } catch (error) { /* synthetic events */ }
            minimapPointToView(event);
            event.preventDefault();
        });
        minimapCanvas.addEventListener('pointermove', (event) => {
            if (minimapDrag) minimapPointToView(event);
        });
        const end = () => { minimapDrag = false; };
        minimapCanvas.addEventListener('pointerup', end);
        minimapCanvas.addEventListener('pointercancel', end);
    }

    function setMinimapEnabled(enabled) {
        minimapEnabled = Boolean(enabled);
        elements.minimapToggle?.setAttribute('aria-pressed', String(minimapEnabled));
        try { localStorage.setItem(Config.MINIMAP_KEY, minimapEnabled ? 'on' : 'off'); } catch (error) { /* storage unavailable */ }
        drawMinimap();
    }

    function toggleMinimap() {
        setMinimapEnabled(!minimapEnabled);
    }

    // ---- Colours-only view ------------------------------------------------------------------

    /** Textures on/off. The board, the brush dot and exports all follow the view. */
    function setColorView(on) {
        Textures.setFlat(on);
        try { localStorage.setItem(Config.COLOR_VIEW_KEY, on ? 'on' : 'off'); } catch (error) { /* storage unavailable */ }
        const button = elements.viewModeToggle;
        if (button) {
            const label = on ? 'Show textures' : 'Show colors only';
            button.setAttribute('aria-pressed', String(on));
            button.setAttribute('aria-label', label);
            button.dataset.tip = label;
        }
        Renderer.renderBoard();
        window.dispatchEvent(new CustomEvent('pg:toolchange'));
    }

    function loadColorViewPreference() {
        let stored = null;
        try { stored = localStorage.getItem(Config.COLOR_VIEW_KEY); } catch (error) { /* storage unavailable */ }
        setColorView(stored === 'on');
    }

    function loadMinimapPreference() {
        let stored = null;
        try { stored = localStorage.getItem(Config.MINIMAP_KEY); } catch (error) { /* storage unavailable */ }
        // Default: on, except on narrow screens where it would crowd the canvas.
        minimapEnabled = stored ? stored === 'on' : window.innerWidth >= 700;
        elements.minimapToggle?.setAttribute('aria-pressed', String(minimapEnabled));
    }

    // ---- Setup ------------------------------------------------------------------------------------

    function init() {
        canvas = document.getElementById('gameCanvas');
        if (!canvas) return;
        for (const id of ['zoomOut', 'zoomIn', 'zoomLabel', 'zoomFit', 'minimapToggle', 'viewModeToggle', 'minimap', 'minimapCanvas']) {
            elements[id] = document.getElementById(id);
        }

        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('pointerdown', onPointerDown, { capture: true });
        canvas.addEventListener('pointermove', onPointerMove, { capture: true });
        canvas.addEventListener('pointerup', onPointerEnd, { capture: true });
        canvas.addEventListener('pointercancel', onPointerEnd, { capture: true });
        // The middle button would otherwise start the browser's auto-scroll.
        canvas.addEventListener('mousedown', (event) => { if (event.button === 1) event.preventDefault(); });
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', () => setSpace(false));

        elements.zoomOut?.addEventListener('click', zoomOut);
        elements.zoomIn?.addEventListener('click', zoomIn);
        elements.zoomLabel?.addEventListener('click', actualSize);
        elements.zoomFit?.addEventListener('click', fit);
        elements.minimapToggle?.addEventListener('click', toggleMinimap);
        elements.viewModeToggle?.addEventListener('click', () => setColorView(!Textures.isFlat()));

        bindMinimap();
        loadMinimapPreference();
        loadColorViewPreference();
        Renderer.onRender(() => {
            if (minimapEnabled && minimapSignature !== contentSignature()) scheduleMinimapRebuild();
            updateControls();
        });
        updateControls();
    }

    return {
        init,
        zoomIn,
        zoomOut,
        fit,
        actualSize,
        toggleMinimap,
        zoomPercent
    };
})();
