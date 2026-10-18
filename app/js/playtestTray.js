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
 * The trays are real buttons, so keyboard and screen readers work. Everything is drawn from AppState
 * (players, the running game) and rebuilt by render() after every change.
 */
const PlaytestTray = (() => {
    const $ = (id) => document.getElementById(id);
    let layer = null;
    let workspace = null;
    // Seats whose trays are folded to a title bar to give the board more room.
    const collapsed = new Set();
    // A short message per player colour ("No free start for Red.") that fades away.
    const notes = new Map();
    let rolledColor = null;

    const kindLabel = (kind) => (Config.PIECE_KINDS.find((k) => k.id === kind) || { label: kind }).label;
    const key = (color) => String(color).toLowerCase();

    function seatsInUse() {
        const used = new Set(AppState.getState().players.map((p) => p.seat));
        return Config.SEATS.filter((seat) => used.has(seat));
    }

    /** Room the board gives up on each used edge (CSS variables on the workspace, read by styles.css). */
    function updateInsets(visible) {
        if (!workspace) return;
        const inUse = visible ? seatsInUse() : [];
        for (const seat of Config.SEATS) {
            const name = `--tray-${seat}`;
            if (inUse.includes(seat)) workspace.style.setProperty(name, collapsed.has(seat) ? 'var(--tray-band-collapsed)' : 'var(--tray-band)');
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
        const isCollapsed = collapsed.has(seat);
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
            if (collapsed.has(seat)) seatEl.classList.add('collapsed');
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
        say(`${name} ${kindLabel(kind).toLowerCase()} placed at ${tile ? Pieces.tileLabel(state.polygons, tile, state.labels, state.boardConfig.boardShape) : 'its start'}.`);
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
        if (collapsed.has(seat)) collapsed.delete(seat); else collapsed.add(seat);
        updateInsets(true);
        render();
        // The board gets a new size, so it is laid out again.
        window.dispatchEvent(new Event('resize'));
    }

    function onClick(event) {
        const piece = event.target.closest('.tray-piece');
        if (piece) {
            // A drag that just ended also produces a click on the piece; that is not a request to place it.
            if (typeof PlaytestDrag !== 'undefined' && PlaytestDrag.consumeClick()) return;
            sendFromTray(piece.dataset.color, piece.dataset.kind);
            return;
        }
        const die = event.target.closest('.die');
        if (die) {
            rollDie(die.dataset.color, Number(die.dataset.sides));
            return;
        }
        const toggle = event.target.closest('.tray-toggle');
        if (toggle) toggleSeat(toggle.dataset.seat);
    }

    function init() {
        layer = $('trayLayer');
        workspace = layer ? layer.parentElement : null;
        if (!layer) return;
        layer.addEventListener('click', onClick);
        window.addEventListener('pg:playerschange', () => { if (AppState.getState().playtest) render(); });
    }

    return { init, render, setVisible, sendFromTray, rollDie, updateInsets };
})();
