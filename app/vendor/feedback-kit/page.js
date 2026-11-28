/* feedback-kit: a picture of the page (or of one element), redrawn from what is on screen right now.

   pagePicture(element = document.documentElement, options) → Promise<canvas>
     The copy is taken at once (synchronously), so the picture is the moment of the call. Every computed style is
     written inline, the copy goes into an SVG <foreignObject>, and that is drawn on a canvas: no screenshot, no
     prompt, no packages, in every browser. It is a close copy, not an exact one (see Limits in README.md).
     options.area        'screen' (default): what is visible now, like a screenshot. 'full': the whole page (or the
                         whole element), also what is scrolled out of view
     options.fonts       a promise of @font-face CSS with the files inlined (embedFonts in picture.js), for web fonts
     options.background  the colour behind the page (default: the page's own background, else white)
     options.maxSize     the longer side of the picture in pixels, at most (default 2400)
   Elements with a data-fk-skip attribute are left out (the kit's own panel has it); give it to anything that
   shouldn't be in the picture.

   Canvases and same-origin images are copied as they are. Images, backgrounds and fonts from other sites appear
   only if their server allows CORS; iframes, video and plugins come out as empty boxes of their size. */
import { dataUrl, drawSvg } from './picture.js';

const XHTML = 'http://www.w3.org/1999/xhtml';
const SVG_NS = 'http://www.w3.org/2000/svg';
const LEAVE_OUT = new Set(['script', 'noscript', 'template', 'link', 'meta', 'head', 'title', 'base']);
const EMPTY_BOX = new Set(['iframe', 'video', 'audio', 'object', 'embed', 'frame', 'frameset']);
// no animations or transitions in the copy: the computed values already hold the moment
const NOT_COPIED = /^(animation|transition)|^-webkit-(animation|transition)|^--/;
// how SVG's own elements look; the rest of their style stays in their attributes and inner <style>
const SVG_PROPS = ['display', 'visibility', 'opacity', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-opacity',
  'stroke-width', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'paint-order',
  'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor', 'dominant-baseline',
  'stop-color', 'stop-opacity', 'transform', 'transform-origin', 'mix-blend-mode', 'filter', 'clip-path', 'mask'];

const values = cs => { const v = {}; for (let k = 0; k < cs.length; k++){ const p = cs[k]; if (!NOT_COPIED.test(p)) v[p] = cs.getPropertyValue(p); } return v; };

// the browser's own style for an element, from an empty frame, so the copy needs to say only what differs
function defaultsFinder(){
  const cache = new Map();
  let frame = null;
  return {
    get(tag){
      if (cache.has(tag)) return cache.get(tag);
      if (!frame){
        frame = document.createElement('iframe');
        frame.setAttribute('data-fk-skip', ''); frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
        frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:100px;height:100px;border:0;visibility:hidden';
        document.documentElement.appendChild(frame);
        frame.contentDocument.open(); frame.contentDocument.write('<!doctype html><html><head></head><body></body></html>'); frame.contentDocument.close();
      }
      const d = frame.contentDocument, e = d.createElement(tag);
      d.body.appendChild(e);
      const v = values(frame.contentWindow.getComputedStyle(e));
      e.remove();
      cache.set(tag, v);
      return v;
    },
    done(){ if (frame) frame.remove(); frame = null; }
  };
}

function styleText(v, parent, def){
  let out = '';
  for (const p in v) if (v[p] !== def[p] || (parent && v[p] !== parent[p])) out += `${p}:${v[p]};`;
  return out;
}

const pseudoText = cs => { let out = ''; for (let k = 0; k < cs.length; k++){ const p = cs[k]; if (!NOT_COPIED.test(p)) out += `${p}:${cs.getPropertyValue(p)};`; } return out; };

// a canvas or a same-origin image as a data: URL, or '' when the browser won't give its pixels
function pixels(source, w, h){
  try {
    if (source instanceof HTMLCanvasElement) return source.toDataURL('image/png');
    const c = document.createElement('canvas');
    c.width = Math.max(1, w); c.height = Math.max(1, h);
    c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } catch (e){ return ''; }
}

