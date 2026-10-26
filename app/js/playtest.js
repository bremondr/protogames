/**
 * PROTOGAMES PLAYTEST MODE
 * --------------------------------------------------------------
 * Locks editing so the board can be played on without changing it by accident: painting, the
 * tool bar, the side panel and every editing shortcut are off, while pan and zoom keep working.
 * The state lives in AppState (`playtest`), which Interactions and Shortcuts check.
 *
 * It also runs the game: when players are defined, every player's pieces start in their tray
 * (PlaytestTray), pieces are moved by clicking and dragging (PlaytestDrag), and dice are rolled
 * from the trays. The game state (Play) is built from the design when playtest starts, kept while
 * the tab lives, and never saved. This module owns the button, the status pill (with Reset), the
 * way back (button or Escape) and the glue between those parts.
 */
const Playtest = (() => {
    const PILL_VISIBLE_MS = 10000;
    let pillTimer = null;

    const $ = (id) => document.getElementById(id);

    function isOn() {
        return AppState.getState().playtest;
    }

    function play() {
        return AppState.getState().play;
    }

    // ---- The game ------------------------------------------------------------------------------------

    /** Ids of the tiles a running game may keep pieces on (all tiles it knows of that still exist). */
    function validTileIds() {
        const state = AppState.getState();
        const ids = new Set(state.polygons.map((p) => p.id));
        // An infinite board only holds the tiles near the view; any other tile of its lattice still exists.
        if (typeof Infinite !== 'undefined' && Infinite.isActive() && state.play) {
            state.play.pieces.forEach((p) => { if (p.tileId !== null && !ids.has(p.tileId) && Infinite.fromId(p.tileId)) ids.add(p.tileId); });
        }
        return ids;
    }

    /** Builds the game from the players, or brings the running one up to date with the design. */
    function syncGame() {
        const state = AppState.getState();
        AppState.setPlay(Play.sync(state.play, state.players, validTileIds()));
    }

    /** The design was replaced (a file or link was opened): the game that belonged to the old one is over. */
    function designChanged() {
        if (isOn()) setOn(false);
        AppState.setPlay(null);
        AppState.setSelectedPiece(null);
        window.dispatchEvent(new CustomEvent('pg:designchange'));
        window.dispatchEvent(new CustomEvent('pg:playerschange'));
    }

    function announce(text) {
        const live = $('playtestAnnouncer');
        if (!live) return;
        // Clearing first makes a repeated message (the same die twice) be read again.
        live.textContent = '';
        setTimeout(() => { live.textContent = text; }, 30);
    }

    /** Redraws everything that shows the game: board, trays, the list of pieces on the board, the pill. */
    function refresh() {
        Renderer.renderBoard();
        if (typeof PlaytestTray !== 'undefined') PlaytestTray.render();
        if (typeof PlaytestDrag !== 'undefined') PlaytestDrag.renderBoardPieces();
        updatePill();
    }

    function updatePill() {
        const game = play();
        const info = $('playtestInfo');
        const reset = $('playtestReset');
        const hasGame = Boolean(game && game.pieces.length);
        if (info) {
            info.textContent = hasGame ? `${game.moves} ${game.moves === 1 ? 'move' : 'moves'}` : 'Editing is locked';
        }
        if (reset) reset.hidden = !hasGame;
    }

    function resetGame() {
        const game = play();
        if (!game) return;
        Play.reset(game);
        AppState.setSelectedPiece(null);
        refresh();
        announce('Game reset. All pieces are back in their trays.');
    }

    function undoMove() {
        const game = play();
        if (!game || !Play.undo(game)) return;
        refresh();
        announce('Move undone.');
    }

    function redoMove() {
        const game = play();
        if (!game || !Play.redo(game)) return;
        refresh();
        announce('Move redone.');
    }

    // ---- Switching ------------------------------------------------------------------------------------

    function setOn(on) {
        const wanted = Boolean(on);
        if (wanted === isOn()) return;
        clearTimeout(pillTimer);
        if (wanted) {
            // A stroke or line in progress must not survive the lock.
            Interactions.cancelStroke();
            AppState.setHoverPolygonId(null, null);
            syncGame();
            Renderer.renderBoard();
        } else {
            if (typeof PlaytestDrag !== 'undefined') PlaytestDrag.cancel();
            // The trays are about to go: focus would drop to the page, so it goes to the play button.
            const layer = $('trayLayer');
            if (layer && layer.contains(document.activeElement)) $('playButton')?.focus();
        }
        AppState.setPlaytest(wanted);
        document.body.classList.toggle('playtest', wanted);
        if (typeof PlaytestTray !== 'undefined') PlaytestTray.setVisible(wanted);

        const button = $('playButton');
        if (button) {
            const label = wanted ? 'Back to editing' : 'Playtest (lock editing)';
            button.setAttribute('aria-pressed', String(wanted));
            button.setAttribute('aria-label', label);
            button.dataset.tip = label;
        }
        const pill = $('playtestPill');
        if (pill) {
            pill.hidden = !wanted;
            pill.classList.remove('faded');
            // The pill fades out after a while so it does not sit on the board. A running game keeps it:
            // it holds Reset and the move count.
            const hasGame = Boolean(play() && play().pieces.length);
            if (wanted && !hasGame) pillTimer = setTimeout(() => pill.classList.add('faded'), PILL_VISIBLE_MS);
        }
        updatePill();
        window.dispatchEvent(new CustomEvent('pg:playtest', { detail: { on: wanted } }));
        // Let the canvas re-measure now that the side panel went away or came back and the trays took room.
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
            if (wanted) refresh();
        }, 30);
    }

    function init() {
        $('playButton')?.addEventListener('click', () => setOn(!isOn()));
        $('playtestBack')?.addEventListener('click', () => setOn(false));
        $('playtestReset')?.addEventListener('click', resetGame);
        document.addEventListener('keydown', (event) => {
            // One Escape closes only the topmost layer: a dialog or the help overlay first, then a
            // popover or full screen (the toolbar marks those keys as used), then playtest.
            // Capture phase, so a dialog closing on this same key press is still seen as open.
            if (event.key !== 'Escape' || event.defaultPrevented || !isOn() || FocusUtils.layerOpen()) return;
            setOn(false);
        }, true);
    }

    return { init, setOn, isOn, designChanged, refresh, resetGame, undoMove, redoMove, announce, syncGame };
})();
