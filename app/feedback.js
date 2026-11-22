/**
 * PROTOGAMES FEEDBACK
 * --------------------------------------------------------------
 * Wires the "Send feedback" button to feedback-kit (vendor/feedback-kit/, a copy of a web-kit release: see
 * vendor.json, and do not edit it here). The panel opens with a picture of the whole page as it is at the tap,
 * to draw on, with a switch to just the board; it links to a new GitHub issue filled in with what was on screen
 * and a link that reopens this board.
 *
 * It is a module (the kit is made of ES modules) and sits outside app/js, whose files are the classic scripts that
 * index.html lists in order. It reads the app's globals (AppState, ShareLink), which are defined by then:
 * module scripts run after the deferred ones, before DOMContentLoaded.
 */
import { createFeedback } from './vendor/feedback-kit/kit.js';

const REPO = 'bremondr/protogames';
const FILE_NAME = 'feedback-protogames.png';

/** A copy of the board canvas as it is this instant, on the canvas colour (the board itself has transparent gaps). */
function boardPicture() {
    const source = document.getElementById('gameCanvas');
    const copy = document.createElement('canvas');
    copy.width = source.width;
    copy.height = source.height;
    const context = copy.getContext('2d');
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-canvas').trim() || '#f0f2f7';
    context.fillRect(0, 0, copy.width, copy.height);
    context.drawImage(source, 0, 0);
    return Promise.resolve(copy);
}

/** The "Reopen" section: a link that opens this board, or nothing to link to (an empty board, or one too big for a link). */
async function reopenSection(state, painted) {
    const problem = ShareLink.shareProblem(state.boardConfig, painted);
    if (!painted || problem) return [];
    try {
        const link = await ShareLink.currentLink();
        const custom = !Config.COLOR_PALETTES.some((p) => p.id === state.currentPaletteId);
        const note = custom ? ' It uses a custom theme, which the link does not carry, so flat colours show instead.' : '';
        return [{
            heading: 'Reopen',
            text: `[Open this board](${link}).${note}`,
            fallback: '_The link to this board was too long to include. Attach the project file (Export, Project file) if it matters._'
        }];
    } catch (error) {
        return [{ heading: 'Reopen', text: `_No link to this board: ${error.message}_`, fallback: '_No link to this board._' }];
    }
}

function describe() {
    const state = AppState.getState();
    const config = state.boardConfig;
    const painted = state.polygons.length;
    const shape = config.boardShape === 'country' ? `${config.country || 'country'} board` : `${config.boardShape} board`;
    const mode = state.playtest ? 'playtest' : 'editing';
    return {
        subtitle: painted ? `${shape}, ${painted} tiles, ${mode}` : 'No board yet',
        fileName: FILE_NAME,
        issue: reopenSection(state, painted).then((sections) => ({
            title: `Feedback: ${shape}`,
            sections,
            rows: [
                ['Board', `${shape}, ${config.gridType} tiles, ${painted} tiles`],
                ['Mode', mode],
                ['Players', String(state.players.length)],
                ['Zoom', `${Math.round(state.view.scale * 100)}%`]
            ]
        }))
    };
}

const feedback = createFeedback({
    repo: REPO,
    labels: ['feedback'],
    footer: 'Sent with Send feedback in the Protogames editor.',
    // The whole page first. The editor fills the window and does not scroll (html and body are overflow: hidden), so
    // 'screen' (what is visible) and 'full' would be the same picture; 'screen' says what is meant. The page uses only
    // system fonts, so there are no web fonts to pass. Anything that should stay out of the picture has data-fk-skip
    // (the preview badge does; see tools/preview-runtime.js).
    page: { area: 'screen' },
    // The board on its own stays available as a switch: it is a big canvas, and a picture of just it is the clearest
    // way to point at a tile.
    picture: boardPicture,
    pictureLabel: 'Just the board',
    describe
});

document.getElementById('feedbackButton')?.addEventListener('click', feedback.open);