// a scrolling element whose scrollbars take no space on screen: overlay ones (iPad, phones, macOS) or hidden ones.
// The copy would draw classic ones, which take space and cut off the content, so it gets none either. Where the
// screen does show classic scrollbars (Windows), the copy keeps them. (Sizes are whole pixels, hence the 2.)
function noScrollbarSpace(src, v){
  if (!/auto|scroll/.test(v['overflow-x'] + v['overflow-y']) || !(src instanceof HTMLElement)) return false;
  const px = p => parseFloat(v[p]) || 0;
  const across = src.offsetWidth - src.clientWidth - px('border-left-width') - px('border-right-width');
  const down = src.offsetHeight - src.clientHeight - px('border-top-width') - px('border-bottom-width');
  return across < 2 && down < 2;
}

function copySvg(svg, box){
  const copy = svg.cloneNode(true), from = [svg, ...svg.querySelectorAll('*')], to = [copy, ...copy.querySelectorAll('*')];
  from.forEach((e, k) => {
    if (k === 0) return;
    const cs = getComputedStyle(e);
    to[k].setAttribute('style', SVG_PROPS.map(p => [p, cs.getPropertyValue(p)]).filter(([, v]) => v).map(([p, v]) => `${p}:${v}`).join(';'));
  });
  copy.setAttribute('style', box);
  return copy;
}

function snapshot(root, {fixSticky}){
  const defaults = defaultsFinder(), rules = [];
  let n = 0;
  function walk(src, parent){
    if (src.nodeType === 3) return document.createTextNode(src.data);
    if (src.nodeType !== 1 || src.hasAttribute('data-fk-skip')) return null;
    const tag = src.localName;
    if (LEAVE_OUT.has(tag) || (tag === 'style' && src.namespaceURI === XHTML)) return null;
    const cs = getComputedStyle(src);
    if (cs.display === 'none') return null;
    const v = values(cs), r = src.getBoundingClientRect();
    if (fixSticky && v.position === 'sticky'){
      // where it would be without sticking, so the copy (which isn't scrolled) can be moved to where it is now
      const was = src.getAttribute('style');
      src.style.setProperty('position', 'static', 'important');
      const at = src.getBoundingClientRect();
      if (was === null) src.removeAttribute('style'); else src.setAttribute('style', was);
      v.position = 'relative'; v.top = `${r.top - at.top}px`; v.left = `${r.left - at.left}px`; v.bottom = v.right = 'auto';
    }
    const box = styleText(v, parent, defaults.get(src.namespaceURI === XHTML ? tag : 'span'));
    let el;
    if (src.namespaceURI === SVG_NS && tag === 'svg') return copySvg(src, box);
    if (tag === 'canvas' || tag === 'img'){
      el = document.createElement('img');
      const url = pixels(src, src.naturalWidth || src.width, src.naturalHeight || src.height);
      if (url) el.setAttribute('src', url);
      else if (tag === 'img' && src.currentSrc) el.setAttribute('src', src.currentSrc);   // other site: try fetching it below
      if (src.alt) el.setAttribute('alt', src.alt);
    } else if (EMPTY_BOX.has(tag)){
      el = document.createElement('div');
    } else {
      el = src.cloneNode(false);
      el.removeAttribute('id');
      if (tag === 'input'){
        if (src.type === 'checkbox' || src.type === 'radio'){ if (src.checked) el.setAttribute('checked', ''); else el.removeAttribute('checked'); }
        else el.setAttribute('value', src.value);
      } else if (tag === 'option'){ if (src.selected) el.setAttribute('selected', ''); else el.removeAttribute('selected'); }
    }
    el.setAttribute('style', box);
    if (noScrollbarSpace(src, v)){
      el.style.setProperty('scrollbar-width', 'none');
      el.classList.add('fk-nobar');   // the same for Safari before 18.2, which has no scrollbar-width (rule below)
    }
    for (const which of ['::before', '::after']){
      const ps = getComputedStyle(src, which), content = ps.getPropertyValue('content');
      if (content && content !== 'none' && content !== 'normal'){
        const name = `fk-p${++n}`;
        el.classList.add(name);
        rules.push(`.${name}${which}{${pseudoText(ps)}}`);
      }
    }
    if (tag === 'textarea'){ el.textContent = src.value; return el; }
    if (el.localName === 'img' || EMPTY_BOX.has(tag)) return el;
    // a scrolled area: the copy can't scroll, so its content moves up and left by as much. In a block, a wrapper
    // with negative margins does it without changing what is drawn on top of what; in flex and grid (where a
    // wrapper would change the layout), each child is moved
    const dx = src.scrollLeft, dy = src.scrollTop, scrolled = dx || dy;
    const flow = /^(block|flow-root|list-item|inline-block)$/.test(v.display);
    let into = el;
    if (scrolled){
      el.style.overflow = 'hidden';
      if (flow){ into = document.createElement('div'); into.setAttribute('style', `margin:${-dy}px 0 0 ${-dx}px`); el.appendChild(into); }
    }
    for (const c of src.childNodes){
      const k = walk(c, v);
      if (!k) continue;
      if (scrolled && !flow && k.nodeType === 1) k.style.translate = `${-dx}px ${-dy}px`;
      into.appendChild(k);
    }
    return el;
  }
  rules.push('.fk-nobar::-webkit-scrollbar{display:none}');
  try {
    return {copy: walk(root, null), rules};
  } finally { defaults.done(); }
}

