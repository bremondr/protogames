/**
 * PROTOGAMES PLAYERS
 * --------------------------------------------------------------
 * Pure helpers for the players of a design: [{ color, seat, pieces: [{ kind, count }] }].
 * A player is a colour with a seat (the screen edge they sit at) and a piece set. Every
 * function returns a new list and leaves its input alone, so the players panel can keep the
 * result without worrying about shared objects. Unit-tested in Node; no DOM.
 */
const Players = (() => {
    const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

    const clone = (players) => JSON.parse(JSON.stringify(players));

    /** How many pieces the design has in total, over all players. */
    function totalPieces(players) {
        return players.reduce((sum, player) => sum + player.pieces.reduce((inner, entry) => inner + entry.count, 0), 0);
    }

    /** The first colour of the palette no player has, or null when all are taken. */
    function freeColor(players) {
        const match = Config.PLAYER_COLORS.find((c) => !players.some((p) => same(p.color, c.hex)));
        return match ? match.hex : null;
    }

    /** The first seat nobody sits at; with all four taken they are handed out again in turn. */
    function nextSeat(players) {
        const free = Config.SEATS.find((seat) => !players.some((p) => p.seat === seat));
        return free || Config.SEATS[players.length % Config.SEATS.length];
    }

    /** Adds a player with the first free colour and seat and four pawns. Returns the list unchanged when there is no room. */
    function addPlayer(players) {
        const color = freeColor(players);
        const room = Config.MAX_PIECES - totalPieces(players);
        if (!color || players.length >= Config.MAX_PLAYERS || room < 1) return clone(players);
        const count = Math.min(4, room);
        return [...clone(players), { color, seat: nextSeat(players), pieces: [{ kind: Config.PIECE_KINDS[0].id, count }] }];
    }

    function removePlayer(players, color) {
        return clone(players.filter((p) => !same(p.color, color)));
    }

    function setSeat(players, color, seat) {
        if (!Config.SEATS.includes(seat)) return clone(players);
        return clone(players).map((p) => (same(p.color, color) ? { ...p, seat } : p));
    }

    /** Gives a player another colour; refused (list unchanged) when another player already has it. */
    function setColor(players, color, nextColor) {
        const valid = Config.PLAYER_COLORS.some((c) => same(c.hex, nextColor));
        if (!valid || (!same(color, nextColor) && players.some((p) => same(p.color, nextColor)))) return clone(players);
        return clone(players).map((p) => (same(p.color, color) ? { ...p, color: nextColor } : p));
    }

    /**
     * Sets how many pieces of a kind a player has: adds the kind when it is new, removes it at 0.
     * The count is whole, never below 0, and limited by what is left of the design's total.
     */
    function setCount(players, color, kind, count) {
        if (!Config.PIECE_KINDS.some((k) => k.id === kind)) return clone(players);
        const next = clone(players);
        const player = next.find((p) => same(p.color, color));
        if (!player) return next;
        const wanted = Math.max(0, Math.floor(Number(count) || 0));
        const entry = player.pieces.find((e) => e.kind === kind);
        const others = totalPieces(next) - (entry ? entry.count : 0);
        const value = Math.min(wanted, Math.max(0, Config.MAX_PIECES - others));
        if (entry) entry.count = value;
        else if (value > 0) player.pieces.push({ kind, count: value });
        player.pieces = player.pieces.filter((e) => e.count > 0);
        // Keep the order of Config.PIECE_KINDS so the panel and the tray never jump around.
        const order = Config.PIECE_KINDS.map((k) => k.id);
        player.pieces.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
        return next;
    }

    /**
     * Gentle hints for the players panel (they never block saving): a start marker whose colour belongs to
     * nobody, a player without start markers, and a player without pieces.
     * @returns {string[]}
     */
    function hints(players, polygons) {
        const out = [];
        const startColors = [];
        for (const polygon of polygons) {
            if (polygon.start && !startColors.some((c) => same(c, polygon.start))) startColors.push(polygon.start);
        }
        for (const color of startColors) {
            if (!players.some((p) => same(p.color, color))) out.push(`${colorName(color)} start markers have no player; add one in that colour or clear them.`);
        }
        for (const player of players) {
            const name = colorName(player.color);
            if (!player.pieces.length) out.push(`${name} has no pieces.`);
            else if (!polygons.some((p) => p.start && same(p.start, player.color))) out.push(`${name} has no start markers: its pieces are placed by hand.`);
        }
        return out;
    }

    function colorName(hex) {
        const match = Config.PLAYER_COLORS.find((c) => same(c.hex, hex));
        return match ? match.name : hex;
    }

    return { same, totalPieces, freeColor, nextSeat, addPlayer, removePlayer, setSeat, setColor, setCount, hints, colorName };
})();
