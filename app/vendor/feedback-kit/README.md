# Feedback kit

"Send feedback" for a static web app: a GitHub issue, already filled in, plus a picture to draw on. Plain ES modules and one stylesheet, with no dependencies, no build step, no server and no token. The person signs in to GitHub and taps Submit there.

It began in [Ultimate Playbook](https://github.com/bremondr/ultimate-playbook) but knows nothing about it. Nothing in this folder imports from outside it (`tools/check-modules.mjs` checks that). Changes are listed in `CHANGELOG.md`.

## What the person sees

1. They tap your "Send feedback" button. A panel fills most of the screen with a picture of the page, taken at the moment of the tap. If your app gives a picture of its own part (a chart, a field), a switch shows that instead.
   On a desktop browser, **Take a real screenshot** asks to share the tab and takes an exact picture, with the panel out of the way.
   Or they use **their own screenshot**: "Use my screenshot…" chooses one (on the iPad, from Photos), and pasting (Ctrl+V, ⌘V) or dropping an image on the panel works too. It's exact, where the redrawn page is a close copy.
2. They can draw on the picture to point at the problem: four pen colours, Undo (also Ctrl/Cmd+Z), Clear. A finger, the Apple Pencil or the mouse all work.
3. The picture is on the clipboard: copied when the panel opens and again after every stroke. **Share…** (where the browser can share files, as on the iPad) and **Save picture** are there too.
4. **Write the issue on GitHub** opens a new issue with the title, labels and body filled in. They paste the picture, say what's wrong and tap Submit.

## Files

| File | What it does |
|---|---|
| `kit.js` | `createFeedback(options)`: the panel, the clipboard, Share and Save, the device's rows in the issue |
| `page.js` | `pagePicture(element, options)`: a picture of the whole page (or of one element), redrawn from what is on screen. `screenPicture(options)`: a real screenshot from the browser's screen capture, on desktop browsers (`canCaptureScreen()` says if there is one) |
| `picture.js` | `svgPicture(svg, options)`: a PNG-ready canvas of an SVG as it looks now. `embedFonts({stylesheet, family, unicode})`: web fonts inlined for it, from a stylesheet on Google Fonts or the app's own (`unicode` picks subsets by `unicode-range`, Latin by default; rules without one are always kept) |
| `sketch.js` | `createSketch(canvas)`: drawing on a picture |
| `issue.js` | `issueUrl(issue)`: the new-issue address, kept under GitHub's length limit. No DOM, so it runs in Node |
| `feedback-kit.css` | the panel; themed with `--fk-*` custom properties |

## Using it

```html
<link rel="stylesheet" href="js/feedback-kit/feedback-kit.css">
```

```js
import { createFeedback } from './feedback-kit/kit.js';
import { embedFonts, svgPicture } from './feedback-kit/picture.js';

const fonts = embedFonts({stylesheet: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700', family: 'Inter'});
const feedback = createFeedback({
  repo: 'owner/name',
  labels: ['feedback'],                  // the label must exist in the repository
  footer: 'Sent with Send feedback in the app.',
  // the whole page, shown first (see "The pictures" below)
  page: {area: 'screen', fonts},
  // optional: a picture of the app's own part, offered as a switch. A promise of a canvas; it's called in the tap,
  // so take the copy at once: svgPicture does
  picture: () => svgPicture(document.querySelector('#chart'), {fonts}),
  pictureLabel: 'Just the chart',
  capture: 'button',                     // a real screen capture on desktop browsers: 'button', 'tap' or 'off'
  // what was on screen, also called in the tap
  describe: () => ({
    subtitle: 'Sales chart, March',      // under the panel's heading
    fileName: 'feedback-sales.png',
    issue: {                             // or a promise of it, for parts that take a moment (a link to pack)
      title: 'Feedback: sales chart',
      sections: [{heading: 'Reopen', text: '[Open it again](https://…)', fallback: '_Link too long._'}],
      rows: [['View', 'Sales chart, March']]
    }
  })
});
document.querySelector('#feedback').addEventListener('click', feedback.open);
```

The issue body has these parts, in order:
- "What's wrong, and what should happen", left empty for the person;
- "Picture", where they paste it;
- your `sections`;
- an "On screen" table: your `rows`, then the screen, theme, browser and page.

If the address would be longer than GitHub accepts (about 8 KB), sections give way to their `fallback` text, the longest first, until it fits.

### The pictures

Both are taken in the tap, so they show the same moment.

- **The whole page** comes first. `pagePicture` copies the page with every computed style written inline and draws the copy, in every browser, with no prompt. The `page` option is passed to it:
  - `area`: `'screen'` (default) for what is visible, like a screenshot, or `'full'` for the whole scrollable page;
  - `fonts`: web fonts the page uses, through `embedFonts`, or the picture falls back to other fonts;
  - `element`: picture one element instead of the page; `maxSize`: the longer side in pixels, at most (default 2400); `background`.
  
  It keeps what is typed in fields, where scrolled areas are scrolled to, fixed and sticky parts where they are, canvases, and `::before`/`::after`. Give `data-fk-skip` to anything that shouldn't be in it; the panel has it. See Limits for what it can't copy.
- **A real screen capture** (`screenPicture`), on desktop browsers that have it (Chrome, Edge, Firefox, Safari on a Mac; not on the iPad or phones, where it is never offered). It is exact: canvases, video, iframes and images from other sites too. The browser asks the person each time; Chrome and Edge offer this tab first. The `capture` option says when:
  - `'button'` (default): the panel opens with the whole page, and **Take a real screenshot** captures when asked;
  - `'tap'`: the browser asks right at the tap, and the panel opens with the capture;
  - `'off'`: never.
  
  It can also be a function that returns one of them, read at each tap. The panel is hidden while capturing. If the person says no, or there is no screen capture, the picture is the redrawn page.
- **The person's own screenshot**, chosen, pasted or dropped, replaces either one. It is scaled down to `page.maxSize` like the others. It doesn't come from a tap, so it is copied after the first stroke or with Copy picture, not at once.
- **The app's own part** (`picture`, optional) is a switch in the panel labelled `pictureLabel` (default "Just this part"). For an SVG, `svgPicture(svg, {fonts, vars})`; for anything else, any function that returns a promise of a canvas. If the whole page can't be drawn in a browser, the panel shows this one.

### Theming

Set these on `:root` or `.fk`; the defaults are neutral greys and green:

`--fk-surface` `--fk-ink` `--fk-muted` `--fk-rule` `--fk-accent` `--fk-on-accent` `--fk-warn` `--fk-stage` `--fk-font` `--fk-display` `--fk-z`

### Offline

If the app has a service worker that caches fonts, it must not answer a CORS request with an opaque copy cached from a stylesheet `<link>`. `embedFonts` reads the stylesheet with CORS and can't use such a copy. See `staleWhileRevalidate` in [Ultimate Playbook's `sw.js`](https://github.com/bremondr/ultimate-playbook/blob/main/sw.js).

## Setting it up in a project

With the kit copied into the project (see [web-kit's setup guide](../docs/setup-project.md)), usually at `js/vendor/feedback-kit/`:

1. **The label.** Create the label the issues get, once per repository:
   ```sh
   gh label create feedback --repo <owner>/<project> --color d4a72c --description "Sent from the app's feedback link"
   ```
   If it's missing, GitHub drops it from the new issue without saying so.
2. **The styles.** Link `js/vendor/feedback-kit/feedback-kit.css`, and set the `--fk-*` properties to the project's colours and fonts (see Theming). Set `--fk-z` above anything else that covers the page.
3. **The adapter.** Write one project file, for example `js/features/feedback.js`, that calls `createFeedback` with:
   - `repo` and `labels`;
   - `page`: `{fonts}` with the web fonts the page uses (through `embedFonts`), and `area: 'full'` if the whole scrollable page is more useful than what is on screen. Give `data-fk-skip` to anything that shouldn't be in the picture;
   - `capture`: `'button'` (default), `'tap'` if every report should start with a real screenshot on desktop, or `'off'`;
   - optionally `picture` and `pictureLabel`: the app's own part, such as the chart people point at. For an SVG, `svgPicture(svg, {fonts, vars})`, with `vars` for any CSS variables used inside it;
   - `describe`: what is on screen (`subtitle`, `fileName`, and `issue` with `title`, `rows` and `sections`). Most useful is a section with a link that reopens exactly this view, if the app can make one. Give it a `fallback` text, because long links may not fit.
   Keep this file out of the vendored folder.
4. **The button.** Call `feedback.open()` from a tap: the kit copies the picture to the clipboard during that tap. Pause any animation first if the picture should match what the person saw.
5. **Offline.** If a service worker keeps a list of files, add the kit's six files (`kit.js`, `page.js`, `picture.js`, `sketch.js`, `issue.js`, `feedback-kit.css`). If it also caches web fonts, see Offline below.
6. **Preview builds (optional).** A preview banner or a debug page can open the panel without importing the app. The app listens for an event and cancels it to show it handled it:
   ```js
   document.addEventListener('myapp:feedback', e => { e.preventDefault(); feedback.open(); });
   ```
   The banner dispatches `new CustomEvent('myapp:feedback', {cancelable: true})`. If nothing cancelled it, the banner can fall back to a plain new-issue link. Ultimate Playbook's [`tools/preview-runtime.js`](https://github.com/bremondr/ultimate-playbook/blob/main/tools/preview-runtime.js) does this.

[web-kit's demo](https://github.com/bremondr/web-kit/blob/main/demo/feedback-kit.js) is a short, complete example: the whole page, a chart as the app's own part, and a link that reopens the chart. [Ultimate Playbook's adapter](https://github.com/bremondr/ultimate-playbook/blob/main/js/features/feedback.js) is a real one.

### Working from the issues

Add something like this to the project's CLAUDE.md, so a Claude Code session knows what to do with them:

```markdown
Feedback from the app arrives as issues with the `feedback` label ("fix the open feedback issues" means those).
Each one has a table of what was on screen (screen size, orientation, theme, browser, page) and, where the app
makes one, a link that reopens the same view. The pasted picture is a redrawn copy of the page (or of the app's own
part), close to what was on screen but not an exact screenshot.
```

## Limits

- **A copy, not a screenshot.** A page can't take a screenshot of itself on iPad Safari, so the whole page is redrawn from its elements and styles. It is close, but not exact: images, backgrounds and fonts from other sites appear only if their server allows CORS; iframes, video and plugins come out as empty boxes; the browser's own parts (scrollbars, the address bar) aren't in it; and a rare CSS effect can look slightly different, mostly in Safari.
- **Screen capture** is only on desktop browsers, and the browser asks every time. It isn't copied at once (it comes after the prompt, not in the tap): the person copies it after a stroke or with Copy picture.
- **Clipboard.** Safari allows writing to the clipboard only during a tap, so the kit copies when the panel opens and after each stroke. Where copying is refused, Save and Share still work.
- **Sign-in.** The person needs a GitHub account. Labels are applied only if they may label issues in the repository; the owner always can.
