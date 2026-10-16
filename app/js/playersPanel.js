/**
 * PROTOGAMES PLAYERS PANEL
 * --------------------------------------------------------------
 * The "Players" panel in the sidebar: one card per player with a colour, a seat (the screen
 * edge they sit at in playtest) and how many pieces of each kind they have. Edits go straight to
 * AppState.players through the pure Players helpers and are saved with the design.
 *
 * Players are part of the design, not of the tile undo history: removing one is not undone with
 * Ctrl+Z. The panel tells everyone else about a change with the `pg:playerschange` event.
 */
const PlayersPanel = (() => {
    const $ = (id) => document.getElementById(id);
    let list = null;
    let hintsEl = null;
    let totalEl = null;
    let addButton = null;

    const SEAT_LABELS = { bottom: 'Bottom', top: 'Top', left: 'Left', right: 'Right' };
    const players = () => AppState.getState().players;

    /** Stores a new list and lets the rest of the app know. */
    function commit(next, { rerender = true } = {}) {
        AppState.setPlayers(next);
        AppState.markDirty();
        FileManager.autoSaveToLocalStorage(true);
        window.dispatchEvent(new CustomEvent('pg:playerschange', { detail: { rerender } }));
    }

    function option(value, label, selected) {
        const el = document.createElement('option');
        el.value = value;
        el.textContent = label;
        el.selected = selected;
        return el;
    }

    function renderCard(player, index) {
        const name = Players.colorName(player.color);
        const card = document.createElement('div');
        card.className = 'player-card';
        card.dataset.color = player.color;
        card.setAttribute('role', 'group');
        card.setAttribute('aria-label', `${name} player`);

        const head = document.createElement('div');
        head.className = 'player-head';
        const dot = document.createElement('span');
        dot.className = 'player-dot';
        dot.style.background = player.color;
        dot.setAttribute('aria-hidden', 'true');

        const color = document.createElement('select');
        color.className = 'player-color';
        color.setAttribute('aria-label', `Colour of player ${index + 1}`);
        Config.PLAYER_COLORS.forEach((c) => {
            const mine = Players.same(c.hex, player.color);
            if (mine || !players().some((p) => Players.same(p.color, c.hex))) color.appendChild(option(c.hex, c.name, mine));
        });

        const seat = document.createElement('select');
        seat.className = 'player-seat';
        seat.setAttribute('aria-label', `Seat of the ${name} player`);
        Config.SEATS.forEach((s) => seat.appendChild(option(s, SEAT_LABELS[s], s === player.seat)));

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'player-remove';
        remove.setAttribute('aria-label', `Remove the ${name} player`);
        remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
        head.append(dot, color, seat, remove);

        const pieces = document.createElement('div');
        pieces.className = 'player-pieces';
        Config.PIECE_KINDS.forEach((kind) => {
            const entry = player.pieces.find((e) => e.kind === kind.id);
            const label = document.createElement('label');
            label.className = 'piece-field';
            const text = document.createElement('span');
            text.textContent = kind.label;
            const input = document.createElement('input');
            input.type = 'number';
            input.min = '0';
            input.max = String(Config.MAX_PIECES);
            input.step = '1';
            input.value = String(entry ? entry.count : 0);
            input.dataset.kind = kind.id;
            input.setAttribute('aria-label', `${kind.label} pieces of the ${name} player`);
            label.append(text, input);
            pieces.appendChild(label);
        });
        card.append(head, pieces);
        return card;
    }

    function renderSummary() {
        const all = players();
        const total = Players.totalPieces(all);
        totalEl.textContent = all.length
            ? `${all.length} of ${Config.MAX_PLAYERS} players, ${total} of ${Config.MAX_PIECES} pieces.`
            : 'No players yet: playtest then only locks the board.';
        const notes = Players.hints(all, AppState.getState().polygons);
        hintsEl.textContent = notes.join(' ');
        hintsEl.hidden = notes.length === 0;
        addButton.disabled = all.length >= Config.MAX_PLAYERS || total >= Config.MAX_PIECES || !Players.freeColor(all);
    }

    function render() {
        if (!list) return;
        list.innerHTML = '';
        players().forEach((player, index) => list.appendChild(renderCard(player, index)));
        renderSummary();
    }

    function onChange(event) {
        const card = event.target.closest('.player-card');
        if (!card) return;
        const color = card.dataset.color;
        if (event.target.matches('.player-color')) {
            commit(Players.setColor(players(), color, event.target.value));
        } else if (event.target.matches('.player-seat')) {
            commit(Players.setSeat(players(), color, event.target.value), { rerender: false });
            renderSummary();
        } else if (event.target.matches('input[data-kind]')) {
            const next = Players.setCount(players(), color, event.target.dataset.kind, event.target.value);
            commit(next, { rerender: false });
            // A count the design has no room for is shown as it was kept.
            const kept = next.find((p) => Players.same(p.color, color));
            const entry = kept && kept.pieces.find((e) => e.kind === event.target.dataset.kind);
            event.target.value = String(entry ? entry.count : 0);
            renderSummary();
        }
    }

    function onClick(event) {
        const remove = event.target.closest('.player-remove');
        if (!remove) return;
        const card = remove.closest('.player-card');
        commit(Players.removePlayer(players(), card.dataset.color));
        addButton.focus();
    }

    function init() {
        list = $('playersList');
        hintsEl = $('playersHints');
        totalEl = $('playersTotal');
        addButton = $('addPlayer');
        if (!list || !addButton) return;
        list.addEventListener('change', onChange);
        list.addEventListener('click', onClick);
        addButton.addEventListener('click', () => {
            commit(Players.addPlayer(players()));
            const cards = list.querySelectorAll('.player-card');
            cards[cards.length - 1]?.querySelector('select')?.focus();
        });
        // Re-draw when the players change elsewhere (a file or link was opened) and when tiles get or lose
        // start markers, which the hints talk about.
        window.addEventListener('pg:playerschange', (event) => { if (!event.detail || event.detail.rerender !== false) render(); });
        window.addEventListener('pg:toolchange', renderSummary);
        window.addEventListener('pg:designchange', render);
        // Painting and undo add and remove start markers, which the hints talk about.
        document.addEventListener('pointerup', renderSummary);
        document.addEventListener('keyup', renderSummary);
        render();
    }

    return { init, render };
})();
