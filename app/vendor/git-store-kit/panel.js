/* git-store-kit: the panel (optional). Three views in one overlay:
   - the sources: each followed repo with its state, a token to paste, replace or remove, reload, stop following,
     and a field to follow another repo;
   - the conflict question, when a save or a removal finds the file changed meanwhile;
   - an item's history: its versions, to open one or restore it.

     import { createPanel } from './git-store-kit/panel.js';
     const panel = createPanel(store, {title: 'Teams', noun: 'drill'});
     settingsButton.addEventListener('click', () => panel.open());
     addTokenButton.addEventListener('click', () => panel.open({token: repo}));   // straight to that repo's token field
     await panel.save(repo, item, {note});     // asks if there is a conflict; null when the person cancels
     panel.showHistory(repo, id, {onOpen: ({item, commit}) => showReadOnly(item)});
     panel.showHistory(repo, id, {base: sha, onRestore: ({item, sha}) => putOnTheBoard(item, sha)});   // working folder

   Link git-store-kit.css; its colours and fonts come from --gs-* custom properties (see that file). Esc closes the
   panel. Nothing here shows a stored token: the field to paste one is always empty. */
import { GitStoreConflict, tokenNeed } from './store.js';

const TOKEN_PAGE = 'https://github.com/settings/personal-access-tokens/new';

function el(tag, props = {}, ...kids){
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)){
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e && typeof v !== 'string') e[k] = v; else e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...kids.flat().filter(k => k != null && k !== false));
  return e;
}

