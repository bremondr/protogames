'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('./support/load');

const app = loadApp(['js/config.js', 'js/dice.js', 'js/play.js']);
const Play = app.run('Play');

const RED = '#c62828';
const BLUE = '#1565c0';
const players = () => [
    { color: RED, seat: 'bottom', pieces: [{ kind: 'pawn', count: 2 }, { kind: 'cube', count: 1 }] },
    { color: BLUE, seat: 'top', pieces: [{ kind: 'pawn', count: 1 }] }
];
const tiles = (...spec) => spec.map(([id, start]) => ({ id, ...(start ? { start } : {}) }));
const BOARD = tiles(['t1', RED], ['t2', RED], ['t3', BLUE], ['t4']);
const ids = () => new Set(BOARD.map((t) => t.id));

test('a new game puts every piece of every player in its tray', () => {
    const play = Play.create(players());
    assert.equal(play.pieces.length, 4);
    assert.ok(play.pieces.every((p) => p.tileId === null));
    assert.deepEqual(plain(play.pieces.map((p) => [p.kind, p.color])), [['pawn', RED], ['pawn', RED], ['cube', RED], ['pawn', BLUE]]);
    assert.equal(new Set(play.pieces.map((p) => p.id)).size, 4, 'ids are unique');
    assert.equal(play.moves, 0);
});

test('trays group pieces by kind and only list what is still in the tray', () => {
    const play = Play.create(players());
    assert.deepEqual(plain(Play.trayGroups(play, RED).map(({ kind, count }) => ({ kind, count }))), [{ kind: 'pawn', count: 2 }, { kind: 'cube', count: 1 }]);
    Play.move(play, play.pieces[0].id, 't4');
    assert.equal(Play.trayGroups(play, RED.toUpperCase())[0].count, 1, 'colours match whatever the case');
    assert.deepEqual(plain(Play.trayGroups(play, '#00ff00')), []);
});

test('sending a piece from the tray puts it on the first free start of its colour', () => {
    const play = Play.create(players());
    const first = Play.sendToStart(play, BOARD, RED, 'pawn');
    assert.deepEqual(plain(first), { ok: true, pieceId: play.pieces[0].id, tileId: 't1' });
    const second = Play.sendToStart(play, BOARD, RED, 'pawn');
    assert.equal(second.tileId, 't2', 't1 is taken');
    assert.equal(Play.sendToStart(play, BOARD, RED, 'cube').ok, false, 'both red starts are taken');
    assert.equal(Play.sendToStart(play, BOARD, RED, 'cube').reason, 'no-start');
    assert.equal(Play.sendToStart(play, BOARD, RED, 'pawn').reason, 'no-piece', 'no red pawn is left in the tray');
    assert.equal(Play.sendToStart(play, BOARD, BLUE, 'pawn').tileId, 't3');
    assert.equal(play.moves, 3);
});

test('a start is taken by a piece of any colour, and free again once it leaves', () => {
    const play = Play.create(players());
    const blue = play.pieces.find((p) => p.color === BLUE);
    Play.move(play, blue.id, 't1');
    assert.equal(Play.firstFreeStart(play, BOARD, RED), 't2', 'a blue piece stands on t1');
    Play.move(play, blue.id, null);
    assert.equal(Play.firstFreeStart(play, BOARD, RED), 't1');
});

test('a colour without start markers gets no free start', () => {
    const play = Play.create(players());
    assert.equal(Play.firstFreeStart(play, tiles(['a'], ['b']), RED), null);
    assert.equal(Play.sendToStart(play, tiles(['a']), RED, 'pawn').reason, 'no-start');
});

test('a piece can be dragged anywhere and back into the tray', () => {
    const play = Play.create(players());
    const piece = play.pieces[0];
    assert.equal(Play.move(play, piece.id, 't4'), true);
    assert.equal(piece.tileId, 't4');
    assert.equal(Play.move(play, piece.id, 't4'), false, 'no change, no step');
    assert.equal(Play.move(play, piece.id, null), true);
    assert.equal(piece.tileId, null);
    assert.equal(Play.move(play, 'nope', 't1'), false);
    assert.equal(play.undo.length, 2);
    // Several pieces may share a tile.
    Play.move(play, play.pieces[0].id, 't4');
    Play.move(play, play.pieces[1].id, 't4');
    assert.equal(Play.piecesOn(play, 't4').length, 2);
});

