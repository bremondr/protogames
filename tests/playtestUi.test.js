'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, GEOMETRY_SCRIPTS, plain } = require('./support/load');

// ---- Labels on infinite boards ---------------------------------------------------------------------------

const labels = loadApp([...GEOMETRY_SCRIPTS, 'app/js/viewMath.js', 'app/js/state.js', 'app/js/infinite.js', 'app/js/pieces.js']);
const Pieces = labels.run('Pieces');
const Infinite = labels.run('Infinite');
const FAMILIES = ['inf_hp', 'inf_hf', 'inf_s', 'inf_t'];
const label = (cell) => Pieces.tileLabel([cell], cell);

test('a tile of an infinite board is labelled by its lattice position, whatever tiles are loaded', () => {
    const rect = { minX: -300, minY: -200, maxX: 300, maxY: 200 };
    for (const family of FAMILIES) {
        const cells = Infinite.cellsIn(family, rect);
        const wide = Infinite.cellsIn(family, { minX: -900, minY: -600, maxX: 900, maxY: 600 });
        const byId = new Map(wide.map((c) => [c.id, c]));
        for (const cell of cells) {
            assert.equal(Pieces.tileLabel(cells, cell), Pieces.tileLabel(wide, byId.get(cell.id)), `${cell.id}: same label with another tile set`);
            assert.equal(Pieces.tileLabel(cells, cell), label(cell), `${cell.id}: same label alone`);
        }
    }
});

test('infinite-board labels are unique, count columns left to right and rows downwards', () => {
    for (const family of FAMILIES) {
        const cells = Infinite.cellsIn(family, { minX: -300, minY: -200, maxX: 300, maxY: 200 });
        const seen = new Set(cells.map(label));
        assert.equal(seen.size, cells.length, `${family}: every tile has its own label`);
        const at = (cell) => Pieces.latticeCell(cell.id);
        for (const a of cells) {
            for (const b of cells) {
                if (Math.abs(a.center.y - b.center.y) < 1e-6 && a.center.x < b.center.x - 1e-6) {
                    assert.ok(at(a).column < at(b).column, `${family}: ${a.id} is left of ${b.id}`);
                }
                if (a.center.y < b.center.y - 1e-6) assert.ok(at(a).row <= at(b).row, `${family}: ${a.id} is above ${b.id}`);
            }
        }
    }
});

test('the origin tile is column 0, row 0 and other ids give signed positions', () => {
    assert.equal(Pieces.tileLabel([], { id: 'inf_s_0_0', center: { x: 0, y: 0 } }), 'column 0, row 0');
    assert.equal(Pieces.tileLabel([], { id: 'inf_s_-3_2', center: { x: 0, y: 0 } }), 'column -3, row 2');
    assert.equal(plain(Pieces.latticeCell('inf_hp_2_3')).row, 3);
    assert.equal(Pieces.latticeCell('hex_1_2'), null);
    assert.equal(Pieces.latticeCell('inf_t_1_2'), null, 'a triangle id needs its direction');
    assert.equal(Pieces.latticeCell('inf_s_1_2_up'), null, 'only triangles have a direction');
});

test('a tile that is not loaded still has a label from its id; unknown ids have none', () => {
    const loaded = Infinite.cellsIn('inf_hp', { minX: -100, minY: -100, maxX: 100, maxY: 100 });
    assert.equal(Pieces.tileLabelById(loaded, 'inf_hp_90_40'), 'column 110, row 40');
    assert.equal(Pieces.tileLabelById(loaded, loaded[0].id), label(loaded[0]));
    assert.equal(Pieces.tileLabelById(loaded, 'gone'), null);
});

test('finite boards keep their column and row labels', () => {
    const tiles = [
        { id: 'a', center: { x: 10, y: 10 } }, { id: 'b', center: { x: 30, y: 10 } },
        { id: 'c', center: { x: 10, y: 30 } }, { id: 'd', center: { x: 30, y: 30 } }
    ];
    assert.equal(Pieces.tileLabel(tiles, tiles[3]), 'column 2, row 2');
    assert.equal(Pieces.tileLabelById(tiles, 'c'), 'column 1, row 2');
});

// ---- Trays fold themselves when the board would get too small -----------------------------------------------

const trayApp = loadApp(['app/js/config.js', 'app/js/playtestTray.js']);
const fit = (args) => [...trayApp.run('PlaytestTray').fitFolded({ used: ['left', 'right'], folded: new Set(), pinned: null, band: 154, bandFolded: 61, min: 260, ...args })].sort();

test('trays keep the board at least the minimum size by folding side trays first', () => {
    assert.deepEqual(fit({ width: 1280, height: 800 }), [], 'plenty of room: nothing folds');
    // 390 wide: two open side trays leave 82 px, one leaves 186, none 268
    assert.deepEqual(fit({ width: 390, height: 844 }), ['left', 'right']);
    assert.deepEqual(fit({ width: 500, height: 800 }), ['left'], 'one folded tray is enough');
});

test('rows are folded when the board is too low, columns are not', () => {
    const used = ['bottom', 'top'];
    assert.deepEqual(fit({ width: 844, height: 300, used }), ['bottom', 'top']);
    assert.deepEqual(fit({ width: 844, height: 480, used }), ['top']);
});

test('trays the player folded count as folded and are not reported again', () => {
    assert.deepEqual(fit({ width: 390, height: 844, folded: new Set(['left']) }), ['right']);
    assert.deepEqual(fit({ width: 390, height: 844, folded: new Set(['left', 'right']) }), []);
});

test('the tray the player opened last stays open, the others fold around it', () => {
    assert.deepEqual(fit({ width: 500, height: 800, pinned: 'left' }), ['right']);
    assert.deepEqual(fit({ width: 390, height: 844, pinned: 'left' }), ['right'], 'a deliberate choice stays, even if the board gets small');
});

