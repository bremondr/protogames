# Deployment

Purpose: how Protogames is published (production and per-pull-request previews), how the site is built, and the security rules that follow from it.

**Status:** current reference. **Last verified:** 2026-10-26 against `d6ca3be` (`main`); the GitHub Pages settings (custom domain `protogames.eu`, source "GitHub Actions", HTTPS enforced) and the DNS records were read from GitHub and public DNS on the same day. Part of the [documentation index](README.md).

## Contents

[Versions and addresses](#versions-and-addresses) · [Custom domain](#custom-domain) · [How to try something out](#how-to-try-something-out) · [What the workflow does](#what-the-workflow-does) · [What is different in a preview](#what-is-different-in-a-preview) · [Security](#security) · [Setting it up](#setting-it-up-once) · [The landing page](#the-landing-page)

## Versions and addresses

Protogames is a static site (no build step), so any version of the repository can be served as is. One GitHub Pages site carries several versions at once:

| Version | Address | Built from |
|---|---|---|
| **Production** | `https://protogames.eu/` (landing page) and `.../app/` (the editor) | `main` |
| **Preview** | `https://protogames.eu/preview/pr-<number>/` (landing page) and `.../preview/pr-<number>/app/` (the editor) | the head of open pull request `<number>` |
| Index of previews | `https://protogames.eu/preview/` | the previews that were built (with a "draft" tag and a link to the pull request) |

Only `index.html`, `landing.js` and `app/` are published (`app/` holds the editor with `styles.css`, `js/`, `images/`, `showcases/` and `data/`); tests, docs, `dev/` and `scripts/` are not. A `.nojekyll` file is added.

## Custom domain

The site is served from `protogames.eu` (set under Settings → Pages → Custom domain; the site is deployed by a workflow, so no `CNAME` file is needed). DNS is at WEDOS: `A` records `185.199.108.153`, `.109.153`, `.110.153`, `.111.153` and `AAAA` records `2606:50c0:8000::153` to `8003::153` on the apex, and a `www` `CNAME` to `bremondr.github.io`. The old `bremondr.github.io/protogames/` address redirects to the new one (share links keep working, the path and hash are kept). Browser storage (saved projects, custom themes, settings) is tied to the address (the origin), so it does **not** move with the redirect: work saved only in the browser under `bremondr.github.io` is not visible on `protogames.eu`, and the old address can no longer be opened to export it. Anyone who used the old address should have exported their projects (Export, Project file) before the move; projects exported earlier can be loaded on `protogames.eu` with Load.

## How to try something out

Open a pull request (a **draft** is fine for an experiment). The workflow publishes it and comments the link on the pull request (or, if the pull request cannot have a preview, says why); pushing more commits updates the preview, and closing or merging the pull request removes it. Several experiments side by side are simply several open pull requests.

A preview shows a small **Preview: PR #n (commit)** badge with links to production and to the list of previews. You can hide it with the x.

## What the workflow does

`.github/workflows/pages.yml` ("Deploy site") runs on every push to `main`, on pull request events (`opened`, `reopened`, `synchronize`, `ready_for_review`, `closed`, through `pull_request_target`) and by hand (`workflow_dispatch`). Each run rebuilds the **whole** site (so nothing stale is left behind) using `scripts/build-site.js`:

1. checks out `main` and runs the unit tests (`npm test`) on every run, whatever started it (a failing `main` is never published, not even by a pull request event);
2. lists the open pull requests of this repository (forks are filtered out before any limit; the newest 40 are looked at) and fetches their heads;
3. writes production at the root and each pull request under `preview/pr-<number>/`, reading every version straight from git;
4. deploys the folder with the official Pages actions, then comments on **every** open pull request in the build summary (see below).

Runs are serialised and the latest one wins (`concurrency: group pages, cancel-in-progress` is on the deploy job, so a skipped fork pull request cannot cancel a deploy in flight). Actions are referenced by version tag, not pinned to a commit. The token has `contents: read`, `pages: write`, `id-token: write` and `pull-requests: write` (the last for the comments). A separate workflow, `.github/workflows/test.yml`, runs `npm test` on every push to `main` and every pull request, with `contents: read` only.

**Skipped pull requests.** A pull request is skipped, with a warning in the log, and never blocks production, when its head cannot be fetched, has no `app/index.html` (it is older than the landing page/app split: rebase on main), has no landing page, or when its `app/index.html` or landing page uses a local script, stylesheet, icon or image that is not in the published files (for example a head without `js/`). At most 20 previews are published; the limit is applied after skipping, so a skipped pull request does not use up a place, and the pull requests beyond it are reported as over the limit.

**The build summary and the comments.** `build-site.js` can write a JSON summary (`--summary build-summary.json`, not published) with one entry per pull request: `built` (with the short commit), `skipped` (with the reason) or `over-cap`. The last step of the workflow runs after a successful deploy, in whichever run completed it, and for every pull request in the summary creates or updates the single comment that starts with `<!-- protogames-preview -->` (only a comment by `github-actions[bot]` is updated; nothing is posted twice, an unchanged comment is not touched): a link for a built preview, `No preview: <reason>` for a skipped one, and a note for one over the limit. A run that a newer one cancelled therefore does not leave a pull request without its comment, because the next run that finishes posts it. Comments on closed pull requests are not touched. The workflow and the build script that run are always the ones on `main` (see Security), so a change to what is published, such as adding a folder to the list in `scripts/build-site.js`, only shows up in previews once it has been merged.

You can build the same folder locally from any git refs (checked on this revision: it writes `_site/` with production, `preview/index.html` and each preview):

```bash
node scripts/build-site.js --out _site --main main --previews previews.json --repo bremondr/protogames
# previews.json: [{ "number": 66, "title": "Experiment", "ref": "my-branch" }]   ("isDraft": true adds a draft tag)
python -m http.server 8000 --bind 127.0.0.1 --directory _site
```

`_site/`, `previews.json` and `build-summary.json` are ignored by git. To run the editor without building anything, serve the repository root (`python -m http.server 8000 --bind 127.0.0.1`) and open `/` (landing page) or `/app/` (editor); showcases and country outlines are fetched, so opening `app/index.html` as a file is not enough for them. The tests need Node.js 22 or newer.

## What is different in a preview

Production is the site exactly as committed (landing page at the root, the editor in `app/`), and a preview has the same layout. A preview differs in three ways, all added by the build and none present in the source:

- **Separate saved data.** All versions share one browser origin, so without care a preview would read and overwrite production's stored projects, themes and settings (and the project format is versioned, so an experiment may write data production cannot read). `preview-runtime.js` is the first script of a preview's `app/index.html` and of its landing page (which lists the saved projects) and makes `localStorage` and `sessionStorage` see only keys with a `preview:pr-<n>:` prefix, so a preview never sees or touches production's data or another preview's. The keys of a closed pull request are never cleaned up and count against the shared quota (register: A3-L25).
- **A badge**, so a preview is not mistaken for the real thing.
- **No analytics, and `noindex`**, so experiments do not count as visits or show up in search (the analytics script is removed from the preview page and a `robots` meta tag is added; the index of previews is `noindex` too).

Share links carry the address they were made on, so a link made on a preview opens on that preview. A link from an experiment may use a newer link or project format than production understands; production then refuses it with a clear "made by a newer version" message.

## Security

All versions are served from one origin, so code in a preview could read production's data. For that reason:

- only pull requests **from this repository** are published, never from forks;
- the workflow uses `pull_request_target`, so the workflow that runs is always the one on `main`, and a pull request's files are only copied out of git, never executed in CI;
- preview code can still read production's storage if it wants to (the prefixing protects against accidents, not against malicious code), so only open pull requests you trust from people with write access.

**Content-Security-Policy and analytics (accepted risk).** `app/index.html` carries a CSP `<meta>`: `default-src 'self'`, scripts only from the site itself and from `scripts.simpleanalyticscdn.com`, connections (`connect-src`) only to the site and the analytics hosts, `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`, so injected markup cannot load other code or send data elsewhere. The analytics script is the one third-party script in production: it is loaded from a "latest" address, so it cannot be pinned with Subresource Integrity, and whoever controls that address could run code on the page. This is accepted for a static, secret-free app (the original requirement that no user data leaves the browser is therefore relaxed for anonymous page views), and previews do not load it. Styles allow `'unsafe-inline'` and images allow `data:`, `blob:` and `https:` (themes may name images by web address, which are fetched on every start: register: A3-L26); a meta tag cannot set `frame-ancestors`. The landing page has its own, stricter policy (see below) and no analytics.

## Setting it up (once)

This was done once and is kept for rebuilding the site elsewhere.

1. Merge the pull request that adds the workflow.
2. In the repository, **Settings, Pages, Build and deployment, Source: GitHub Actions** (it was "Deploy from a branch"). Until the first workflow run finishes, the site is not updated, so run the workflow right away (**Actions, Deploy site, Run workflow**) or push to `main`.
3. If the `github-pages` environment restricts deployment branches, it must allow `main` (the default); pull request runs also deploy as `main`.

To go back, set the source to "Deploy from a branch" and choose `main`; the site then contains only production.

## The landing page

`index.html` at the root is a static landing page (no build step, inline styles, no analytics) with its own Content-Security-Policy: scripts, images (and `data:` images) only from the site itself and no network connections at all. It loads `app/js/projectLibrary.js` and `landing.js`, which do two things: forward any root address whose hash starts with `#b=` to `app/` with the query and hash intact (share links made before the editor moved to `app/` pointed at the root; the same happens when such a link is pasted into an open landing-page tab), and list the projects saved in this browser, each opening in the editor (see "Projects in the browser" in [SPECIFICATION.md](SPECIFICATION.md#projects-in-the-browser)). Saved data is stored per browser origin, not per path, so it is still there after the move from `/` to `/app/` (the move to `protogames.eu` is different: see Custom domain).
