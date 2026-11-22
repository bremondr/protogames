/* feedback-kit: a picture of an SVG on the page, as it looks right now.

   svgPicture(svgElement, options) → Promise<canvas>
     The copy is taken at once (synchronously), so the picture is the moment of the call even while the page goes on
     animating. Every computed style that changes how SVG looks is written inline, so CSS classes and CSS variables
     come out right without the page's stylesheets.
     options.fonts       a promise of @font-face CSS with the files inlined (embedFonts below); an SVG drawn as an
                         image can't load anything itself
     options.vars        CSS custom property names to define again inside the copy, for values that stay var()
     options.background  the colour behind the SVG (default: the page's background)
     options.maxSize     the longer side of the picture in pixels, at most (default 2400; at least the SVG's own size)

   embedFonts({stylesheet, family, unicode}) → Promise<string>
     The @font-face rules of `family` from a stylesheet that allows CORS (Google Fonts does), with the font files
     inlined as data: URLs. `unicode` picks the subsets by their unicode-range (default: Latin); a rule without a
     unicode-range covers every character and is always kept. Resolves to '' when it can't be read. */

const NS = 'http://www.w3.org/2000/svg';
const PROPS = ['display', 'visibility', 'opacity', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-opacity',
  'stroke-width', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'paint-order',
  'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor', 'dominant-baseline'];
const SKIP = {display: 'inline', visibility: 'visible', opacity: '1', 'fill-opacity': '1', 'stroke-opacity': '1',
  'stroke-dashoffset': '0px', 'font-style': 'normal', 'paint-order': 'normal'};

export const dataUrl = blob => new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(blob); });

function snapshot(svg, vars){
  const r = svg.getBoundingClientRect(), root = getComputedStyle(document.documentElement);
  const copy = svg.cloneNode(true), from = [svg, ...svg.querySelectorAll('*')], to = [copy, ...copy.querySelectorAll('*')];
  from.forEach((e, k) => {
    const cs = getComputedStyle(e);
    to[k].setAttribute('style', PROPS.map(p => [p, cs.getPropertyValue(p)]).filter(([p, v]) => v && SKIP[p] !== v).map(([p, v]) => `${p}:${v}`).join(';'));
  });
  copy.removeAttribute('id'); copy.removeAttribute('class');
  copy.setAttribute('xmlns', NS);
  copy.setAttribute('width', Math.round(r.width)); copy.setAttribute('height', Math.round(r.height));
  const style = document.createElementNS(NS, 'style');
  style.textContent = `svg{${vars.map(v => `${v}:${root.getPropertyValue(v).trim()}`).join(';')}}`;
  copy.insertBefore(style, copy.firstChild);
  return {copy, style, w: r.width, h: r.height};
}

export async function svgPicture(svg, {fonts = null, vars = [], background = null, maxSize = 2400} = {}){
  const {copy, style, w, h} = snapshot(svg, vars);
  const bg = background || getComputedStyle(document.body).backgroundColor;
  if (fonts) style.textContent += '\n' + await fonts;
  return drawSvg(new XMLSerializer().serializeToString(copy), w, h, {background: bg, scale: Math.min(3, Math.max(1, maxSize / Math.max(w, h)))});
}

/* The canvas of an SVG given as text, w × h CSS pixels, drawn at `scale` over `background`. Shared with page.js. */
export async function drawSvg(text, w, h, {background = '#fff', scale = 1} = {}){
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale)); canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  const draw = () => { ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); };
  draw();
  // Safari can draw an SVG image before its embedded fonts and images are ready: draw it again a moment later
  await new Promise(ok => setTimeout(ok, 80));
  draw();
  return canvas;
}

const fontCache = new Map();
export function embedFonts({stylesheet, family, unicode = /U\+0000-00FF/i}){
  const key = stylesheet + '|' + family;
  if (fontCache.has(key)) return fontCache.get(key);
  const p = (async () => {
    const css = await (await fetch(stylesheet, {mode: 'cors'})).text();
    const faces = (css.match(/@font-face\s*{[^}]*}/g) || []).filter(f => f.includes(family) && (unicode.test(f) || !/unicode-range/i.test(f)));
    const out = await Promise.all(faces.map(async f => {
      const m = /url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(f);
      if (!m) return '';
      const res = await fetch(new URL(m[1], stylesheet), {mode: 'cors'});
      if (!res.ok) throw new Error('font');
      return f.replace(m[0], `url(${await dataUrl(await res.blob())})`);
    }));
    return out.join('\n');
  })().catch(() => '');
  fontCache.set(key, p);
  p.then(css => { if (!css) fontCache.delete(key); });   // try again next time
  return p;
}
