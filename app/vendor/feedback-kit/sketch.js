/* feedback-kit: drawing on a picture with a finger, the Apple Pencil or the mouse.

   const sketch = createSketch(canvas, {onChange})
     sketch.setPicture(source)  a canvas or image to draw on; the canvas takes its size, and earlier strokes go
     sketch.color = '#ff2d55'   the pen's colour
     sketch.undo(), sketch.clear(), sketch.strokes (how many)
     onChange()                 after each finished stroke, undo and clear: inside the pointer or click event, so the
                                caller may copy to the clipboard there
   Strokes are kept in the picture's own pixels, so the drawing is as sharp as the picture. */

export function createSketch(canvas, {onChange = () => {}} = {}){
  const ctx = canvas.getContext('2d');
  let base = null, strokes = [], live = null;
  const width = () => Math.max(3, Math.round(Math.max(canvas.width, canvas.height) / 300));

  function line(s, from = 0){
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    const p = s.pts;
    if (p.length === 1){ ctx.arc(p[0][0], p[0][1], s.width / 2, 0, Math.PI * 2); ctx.fillStyle = s.color; ctx.fill(); return; }
    ctx.moveTo(...p[Math.max(0, from - 1)]);
    for (let k = Math.max(1, from); k < p.length; k++) ctx.lineTo(...p[k]);
    ctx.stroke();
  }
  function render(){
    if (!base) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
    strokes.forEach(s => line(s));
  }
  // a point of the event in the canvas's own pixels
  function at(e){
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height];
  }

  canvas.addEventListener('pointerdown', e => {
    if (!base || live || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    live = {id: e.pointerId, color: sketch.color, width: width() * (e.pointerType === 'pen' ? 0.8 : 1), pts: [at(e)]};
    line(live);
  });
  canvas.addEventListener('pointermove', e => {
    if (!live || e.pointerId !== live.id) return;
    const n = live.pts.length;
    (e.getCoalescedEvents ? e.getCoalescedEvents() : [e]).forEach(c => live.pts.push(at(c)));
    if (n === 1){ render(); line(live); }   // the dot of the first point becomes a line
    else line(live, n);
  });
  const end = e => {
    if (!live || e.pointerId !== live.id) return;
    strokes.push(live); live = null; render();
    onChange();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', e => { if (live && e.pointerId === live.id){ live = null; render(); } });

  const sketch = {
    color: '#ff2d55',
    get strokes(){ return strokes.length; },
    setPicture(source){ base = source; strokes = []; live = null; canvas.width = source.width; canvas.height = source.height; render(); },
    undo(){ if (strokes.length){ strokes.pop(); render(); onChange(); } },
    clear(){ if (strokes.length){ strokes = []; render(); onChange(); } }
  };
  return sketch;
}
