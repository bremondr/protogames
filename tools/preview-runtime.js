/* PREVIEW RUNTIME
   The original is consumer/preview-runtime.js in bremondr/web-kit; projects keep a copy in tools/preview-runtime.js,
   next to tools/build-site.mjs. Don't edit the copy: what differs between projects is in site.json.

   The site build adds it to previews only (a pull request published under /preview/pr-<n>/), at the preview's root,
   as the first script of every HTML page. The live site and the project's own source never contain it. It does two
   things:

   1. Gives the preview its own browser storage. Every version on the GitHub Pages site shares one origin, so
      without this a preview would read and overwrite what the live site and the other previews saved.
      localStorage and sessionStorage keys, IndexedDB database names and Cache Storage names get a per-preview
      prefix instead, unseen by the page. (This guards against accidents, not against code that means harm.)
   2. Shows a small badge, so nobody mistakes a preview for the real site: the commit, links to the pull request,
      the live version of the same page and all previews, and, when site.json has "feedback", a Feedback link. That
      link first asks the page for its own feedback panel with a cancelable event (feedback.event, default
      "preview:feedback"); a page that cancels it opened its panel, and otherwise a new issue opens with only the
      preview filled in.

   The page can read the preview's description as window.SITE_PREVIEW (and under site.json's "global" name too).
   The `null` after the BUILD marker below is replaced with this preview's description when it is built. */
