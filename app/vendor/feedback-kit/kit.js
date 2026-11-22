/* feedback-kit: "Send feedback" for a static web app, as a GitHub issue plus a picture to draw on.

   The panel shows a picture of the page (or part of it), lets the person draw on it to point at the problem,
   keeps the picture on the clipboard (copied when the panel opens and again after every stroke), offers to share or
   save it, and links to a new GitHub issue already filled in. Nothing here knows about the app: it gives the picture
   and the description. No server and no token: the person signs in to GitHub and taps Submit there.

     import { createFeedback } from './feedback-kit/kit.js';
     const feedback = createFeedback({
       repo: 'owner/name',
       labels: ['feedback'],
       picture: () => svgPicture(svgElement),   // a promise of a canvas; called in the tap, so take the copy at once
       describe: () => ({                        // what is on screen, also called in the tap
         subtitle: 'Angel drill, step 2',        // under the panel's heading
         fileName: 'feedback-angel-step-2.png',
         issue: {title, rows: [[name, value]], sections: [{heading, text, fallback}]}   // or a promise of it
       }),
       footer: 'Sent with Send feedback in the app.'
     });
     button.addEventListener('click', feedback.open);

   The issue also gets rows about the device: screen, theme, browser and page. Link feedback-kit.css for the panel;
   its colours and fonts come from --fk-* custom properties (see that file). Esc closes the panel, Ctrl/Cmd+Z undoes
   a stroke. See README.md in this folder. */
import { issueUrl } from './issue.js';
import { createSketch } from './sketch.js';

const PENS = [['#ff2d55', 'Red'], ['#ffffff', 'White'], ['#1f6feb', 'Blue'], ['#111111', 'Black']];

export function deviceRows(){
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  return [
    ['Screen', `${innerWidth} × ${innerHeight} px, ${innerWidth >= innerHeight ? 'landscape' : 'portrait'}, pixel ratio ${Math.round((devicePixelRatio || 1) * 100) / 100}, ${dark ? 'dark' : 'light'} mode${standalone ? ', home screen app' : ''}`],
    ['Browser', navigator.userAgent],
    ['Page', location.origin + location.pathname]
  ];
}

const toBlob = canvas => new Promise((ok, no) => canvas.toBlob(b => b ? ok(b) : no(new Error('no picture')), 'image/png'));

/* Copy a picture given as a promise. Safari allows clipboard.write only during the tap itself, so the call has to
   happen there with a promise; browsers that don't take a promise get a second try once the picture is ready. */
function copy(blob){
  if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem !== 'function') return Promise.reject(new Error('no clipboard'));
  try {
    return navigator.clipboard.write([new ClipboardItem({'image/png': blob})])
      .catch(async () => navigator.clipboard.write([new ClipboardItem({'image/png': await blob})]));
  } catch (e){ return blob.then(b => navigator.clipboard.write([new ClipboardItem({'image/png': b})])); }
}

function element(tag, props = {}, ...kids){
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)){
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
    else if (k in e && typeof v !== 'string') e[k] = v; else e.setAttribute(k, v);
  }
  e.append(...kids);
  return e;
}

