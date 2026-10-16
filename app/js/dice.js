/**
 * PROTOGAMES DICE
 * --------------------------------------------------------------
 * Rolling dice for playtest. Pure functions (no DOM), unit-tested in Node.
 *
 * The random source is a function returning a uniformly random unsigned 32-bit
 * integer, so tests (and, later, seeded replays) can pass their own. The default
 * is crypto.getRandomValues. A value in [1, sides] is drawn by rejection
 * sampling, so no face is favoured when `sides` does not divide 2^32.
 */
const Dice = (() => {
    const RANGE = 2 ** 32;
    const MIN_SIDES = 2;
    const MAX_SIDES = 1000;

    /** A uniformly random unsigned 32-bit integer from the browser's secure generator. */
    function secureRandom32() {
        const cryptoSource = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
        if (cryptoSource && typeof cryptoSource.getRandomValues === 'function') {
            return cryptoSource.getRandomValues(new Uint32Array(1))[0];
        }
        return Math.floor(Math.random() * RANGE);
    }

    function isValidSides(sides) {
        return Number.isInteger(sides) && sides >= MIN_SIDES && sides <= MAX_SIDES;
    }

    /** A uniformly random integer in [0, max). */
    function randomInt(max, random32 = secureRandom32) {
        if (!Number.isInteger(max) || max < 1 || max > RANGE) throw new RangeError(`Cannot draw a number below ${max}.`);
        // Draws at or above the limit would make the low values more likely, so they are thrown away.
        const limit = RANGE - (RANGE % max);
        for (;;) {
            const value = random32();
            if (value < limit) return value % max;
        }
    }

    /** Rolls one die with `sides` faces: an integer from 1 to `sides`. */
    function roll(sides, random32 = secureRandom32) {
        if (!isValidSides(sides)) throw new RangeError(`A die needs a whole number of sides from ${MIN_SIDES} to ${MAX_SIDES}.`);
        return randomInt(sides, random32) + 1;
    }

    /** "d6" for a die with six sides. */
    function label(sides) {
        return `d${sides}`;
    }

    return { MIN_SIDES, MAX_SIDES, secureRandom32, isValidSides, randomInt, roll, label };
})();