(function (root) {
  'use strict';

  const build = /*BUILD*/ null;

  /* ---- storage ---- */

  // Patches the prototype: assigning methods on a Storage instance would store items named "getItem" instead.
  function installStoragePrefix(StorageClass, prefix) {
    const proto = StorageClass.prototype;
    const original = {getItem: proto.getItem, setItem: proto.setItem, removeItem: proto.removeItem, key: proto.key};
    const realLength = Object.getOwnPropertyDescriptor(proto, 'length').get;

    function ownNames(storage) {
      const names = [], count = realLength.call(storage);
      for (let i = 0; i < count; i++) {
        const key = original.key.call(storage, i);
        if (key !== null && key.startsWith(prefix)) names.push(key.slice(prefix.length));
      }
      return names;
    }

    proto.getItem = function (key) { return original.getItem.call(this, prefix + key); };
    proto.setItem = function (key, value) { return original.setItem.call(this, prefix + key, value); };
    proto.removeItem = function (key) { return original.removeItem.call(this, prefix + key); };
    proto.key = function (index) { const names = ownNames(this); return index < names.length ? names[index] : null; };
    proto.clear = function () { ownNames(this).forEach(name => original.removeItem.call(this, prefix + name)); };
    Object.defineProperty(proto, 'length', {configurable: true, get() { return ownNames(this).length; }});
  }

  // indexedDB.open('x') opens 'preview:pr-<n>:x'; databases() lists only the preview's own, without the prefix.
  function installIndexedDBPrefix(FactoryClass, prefix) {
    const proto = FactoryClass.prototype;
    const original = {open: proto.open, deleteDatabase: proto.deleteDatabase, databases: proto.databases};
    proto.open = function (name, ...rest) { return original.open.call(this, prefix + name, ...rest); };
    proto.deleteDatabase = function (name, ...rest) { return original.deleteDatabase.call(this, prefix + name, ...rest); };
    if (original.databases) {
      proto.databases = function () {
        return original.databases.call(this).then(list => list
          .filter(db => db.name && db.name.startsWith(prefix))
          .map(db => ({name: db.name.slice(prefix.length), version: db.version})));
      };
    }
  }

  // caches.open('x') opens 'preview:pr-<n>:x', and keys() lists only the preview's own caches. caches.match() still
  // looks in every cache; a page that cares opens its cache first.
  function installCachePrefix(CacheStorageClass, prefix) {
    const proto = CacheStorageClass.prototype;
    const original = {open: proto.open, has: proto.has, delete: proto.delete, keys: proto.keys};
    proto.open = function (name) { return original.open.call(this, prefix + name); };
    proto.has = function (name) { return original.has.call(this, prefix + name); };
    proto.delete = function (name) { return original.delete.call(this, prefix + name); };
    proto.keys = function () {
      return original.keys.call(this).then(names => names.filter(n => n.startsWith(prefix)).map(n => n.slice(prefix.length)));
    };
  }

  /* ---- links ---- */

  // The preview's root is where this script is; the live site is two folders up, at the same page.
  function linksFor(scriptUrl, pageUrl) {
    const previewRoot = new URL('./', scriptUrl);
    const page = new URL(pageUrl);
    const inside = page.pathname.startsWith(previewRoot.pathname) ? page.pathname.slice(previewRoot.pathname.length) : '';
    return {liveUrl: new URL('../../' + inside, previewRoot).href, indexUrl: new URL('../', previewRoot).href};
  }

  /* ---- badge ---- */

  // A small tab in the bottom-right corner, so it covers as little of the page as it can. Tapping it shows the
  // commit and the links; × hides it until the page is loaded again.
  function showBadge(info, links, doc) {
    const badge = doc.createElement('div');
    badge.className = 'preview-badge';
    badge.setAttribute('role', 'note');
    badge.setAttribute('data-fk-skip', '');
    badge.style.cssText = 'position:fixed;right:calc(8px + env(safe-area-inset-right, 0px));bottom:0;z-index:2147483000;'
      + 'display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;column-gap:8px;max-width:calc(100vw - 16px);'
      + 'padding:3px 6px calc(3px + env(safe-area-inset-bottom, 0px)) 6px;border-radius:8px 8px 0 0;'
      + 'background:#7a3e00;color:#fff;font:600 12px/1.2 system-ui,sans-serif;box-shadow:0 -2px 10px rgba(0,0,0,.25)';

    const toggle = doc.createElement('button');
    toggle.type = 'button';
    toggle.textContent = 'Preview ' + info.label;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.style.cssText = 'border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;padding:4px 6px;white-space:nowrap;flex-shrink:0';
    badge.appendChild(toggle);

    const link = (label, href) => {
      const a = doc.createElement('a');
      a.textContent = label;
      a.href = href;
      a.style.cssText = 'color:#ffd9a8;text-decoration:underline;white-space:nowrap';
      return a;
    };

    if (info.feedback) {
      const feedback = link('Feedback', feedbackUrl(info, root));
      feedback.target = '_blank';
      feedback.rel = 'noopener';
      feedback.style.padding = '4px 6px';
      feedback.addEventListener('click', e => {
        const ev = new root.CustomEvent(info.feedback.event, {cancelable: true});
        if (!doc.dispatchEvent(ev)) e.preventDefault();   // the page opened its own panel
        else feedback.href = feedbackUrl(info, root);      // the page's address now
      });
      badge.appendChild(feedback);
    }

    const more = doc.createElement('span');
    more.style.cssText = 'display:none;flex-wrap:wrap;justify-content:flex-end;align-items:center;column-gap:10px;row-gap:2px';
    if (info.sha) { const c = doc.createElement('span'); c.textContent = info.sha; c.style.cssText = 'font-weight:400;opacity:.8'; more.appendChild(c); }
    if (info.pullUrl) more.appendChild(link('pull request', info.pullUrl));
    more.appendChild(link('live site', links.liveUrl));
    more.appendChild(link('all previews', links.indexUrl));
    const close = doc.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Hide the preview badge');
    close.style.cssText = 'border:0;background:transparent;color:#fff;font-size:18px;line-height:1;cursor:pointer;padding:2px 6px;min-width:28px;min-height:28px';
    close.addEventListener('click', () => badge.remove());
    more.appendChild(close);
    badge.appendChild(more);

    toggle.addEventListener('click', () => {
      const open = more.style.display === 'none';
      more.style.display = open ? 'flex' : 'none';
      toggle.setAttribute('aria-expanded', String(open));
    });
    doc.body.appendChild(badge);
    return badge;
  }

  // a new issue with what the preview knows; the page's own feedback panel, if it has one, fills in much more
  function feedbackUrl(info, win) {
    const loc = win.location || {}, nav = win.navigator || {};
    const body = ['## What’s wrong, and what should happen', '', '', '', '## On screen', '',
      `- Where: Preview ${info.label}${info.sha ? ` (commit ${info.sha})` : ''}`,
      `- Page: ${loc.href || ''}`,
      `- Screen: ${win.innerWidth} × ${win.innerHeight} px`,
      `- Browser: ${nav.userAgent || ''}`].join('\n');
    const labels = info.feedback.labels.length ? '&labels=' + encodeURIComponent(info.feedback.labels.join(',')) : '';
    return `https://github.com/${info.feedback.repo}/issues/new?title=` + encodeURIComponent(`Feedback on preview ${info.label}`)
      + labels + '&body=' + encodeURIComponent(body);
  }

  if (build) {
    root.SITE_PREVIEW = build;
    if (build.global) root[build.global] = build;
    const prefix = build.storagePrefix;
    if (typeof root.Storage === 'function') installStoragePrefix(root.Storage, prefix);
    if (typeof root.IDBFactory === 'function') installIndexedDBPrefix(root.IDBFactory, prefix);
    if (typeof root.CacheStorage === 'function') installCachePrefix(root.CacheStorage, prefix);
    if (typeof root.document !== 'undefined') {
      const doc = root.document;
      const script = doc.currentScript;
      const links = linksFor(script ? script.src : root.location.href, root.location.href);
      // after parsing, when <title> and <body> exist: this script runs before them
      const show = () => { doc.title = build.label + ' · ' + doc.title; showBadge(build, links, doc); };
      if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', show);
      else show();
    }
  }

  root.__sitePreview = {installStoragePrefix, installIndexedDBPrefix, installCachePrefix, linksFor, showBadge, feedbackUrl};
})(typeof window !== 'undefined' ? window : globalThis);
