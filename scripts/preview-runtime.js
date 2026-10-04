/**
 * PROTOGAMES PREVIEW RUNTIME
 * --------------------------------------------------------------
 * Added (by scripts/build-site.js) to preview builds only, as the first script of the page;
 * the production build and the app's own source never contain it. It does two things:
 *
 *  1. Gives the preview its own browser storage. Every version published under the same
 *     address shares one origin, so without this a preview would read and overwrite the
 *     autosave, themes and settings of production and of the other previews. All storage keys
 *     get a per-preview prefix instead, invisibly to the app.
 *  2. Shows a small badge so nobody mistakes a preview for the real thing.
 *
 * The `null` after the BUILD marker in the code below is replaced with the build description when
 * the preview is built.
 */
(function (root) {
    'use strict';

    const build = /*BUILD*/ null;

    // ---- Storage ---------------------------------------------------------------------------------

    /**
     * Makes every Storage object (localStorage and sessionStorage) see only its own keys, stored
     * under `prefix`. Patches the prototype: assigning methods on a Storage instance would store
     * items named "getItem" instead.
     */
    function installStoragePrefix(StorageClass, prefix) {
        const proto = StorageClass.prototype;
        const original = {
            getItem: proto.getItem,
            setItem: proto.setItem,
            removeItem: proto.removeItem,
            key: proto.key
        };
        const realLength = Object.getOwnPropertyDescriptor(proto, 'length').get;

        function ownNames(storage) {
            const names = [];
            const count = realLength.call(storage);
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
        proto.clear = function () { ownNames(this).forEach((name) => original.removeItem.call(this, prefix + name)); };
        Object.defineProperty(proto, 'length', { configurable: true, get() { return ownNames(this).length; } });
    }

    // ---- Badge -----------------------------------------------------------------------------------

    function showBadge(info, doc) {
        const badge = doc.createElement('div');
        badge.setAttribute('role', 'note');
        badge.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9998;display:flex;align-items:center;gap:8px;'
            + 'padding:6px 8px 6px 12px;border-radius:999px;background:#7a3e00;color:#fff;font:600 12px/1.2 system-ui,sans-serif;'
            + 'box-shadow:0 4px 14px rgba(0,0,0,.35)';

        const text = doc.createElement('span');
        text.textContent = `Preview: ${info.label}${info.sha ? ` (${info.sha})` : ''}`;
        badge.appendChild(text);

        const link = (label, href) => {
            const a = doc.createElement('a');
            a.textContent = label;
            a.href = href;
            a.style.cssText = 'color:#ffd9a8;text-decoration:underline';
            return a;
        };
        badge.appendChild(link('production', info.productionUrl));
        badge.appendChild(link('all previews', info.indexUrl));

        const close = doc.createElement('button');
        close.type = 'button';
        close.textContent = '×';
        close.setAttribute('aria-label', 'Hide the preview badge');
        close.style.cssText = 'border:0;background:transparent;color:#fff;font-size:16px;line-height:1;cursor:pointer;padding:0 4px';
        close.addEventListener('click', () => badge.remove());
        badge.appendChild(close);
        doc.body.appendChild(badge);
    }

    if (build) {
        root.PG_BUILD = build;
        if (typeof root.Storage === 'function') installStoragePrefix(root.Storage, build.storagePrefix);
        if (typeof root.document !== 'undefined') {
            const show = () => showBadge(build, root.document);
            if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', show);
            else show();
        }
    }

    root.__pgPreview = { installStoragePrefix, showBadge };
})(typeof window !== 'undefined' ? window : globalThis);
