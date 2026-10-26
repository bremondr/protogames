'use strict';
/**
 * Writes the board-game showcases in app/showcases/ (chess, island settlers, triangle peg solitaire,
 * Chinese checkers). The boards are laid out by the app's own geometry code, so tile ids and
 * outlines are exactly what the editor generates; the rest is painting by tile id.
 *
 *   node dev/build-showcases.js
 *
 * Dev tooling only: the app does not load this file. The showcase files are committed; run this
 * again after changing a palette colour or a layout here.
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadGeometry } = require('../tests/support/load');

const { Geometry, Checks, Config } = loadGeometry();
const OUT = path.join(__dirname, '..', 'app', 'showcases');
const CANVAS = { width: 1200, height: 800 };
const VERSION = 7; // the format these files are written in; the app migrates them to ProjectFormat.CURRENT_VERSION (8) when it opens them; tests/projectFormat.test.js parses every file written here
const CREATED = '2026-10-20T12:00:00.000Z';

const palette = (id) => Object.fromEntries(Config.getPaletteById(id).colors.map((c) => [c.label, c.hex]));
const player = (name) => Config.PLAYER_COLORS.find((c) => c.name === name).hex;

function board({ shape, tile, orientation, sizes, paletteId, paint, players = [], dice = [] }) {
    const boardConfig = Checks.makeConfig(shape, tile, orientation, 'point-up', sizes);
    const polygons = Geometry.generateGrid(boardConfig, CANVAS, null).map((polygon) => {
        const { color, start } = paint(polygon.id);
        return { ...polygon, color, ...(start ? { start } : {}) };
    });
    return {
        version: VERSION,
        projectName: '',
        created: CREATED,
        appState: {
            boardConfig,
            currentColor: Config.getPaletteById(paletteId).colors[0].hex,
            paletteId,
            isEraserActive: false,
            autoSaveEnabled: true,
            polygons,
            players,
            dice
        }
    };
}

const write = (file, name, project) => {
    project.projectName = name;
    fs.writeFileSync(path.join(OUT, file), JSON.stringify(project, null, 2) + '\n');
    console.log(`${file}: ${project.appState.polygons.length} tiles, ${project.appState.players.length} players`);
};

const army = (color, seat, count) => ({ color, seat, pieces: [{ kind: 'pawn', count }] });

// ---- Chess: 8 x 8, a1 (bottom left) dark, Blue on ranks 1-2, Orange on ranks 7-8 ----
{
    const colors = palette('chess');
    const blue = player('Blue');
    const orange = player('Orange');
    write('chess.protogames.json', 'Chess', board({
        shape: 'rectangle',
        tile: 'square',
        orientation: 'orthogonal',
        sizes: { width: 8, height: 8 },
        paletteId: 'chess',
        paint: (id) => {
            const [, row, col] = id.split('_').map(Number);
            return {
                color: (row + col) % 2 ? colors['Dark square'] : colors['Light square'],
                start: row >= 6 ? blue : row <= 1 ? orange : undefined
            };
        },
        players: [army(blue, 'bottom', 16), army(orange, 'top', 16)]
    }));
}

// ---- Island settlers: 19 land hexes (3-4-5-4-3) inside a ring of sea ----
{
    const colors = palette('island-settlers');
    const rows = {
        '-2': ['Mountains', 'Pasture grass', 'Forest'],
        '-1': ['Wheat fields', 'Hills', 'Wheat fields', 'Mountains'],
        '0': ['Forest', 'Hills', 'Desert', 'Forest', 'Pasture grass'],
        '1': ['Pasture grass', 'Mountains', 'Wheat fields', 'Hills'],
        '2': ['Wheat fields', 'Forest', 'Pasture grass']
    };
    write('island-settlers.protogames.json', 'Island settlers', board({
        shape: 'hexagon',
        tile: 'hexagon',
        orientation: 'pointy-top',
        sizes: { radius: 3 },
        paletteId: 'island-settlers',
        paint: (id) => {
            const [, q, r] = id.split('_').map(Number);
            const row = rows[r];
            const firstQ = Math.max(-2, -2 - r);
            const terrain = row && q >= firstQ && q < firstQ + row.length ? row[q - firstQ] : 'Sea water';
            return { color: colors[terrain] };
        }
    }));
}

// ---- Triangle peg solitaire: 15 holes in five rows, 14 pegs, the top hole empty ----
{
    const colors = palette('classic-wood');
    const red = player('Red');
    const empty = 'hex_0_2';
    write('peg-solitaire.protogames.json', 'Triangle peg solitaire', board({
        shape: 'triangle',
        tile: 'hexagon',
        orientation: 'pointy-top',
        sizes: { size: 5 },
        paletteId: 'classic-wood',
        paint: (id) => ({ color: colors['Wood board'], start: id === empty ? undefined : red }),
        players: [{ color: red, seat: 'bottom', pieces: [{ kind: 'disc', count: 14 }] }]
    }));
}

// ---- Chinese checkers: the star is every cell with all three axial coordinates >= -4, or all <= 4 ----
{
    const colors = palette('classic-wood');
    // One corner per colour, named by the coordinate that leaves the central hexagon: +q, +r, +s, -q, -r, -s.
    const corners = [
        { test: (q, r, s) => r > 4, name: 'Red', seat: 'bottom' },
        { test: (q, r, s) => r < -4, name: 'Green', seat: 'top' },
        { test: (q, r, s) => q < -4, name: 'Blue', seat: 'left' },
        { test: (q, r, s) => q > 4, name: 'Yellow', seat: 'right' },
        { test: (q, r, s) => s > 4, name: 'Purple', seat: 'top' },
        { test: (q, r, s) => s < -4, name: 'Orange', seat: 'bottom' }
    ];
    write('chinese-checkers.protogames.json', 'Chinese checkers', board({
        shape: 'hexagon',
        tile: 'hexagon',
        orientation: 'pointy-top',
        sizes: { radius: 8 },
        paletteId: 'classic-wood',
        paint: (id) => {
            const [, q, r] = id.split('_').map(Number);
            const s = -q - r;
            const inStar = (q >= -4 && r >= -4 && s >= -4) || (q <= 4 && r <= 4 && s <= 4);
            if (!inStar) return { color: colors['Wood board'] };
            const corner = corners.find((c) => c.test(q, r, s));
            return corner
                ? { color: colors[`${corner.name} corner`], start: player(corner.name) }
                : { color: colors.Hole };
        },
        players: corners.map((c) => ({ color: player(c.name), seat: c.seat, pieces: [{ kind: 'disc', count: 10 }] }))
    }));
}