// url(…) in styles and img src that aren't data: yet, inlined where the server allows (same site, or CORS)
async function inlineResources(node){
  const cache = new Map();
  const fetchUrl = url => {
    if (!cache.has(url)) cache.set(url, fetch(url, {mode: 'cors'}).then(r => r.ok ? r.blob() : Promise.reject()).then(dataUrl).catch(() => ''));
    return cache.get(url);
  };
  const jobs = [];
  for (const e of [node, ...node.querySelectorAll('*')]){
    const style = e.getAttribute('style');
    if (style && style.includes('url(')){
      const urls = [...style.matchAll(/url\("?([^")]+)"?\)/g)].map(m => m[1]).filter(u => !u.startsWith('data:') && !u.startsWith('#'));
      if (urls.length) jobs.push(Promise.all(urls.map(fetchUrl)).then(found => {
        let s = e.getAttribute('style');
        urls.forEach((u, k) => { s = s.split(u).join(found[k] || ''); });
        e.setAttribute('style', s);
      }));
    }
    if (e.localName === 'img'){
      const src = e.getAttribute('src');
      if (src && !src.startsWith('data:')) jobs.push(fetchUrl(src).then(d => { if (d) e.setAttribute('src', d); else e.removeAttribute('src'); }));
    }
  }
  await Promise.all(jobs);
}

