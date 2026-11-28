/* feedback-kit: "Send feedback" for a static web app, as a GitHub or GitLab issue plus a picture to draw on.

   The panel shows a picture of the page, taken at the moment of the tap, lets the person draw on it to point at the
   problem, keeps the picture on the clipboard (copied when the panel opens and again after every stroke), offers to
   share or save it, and links to a new issue already filled in, on GitHub or GitLab. Nothing here knows about the
   app: it gives the description, and optionally a picture of its own part. No server and no token: the person signs
   in to GitHub or GitLab and taps Submit there.

     import { createFeedback } from './feedback-kit/kit.js';
     const feedback = createFeedback({
       repo: 'owner/name',                       // on GitLab, 'group/project' or 'group/subgroup/project'
       // provider: 'gitlab', host: 'https://gitlab.example.com',   // GitHub and its public host by default
       // urlLimit: 8000,                         // the longest issue address, in characters
       labels: ['feedback'],
       page: {area: 'screen', fonts},            // the whole page (pagePicture in page.js), shown first
       picture: () => svgPicture(svgElement),   // optional: the app's own part, a switch in the panel. A promise of
       pictureLabel: 'Just the field',           //   a canvas; called in the tap, so take the copy at once
       describe: () => ({                        // what is on screen, also called in the tap
         subtitle: 'Angel drill, step 2',        // under the panel's heading
         fileName: 'feedback-angel-step-2.png',
         issue: {title, rows: [[name, value]], sections: [{heading, text, fallback}]}   // or a promise of it
       }),
       footer: 'Sent with Send feedback in the app.',
       // language: 'cs', strings: {heading: 'Nahlásit chybu'},   // English by default; see strings.js
     });
     button.addEventListener('click', feedback.open);

   The issue also gets rows about the device: screen, theme, browser and page. Link feedback-kit.css for the panel;
   its colours and fonts come from --fk-* custom properties (see that file). Esc closes the panel, Ctrl/Cmd+Z undoes
   a stroke. See README.md in this folder. */
import { issueTarget, issueUrl } from './issue.js';
import { createSketch } from './sketch.js';
import { canCaptureScreen, pagePicture, screenPicture } from './page.js';
import { format, listOf, STRINGS, texts } from './strings.js';

const PENS = [['#ff2d55', 'penRed'], ['#ffffff', 'penWhite'], ['#1f6feb', 'penBlue'], ['#111111', 'penBlack']];

// the rows about the device for the issue, in the language of `t` (the texts from strings.js)
export function deviceRows(t = STRINGS.en){
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const desktop = matchMedia('(pointer: fine)').matches && !matchMedia('(pointer: coarse)').matches;
  return [
    [t.rowScreen, format(standalone ? t.screenApp : t.screen, {width: innerWidth, height: innerHeight,
      orientation: innerWidth >= innerHeight ? t.landscape : t.portrait, theme: dark ? t.darkMode : t.lightMode,
      ratio: String(Math.round((devicePixelRatio || 1) * 100) / 100).replace('.', t.decimal)})],
    // on a desktop the page is a window on a bigger screen: say how big both are
    ...(desktop ? [[t.rowWindow, format(t.window, {width: outerWidth, height: outerHeight, screenWidth: screen.width, screenHeight: screen.height})]] : []),
    [t.rowBrowser, navigator.userAgent],
    [t.rowPage, location.origin + location.pathname]
  ];
}

// the first picture file in a paste or a drop
const imageIn = data => [...(data?.files || [])].find(f => f.type.startsWith('image/'))
  || [...(data?.items || [])].filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile()).find(Boolean) || null;

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

