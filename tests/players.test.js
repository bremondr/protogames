'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('./support/load');

const app = loadApp(['js/config.js', 'js/players.js']);
const Players = app.run('Players');
const Config = app.run('Config');
const add = (players) => plain(Players.addPlayer(players));

test('the first player gets the first colour and seat and four pawns', () => {
    const players = add([]);
    assert.deepEqual(players, [{ color: Config.PLAYER_COLORS[0].hex, seat: 'bottom', pieces: [{ kind: 'pawn', count: 4 }] }]);
});

test('new players take the first free colour and seat, in order', () => {
    let players = [];
    for (let i = 0; i < 4; i++) players = add(players);
    assert.deepEqual(players.map((p) => p.seat), ['bottom', 'top', 'left', 'right']);
    assert.equal(new Set(players.map((p) => p.color)).size, 4);
});

test('with every seat taken, seats are handed out again in turn and colours stay unique', () => {
    let players = [];
    for (let i = 0; i < 6; i++) players = add(players);
    assert.deepEqual(players.map((p) => p.seat), ['bottom', 'top', 'left', 'right', 'bottom', 'top']);
    assert.equal(new Set(players.map((p) => p.color)).size, 6);
});

test('there are at most 8 players, and none can be added when no colour or piece is left', () => {
    let players = [];
    for (let i = 0; i < 12; i++) players = add(players);
    assert.equal(players.length, Config.MAX_PLAYERS);
    assert.equal(Players.freeColor(players), null);
    const input = [{ color: Config.PLAYER_COLORS[0].hex, seat: 'bottom', pieces: [{ kind: 'pawn', count: 500 }] }];
    assert.deepEqual(plain(Players.addPlayer(input)), input, 'the 500 pieces are used up');
});

test('a new player gets fewer pawns when the design is nearly full', () => {
    const input = [{ color: Config.PLAYER_COLORS[0].hex, seat: 'bottom', pieces: [{ kind: 'pawn', count: 498 }] }];
    const next = add(input);
    assert.equal(next[1].pieces[0].count, 2);
    assert.equal(Players.totalPieces(next), 500);
});

test('functions leave their input alone', () => {
    const input = add([]);
    const frozen = JSON.stringify(input);
    Players.addPlayer(input);
    Players.setSeat(input, input[0].color, 'top');
    Players.setCount(input, input[0].color, 'cube', 3);
    Players.removePlayer(input, input[0].color);
    assert.equal(JSON.stringify(input), frozen);
});

test('seats and colours can be changed, a colour only to one nobody has', () => {
    let players = add(add([]));
    const [a, b] = players.map((p) => p.color);
    players = plain(Players.setSeat(players, a, 'left'));
    assert.equal(players[0].seat, 'left');
    players = plain(Players.setSeat(players, a, 'diagonal'));
    assert.equal(players[0].seat, 'left', 'an unknown seat is ignored');
    assert.deepEqual(plain(Players.setColor(players, a, b)), players, 'a taken colour is refused');
    assert.deepEqual(plain(Players.setColor(players, a, '#123456')), players, 'a colour outside the palette is refused');
    const free = Players.freeColor(players);
    players = plain(Players.setColor(players, a, free));
    assert.equal(players[0].color, free);
});

test('counts add a kind, change it, and remove it at zero, always in palette order', () => {
    let players = add([]);
    const color = players[0].color;
    players = plain(Players.setCount(players, color, 'cube', 12));
    players = plain(Players.setCount(players, color, 'disc', 2));
    assert.deepEqual(players[0].pieces.map((e) => e.kind), ['pawn', 'disc', 'cube']);
    players = plain(Players.setCount(players, color, 'pawn', 0));
    assert.deepEqual(players[0].pieces, [{ kind: 'disc', count: 2 }, { kind: 'cube', count: 12 }]);
    players = plain(Players.setCount(players, color, 'cube', -5));
    assert.deepEqual(players[0].pieces, [{ kind: 'disc', count: 2 }]);
    players = plain(Players.setCount(players, color, 'disc', 2.9));
    assert.equal(players[0].pieces[0].count, 2, 'counts are whole');
    assert.deepEqual(plain(Players.setCount(players, color, 'dragon', 3)), players, 'an unknown kind is ignored');
    assert.deepEqual(plain(Players.setCount(players, '#abcdef', 'cube', 3)), players, 'an unknown player is ignored');
});

test('counts stop at what is left of the 500 pieces of the design', () => {
    let players = add(add([]));
    const [a, b] = players.map((p) => p.color);
    players = plain(Players.setCount(players, a, 'pawn', 400));
    players = plain(Players.setCount(players, b, 'pawn', 400));
    assert.equal(players[1].pieces[0].count, 100);
    assert.equal(Players.totalPieces(players), 500);
    players = plain(Players.setCount(players, a, 'pawn', 1000));
    assert.equal(players[0].pieces[0].count, 400, 'a player cannot take more than the rest of the design allows');
});

test('removing a player removes only that player', () => {
    const players = add(add([]));
    const left = plain(Players.removePlayer(players, players[0].color.toUpperCase()));
    assert.deepEqual(left, [players[1]]);
});

test('hints name start markers without a player, players without markers and players without pieces', () => {
    const red = Config.PLAYER_COLORS[0].hex;
    const blue = Config.PLAYER_COLORS[1].hex;
    const green = Config.PLAYER_COLORS[2].hex;
    const players = [
        { color: red, seat: 'bottom', pieces: [{ kind: 'pawn', count: 2 }] },
        { color: blue, seat: 'top', pieces: [] }
    ];
    const hints = Players.hints(players, [{ id: 'a', start: red.toUpperCase() }, { id: 'b', start: green }, { id: 'c' }]);
    assert.deepEqual(plain(hints), [
        'Green start markers have no player; add one in that colour or clear them.',
        'Blue has no pieces.'
    ]);
    assert.deepEqual(plain(Players.hints(players.slice(0, 1), [{ id: 'a' }])), ['Red has no start markers: its pieces are placed by hand.']);
    assert.deepEqual(plain(Players.hints([], [])), []);
});
