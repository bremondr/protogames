'use strict';
/**
 * Small stand-ins for the browser pieces the untested modules reach for (storage, window,
 * notifications, a canvas that records its listeners), so they can run in a vm context.
 */

/** A localStorage that can be made to fail, like a full or blocked one. */
function makeStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
        failWith: null,
        get length() { return data.size; },
        key: (i) => [...data.keys()][i] ?? null,
        getItem(key) { if (this.failWith) throw this.failWith; return data.has(key) ? data.get(key) : null; },
        setItem(key, value) { if (this.failWith) throw this.failWith; data.set(key, String(value)); },
        removeItem(key) { data.delete(key); },
        dump: () => Object.fromEntries(data)
    };
}

/** An Error shaped like the one browsers throw when storage is full. */
function quotaError() {
    const error = new Error('quota');
    error.name = 'QuotaExceededError';
    return error;
}

/** Collects the notifications the app would show. */
function makeUI(extra = {}) {
    const notes = [];
    return {
        notes,
        showNotification: (message) => notes.push(message),
        initializePaletteSelector() {},
        renderColorPalette: (paletteId, color) => ({ paletteId, color }),
        updateBoardControls() {},
        updateCanvasMessage() {},
        setEraserActive() {},
        ...extra
    };
}

/** A canvas that remembers its listeners so a test can fire pointer events at them. */
function makeCanvas(width = 800, height = 600) {
    const listeners = {};
    return {
        width,
        height,
        style: {},
        listeners,
        addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
        getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
        fire(type, event) { (listeners[type] || []).forEach((fn) => fn(event)); }
    };
}

/** A pointer event with the bits the handlers read. */
function pointer(x, y, extra = {}) {
    return {
        clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: 'mouse',
        preventDefault() { this.prevented = true; },
        target: { setPointerCapture() {} },
        ...extra
    };
}

module.exports = { makeStorage, quotaError, makeUI, makeCanvas, pointer };
