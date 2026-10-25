/**
 * PROTOGAMES PLAYTEST DRAG
 * --------------------------------------------------------------
 * Moving pieces in playtest.
 *
 *   mouse, touch, pen   press a piece (on the board or in a tray), move past a few pixels, release:
 *                       on a tile it stands there, on its own tray it goes back to the tray, anywhere
 *                       else it returns to where it came from. Escape cancels a drag.
 *   several fingers     every finger that starts on a piece carries that piece, so two players can move
 *                       pieces at the same time. Only fingers that start on empty board pan and zoom
 *                       (ViewControls asks wantsPointer() first).
 *   keyboard            pieces on the board are buttons in a list that only screen readers and the
 *                       keyboard see: arrow keys move the focused piece to the neighbouring tile in that
 *                       direction, Delete puts it back in its tray.
 *
 * The piece being carried is a small picture that follows the pointer (so it can cross from the board to
 * a tray); the piece on the board is hidden while it is carried. What changes goes through Play.
 */
const PlaytestDrag = (() => {
    const THRESHOLD_PX = 6;
    const TOUCH_MARGIN_PX = 14;
    const MOUSE_MARGIN_PX = 3;
    const GHOST_PX = 56;

    let canvas = null;
    let trayLayer = null;
    let list = null;
    // pointerId -> { pieceId, kind, color, origin: 'board' | 'tray', startX, startY, active, ghost, button (tray origin) }
    const drags = new Map();
    // Pointers whose drag was cancelled with Escape and that are still down: their release does nothing. The
    // tray button keeps the pointer captured, so without this the release would still be a click on it.
    const cancelled = new Set();
    let suppressClick = false;

    const state = () => AppState.getState();
    const game = () => state().play;

    // ---- Geometry ---------------------------------------------------------------------------

    function worldPoint(event) {
        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (canvas.width / rect.width);
        const y = (event.clientY - rect.top) * (canvas.height / rect.height);
        return ViewMath.toWorld(state().view, x, y);
    }

    function insideCanvas(event) {
        const rect = canvas.getBoundingClientRect();
        return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    }

    function placements() {
        return Pieces.placements(game().pieces, Pieces.polygonMap(state().polygons));
    }

    /** The piece under the pointer on the board, or null. */
    function pieceAtEvent(event) {
        if (!state().playtest || !game()) return null;
        const margin = (event.pointerType === 'touch' ? TOUCH_MARGIN_PX : MOUSE_MARGIN_PX) / state().view.scale;
        return Pieces.hitTest(placements(), worldPoint(event), margin);
    }

    /** ViewControls asks before it treats a touch as the start of a pan or zoom. */
    function wantsPointer(event) {
        return Boolean(pieceAtEvent(event));
    }

    // ---- Ghost ----------------------------------------------------------------------------------

    function makeGhost(kind, color) {
        const ghost = document.createElement('img');
        ghost.className = 'drag-ghost';
        ghost.alt = '';
        ghost.draggable = false;
        ghost.src = Pieces.iconUrl(kind, color);
        ghost.style.width = `${GHOST_PX}px`;
        ghost.style.height = `${GHOST_PX}px`;
        document.body.appendChild(ghost);
        return ghost;
    }

    function moveGhost(drag, event) {
        if (!drag.ghost) return;
        drag.ghost.style.transform = `translate(${event.clientX - GHOST_PX / 2}px, ${event.clientY - GHOST_PX * 0.86}px)`;
    }

    function syncHidden() {
        const hidden = [...drags.values()].filter((d) => d.active).map((d) => d.pieceId);
        AppState.setDrag(hidden.length ? hidden : null);
        Renderer.renderBoard();
    }

    function markDropTarget(event, drag) {
        const target = document.elementFromPoint(event.clientX, event.clientY);
        const tray = target && target.closest ? target.closest('.tray') : null;
        trayLayer.querySelectorAll('.tray.drop-target').forEach((t) => t.classList.remove('drop-target'));
        if (tray && Players.same(tray.dataset.color, drag.color)) tray.classList.add('drop-target');
    }

    // ---- Starting, moving and ending a drag --------------------------------------------------------

    function begin(event, piece, origin, button = null) {
        const drag = {
            pieceId: piece.id,
            kind: piece.kind,
            color: piece.color,
            origin,
            startX: event.clientX,
            startY: event.clientY,
            active: false,
            ghost: null,
            button
        };
        cancelled.delete(event.pointerId);
        drags.set(event.pointerId, drag);
        if (origin === 'board') AppState.setSelectedPiece(piece.id);
        return drag;
    }

    function activate(drag, event) {
        drag.active = true;
        drag.ghost = makeGhost(drag.kind, drag.color);
        moveGhost(drag, event);
        syncHidden();
    }

    function finish(pointerId) {
        const drag = drags.get(pointerId);
        if (!drag) return null;
        drags.delete(pointerId);
        if (drag.ghost) drag.ghost.remove();
        trayLayer.querySelectorAll('.tray.drop-target').forEach((t) => t.classList.remove('drop-target'));
        return drag;
    }

    function onBoardPointerDown(event) {
        if (!state().playtest || !game() || event.button > 0) return;
        const piece = pieceAtEvent(event);
        if (!piece) return;
        event.preventDefault();
        begin(event, piece, 'board');
        try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* synthetic events */ }
        Renderer.renderBoard();
    }

    function onTrayPointerDown(event) {
        const button = event.target.closest('.tray-piece');
        if (!button || !state().playtest || !game() || event.button > 0) return;
        const group = Play.trayGroups(game(), button.dataset.color).find((g) => g.kind === button.dataset.kind);
        const piece = group && Play.find(game(), group.ids[0]);
        if (!piece) return;
        begin(event, piece, 'tray', button);
        try { button.setPointerCapture(event.pointerId); } catch (error) { /* synthetic events */ }
    }

    function onPointerMove(event) {
        const drag = drags.get(event.pointerId);
        if (!drag) {
            hoverCursor(event);
            return;
        }
        if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > THRESHOLD_PX) activate(drag, event);
        if (drag.active) {
            moveGhost(drag, event);
            markDropTarget(event, drag);
        }
    }

    /** A hand over a piece tells the player it can be picked up. */
    function hoverCursor(event) {
        if (event.target !== canvas || !state().playtest || event.pointerType === 'touch') return;
        canvas.style.cursor = pieceAtEvent(event) ? 'grab' : '';
    }

    function onPointerUp(event) {
        if (cancelled.delete(event.pointerId)) {
            // Escape already took the piece back: releasing must not place it or count as a move.
            suppressClickOnce();
            return;
        }
        const drag = finish(event.pointerId);
        if (!drag) return;
        if (!drag.active) {
            // A press without a drag: on the board it only selects; in a tray it is a tap, which sends the piece to
            // a start. That happens here and not on `click`, because two fingers tapping at once produce no click.
            if (drag.origin === 'board') Renderer.renderBoard();
            else if (drag.button && typeof PlaytestTray !== 'undefined') PlaytestTray.tapPiece(event, drag.button);
            return;
        }
        suppressClickOnce();
        const piece = Play.find(game(), drag.pieceId);
        const target = document.elementFromPoint(event.clientX, event.clientY);
        const tray = target && target.closest ? target.closest('.tray') : null;
        const name = `${Players.colorName(drag.color)} ${kindName(drag.kind)}`;
        let message = '';
        if (tray) {
            if (Players.same(tray.dataset.color, drag.color) && piece && piece.tileId !== null) {
                Play.move(game(), drag.pieceId, null);
                message = `${name} returned to its tray.`;
            }
        } else if (insideCanvas(event)) {
            const tile = AppState.getTopology().locate(worldPoint(event));
            if (tile && Play.move(game(), drag.pieceId, tile.id)) {
                message = `${name} moved to ${Pieces.tileLabel(state().polygons, tile)}.`;
            }
        }
        // A drop that changed nothing (off the board, on a foreign tray) puts the piece back: say so.
        if (!message) message = dropMessage(name, drag.origin);
        AppState.setDrag(null);
        Playtest.refresh();
        if (message) Playtest.announce(message);
    }

    /** What a screen reader hears when a drag ended without moving the piece. */
    function dropMessage(name, origin) {
        return `${name} was put back ${origin === 'tray' ? 'in its tray' : 'where it was'}.`;
    }

    function suppressClickOnce() {
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 0);
    }

    function onPointerCancel(event) {
        cancelled.delete(event.pointerId);
        if (!drags.has(event.pointerId)) return;
        finish(event.pointerId);
        syncHidden();
        Playtest.refresh();
    }

    /** Puts every carried piece back where it came from (Escape, leaving playtest). */
    function cancel() {
        if (!drags.size) return false;
        [...drags.keys()].forEach((pointerId) => {
            finish(pointerId);
            cancelled.add(pointerId);
        });
        AppState.setDrag(null);
        Renderer.renderBoard();
        return true;
    }

    function kindName(kind) {
        return (Config.PIECE_KINDS.find((k) => k.id === kind) || { label: kind }).label.toLowerCase();
    }

    /** True once after a drag, so the click that follows the release is not taken as a request to place the piece. */
    function consumeClick() {
        const was = suppressClick;
        suppressClick = false;
        return was;
    }

    // ---- Keyboard: the list of pieces on the board -------------------------------------------------

    // The tile set the list was built from: on an infinite board panning loads other tiles, and the list follows.
    let listedPolygons = null;
    let listTimer = null;

    function renderBoardPieces() {
        if (!list) return;
        const focused = document.activeElement && list.contains(document.activeElement) ? document.activeElement.dataset.pieceId : null;
        list.innerHTML = '';
        const s = state();
        listedPolygons = s.polygons;
        if (!s.playtest || !s.play) return;
        for (const piece of s.play.pieces) {
            if (piece.tileId === null) continue;
            // A piece on an infinite board can stand on a tile that is not loaded right now; it is still listed.
            const label = Pieces.tileLabelById(s.polygons, piece.tileId);
            if (!label) continue;
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.pieceId = piece.id;
            button.textContent = `${Players.colorName(piece.color)} ${kindName(piece.kind)} at ${label}`;
            button.setAttribute('aria-description', 'Arrow keys move it to the next tile. Delete puts it back in its tray.');
            item.appendChild(button);
            list.appendChild(item);
        }
        if (focused) Array.from(list.querySelectorAll('button')).find((b) => b.dataset.pieceId === focused)?.focus();
    }

    /** After a pan or zoom ends, rebuilds the list when the loaded tiles changed (infinite boards only). */
    function refreshListSoon() {
        if (listTimer || !state().playtest || state().polygons === listedPolygons) return;
        listTimer = setTimeout(() => {
            listTimer = null;
            if (state().playtest && state().polygons !== listedPolygons) renderBoardPieces();
        }, 150);
    }

    const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

    function onListKeyDown(event) {
        const button = event.target.closest('button[data-piece-id]');
        if (!button || !game()) return;
        const piece = Play.find(game(), button.dataset.pieceId);
        if (!piece || piece.tileId === null) return;
        const name = `${Players.colorName(piece.color)} ${kindName(piece.kind)}`;
        if (ARROWS[event.key]) {
            event.preventDefault();
            if (!Pieces.polygonMap(state().polygons).has(piece.tileId)) {
                Playtest.announce(`${name} is on a part of the board that is not shown. Pan the board to it, or press Delete to put it back in its tray.`);
                return;
            }
            const [dx, dy] = ARROWS[event.key];
            const { adjacency } = AppState.getTopology();
            const next = Pieces.neighborInDirection(state().polygons, adjacency, piece.tileId, dx, dy);
            if (!next) {
                Playtest.announce(`${name} cannot move that way.`);
                return;
            }
            Play.move(game(), piece.id, next);
            Playtest.refresh();
            Playtest.announce(`${name} moved to ${Pieces.tileLabelById(state().polygons, next)}.`);
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            Play.move(game(), piece.id, null);
            AppState.setSelectedPiece(null);
            Playtest.refresh();
            Playtest.announce(`${name} returned to its tray.`);
            trayLayer.querySelector(`.tray-piece[data-color="${piece.color}"]`)?.focus();
        }
    }

    function init() {
        canvas = document.getElementById('gameCanvas');
        trayLayer = document.getElementById('trayLayer');
        list = document.getElementById('boardPieceList');
        if (!canvas || !trayLayer) return;
        canvas.addEventListener('pointerdown', onBoardPointerDown);
        trayLayer.addEventListener('pointerdown', onTrayPointerDown);
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerCancel);
        // Panning and zooming an infinite board load other tiles; the list of pieces follows once it settles.
        document.addEventListener('pointerup', refreshListSoon);
        document.addEventListener('wheel', refreshListSoon, { passive: true });
        document.addEventListener('keyup', refreshListSoon);
        // Registered before Playtest's own Escape handler, so Escape cancels a drag without also leaving playtest.
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && drags.size && cancel()) event.preventDefault();
        }, true);
        list?.addEventListener('keydown', onListKeyDown);
        list?.addEventListener('focusin', (event) => {
            const button = event.target.closest('button[data-piece-id]');
            if (!button) return;
            AppState.setSelectedPiece(button.dataset.pieceId);
            Renderer.renderBoard();
        });
        list?.addEventListener('focusout', () => {
            setTimeout(() => {
                if (list.contains(document.activeElement)) return;
                AppState.setSelectedPiece(null);
                Renderer.renderBoard();
            }, 0);
        });
    }

    return { init, wantsPointer, cancel, consumeClick, renderBoardPieces };
})();
