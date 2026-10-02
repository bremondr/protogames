'use strict';
/**
 * Loads the app's browser scripts (plain IIFE files, no modules) into an isolated
 * vm context so they can be unit-tested in Node without a DOM or a bundler.
 *
 * Usage:
 *   const app = loadApp(['js/config.js', 'js/geometry/helpers.js', ...]);
 *   app.run('Config.CANVAS_PADDING');      // evaluate an expression in the context
 *   app.context.Geometry                  // globals assigned to window/globalThis
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');

/** Scripts that make up the pure geometry layer, in load order. */
const GEOMETRY_SCRIPTS = [
    'js/config.js',
    'js/geometry/helpers.js',
    'js/geometry/hex.js',
    'js/geometry/triangle.js',
    'js/geometry/square.js',
    'js/geometry/neighbors.js',
    'js/geometry.js',
    'dev/geometry-checks.js'
];

function loadApp(scripts, globals) {
    const context = vm.createContext({ console, ...(globals || {}) });
    for (const relative of scripts) {
        const file = path.join(ROOT, relative);
        vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: relative });
    }
    return {
        context,
        run: (expression) => vm.runInContext(expression, context)
    };
}

function loadGeometry() {
    const app = loadApp(GEOMETRY_SCRIPTS);
    return {
        ...app,
        Config: app.run('Config'),
        Geometry: app.context.Geometry,
        Checks: app.context.GeometryChecks,
        Helpers: app.context.GeometryHelpers,
        Neighbors: app.context.GeometryNeighbors
    };
}

/**
 * Copies a value created inside the vm context into this realm. Arrays and
 * objects from another realm have a different prototype, which makes
 * assert.deepEqual (strict) reject structurally equal values.
 */
function plain(value) {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

module.exports = { ROOT, loadApp, loadGeometry, GEOMETRY_SCRIPTS, plain };
