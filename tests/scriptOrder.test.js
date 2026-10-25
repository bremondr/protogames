'use strict';
/**
 * The page has no bundler: app/index.html lists every script and the browser runs them in that order. Nothing but
 * the list guarantees that a module is defined before the ones that use it while loading, so these tests pin the list:
 * every file is in it exactly once, the order rules that matter hold, and loading the list in a bare context works.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'app', 'index.html'), 'utf8');
const tags = [...html.matchAll(/<script\b([^>]*)>/gi)].map((m) => m[1]).filter((attrs) => /\bsrc="js\//.test(attrs));
const listed = tags.map((attrs) => 'app/' + /\bsrc="([^"]+)"/.exec(attrs)[1]);
const source = Object.fromEntries(listed.map((file) => [file, fs.readFileSync(path.join(ROOT, file), 'utf8')]));

/** Every .js file below app/js, as paths relative to the repository (forward slashes). */
function appScripts(dir = path.join(ROOT, 'app', 'js')) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return appScripts(full);
        return entry.name.endsWith('.js') ? [path.relative(ROOT, full).split(path.sep).join('/')] : [];
    });
}

test('every script under app/js is loaded by app/index.html exactly once, with defer, and every listed script exists', () => {
    const files = appScripts().sort();
    assert.ok(files.length > 30);
    for (const file of files) {
        assert.equal(listed.filter((entry) => entry === file).length, 1, `${file} appears once in app/index.html`);
    }
    assert.deepEqual([...listed].sort(), files, 'and nothing else is listed');
    assert.ok(tags.every((attrs) => /\bdefer\b/.test(attrs)), 'each tag has defer');
});

const at = (file) => {
    const index = listed.indexOf('app/js/' + file);
    assert.notEqual(index, -1, `${file} is listed`);
    return index;
};

/** [module, modules that must come after it, why]. Loading breaks (see the last test) when one of these is turned around. */
const RULES = [
    ['config.js', ['state.js', 'interactions.js', 'infinite.js'], 'they read Config while they load'],
    ['textureUtils.js', ['textures.js', 'objects.js'], 'both are built from TextureUtils'],
    ['utils.js', ['main.js'], 'Main takes Utils at start-up'],
    ['geometry/helpers.js', ['geometry/hex.js', 'geometry/triangle.js', 'geometry/square.js', 'geometry.js', 'infinite.js'], 'the tile shapes destructure the helpers'],
    ['geometry/neighbors.js', ['geometry.js'], 'Geometry re-exports the neighbour functions'],
    ['geometry.js', ['infinite.js', 'countryBoard.js', 'countryRegions.js'], 'they wrap Geometry.generateGrid'],
    ['state.js', ['infinite.js'], 'Infinite wraps the AppState setters'],
    ['viewMath.js', ['infinite.js'], 'Infinite wraps ViewMath.clampToBounds'],
    ['renderer.js', ['countryRegions.js'], 'CountryRegions wraps Renderer.paint'],
    ['countryBoard.js', ['countryRegions.js'], 'CountryRegions builds on CountryBoard']
];

test('the scripts are listed in an order where each module comes after the ones it is built from', () => {
    for (const [before, afters, why] of RULES) {
        for (const after of afters) assert.ok(at(before) < at(after), `${before} must come before ${after}: ${why}`);
    }
});

test('the helper modules come before every module that mentions them', () => {
    for (const [helper, name] of [['focusUtils.js', 'FocusUtils'], ['textureUtils.js', 'TextureUtils'], ['projectFormat.js', 'ProjectFormat']]) {
        const users = listed.filter((file) => file !== 'app/js/' + helper && new RegExp(`\\b${name}\\b`).test(source[file]));
        assert.ok(users.length >= 2, `${name} is used by something (${users.length})`);
        for (const user of users) assert.ok(at(helper) < listed.indexOf(user), `${helper} must come before ${user}`);
    }
});

// ---- Loading the list --------------------------------------------------------------------------------------------

/** A context with just enough of a browser that every module can run its start-up code. */
function makeContext() {
    const noop = () => {};
    const element = () => new Proxy(function () {}, {
        get: (target, key) => (key === 'classList' ? { add: noop, remove: noop, toggle: noop, contains: () => false } : key === 'style' || key === 'dataset' ? {} : key === Symbol.toPrimitive ? () => '' : noop),
        apply: () => element()
    });
    const document = {
        addEventListener: noop, removeEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        createElement: () => element(), body: element(), documentElement: element(), activeElement: null, readyState: 'loading', fonts: { ready: Promise.resolve() }
    };
    const context = {
        console, document, location: { search: '', hash: '', pathname: '/', href: 'http://localhost/' },
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop, length: 0, key: () => null }, history: { replaceState: noop },
        navigator: { userAgent: 'test', platform: 'test' }, matchMedia: () => ({ matches: false, addEventListener: noop }),
        setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop, requestAnimationFrame: noop,
        URL, Blob, Promise, TextEncoder, TextDecoder, structuredClone, crypto: { randomUUID: () => 'id' }, fetch: () => Promise.reject(new Error('offline')),
        CustomEvent: class {}, Event: class {}, atob, btoa, ResizeObserver: class { observe() {} }, Image: class {}, IntersectionObserver: class {}, MutationObserver: class { observe() {} }
    };
    context.window = context;
    context.globalThis = context;
    context.addEventListener = noop;
    context.removeEventListener = noop;
    context.dispatchEvent = noop;
    return vm.createContext(context);
}

/** Runs the scripts in this order; returns what went wrong while loading, as "file: message". */
function loadErrors(order) {
    const context = makeContext();
    const errors = [];
    for (const file of order) {
        try { vm.runInContext(source[file], context, { filename: file }); } catch (error) { errors.push(`${file}: ${String(error.message).split('\n')[0]}`); }
    }
    return errors;
}

test('all scripts load in the listed order without an error, in a context that has no page', () => {
    assert.deepEqual(loadErrors(listed), []);
});

test('the order rules are real: with a module moved in front of what it needs, loading fails loudly', () => {
    for (const [before, afters] of RULES) {
        for (const after of afters) {
            const moved = listed.filter((file) => file !== 'app/js/' + after);
            moved.splice(moved.indexOf('app/js/' + before), 0, 'app/js/' + after);
            assert.notDeepEqual(loadErrors(moved), [], `${after} loaded before ${before} should fail`);
        }
    }
});