test('undo and redo walk through the moves, and a new move ends the redo line', () => {
    const play = Play.create(players());
    const [a, b] = play.pieces;
    Play.move(play, a.id, 't1');
    Play.move(play, b.id, 't2');
    Play.move(play, a.id, 't4');
    assert.equal(play.moves, 3);
    Play.undo(play);
    assert.equal(a.tileId, 't1');
    Play.undo(play);
    assert.equal(b.tileId, null);
    assert.equal(play.moves, 1);
    Play.redo(play);
    assert.equal(b.tileId, 't2');
    Play.move(play, b.id, 't3');
    assert.equal(Play.redo(play), null, 'a new move discards what could be redone');
    Play.undo(play); Play.undo(play); Play.undo(play);
    assert.equal(Play.undo(play), null, 'nothing left to undo');
    assert.ok(play.pieces.every((p) => p.tileId === null));
    assert.equal(play.moves, 0);
});

test('reset puts everything back in the trays and clears history and rolls', () => {
    const play = Play.create(players());
    Play.sendToStart(play, BOARD, RED, 'pawn');
    Play.roll(play, RED, 6, () => 0);
    Play.reset(play);
    assert.ok(play.pieces.every((p) => p.tileId === null));
    assert.deepEqual(plain({ u: play.undo, r: play.redo, m: play.moves, l: play.rolls }), { u: [], r: [], m: 0, l: {} });
});

test('rolls are remembered per player, are not moves, and cannot be undone', () => {
    const play = Play.create(players());
    assert.equal(Play.latestRoll(play, RED), null);
    assert.equal(Play.roll(play, RED, 6, () => 4), 5);
    assert.equal(Play.roll(play, BLUE.toUpperCase(), 20, () => 0), 1);
    assert.deepEqual(plain(Play.latestRoll(play, RED)), { sides: 6, value: 5 });
    assert.deepEqual(plain(Play.latestRoll(play, BLUE)), { sides: 20, value: 1 });
    assert.equal(Play.roll(play, RED, 8, () => 7), 8);
    assert.deepEqual(plain(Play.latestRoll(play, RED)), { sides: 8, value: 8 }, 'the latest roll replaces the earlier one');
    assert.equal(play.moves, 0);
    assert.equal(play.undo.length, 0);
    assert.equal(Play.undo(play), null);
    assert.equal(Play.latestRoll(play, RED).value, 8, 'undo did not re-roll');
    assert.throws(() => Play.roll(play, RED, 1), (error) => error.name === 'RangeError');
});

test('sync keeps a running game while the players are the same', () => {
    const play = Play.create(players());
    Play.sendToStart(play, BOARD, RED, 'pawn');
    const same = Play.sync(play, players(), ids());
    assert.equal(same, play);
    assert.equal(play.pieces[0].tileId, 't1');
});

test('sync sends pieces on tiles that vanished back to their trays and drops the move history', () => {
    const play = Play.create(players());
    Play.sendToStart(play, BOARD, RED, 'pawn');
    Play.sendToStart(play, BOARD, RED, 'pawn');
    Play.sync(play, players(), new Set(['t2', 't3', 't4']));
    assert.equal(play.pieces[0].tileId, null);
    assert.equal(play.pieces[1].tileId, 't2');
    assert.equal(play.undo.length, 0);
});

test('sync starts a new game when the piece set changed', () => {
    const play = Play.create(players());
    Play.sendToStart(play, BOARD, RED, 'pawn');
    const changed = players();
    changed[0].pieces[0].count = 3;
    const next = Play.sync(play, changed, ids());
    assert.notEqual(next, play);
    assert.equal(next.pieces.length, 5);
    assert.ok(next.pieces.every((p) => p.tileId === null));
    assert.notEqual(Play.signature(players()), Play.signature(changed));
    assert.equal(Play.sync(null, players(), ids()).pieces.length, 4, 'no game yet: a new one');
    // The seat does not change which pieces exist.
    const moved = players();
    moved[0].seat = 'left';
    assert.equal(Play.signature(moved), Play.signature(players()));
});

test('every seat has a rotation that makes the tray face the person sitting there', () => {
    assert.deepEqual(plain(Play.SEAT_ROTATION), { bottom: 0, top: 180, left: 90, right: -90 });
});