function ago(t, now = Date.now()){
  if (!t) return 'never';
  const s = Math.round((now - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export function createPanel(store, {title = 'Shared sources', noun = 'item', nouns = noun + 's', sourceLabel = 'repo',
  heading = null, parent = null, tokenHelp = null} = {}){
  const itemName = item => store.nameOf(item);
  let root = null, card = null, view = null, back = null, pending = null, unsubscribe = null;
  const ui = {tokenFor: null, confirmRemove: null, saved: null, helpOpen: false, message: ''};

  function mount(){
    if (root) return;
    card = el('div', {class: 'gs-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gs-title'});
    root = el('div', {class: 'gs', hidden: true, onclick: e => { if (e.target === root) close(); }}, card);
    root.addEventListener('keydown', e => { if (e.key === 'Escape'){ e.preventDefault(); close(); } });
    (parent || document.body).append(root);
  }
  function show(name, build, focus){
    mount();
    if (root.hidden){ back = document.activeElement; root.hidden = false; }
    view = name;
    card.replaceChildren(...build());
    (card.querySelector(focus || '[data-gs-focus]') || card.querySelector('button, input, a'))?.focus({preventScroll: true});
  }
  function close(){
    if (!root || root.hidden) return;
    root.hidden = true;
    view = null;
    if (unsubscribe){ unsubscribe(); unsubscribe = null; }
    if (pending){ const p = pending; pending = null; p(null); }
    if (back && back.focus) back.focus({preventScroll: true});
  }
  const head = (text, sub) => el('div', {class: 'gs-head'},
    el('div', {}, el('h2', {id: 'gs-title', text}), sub ? el('p', {class: 'gs-sub', text: sub}) : null),
    el('button', {class: 'gs-x', type: 'button', 'aria-label': 'Close', text: '×', onclick: close}));

  /* ---------- sources ---------- */
  function stateText(s){
    if (s.loading && !s.loadedAt) return 'Loading…';
    const parts = [];
    if (s.loadedAt) parts.push(`${plural(s.items.length, noun, nouns)}, checked ${ago(s.loadedAt)}`);
    if (s.dropped) parts.push(`${plural(s.dropped, 'file')} couldn’t be read`);
    return parts.join(' · ') || (s.error ? 'Not loaded' : 'Not loaded yet');
  }
  function badges(s){
    const b = [];
    if (s.private === true) b.push(['Private', 'gs-badge']); else if (s.private === false) b.push(['Public', 'gs-badge']);
    if (s.hasToken) b.push([s.canWrite ? 'You can edit' : 'Read only', s.canWrite ? 'gs-badge gs-on' : 'gs-badge']);
    return b.map(([t, c]) => el('span', {class: c, text: t}));
  }
  function sourceRow(s){
    const tokenOpen = ui.tokenFor === s.repo, confirming = ui.confirmRemove === s.repo;
    const input = el('input', {class: 'gs-input', type: 'password', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off',
      placeholder: s.hasToken ? 'Paste a new token to replace it' : 'github_pat_…', 'aria-label': `GitHub token for ${s.repo}`});
    const tokenMsg = el('p', {class: 'gs-note', role: 'status'});
    const saveToken = () => {
      try { store.setToken(s.repo, input.value); }
      catch (e){ tokenMsg.textContent = e.message; tokenMsg.classList.add('gs-warn'); input.focus(); return; }
      input.value = ''; ui.tokenFor = null; ui.saved = s.repo;
      store.load(s.repo);
      renderSources(`[data-repo="${s.repo}"] [data-gs-token]`, s.repo);
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); saveToken(); } });
    return el('li', {class: 'gs-source', 'data-repo': s.repo},
      el('div', {class: 'gs-line'},
        el('a', {class: 'gs-name', href: `https://github.com/${s.repo}`, target: '_blank', rel: 'noopener', text: s.repo}),
        el('span', {class: 'gs-badges'}, badges(s))),
      el('p', {class: 'gs-state', text: stateText(s)}),
      problemLine(s),
      ui.saved === s.repo ? el('p', {class: 'gs-note gs-done', role: 'status', text: savedText(s)}) : null,
      el('div', {class: 'gs-row'},
        tokenButton(s, tokenOpen),
        el('button', {class: 'gs-btn', type: 'button', 'data-gs-reload': true, text: s.loading ? 'Loading…' : 'Reload', disabled: s.loading, onclick: () => store.load(s.repo)}),
        confirming
          ? el('span', {class: 'gs-confirm'}, el('span', {text: 'Stop following?'}),
            el('button', {class: 'gs-btn gs-danger', type: 'button', text: 'Yes, remove', onclick: async () => { ui.confirmRemove = null; await store.unfollow(s.repo); ui.message = `${s.repo} removed from this device.`; renderSources(); }}),
            el('button', {class: 'gs-btn', type: 'button', text: 'Keep', onclick: () => { ui.confirmRemove = null; renderSources(); }}))
          : el('button', {class: 'gs-btn', type: 'button', text: 'Remove', onclick: () => { ui.confirmRemove = s.repo; ui.tokenFor = null; ui.saved = null; renderSources(); }})),
      tokenOpen ? el('div', {class: 'gs-token'},
        tokenNeed(s, {label: sourceLabel}) ? null : el('p', {class: 'gs-note', text: s.hasToken
          ? 'Paste a new token to replace the one on this device. The token itself is never shown.'
          : `A token lets this device save to ${s.repo}${s.private === false ? '' : ', and read it if it is private'}.`}),
        el('div', {class: 'gs-row'}, input,
          el('button', {class: 'gs-btn gs-primary', type: 'button', text: 'Save token', onclick: saveToken}),
          s.hasToken ? el('button', {class: 'gs-btn', type: 'button', text: 'Remove token', onclick: () => {
            store.removeToken(s.repo); ui.tokenFor = null; ui.saved = null; ui.message = `Token removed for ${s.repo}.`; store.load(s.repo); renderSources();
          }}) : null),
        tokenMsg,
        tokenHelp ? el('p', {class: 'gs-note'}, tokenHelp) : helpFor(s.repo),
        el('p', {class: 'gs-note', text: 'The token stays in this browser and is sent only to GitHub.'})) : null);
  }
  // why a source doesn't work: the reason it needs a token when that is it, otherwise the error
  function problemLine(s){
    const need = tokenNeed(s, {label: sourceLabel});
    if (!s.error || (s.loading && ui.saved === s.repo)) return null;
    return el('p', {class: 'gs-note gs-warn gs-problem', text: (need ? need.reason : s.error.message) + (s.stale ? ' Showing the copy saved on this device.' : '')});
  }
  function tokenLabel(s){
    const need = !(s.loading && ui.saved === s.repo) && tokenNeed(s, {label: sourceLabel});
    if (need) return [need.action === 'replace' ? 'Replace the token' : 'Add a token', ui.tokenFor === s.repo ? 'gs-btn' : 'gs-btn gs-primary'];
    return [s.hasToken ? 'Token…' : 'Add a token…', 'gs-btn'];
  }
  function tokenButton(s, tokenOpen){
    const [text, cls] = tokenLabel(s);
    return el('button', {class: cls, type: 'button', 'data-gs-token': true, 'aria-expanded': String(tokenOpen), text, onclick: () => {
      const opening = ui.tokenFor !== s.repo;
      ui.tokenFor = opening ? s.repo : null; ui.confirmRemove = null; ui.saved = null;
      renderSources(opening ? `[data-repo="${s.repo}"] .gs-input` : `[data-repo="${s.repo}"] [data-gs-token]`, s.repo);
    }});
  }
  // after a token is saved: what it changed, as soon as the source has loaded with it
  function savedText(s){
    if (s.loading) return `Token saved. Loading ${s.repo}…`;
    if (s.error) return `Token saved, but ${s.repo} still doesn’t load (see above).`;
    return `Token saved. ${s.repo}: ${plural(s.items.length, noun, nouns)}, ${s.canWrite ? 'you can edit.' : 'read only (this token can’t save).'}`;
  }
  // the steps for making a fine-grained token on GitHub, folded away until asked for
  function helpFor(repo){
    const strong = text => el('strong', {text});
    const help = el('details', {class: 'gs-help', open: ui.helpOpen},
      el('summary', {text: 'How do I make a token?'}),
      el('ol', {},
        el('li', {}, 'On GitHub: Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token. ',
          el('a', {href: TOKEN_PAGE, target: '_blank', rel: 'noopener', text: 'Open that page'}), '.'),
        el('li', {}, strong('Resource owner'), `: the account or organisation that owns ${repo}.`),
        el('li', {}, strong('Expiration'), ': a date, for example in a year.'),
        el('li', {}, strong('Repository access'), ': Only select repositories, then ', strong(repo), '.'),
        el('li', {}, strong('Repository permissions'), ' → Contents: ', strong('Read and write'), ' to save, or ', strong('Read-only'),
          ' only to read a private repo. Nothing else.'),
        el('li', {}, 'Generate the token, copy it (it starts with ', el('code', {text: 'github_pat_'}), ') and paste it above.')));
    help.addEventListener('toggle', () => { ui.helpOpen = help.open; });
    return help;
  }
  function renderSources(focus, reveal = null){
    const list = store.sources();
    const add = el('input', {class: 'gs-input', type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', placeholder: 'owner/repo', 'aria-label': `Follow a ${sourceLabel}`});
    const addMsg = el('p', {class: 'gs-note', role: 'status', text: ui.message});
    ui.message = '';
    const follow = () => {
      const repo = store.follow(add.value);
      if (!repo){ addMsg.textContent = `That isn’t a ${sourceLabel} name. Write it as owner/repo.`; addMsg.className = 'gs-note gs-warn'; return; }
      ui.message = `Following ${repo}.`;
      store.load(repo);
      renderSources();
    };
    add.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); follow(); } });
    show('sources', () => [
      head(heading || title, list.length ? `${plural(list.length, sourceLabel)} on this device` : `No ${sourceLabel}s yet`),
      el('div', {class: 'gs-body'},
        list.length ? el('ul', {class: 'gs-sources'}, list.map(sourceRow)) : el('p', {class: 'gs-note', text: `Open a link to a ${sourceLabel}, or add one below.`}),
        el('div', {class: 'gs-add'},
          el('label', {class: 'gs-label', text: `Follow a ${sourceLabel}`}),
          el('div', {class: 'gs-row'}, add, el('button', {class: 'gs-btn', type: 'button', text: 'Follow', onclick: follow})),
          addMsg))
    ], focus || '.gs-x');
    if (reveal) card.querySelector(`[data-repo="${reveal}"]`)?.scrollIntoView({block: 'nearest'});
  }
  // while the sources are shown, keep their states up to date without disturbing what is being typed or focused
  function refreshSources(){
    if (view !== 'sources') return;
    const list = store.sources(), rows = [...card.querySelectorAll('.gs-source')];
    if (rows.length !== list.length || rows.some((r, k) => r.dataset.repo !== list[k].repo)){ renderSources(); return; }
    rows.forEach((row, k) => {
      const s = list[k], fresh = sourceRow(s);
      for (const part of ['.gs-badges', '.gs-state']) row.querySelector(part).replaceWith(fresh.querySelector(part));
      row.querySelector(':scope > .gs-problem')?.remove();
      const problem = fresh.querySelector(':scope > .gs-problem');
      if (problem) row.querySelector('.gs-state').after(problem);
      const done = row.querySelector(':scope > .gs-done');
      if (done) done.textContent = savedText(s);
      const reload = row.querySelector('[data-gs-reload]');
      reload.textContent = s.loading ? 'Loading…' : 'Reload';
      reload.disabled = s.loading;
      const [text, cls] = tokenLabel(s), token = row.querySelector('[data-gs-token]');
      token.textContent = text; token.className = cls;
    });
  }
  /** Shows the sources. `{token: repo}` opens that source's token field, ready to paste in. */
  function open({token = null} = {}){
    const want = token && String(token).toLowerCase();
    const s = want && store.sources().find(x => x.repo.toLowerCase() === want);
    ui.tokenFor = s ? s.repo : null; ui.confirmRemove = null; ui.saved = null;
    renderSources(s ? `[data-repo="${s.repo}"] .gs-input` : null, s ? s.repo : null);
    if (!unsubscribe) unsubscribe = store.subscribe(refreshSources);
  }

  /* ---------- conflict ---------- */
  /** Asks what to do about a conflict. Resolves to 'overwrite', 'theirs', 'copy', or null for cancel. */
  function askConflict(c){
    if (pending){ const p = pending; pending = null; p(null); }
    if (unsubscribe){ unsubscribe(); unsubscribe = null; }
    return new Promise(done => {
      pending = done;
      const pick = choice => () => { pending = null; close(); done(choice); };
      const name = (c.mine && itemName(c.mine)) || (c.theirs && c.theirs.item && itemName(c.theirs.item)) || c.id;
      const removing = c.op === 'remove';
      const what = c.theirs ? 'was changed' : 'was removed';
      show('conflict', () => [
        head('Changed meanwhile', c.repo),
        el('div', {class: 'gs-body'},
          el('p', {class: 'gs-text', text: `“${name}” ${what} on another device or on GitHub since you loaded it.`}),
          c.theirs && c.theirs.item && itemName(c.theirs.item) !== name ? el('p', {class: 'gs-note', text: `It is now called “${itemName(c.theirs.item)}”.`}) : null,
          el('p', {class: 'gs-note', text: 'Nothing is lost either way: GitHub keeps every earlier version in the history.'}),
          el('div', {class: 'gs-choices'},
            removing
              ? el('button', {class: 'gs-btn gs-danger', type: 'button', 'data-gs-focus': true, text: 'Remove it anyway', onclick: pick('overwrite')})
              : el('button', {class: 'gs-btn gs-primary', type: 'button', 'data-gs-focus': true, text: c.theirs ? 'Overwrite with mine' : 'Save mine again', onclick: pick('overwrite')}),
            c.theirs ? el('button', {class: 'gs-btn', type: 'button', text: removing ? 'Keep it' : 'Keep theirs, drop mine', onclick: pick('theirs')}) : null,
            removing ? null : el('button', {class: 'gs-btn', type: 'button', text: 'Save mine as a copy', onclick: pick('copy')}),
            el('button', {class: 'gs-btn gs-quiet', type: 'button', text: 'Cancel', onclick: pick(null)})))
      ]);
    });
  }

  async function withConflict(run){
    try { return await run(); }
    catch (e){
      if (!(e instanceof GitStoreConflict)) throw e;
      const choice = await askConflict(e);
      return choice ? store.resolve(e, choice) : null;
    }
  }

  /* ---------- history ---------- */
  /** Shows an item's versions. `onOpen({item, commit, date})` gets one opened read-only (the panel closes first);
      Restore saves an older version as the newest, and `onRestore({id, item, sha, commit, kept})` gets what was
      saved. `base` is the version the app has open (working folder): a restore on top of a newer version asks the
      conflict question. `restore: false` leaves out the Restore buttons, for an app that offers its own. */
  async function showHistory(repo, id, {onOpen = null, onRestore = null, name = null, base, restore: canRestore = true} = {}){
    if (unsubscribe){ unsubscribe(); unsubscribe = null; }
    const known = (store.source(repo)?.items || []).find(i => i.id === id);
    const label = name || (known && known.name) || id;
    const status = el('p', {class: 'gs-note', role: 'status', text: 'Loading the versions…'});
    const list = el('ol', {class: 'gs-versions'});
    show('history', () => [head(`Versions of “${label}”`, repo), el('div', {class: 'gs-body'}, status, list)]);
    const canWrite = store.source(repo)?.canWrite && canRestore;
    let at = base;   // the version the app has open; a restore here moves it on
    const fill = async (done = '') => {
      let versions;
      try { versions = await store.history(repo, id); }
      catch (e){ status.textContent = e.message; status.className = 'gs-note gs-warn'; return; }
      if (view !== 'history') return;
      status.textContent = (done ? done + ' ' : '') + (versions.length ? `${plural(versions.length, 'version')}, newest first.` : 'No versions found.');
      status.className = 'gs-note';
      list.replaceChildren(...versions.map((v, k) => {
        let confirming = false;
        const restore = el('button', {class: 'gs-btn', type: 'button', text: 'Restore…'});
        restore.addEventListener('click', async () => {
          if (!confirming){ confirming = true; restore.textContent = 'Restore this version'; restore.classList.add('gs-primary'); return; }
          restore.disabled = true; restore.textContent = 'Restoring…';
          let r;
          try { r = await withConflict(() => store.restore(repo, id, v.commit, {base: at})); }
          catch (e){ status.textContent = e.message; status.className = 'gs-note gs-warn'; restore.disabled = false; restore.textContent = 'Restore…'; confirming = false; return; }
          if (!r){ await fill('Not restored.'); return; }
          if (r.kept === 'theirs'){ if (at !== undefined) at = r.sha; await fill('Not restored: the version on GitHub was kept.'); return; }
          if (at !== undefined && r.id === id) at = r.sha;
          const copy = r.kept === 'copy';
          if (onRestore) try { onRestore({id: r.id, item: r.item, sha: r.sha, commit: r.commit, kept: r.kept || null}); } catch (e){ setTimeout(() => { throw e; }); }
          try {
            if (view !== 'history') return;
            await fill(copy ? 'Restored as a copy, next to the newer version.' : 'Restored: it is now the newest version.');
            // the button that had the focus is gone with the old list: keep the focus in the panel, so Esc closes it
            if (view === 'history' && !root.contains(document.activeElement)) card.querySelector('.gs-x')?.focus({preventScroll: true});
          }
          catch (e){ status.textContent = e.message; status.className = 'gs-note gs-warn'; restore.disabled = false; restore.textContent = 'Restore…'; confirming = false; }
        });
        const openBtn = onOpen ? el('button', {class: 'gs-btn', type: 'button', text: 'Open', onclick: async () => {
          try { const old = await store.version(repo, id, v.commit); close(); onOpen({...old, commit: v.commit, date: v.date}); }
          catch (e){ status.textContent = e.message; status.className = 'gs-note gs-warn'; }
        }}) : null;
        return el('li', {class: 'gs-version'},
          el('div', {class: 'gs-line'},
            el('strong', {text: v.message.split('\n')[0] || '(no note)'}),
            k === 0 ? el('span', {class: 'gs-badge gs-on', text: 'Newest'}) : null),
          el('p', {class: 'gs-note', text: `${v.date ? new Date(v.date).toLocaleString() : ''}${v.author ? ' · ' + v.author : ''} · ${v.commit.slice(0, 7)}`}),
          el('div', {class: 'gs-row'}, openBtn, k > 0 && canWrite ? restore : null));
      }));
    };
    await fill();
  }

  return {
    open, close, askConflict, showHistory,
    get element(){ mount(); return root; },
    /** store.save, asking about a conflict. Resolves to the result, or null when the person cancels. */
    save: (repo, item, options) => withConflict(() => store.save(repo, item, options)),
    /** store.remove, asking about a conflict. Resolves to the result, or null when the person cancels. */
    remove: (repo, id, options) => withConflict(() => store.remove(repo, id, options))
  };
}
