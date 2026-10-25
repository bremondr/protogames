/**
 * PROTOGAMES PLAYTEST TRAYS
 * --------------------------------------------------------------
 * One tray per player, shown during playtest at the player's seat: centred on that screen edge and
 * turned to face outwards, as if the screen lay flat on a table. A tray holds the pieces that are not
 * on the board yet (grouped by kind, with a count) and the design's dice.
 *
 *   click a piece   it goes to the first free start marker of its colour (or the tray says there is none)
 *   drag a piece    onto any tile (see PlaytestDrag); drag a piece back onto its tray to take it off the board
 *   click a die     rolls it; the result shows in the tray, rotated with it
 *
 * A folded tray keeps its dice and the last result in a single strip. On a small screen trays fold by
 * themselves until the board keeps a usable size (see fitFolded).
 *
 * The trays are real buttons, so keyboard and screen readers work. Mouse and touch act when the pointer is
 * released (two fingers tapping at once produce no click); a click without a preceding pointer release is
 * the keyboard or a screen reader and acts as well. Everything is drawn from AppState (players, the running
 * game) and rebuilt by render() after every change.
 */
const PlaytestTray = (() => {
    const $ = (id) => document.getElementById(id);
    let layer = null;
    let workspace = null;
    // Seats the player folded to a strip to give the board more room.
    const collapsed = new Set();
    // Seats folded for lack of room (derived again whenever the size or the trays change), and the seat the
    // player unfolded last, which stays open even if the board gets small.
    let squeezed = new Set();
    let pinned = null;
    // Board side below which trays fold themselves (px).
    const MIN_BOARD_PX = 260;
    // A short message per player colour ("No free start for Red.") that fades away.
    const notes = new Map();
    let rolledColor = null;

    const kindLabel = (kind) => (Config.PIECE_KINDS.find((k) => k.id === kind) || { label: kind }).label;
    const key = (color) => String(color).toLowerCase();

    function seatsInUse() {
        const used = new Set(AppState.getState().players.map((p) => p.seat));
        return Config.SEATS.filter((seat) => used.has(seat));
    }

    const isFolded = (seat) => collapsed.has(seat) || squeezed.has(seat);

    /**
     * Which seats must fold so that the board keeps at least `min` px on both sides. Seats the player
     * folded already count as folded; the others fold on the failing axis (left, right, top, bottom), except
     * the seat the player unfolded last: that was a deliberate choice. Pure: the sizes are arguments.
     */
    function fitFolded({ width, height, used, folded, pinned: keep, band, bandFolded, min }) {
        const result = new Set();
        const size = (seat) => (folded.has(seat) || result.has(seat) ? bandFolded : band);
        const room = () => ({
            w: width - (used.includes('left') ? size('left') : 0) - (used.includes('right') ? size('right') : 0),
            h: height - (used.includes('top') ? size('top') : 0) - (used.includes('bottom') ? size('bottom') : 0)
        });
        for (;;) {
            const { w, h } = room();
            const axis = w < min ? ['left', 'right'] : h < min ? ['top', 'bottom'] : null;
            if (!axis) break;
            const open = axis.filter((seat) => used.includes(seat) && seat !== keep && !folded.has(seat) && !result.has(seat));
            if (!open.length) break;
            result.add(open[0]);
        }
        return result;
    }

    /** A length in rem that styles.css keeps in a custom property of the workspace, in px. */
    function remVar(name, fallback) {
        const raw = parseFloat(getComputedStyle(workspace).getPropertyValue(name));
        return (Number.isFinite(raw) ? raw : fallback) * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
    }

    /** Works out which seats fold for lack of room. */
    function squeeze(inUse) {
        squeezed = fitFolded({
            width: workspace.clientWidth,
            height: workspace.clientHeight,
            used: inUse,
            folded: collapsed,
            pinned,
            band: remVar('--tray-band', 10.5),
            bandFolded: remVar('--tray-band-collapsed', 3.8),
            min: MIN_BOARD_PX
        });
    }

    /** Room the board gives up on each used edge (CSS variables on the workspace, read by styles.css). */
    function updateInsets(visible) {
        if (!workspace) return;
        const inUse = visible ? seatsInUse() : [];
        if (visible) squeeze(inUse); else squeezed = new Set();
        for (const seat of Config.SEATS) {
            const name = `--tray-${seat}`;
            if (inUse.includes(seat)) workspace.style.setProperty(name, isFolded(seat) ? 'var(--tray-band-collapsed)' : 'var(--tray-band)');
            else workspace.style.removeProperty(name);
        }
    }

    function setVisible(on) {
        if (!layer) return;
        layer.hidden = !on;
        updateInsets(on);
        if (on) render();
        else layer.innerHTML = '';
    }

    // ---- Building a tray -------------------------------------------------------------------------

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function buildPieces(player, game) {
        const name = Players.colorName(player.color);
        const wrap = el('div', 'tray-pieces');
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', `${name} pieces in the tray`);
        const groups = game ? Play.trayGroups(game, player.color) : [];
        if (!groups.length) {
            wrap.appendChild(el('span', 'tray-empty', game && game.pieces.some((p) => Players.same(p.color, player.color)) ? 'All out' : 'No pieces'));
            return wrap;
        }
        for (const group of groups) {
            const button = el('button', 'tray-piece');
            button.type = 'button';
            button.dataset.color = player.color;
            button.dataset.kind = group.kind;
            button.dataset.key = `piece:${key(player.color)}:${group.kind}`;
            button.setAttribute('aria-label', `${name} ${kindLabel(group.kind).toLowerCase()}, ${group.count} in the tray. Activate to send one to a start.`);
            const img = el('img', 'tray-piece-img');
            img.alt = '';
            img.draggable = false;
            img.src = Pieces.iconUrl(group.kind, player.color);
            button.append(img, el('span', 'tray-count', String(group.count)));
            wrap.appendChild(button);
        }
        return wrap;
    }

    function buildDice(player, game) {
        const name = Players.colorName(player.color);
        const dice = AppState.getState().dice;
        const wrap = el('div', 'tray-dice');
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', `${name} dice`);
        for (const die of dice) {
            const button = el('button', 'die', Dice.label(die.sides));
            button.type = 'button';
            button.dataset.color = player.color;
            button.dataset.sides = String(die.sides);
            button.dataset.key = `die:${key(player.color)}:${die.sides}`;
            button.setAttribute('aria-label', `Roll a ${Dice.label(die.sides)} for ${name}`);
            wrap.appendChild(button);
        }
        const result = el('div', 'roll-result');
        const latest = game ? Play.latestRoll(game, player.color) : null;
        if (latest) {
            result.appendChild(el('span', 'roll-die', Dice.label(latest.sides)));
            result.appendChild(el('span', 'roll-value', String(latest.value)));
            result.setAttribute('aria-label', `${name} rolled ${Dice.label(latest.sides)}: ${latest.value}`);
            if (rolledColor && Players.same(rolledColor, player.color)) result.classList.add('rolled');
        }
        wrap.appendChild(result);
        return wrap;
    }

    function buildTray(player, seat, game) {
        const name = Players.colorName(player.color);
        const tray = el('section', 'tray');
        tray.dataset.color = player.color;
        tray.style.setProperty('--player', player.color);
        tray.setAttribute('aria-label', `${name} tray`);

        const head = el('header', 'tray-head');
        head.appendChild(el('span', 'tray-dot'));
        head.appendChild(el('h3', 'tray-name', name));
        const toggle = el('button', 'tray-toggle');
        toggle.type = 'button';
        const isCollapsed = isFolded(seat);
        toggle.dataset.seat = seat;
        toggle.dataset.key = `toggle:${seat}`;
        toggle.setAttribute('aria-expanded', String(!isCollapsed));
        toggle.setAttribute('aria-label', `${isCollapsed ? 'Show' : 'Hide'} the ${seat} tray`);
        toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>';
        head.appendChild(toggle);
        tray.appendChild(head);

        const body = el('div', 'tray-body');
        body.appendChild(buildPieces(player, game));
        body.appendChild(buildDice(player, game));
        const note = notes.get(key(player.color));
        const noteEl = el('p', 'tray-note', note || '');
        noteEl.hidden = !note;
        body.appendChild(noteEl);
        tray.appendChild(body);
        return tray;
    }

    // ---- Rendering --------------------------------------------------------------------------------

    function render() {
        if (!layer || layer.hidden) return;
        const state = AppState.getState();
        if (!state.playtest) return;
        const focusKey = document.activeElement && layer.contains(document.activeElement) ? document.activeElement.dataset.key : null;
        layer.innerHTML = '';
        const seats = seatsInUse();
        updateInsets(true);
        for (const seat of seats) {
            const seatEl = el('div', `tray-seat seat-${seat}`);
            seatEl.dataset.seat = seat;
            if (isFolded(seat)) seatEl.classList.add('collapsed');
            state.players.filter((p) => p.seat === seat).forEach((p) => seatEl.appendChild(buildTray(p, seat, state.play)));
            layer.appendChild(seatEl);
        }
        rolledColor = null;
        if (focusKey) {
            const again = Array.from(layer.querySelectorAll('[data-key]')).find((node) => node.dataset.key === focusKey);
            // A group that was used up has no button any more: focus moves to the next one in its tray.
            (again || layer.querySelector(`[data-key^="${focusKey.split(':').slice(0, 2).join(':')}"]`))?.focus();
        }
    }

    function say(text) {
        if (typeof Playtest !== 'undefined') Playtest.announce(text);
    }

    function showNote(color, text) {
        notes.set(key(color), text);
        render();
        setTimeout(() => {
            if (notes.get(key(color)) === text) {
                notes.delete(key(color));
                render();
            }
        }, 4000);
    }

    // ---- Actions ------------------------------------------------------------------------------------

    /** A click on a tray piece: send one to the first free start of its colour. */
    function sendFromTray(color, kind) {
        const state = AppState.getState();
        if (!state.play) return;
        const name = Players.colorName(color);
        const result = Play.sendToStart(state.play, state.polygons, color, kind);
        if (!result.ok) {
            if (result.reason === 'no-start') {
                const text = `No free start for ${name}. Drag the piece onto the board.`;
                showNote(color, text);
                say(text);
            }
            return;
        }
        AppState.setSelectedPiece(result.pieceId);
        const tile = state.polygons.find((p) => p.id === result.tileId);
        say(`${name} ${kindLabel(kind).toLowerCase()} placed at ${tile ? Pieces.tileLabel(state.polygons, tile) : 'its start'}.`);
        Playtest.refresh();
    }

    function rollDie(color, sides) {
        const state = AppState.getState();
        if (!state.play) return;
        const value = Play.roll(state.play, color, sides);
        rolledColor = color;
        say(`${Players.colorName(color)} rolled ${Dice.label(sides)}: ${value}.`);
        render();
    }

    function toggleSeat(seat) {
        if (isFolded(seat)) {
            collapsed.delete(seat);
            pinned = seat;
        } else {
            collapsed.add(seat);
            if (pinned === seat) pinned = null;
        }
        updateInsets(true);
        render();
        // The board gets a new size, so it is laid out again.
        window.dispatchEvent(new Event('resize'));
    }

    // ---- Pointer and click -----------------------------------------------------------------------------

    // The control each pointer went down on (dice and fold buttons; pieces are tracked by PlaytestDrag).
    const pressed = new Map();
    // The control a pointer release just acted on, so the click that follows it is not acted on twice.
    let acted = { key: null, at: 0 };
    const CLICK_AFTER_MS = 1000;

    /**
     * The control a pointer was released on, when it is the one it went down on. Another finger's tap may
     * have redrawn the trays in between, so the control is found again by its key.
     */
    function releasedOn(event, control) {
        const live = control.isConnected ? control : Array.from(layer.querySelectorAll('[data-key]')).find((n) => n.dataset.key === control.dataset.key);
        const under = document.elementFromPoint(event.clientX, event.clientY);
        return live && under && live.contains(under) ? live : null;
    }

    function act(control) {
        acted = { key: control.dataset.key, at: Date.now() };
        if (control.classList.contains('tray-piece')) sendFromTray(control.dataset.color, control.dataset.kind);
        else if (control.classList.contains('die')) rollDie(control.dataset.color, Number(control.dataset.sides));
        else if (control.classList.contains('tray-toggle')) toggleSeat(control.dataset.seat);
    }

    function onPointerDown(event) {
        const control = event.target.closest('.die, .tray-toggle');
        if (control && event.button === 0) pressed.set(event.pointerId, control);
    }

    function onPointerUp(event) {
        const control = pressed.get(event.pointerId);
        pressed.delete(event.pointerId);
        const live = control && releasedOn(event, control);
        if (live) act(live);
    }

    /** PlaytestDrag: a tap on a tray piece (pressed and released without dragging) sends it to a start. */
    function tapPiece(event, button) {
        const live = button && releasedOn(event, button);
        if (live) act(live);
    }

    function onClick(event) {
        const control = event.target.closest('.tray-piece, .die, .tray-toggle');
        if (!control) return;
        // A click that follows a pointer release already did its work. Clicks from the keyboard or a screen
        // reader (detail 0), or that nothing preceded, act here.
        if (event.detail > 0 && acted.key === control.dataset.key && Date.now() - acted.at < CLICK_AFTER_MS) return;
        // A drag that just ended also produces a click on the piece; that is not a request to place it.
        if (control.classList.contains('tray-piece') && typeof PlaytestDrag !== 'undefined' && PlaytestDrag.consumeClick()) return;
        act(control);
    }

    function init() {
        layer = $('trayLayer');
        workspace = layer ? layer.parentElement : null;
        if (!layer) return;
        layer.addEventListener('click', onClick);
        layer.addEventListener('pointerdown', onPointerDown);
        layer.addEventListener('pointerup', onPointerUp);
        layer.addEventListener('pointercancel', (event) => pressed.delete(event.pointerId));
        window.addEventListener('pg:playerschange', () => { if (AppState.getState().playtest) render(); });
        // A new window size can leave the board too small (or give room back): fold or unfold trays to fit.
        window.addEventListener('resize', () => {
            if (layer.hidden || !AppState.getState().playtest) return;
            const before = [...squeezed].join();
            updateInsets(true);
            if ([...squeezed].join() === before) return;
            render();
            window.dispatchEvent(new Event('resize'));
        });
    }

    return { init, render, setVisible, sendFromTray, rollDie, updateInsets, tapPiece, fitFolded };
})();