test('with every tray folded and still too little room nothing more can be done', () => {
    assert.deepEqual(fit({ width: 200, height: 800, used: ['bottom'] }), []);
});

// ---- Dragging pieces: Escape, taps and drops --------------------------------------------------------------

function dragHarness() {
    const listeners = [];
    const calls = { tap: [], announce: [], moved: [] };
    const nodes = {};
    const node = (name) => {
        nodes[name] = {
            listeners: {},
            addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
            getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }),
            width: 800,
            height: 600,
            style: {},
            querySelectorAll: () => [],
            querySelector: () => null,
            contains: () => false,
            innerHTML: ''
        };
        return nodes[name];
    };
    let under = null;
    const document = {
        getElementById: (id) => nodes[id] || null,
        addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
        createElement: () => ({ style: {}, remove() {}, set src(v) {} }),
        body: { appendChild() {} },
        elementFromPoint: () => under,
        activeElement: null
    };
    node('gameCanvas'); node('trayLayer'); node('boardPieceList');
    const base = ['app/js/config.js', 'app/js/dice.js', 'app/js/players.js', 'app/js/play.js', 'app/js/viewMath.js', 'app/js/pieces.js'];
    const players = [{ color: '#c62828', seat: 'bottom', pieces: [{ kind: 'pawn', count: 2 }] }];
    const state = { playtest: true, play: null, view: { scale: 1, x: 0, y: 0 }, polygons: [{ id: 't1', center: { x: 100, y: 100 }, vertices: [], start: '#c62828' }], players };
    const globals = {
        document,
        // Timers never fire: the click that follows a release is "still to come" for the whole test.
        setTimeout: () => 1,
        clearTimeout() {},
        AppState: {
            getState: () => state,
            setDrag() {}, setSelectedPiece() {},
            getTopology: () => ({ locate: () => null })
        },
        Renderer: { renderBoard() {} },
        Playtest: { refresh() {}, announce: (text) => calls.announce.push(text) },
        PlaytestTray: { tapPiece: (event, button) => calls.tap.push(button.dataset.kind) }
    };
    const app = loadApp([...base, 'app/js/playtestDrag.js'], globals);
    state.play = app.run('Play').create(players);
    app.run('PlaytestDrag').init();
    const Drag = app.run('PlaytestDrag');
    const button = { dataset: { color: '#c62828', kind: 'pawn' }, closest() { return this; }, setPointerCapture() {} };
    const fire = (type, init) => {
        const event = { type, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0, target: button, preventDefault() { this.defaultPrevented = true; }, ...init };
        for (const l of listeners.filter((x) => x.type === type)) l.fn(event);
        return event;
    };
    return {
        Drag, calls, state, fire, nodes,
        setUnder: (value) => { under = value; },
        pressTray: () => nodes.trayLayer.listeners.pointerdown.forEach((fn) => fn({ pointerId: 1, pointerType: 'mouse', button: 0, clientX: 50, clientY: 500, target: button }))
    };
}

test('a tap on a tray piece (press, release, no move) is handed to the tray on release', () => {
    const h = dragHarness();
    h.pressTray();
    h.fire('pointerup', { clientX: 50, clientY: 500 });
    assert.deepEqual(h.calls.tap, ['pawn']);
});

test('Escape during a tray drag cancels it: the release places nothing and sends nothing', () => {
    const h = dragHarness();
    h.pressTray();
    h.fire('pointermove', { clientX: 90, clientY: 460, buttons: 1 });
    const escape = h.fire('keydown', { key: 'Escape', target: {} });
    assert.equal(escape.defaultPrevented, true, 'the drag took the key, playtest stays on');
    h.setUnder({ closest: () => null });
    h.fire('pointerup', { clientX: 400, clientY: 300 });
    assert.deepEqual(h.calls.tap, [], 'no send to a start');
    assert.equal(h.state.play.moves, 0);
    assert.equal(h.state.play.pieces.filter((p) => p.tileId !== null).length, 0);
    assert.deepEqual(h.calls.announce, [], 'the cancelled drag is not announced as a drop');
    assert.equal(h.Drag.consumeClick(), true, 'the click that follows the release is swallowed');
});

test('Escape before the pointer has moved cancels the press too', () => {
    const h = dragHarness();
    h.pressTray();
    h.fire('keydown', { key: 'Escape', target: {} });
    h.fire('pointerup', { clientX: 50, clientY: 500 });
    assert.deepEqual(h.calls.tap, []);
});

test('after a cancelled drag the next press on the same pointer works normally', () => {
    const h = dragHarness();
    h.pressTray();
    h.fire('pointermove', { clientX: 90, clientY: 460, buttons: 1 });
    h.fire('keydown', { key: 'Escape', target: {} });
    h.fire('pointerup', { clientX: 90, clientY: 460 });
    h.Drag.consumeClick();
    h.pressTray();
    h.fire('pointerup', { clientX: 50, clientY: 500 });
    assert.deepEqual(h.calls.tap, ['pawn']);
});

test('Escape with nothing being dragged is left to the rest of the app', () => {
    const h = dragHarness();
    const escape = h.fire('keydown', { key: 'Escape', target: {} });
    assert.notEqual(escape.defaultPrevented, true);
});

test('a drop that puts the piece back is announced', () => {
    const h = dragHarness();
    h.pressTray();
    h.fire('pointermove', { clientX: 90, clientY: 460, buttons: 1 });
    h.setUnder({ closest: () => null });
    h.fire('pointerup', { clientX: 900, clientY: 40 });
    assert.equal(h.calls.announce.length, 1);
    assert.match(h.calls.announce[0], /put back in its tray/);
    assert.equal(h.state.play.moves, 0);
});