export async function pagePicture(element = document.documentElement, {area = 'screen', fonts = null, background = null, maxSize = 2400} = {}){
  const html = document.documentElement, page = element === html || element === document.body;
  const screen = area !== 'full';
  let x, y, w, h, layoutW, layoutH, bg;
  if (page){
    layoutW = html.clientWidth; layoutH = Math.max(html.scrollHeight, document.body.scrollHeight);
    w = layoutW; h = screen ? html.clientHeight : layoutH;
    x = 0; y = screen ? scrollY : 0;
  } else {
    const r = element.getBoundingClientRect();
    layoutW = r.width; layoutH = r.height;
    if (screen){
      const left = Math.max(0, r.left), top = Math.max(0, r.top);
      w = Math.min(innerWidth, r.right) - left; h = Math.min(innerHeight, r.bottom) - top;
      x = left - r.left; y = top - r.top;
    } else { w = r.width; h = r.height; x = y = 0; }
    if (w <= 0 || h <= 0) throw new Error('The element is not on screen.');
  }

  const {copy, rules} = snapshot(page ? document.body : element, {fixSticky: page && screen});
  const wrap = document.createElement('div');
  const hs = getComputedStyle(html), bs = getComputedStyle(document.body);
  const own = c => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';
  bg = background || (own(hs.backgroundColor) ? hs.backgroundColor : own(bs.backgroundColor) ? bs.backgroundColor : '#ffffff');
  // the root's inherited look and custom properties, which the copy's inner SVG <style> may use
  const vars = []; for (let k = 0; k < hs.length; k++) if (hs[k].startsWith('--')) vars.push(`${hs[k]}:${hs.getPropertyValue(hs[k])}`);
  const inherit = ['color', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'direction', 'color-scheme'];
  const from = page ? hs : getComputedStyle(element.parentElement || html);
  wrap.setAttribute('style', [...vars, ...inherit.map(p => `${p}:${from.getPropertyValue(p)}`),
    `position:relative`, `width:${layoutW}px`, `height:${layoutH}px`, `left:${-x}px`, `top:${-y}px`, `margin:0`, `overflow:hidden`,
    page ? `background:${hs.background}` : ''].join(';'));
  if (copy) wrap.appendChild(copy);

  await inlineResources(wrap);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('width', w); svg.setAttribute('height', h); svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const style = document.createElementNS(SVG_NS, 'style');
  style.textContent = rules.join('\n') + (fonts ? '\n' + await fonts : '');
  const fo = document.createElementNS(SVG_NS, 'foreignObject');
  fo.setAttribute('x', 0); fo.setAttribute('y', 0); fo.setAttribute('width', w); fo.setAttribute('height', h);
  const body = document.createElementNS(XHTML, 'div');
  body.setAttribute('style', `width:${w}px;height:${h}px;overflow:hidden;margin:0`);
  body.appendChild(wrap);
  fo.appendChild(body);
  svg.append(style, fo);

  const scale = Math.min(Math.max(1, devicePixelRatio || 1), maxSize / Math.max(w, h));
  return drawSvg(new XMLSerializer().serializeToString(svg), w, h, {background: bg, scale});
}

/* screenPicture({maxSize}) → Promise<canvas>
   A real screenshot from the browser's screen capture (getDisplayMedia), on desktop browsers that have it. The
   browser asks the person each time, so call it from a tap; Chrome and Edge offer this tab first. One frame is
   taken and the capture stops at once. Rejects when there is no screen capture here, or the person says no.
   canCaptureScreen() says whether this browser has it at all (not iPad or iPhone Safari, nor phones). */
export function canCaptureScreen(){
  return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !matchMedia('(pointer: coarse)').matches;
}

export async function screenPicture({maxSize = 2400} = {}){
  if (!canCaptureScreen()) throw new Error('No screen capture in this browser.');
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {displaySurface: 'browser'}, audio: false,
    preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', monitorTypeSurfaces: 'exclude'
  });
  // the stream plays in a video that is on the page but invisible: Safari may not start a video that isn't
  // on the page. Every wait has a limit, so a capture that gives no frame fails instead of hanging
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.autoplay = true;
  video.setAttribute('data-fk-skip', ''); video.setAttribute('aria-hidden', 'true');
  video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  const wait = ms => new Promise(ok => setTimeout(ok, ms));
  try {
    video.srcObject = stream;
    document.documentElement.appendChild(video);
    await Promise.race([video.play().catch(() => {}), wait(1500)]);
    // a moment on, so the first frame isn't empty and the browser's "sharing" notice has settled; then wait for a
    // frame with a size (at most two seconds). WebKit's video sometimes never shows a live stream it was given,
    // though the stream keeps sending frames; given the stream again, it shows it at once. So after half a second
    // with no frame, and again after a second and a half, the video gets the stream again
    await wait(250);
    const noFrame = () => video.readyState < 2 || !video.videoWidth;
    for (let t = 0; t < 40 && noFrame(); t++){
      if (t === 10 || t === 30){ video.srcObject = null; video.srcObject = stream; video.play().catch(() => {}); }
      await wait(50);
    }
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) throw new Error('The screen capture gave no picture.');
    const scale = Math.min(1, maxSize / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    stream.getTracks().forEach(t => t.stop());
    video.srcObject = null; video.remove();
  }
}
