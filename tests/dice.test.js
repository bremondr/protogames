'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./support/load');

const Dice = loadApp(['app/js/dice.js']).run('Dice');
// Errors made inside the script context are of another realm, so instanceof cannot be used.
const isRangeError = (error) => error.name === 'RangeError';

/** A random source that hands out the given values in turn, then repeats the last one. */
const source = (...values) => {
    let i = 0;
    return () => values[Math.min(i++, values.length - 1)];
};

test('a roll is a whole number from 1 to the number of sides', () => {
    for (const sides of [2, 3, 4, 6, 8, 10, 12, 20, 100, 1000]) {
        for (let i = 0; i < 200; i++) {
            const value = Dice.roll(sides);
            assert.ok(Number.isInteger(value) && value >= 1 && value <= sides, `d${sides} gave ${value}`);
        }
    }
});

test('every face can come up, the lowest and the highest included', () => {
    assert.equal(Dice.roll(6, source(0)), 1);
    assert.equal(Dice.roll(6, source(5)), 6);
    const faces = new Set();
    for (let raw = 0; raw < 20; raw++) faces.add(Dice.roll(20, source(raw)));
    assert.equal(faces.size, 20);
});

test('draws that would favour the low faces are thrown away and drawn again', () => {
    // 2^32 = 3 * 1431655765 + 1, so for a d3 the single value 4294967295 is not allowed.
    const calls = [];
    const random = () => {
        calls.push(calls.length);
        return calls.length === 1 ? 2 ** 32 - 1 : 7; // 7 % 3 = 1, so the face is 2
    };
    assert.equal(Dice.roll(3, random), 2);
    assert.equal(calls.length, 2, 'the first draw was refused');
    // For a d6 the refused values are the last 4 of the range (2^32 mod 6 = 4).
    assert.equal(Dice.roll(6, source(2 ** 32 - 4, 0)), 1);
    assert.equal(Dice.roll(6, source(2 ** 32 - 5)), 6, 'a draw just below the limit is accepted');
});

test('with an even random source every face comes up about equally often', () => {
    // A simple deterministic generator (not for production): enough to check the spread.
    let seed = 12345;
    const lcg = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed;
    };
    const counts = new Array(7).fill(0);
    const rolls = 60000;
    for (let i = 0; i < rolls; i++) counts[Dice.roll(6, lcg)]++;
    for (let face = 1; face <= 6; face++) {
        const share = counts[face] / rolls;
        assert.ok(Math.abs(share - 1 / 6) < 0.01, `face ${face} came up ${(share * 100).toFixed(1)}% of the time`);
    }
});

test('a die needs a whole number of sides from 2 to 1000', () => {
    for (const bad of [0, 1, -3, 1001, 2.5, NaN, Infinity, '6', null, undefined]) {
        assert.equal(Dice.isValidSides(bad), false, String(bad));
        assert.throws(() => Dice.roll(bad), isRangeError, String(bad));
    }
    assert.equal(Dice.isValidSides(2), true);
    assert.equal(Dice.isValidSides(1000), true);
});

test('randomInt refuses a range it cannot cover', () => {
    assert.throws(() => Dice.randomInt(0), isRangeError);
    assert.throws(() => Dice.randomInt(1.5), isRangeError);
    assert.equal(Dice.randomInt(1, source(123456)), 0);
});

test('labels read like the dice on a table', () => {
    assert.equal(Dice.label(6), 'd6');
    assert.equal(Dice.label(20), 'd20');
});

test('the default random source works with and without the secure generator', () => {
    const plain = loadApp(['app/js/dice.js'], { crypto: undefined }).run('Dice');
    for (let i = 0; i < 50; i++) assert.ok(plain.roll(6) >= 1);
    const secure = loadApp(['app/js/dice.js'], { crypto: { getRandomValues: (array) => { array[0] = 41; return array; } } }).run('Dice');
    assert.equal(secure.roll(20), (41 % 20) + 1);
});