export function createFeedback({repo, provider = 'github', host, urlLimit, labels = ['feedback'], picture = null,
  pictureLabel, page = {}, capture = 'button', describe, footer = '', heading, language, strings}){
  const name = issueTarget({provider, host, repo, urlLimit, labels}).provider.name;   // throws now if one is wrong
  const t = texts(language, strings);   // this too
  const site = t[`provider.${provider}`] ?? name;   // the provider's name, in the form the texts need
  heading ??= t.heading; pictureLabel ??= t.pictureLabel;
  const COPIED = t.copied, NOT_COPIED = t.notCopied;
  const captureMode = () => { const m = typeof capture === 'function' ? capture() : capture; return canCaptureScreen() ? m : 'off'; };
  let ui = null, run = 0, shown = 0, fileName = t.fileName, file = null, objectUrl = null;
  let pictures = {}, current = null;   // this time's pictures by kind ('page', 'part'), each a promise of a canvas

  function build(){
    const q = {};
    q.canvas = element('canvas', {class: 'fk-canvas', 'aria-label': t.canvasLabel});
    q.wait = element('p', {class: 'fk-wait', text: t.making});
    q.pens = PENS.map(([c, key], k) => element('button', {type: 'button', class: 'fk-pen', title: t[key], 'aria-label': format(t.penLabel, {pen: t[key]}), 'aria-pressed': String(k === 0), style: `--pen:${c}`}));
    q.undo = element('button', {type: 'button', class: 'fk-btn', text: t.undo});
    q.clear = element('button', {type: 'button', class: 'fk-btn', text: t.clear});
    q.status = element('p', {class: 'fk-status', role: 'status'});
    q.open = element('a', {class: 'fk-primary', target: '_blank', rel: 'noopener', 'aria-disabled': 'true', text: format(t.openIssue, {provider: site})});
    q.long = element('p', {class: 'fk-note fk-long', hidden: true});
    q.copy = element('button', {type: 'button', class: 'fk-btn', text: t.copy});
    q.kinds = {
      page: element('button', {type: 'button', class: 'fk-btn', 'aria-pressed': 'true', text: t.kindPage}),
      part: element('button', {type: 'button', class: 'fk-btn', 'aria-pressed': 'false', text: pictureLabel}),
      own: element('button', {type: 'button', class: 'fk-btn', 'aria-pressed': 'false', text: t.kindOwn, hidden: true}),
      screen: element('button', {type: 'button', class: 'fk-btn', 'aria-pressed': 'false', text: t.kindScreen, hidden: true})
    };
    q.pick = element('div', {class: 'fk-pick', role: 'group', 'aria-label': t.pickLabel}, ...Object.values(q.kinds));
    q.file = element('input', {type: 'file', accept: 'image/*', hidden: true, tabindex: '-1', 'aria-hidden': 'true'});
    q.mine = element('button', {type: 'button', class: 'fk-btn fk-mine', text: t.mine});
    q.grab = element('button', {type: 'button', class: 'fk-btn', text: t.grab, hidden: true});
    q.mineNote = element('p', {class: 'fk-note', text: t.mineNote});
    q.share = element('button', {type: 'button', class: 'fk-btn', text: t.share, hidden: true});
    q.save = element('a', {class: 'fk-btn', 'aria-disabled': 'true', text: t.save});
    q.close = element('button', {type: 'button', class: 'fk-x', 'aria-label': t.close, text: '×'});
    q.sub = element('p', {class: 'fk-sub'});
    q.root = element('div', {class: 'fk', role: 'dialog', 'aria-modal': 'true', 'aria-label': heading, hidden: true, 'data-fk-skip': '', ...(language ? {lang: language} : {})},
      element('div', {class: 'fk-card'},
        element('header', {class: 'fk-head'}, element('div', {}, element('h2', {text: heading}), q.sub), q.close),
        element('div', {class: 'fk-body'},
          element('div', {class: 'fk-stage'}, q.canvas, q.wait),
          element('div', {class: 'fk-side'},
            q.pick,
            element('div', {class: 'fk-own'}, q.grab, q.mine, q.file, q.mineNote),
            element('div', {class: 'fk-tools'}, element('div', {class: 'fk-pens', role: 'group', 'aria-label': t.pensLabel}, ...q.pens), q.undo, q.clear),
            element('p', {class: 'fk-note', text: t.drawNote}),
            q.status, q.open, q.long,
            element('div', {class: 'fk-row'}, q.copy, q.share, q.save),
            element('p', {class: 'fk-note', text: format(t.issueNote, {provider: site})})))));
    document.body.appendChild(q.root);

    q.sketch = createSketch(q.canvas, {onChange: () => refresh(true)});
    const tools = () => { q.undo.disabled = q.clear.disabled = !q.sketch.strokes; };
    q.tools = tools;
    q.pens.forEach((b, k) => b.addEventListener('click', () => { q.sketch.color = PENS[k][0]; q.pens.forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
    q.undo.addEventListener('click', () => q.sketch.undo());
    q.clear.addEventListener('click', () => q.sketch.clear());
    q.copy.addEventListener('click', () => refresh(true));
    for (const [kind, b] of Object.entries(q.kinds)) b.addEventListener('click', () => { if (kind !== current) show(kind, true); });
    q.grab.addEventListener('click', () => grab());
    // the person's own screenshot: chosen, pasted or dropped
    q.mine.addEventListener('click', () => { q.file.value = ''; q.file.click(); });
    q.file.addEventListener('change', () => { if (q.file.files[0]) useOwn(q.file.files[0]); });
    document.addEventListener('paste', e => {
      if (q.root.hidden) return;
      const f = imageIn(e.clipboardData);
      if (f){ e.preventDefault(); useOwn(f); }
    });
    q.root.addEventListener('dragover', e => { if ([...(e.dataTransfer?.items || [])].some(i => i.kind === 'file')){ e.preventDefault(); q.root.classList.add('fk-drop'); } });
    q.root.addEventListener('dragleave', e => { if (e.target === q.root || !q.root.contains(e.relatedTarget)) q.root.classList.remove('fk-drop'); });
    q.root.addEventListener('drop', e => {
      q.root.classList.remove('fk-drop');
      const f = imageIn(e.dataTransfer);
      if (f || e.dataTransfer?.files.length) e.preventDefault();
      if (f) useOwn(f); else if (e.dataTransfer?.files.length) say(t.notPicture, true);
    });
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
    const mine = shown;
    ui.tools();
    const copied = toClipboard ? copy(blob) : null;
    blob.then(b => {
      if (mine !== shown) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(b);
      ui.save.href = objectUrl; ui.save.download = fileName; ui.save.removeAttribute('aria-disabled');
      file = new File([b], fileName, {type: 'image/png'});
      ui.share.hidden = !(navigator.canShare && navigator.canShare({files: [file]}) && window.top === window);
    }, () => {});
    if (copied) copied.then(
      () => { if (mine === shown) say(ui.sketch.strokes ? t.copiedDrawing : COPIED); },
      () => { if (mine === shown) say(NOT_COPIED, true); });
  }

  /* Show one of this time's pictures. `toClipboard` when called in a tap (opening the panel, a switch button): the
     copy has to start inside it. If the whole page can't be drawn here, the project's own picture takes its place.
     `note`, if given, is said (as a warning) once the picture is there. */
  function show(kind, toClipboard, note = null){
    const mine = ++shown, pic = pictures[kind];
    current = kind;
    for (const [k, b] of Object.entries(ui.kinds)) b.setAttribute('aria-pressed', String(k === kind));
    const copied = toClipboard ? copy(pic.then(toBlob)) : null;
    ui.canvas.hidden = true; ui.wait.hidden = false; ui.wait.textContent = t.making;
    ui.save.removeAttribute('href'); ui.save.setAttribute('aria-disabled', 'true'); ui.share.hidden = true;
    ui.undo.disabled = ui.clear.disabled = true;
    say(t.making);
    pic.then(canvas => {
      if (mine !== shown) return;
      ui.sketch.setPicture(canvas);
      ui.canvas.hidden = false; ui.wait.hidden = true;
      refresh(false);
      if (note) say(note, true);
      else if (copied) copied.then(() => { if (mine === shown) say(COPIED); }, () => { if (mine === shown) say(NOT_COPIED, true); });
      else say(kind === 'own' ? t.ownIn : t.drawThen);
    }, () => {
      if (mine !== shown) return;
      if (kind === 'own'){ ui.kinds.own.hidden = true; ui.pick.hidden = !pictures.part; show('page', false); say(t.unreadable, true); return; }
      if (kind === 'page' && pictures.part){ show('part', false); return; }
      ui.wait.textContent = t.noPicture;
      say(t.noPictureNote, true);
    });
  }

  /* The person's own screenshot as this time's picture, scaled down like the others. It doesn't come from a tap,
     so it isn't copied at once; it is after the first stroke, or with Copy picture. */
  function useOwn(blob){
    const maxSize = page.maxSize || 2400;
    pictures.own = (typeof createImageBitmap === 'function' ? createImageBitmap(blob) : new Promise((ok, no) => {
      const img = new Image(), url = URL.createObjectURL(blob);
      img.onload = () => { URL.revokeObjectURL(url); ok(img); }; img.onerror = () => { URL.revokeObjectURL(url); no(new Error('not a picture')); };
      img.src = url;
    })).then(src => {
      const w = src.width, h = src.height, scale = Math.min(1, maxSize / Math.max(w, h));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      if (src.close) src.close();
      return c;
    });
    pictures.own.catch(() => {});
    ui.kinds.own.hidden = false; ui.pick.hidden = false;
    show('own', false);
  }

  /* A real screenshot from the browser's screen capture, in a tap. The panel is hidden first, so it isn't in the
     picture, and comes back with the capture, or with the picture it had if the person says no. */
  function grab(){
    const mine = run, had = current;
    ui.root.hidden = true;
    const shot = screenPicture({maxSize: page.maxSize || 2400});   // in the tap: the browser asks now
    shot.catch(() => {});
    return shot.then(canvas => {
      if (mine !== run) return;
      pictures.screen = Promise.resolve(canvas);
      ui.kinds.screen.hidden = false; ui.pick.hidden = false;
      ui.root.hidden = false;
      show('screen', true);
    }, () => {
      if (mine !== run) return;
      ui.root.hidden = false;
      show(had || 'page', false, t.noCapture);
    }).finally(() => { if (mine === run) ui.close.focus({preventScroll: true}); });
  }

  function open(){
    if (ui && !ui.root.hidden) return;
    // all in the tap: this is the moment the feedback is about. The panel isn't in the picture (data-fk-skip)
    const info = describe();
    pictures = {page: pagePicture(page.element || document.documentElement, page)};
    if (picture) pictures.part = picture();
    for (const p of Object.values(pictures)) p.catch(() => {});
    ui = ui || build();
    run++;
    fileName = info.fileName || t.fileName; file = null;
    const mode = captureMode();
    ui.kinds.part.hidden = !picture;
    ui.kinds.own.hidden = ui.kinds.screen.hidden = true;
    ui.grab.hidden = mode === 'off';
    ui.pick.hidden = !picture;
    ui.sub.textContent = info.subtitle || '';
    ui.long.hidden = true;
    ui.open.removeAttribute('href'); ui.open.setAttribute('aria-disabled', 'true');
    if (mode === 'tap'){
      // the browser asks right away; the panel opens once there is a capture, or the page's picture if not
      current = 'page';
      grab();
    } else {
      show('page', true);   // still inside the tap, so the copy can start
      ui.root.hidden = false;
      ui.close.focus({preventScroll: true});
    }

    const mine = run;
    Promise.resolve(info.issue).then(issue => {
      if (mine !== run) return;
      const {url, shortened, gaveWay} = issueUrl({provider, host, repo, urlLimit, labels, footer, ...issue, language, strings, rows: [...(issue.rows || []), ...deviceRows(t)]});
      ui.open.href = url; ui.open.removeAttribute('aria-disabled');
      ui.long.textContent = shortened ? format(t.tooLong, {sections: listOf(gaveWay, language)}) : '';
      ui.long.hidden = !shortened;
    });
  }

  function close(){
    if (!ui || ui.root.hidden) return;
    ui.root.hidden = true; run++; shown++;
    if (objectUrl){ URL.revokeObjectURL(objectUrl); objectUrl = null; }
    file = null;
  }

  return {open, close, get isOpen(){ return !!ui && !ui.root.hidden; }};
}