export function createFeedback({repo, labels = ['feedback'], picture, describe, footer = '', heading = 'Send feedback'}){
  let ui = null, run = 0, fileName = 'feedback.png', file = null, objectUrl = null;

  function build(){
    const q = {};
    q.canvas = element('canvas', {class: 'fk-canvas', 'aria-label': 'Picture of the screen. Draw on it to point at the problem.'});
    q.wait = element('p', {class: 'fk-wait', text: 'Making the picture…'});
    q.pens = PENS.map(([c, name], k) => element('button', {type: 'button', class: 'fk-pen', title: name, 'aria-label': `${name} pen`, 'aria-pressed': String(k === 0), style: `--pen:${c}`}));
    q.undo = element('button', {type: 'button', class: 'fk-btn', text: 'Undo'});
    q.clear = element('button', {type: 'button', class: 'fk-btn', text: 'Clear'});
    q.status = element('p', {class: 'fk-status', role: 'status'});
    q.open = element('a', {class: 'fk-primary', target: '_blank', rel: 'noopener', 'aria-disabled': 'true', text: 'Write the issue on GitHub'});
    q.long = element('p', {class: 'fk-note', hidden: true});
    q.copy = element('button', {type: 'button', class: 'fk-btn', text: 'Copy picture'});
    q.share = element('button', {type: 'button', class: 'fk-btn', text: 'Share…', hidden: true});
    q.save = element('a', {class: 'fk-btn', 'aria-disabled': 'true', text: 'Save picture'});
    q.close = element('button', {type: 'button', class: 'fk-x', 'aria-label': 'Close', text: '×'});
    q.sub = element('p', {class: 'fk-sub'});
    q.root = element('div', {class: 'fk', role: 'dialog', 'aria-modal': 'true', 'aria-label': heading, hidden: true},
      element('div', {class: 'fk-card'},
        element('header', {class: 'fk-head'}, element('div', {}, element('h2', {text: heading}), q.sub), q.close),
        element('div', {class: 'fk-body'},
          element('div', {class: 'fk-stage'}, q.canvas, q.wait),
          element('div', {class: 'fk-side'},
            element('div', {class: 'fk-tools'}, element('div', {class: 'fk-pens', role: 'group', 'aria-label': 'Pen colour'}, ...q.pens), q.undo, q.clear),
            element('p', {class: 'fk-note', text: 'Draw on the picture to point at the problem.'}),
            q.status, q.open, q.long,
            element('div', {class: 'fk-row'}, q.copy, q.share, q.save),
            element('p', {class: 'fk-note', text: 'The issue opens on GitHub with what was on screen filled in. Sign in, paste the picture, say what’s wrong, and tap Submit.'})))));
    document.body.appendChild(q.root);

    q.sketch = createSketch(q.canvas, {onChange: () => refresh(true)});
    const tools = () => { q.undo.disabled = q.clear.disabled = !q.sketch.strokes; };
    q.tools = tools;
    q.pens.forEach((b, k) => b.addEventListener('click', () => { q.sketch.color = PENS[k][0]; q.pens.forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
    q.undo.addEventListener('click', () => q.sketch.undo());
    q.clear.addEventListener('click', () => q.sketch.clear());
    q.copy.addEventListener('click', () => refresh(true));
    q.share.addEventListener('click', () => { if (file) navigator.share({files: [file], title: heading}).catch(() => {}); });
    q.open.addEventListener('click', e => { if (q.open.getAttribute('aria-disabled')) e.preventDefault(); });
    q.save.addEventListener('click', e => { if (q.save.getAttribute('aria-disabled')) e.preventDefault(); });
    q.close.addEventListener('click', close);
    q.root.addEventListener('click', e => { if (e.target === q.root) close(); });
    document.addEventListener('keydown', e => {
      if (q.root.hidden) return;
      if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); close(); }
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z'){ e.preventDefault(); e.stopPropagation(); q.sketch.undo(); }
    }, true);   // before the page's own keys
    return q;
  }

  const say = (text, warn) => { ui.status.textContent = text; ui.status.classList.toggle('fk-warn', !!warn); };

  // the picture as it is now (with the drawing) goes to the clipboard (when asked, inside a tap), Save and Share
  function refresh(toClipboard, blob = toBlob(ui.canvas)){
    const mine = run;
    ui.tools();
    const copied = toClipboard ? copy(blob) : null;
    blob.then(b => {
      if (mine !== run) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(b);
      ui.save.href = objectUrl; ui.save.download = fileName; ui.save.removeAttribute('aria-disabled');
      file = new File([b], fileName, {type: 'image/png'});
      ui.share.hidden = !(navigator.canShare && navigator.canShare({files: [file]}) && window.top === window);
    }, () => {});
    if (copied) copied.then(
      () => { if (mine === run) say(ui.sketch.strokes ? 'The picture is copied, with your drawing. Paste it into the issue.' : 'The picture is copied. Paste it into the issue, or draw on it first.'); },
      () => { if (mine === run) say('Couldn’t copy the picture here. Save or share it, then attach it to the issue.', true); });
  }

  function open(){
    if (ui && !ui.root.hidden) return;
    const info = describe(), pic = picture();   // both in the tap: this is the moment the feedback is about
    ui = ui || build();
    const mine = ++run;
    fileName = info.fileName || 'feedback.png'; file = null;
    const firstCopy = copy(pic.then(toBlob));   // still inside the tap
    ui.sub.textContent = info.subtitle || '';
    ui.canvas.hidden = true; ui.wait.hidden = false; ui.long.hidden = true;
    ui.open.removeAttribute('href'); ui.open.setAttribute('aria-disabled', 'true');
    ui.save.removeAttribute('href'); ui.save.setAttribute('aria-disabled', 'true'); ui.share.hidden = true;
    ui.undo.disabled = ui.clear.disabled = true;
    say('Making the picture…');
    ui.root.hidden = false;
    ui.close.focus({preventScroll: true});

    pic.then(canvas => {
      if (mine !== run) return;
      ui.sketch.setPicture(canvas);
      ui.canvas.hidden = false; ui.wait.hidden = true;
      refresh(false);
      firstCopy.then(
        () => { if (mine === run) say('The picture is copied. Paste it into the issue, or draw on it first.'); },
        () => { if (mine === run) say('Couldn’t copy the picture here. Save or share it, then attach it to the issue.', true); });
    }, () => { if (mine === run){ ui.wait.textContent = 'No picture in this browser.'; say('Couldn’t make a picture here. The issue still says what was on screen.', true); } });

    Promise.resolve(info.issue).then(issue => {
      if (mine !== run) return;
      const {url, shortened} = issueUrl({repo, labels, footer, ...issue, rows: [...(issue.rows || []), ...deviceRows()]});
      ui.open.href = url; ui.open.removeAttribute('aria-disabled');
      ui.long.textContent = shortened ? 'Some of what was on screen was too long to put in the issue.' : '';
      ui.long.hidden = !shortened;
    });
  }

  function close(){
    if (!ui || ui.root.hidden) return;
    ui.root.hidden = true; run++;
    if (objectUrl){ URL.revokeObjectURL(objectUrl); objectUrl = null; }
    file = null;
  }

  return {open, close, get isOpen(){ return !!ui && !ui.root.hidden; }};
}
