# H: browser checks (Chrome, main @ 39ead4a served locally)

## H1 — Discard on the autosave prompt leaves an empty canvas (Medium, pre-existing)
- Location: `js/main.js` startBoard (returns after `promptAutosaveRestore`), `js/fileManager.js:227-240` handleChoice 'discard'.
- Repro (browser): have an autosave in localStorage, reload, click "Discard". Observed: `AppState.getState().polygons.length === 0`, the canvas shows only the striped background, the toolbar is live but there is nothing to paint on. Clicking Generate Board (or any window resize, which regenerates) brings a board back.
- Same in the original code at cdf317e (`handleChoice` there has the same two branches), so it is not a regression of #76.
- Fix: in the discard branch call `Interactions.generateBoard(AppState.getState().boardConfig, { skipDirtyFlag: true })`.

## H2 — Issue #19 reproduces: Load keeps saved pixel coordinates (Medium)
- Browser evidence: board generated on a 1620x1055 canvas (polygon bounds x 304..1316, y 48..951), one tile painted, autosave written. The canvas container was then shrunk to 700x500 (`Renderer.resizeCanvas()`, no regenerate) and `FileManager.restoreState(FileManager.loadAutoSave())` called. Result: polygon bounds unchanged (x 304..1316, y 48..951) on a 700x500 canvas, so most of the board is outside the canvas.
- A window `resize` event afterwards runs the debounced regenerate and re-fits it (x 155..545, y 48..396), with the painted tile preserved. So the defect lasts until the next resize.
- Note: the browser window itself could not be resized in this setup (the resize_window tool reported success but innerWidth stayed 1920), so the smaller screen was emulated by shrinking `.workspace`.

## H3 — smoke test of PR #76 behaviours that DID work (Chrome, merged code)
CSP loads the page without violations; Tab is left alone on body/button and cycles swatches only with canvas focus; a late share link asks before replacing painted work and Cancel clears the hash; autosave restore works; Print dialog traps Tab and Escape closes it.
