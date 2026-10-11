/**
 * PROTOGAMES PLAY STATE
 * --------------------------------------------------------------
 * The running playtest game, kept apart from the design and never saved. Pure functions
 * (no DOM), unit-tested in Node.
 *
 *   play = {
 *     signature,        // fingerprint of the players it was built from
 *     pieces: [{ id, kind, color, tileId }],   // tileId null = in the player's tray
 *     undo: [], redo: [],                       // piece moves only
 *     moves,            // moves made since the start or the last reset
 *     rolls: { <colour>: { sides, value } }     // each player's latest die roll
 *   }
 *
 * Every piece starts in its player's tray. A click sends it to a free start marker of its colour;
 * otherwise the player drags it anywhere. Rolls are not part of the move history, so undo can
 * never re-roll a die.
 */
const Play = (() => {
    const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
    const key = (color) => String(color).toLowerCase();
    const HISTORY_LIMIT = 200;

    /** Rotation (degrees, clockwise) that makes a tray face the person sitting at that screen edge. */
    const SEAT_ROTATION = Object.freeze({ bottom: 0, top: 180, left: 90, right: -90 });

    /** A fingerprint of the parts of the players that decide which pieces exist. */
    function signature(players) {
        return players
            .map((p) => `${key(p.color)}:${p.pieces.map((e) => `${e.kind}*${e.count}`).join(',')}`)
            .join('|');
    }

    /** A fresh game: every piece of every player in its tray. */
    function create(players) {
        const pieces = [];
        let n = 0;
        for (const player of players) {
            for (const entry of player.pieces) {
                for (let i = 0; i < entry.count; i++) {
                    n += 1;
                    pieces.push({ id: `pc_${n}`, kind: entry.kind, color: player.color, tileId: null });
                }
            }
        }
        return { signature: signature(players), pieces, undo: [], redo: [], moves: 0, rolls: {} };
    }

    /**
     * Brings a game up to date with the design. A changed piece set starts a new game (what was on
     * the board no longer means anything); otherwise only pieces standing on tiles that no longer
     * exist go back to their trays. Returns the game to keep.
     */
    function sync(play, players, tileIds) {
        if (!play || play.signature !== signature(players)) return create(players);
        const valid = tileIds instanceof Set ? tileIds : new Set(tileIds);
        let lost = false;
        for (const piece of play.pieces) {
            if (piece.tileId !== null && !valid.has(piece.tileId)) {
                piece.tileId = null;
                lost = true;
            }
        }
        if (lost) { play.undo = []; play.redo = []; }
        return play;
    }

    function piecesOn(play, tileId) {
        return play.pieces.filter((p) => p.tileId === tileId);
    }

    /** Tiles that hold at least one piece. */
    function occupiedTiles(play) {
        return new Set(play.pieces.filter((p) => p.tileId !== null).map((p) => p.tileId));
    }

    /** The pieces of a player that are still in the tray, grouped by kind: [{ kind, count, ids }]. */
    function trayGroups(play, color) {
        const groups = [];
        for (const piece of play.pieces) {
            if (piece.tileId !== null || !same(piece.color, color)) continue;
            let group = groups.find((g) => g.kind === piece.kind);
            if (!group) {
                group = { kind: piece.kind, count: 0, ids: [] };
                groups.push(group);
            }
            group.count += 1;
            group.ids.push(piece.id);
        }
        return groups;
    }

    /** The first start marker (in tile order) of a colour that has no piece on it, or null. */
    function firstFreeStart(play, polygons, color) {
        const taken = occupiedTiles(play);
        const match = polygons.find((p) => p.start && same(p.start, color) && !taken.has(p.id));
        return match ? match.id : null;
    }

    function find(play, pieceId) {
        return play.pieces.find((p) => p.id === pieceId) || null;
    }

    /** Moves a piece to a tile (or null for its tray) and records the step. Returns false when nothing changes. */
    function move(play, pieceId, tileId) {
        const piece = find(play, pieceId);
        const target = tileId === undefined ? null : tileId;
        if (!piece || piece.tileId === target) return false;
        play.undo.push({ id: pieceId, from: piece.tileId, to: target });
        if (play.undo.length > HISTORY_LIMIT) play.undo.shift();
        play.redo = [];
        piece.tileId = target;
        play.moves += 1;
        return true;
    }

    /**
     * Click on a tray piece: takes one piece of that colour and kind out of the tray and puts it on the
     * first free start of its colour. Returns { ok: true, pieceId, tileId } or { ok: false, reason }
     * where reason is 'no-piece' (the tray has none of that kind) or 'no-start' (no free start marker).
     */
    function sendToStart(play, polygons, color, kind) {
        const group = trayGroups(play, color).find((g) => g.kind === kind);
        if (!group) return { ok: false, reason: 'no-piece' };
        const tileId = firstFreeStart(play, polygons, color);
        if (tileId === null) return { ok: false, reason: 'no-start' };
        const pieceId = group.ids[0];
        move(play, pieceId, tileId);
        return { ok: true, pieceId, tileId };
    }

    function undo(play) {
        const step = play.undo.pop();
        if (!step) return null;
        const piece = find(play, step.id);
        if (piece) piece.tileId = step.from;
        play.redo.push(step);
        play.moves = Math.max(0, play.moves - 1);
        return step;
    }

    function redo(play) {
        const step = play.redo.pop();
        if (!step) return null;
        const piece = find(play, step.id);
        if (piece) piece.tileId = step.to;
        play.undo.push(step);
        play.moves += 1;
        return step;
    }

    /** Everything back in the trays, history and rolls cleared. */
    function reset(play) {
        play.pieces.forEach((p) => { p.tileId = null; });
        play.undo = [];
        play.redo = [];
        play.moves = 0;
        play.rolls = {};
    }

    /** Rolls a die for a player and remembers it as that player's latest roll. Not undoable. */
    function roll(play, color, sides, random32) {
        const value = Dice.roll(sides, random32);
        play.rolls[key(color)] = { sides, value };
        return value;
    }

    function latestRoll(play, color) {
        return play.rolls[key(color)] || null;
    }

    return {
        SEAT_ROTATION,
        signature,
        create,
        sync,
        piecesOn,
        occupiedTiles,
        trayGroups,
        firstFreeStart,
        find,
        move,
        sendToStart,
        undo,
        redo,
        reset,
        roll,
        latestRoll
    };
})();
