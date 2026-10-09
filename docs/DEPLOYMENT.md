# Deployment

Protogames is a static site (no build step), so any version of the repository can be served as is. One GitHub Pages site carries several versions at once:

| Version | Address | Built from |
|---|---|---|
| **Production** | `https://bremondr.github.io/protogames/` | `main` |
| **Preview** | `https://bremondr.github.io/protogames/preview/pr-<number>/` | the head of open pull request `<number>` |
| Index of previews | `https://bremondr.github.io/protogames/preview/` | all open pull requests |

## How to try something out

Open a pull request (a **draft** is fine for an experiment). The workflow publishes it and comments the link on the pull request; pushing more commits updates the preview, and closing or merging the pull request removes it. Several experiments side by side are simply several open pull requests.

A preview shows a small **Preview: PR #n (commit)** badge with links to production and to the list of previews. You can hide it with the x.

## What the workflow does

`.github/workflows/pages.yml` runs on every push to `main` and on every pull request event, and each run rebuilds the **whole** site (so nothing stale is left behind) using `scripts/build-site.js`:

1. checks out `main` and, for pushes, runs the unit tests (a failing `main` is not published);
2. lists the open pull requests of this repository and fetches their heads;
3. writes production at the root and each pull request under `preview/pr-<number>/`, reading every version straight from git (only `index.html`, `styles.css`, `js/`, `images/` and `showcases/` are published);
4. deploys the folder with the official Pages actions and comments the preview link.

Runs are serialised and the latest one wins. At most 20 previews are published.

You can build the same folder locally from any git refs:

```bash
node scripts/build-site.js --out _site --main main --previews previews.json --repo bremondr/protogames
# previews.json: [{ "number": 66, "title": "Experiment", "ref": "my-branch" }]
python -m http.server 8000 --directory _site
```

## What is different in a preview

Production is the app exactly as committed. A preview differs in three ways, all added by the build and none present in the source:

- **Separate saved data.** All versions share one browser origin, so without care a preview would read and overwrite production's autosave, themes and settings (and the project format is versioned, so an experiment may write data production cannot read). `preview-runtime.js` is the first script of a preview and gives every storage key a `preview:pr-<n>:` prefix, so a preview never sees or touches production's data or another preview's.
- **A badge**, so a preview is not mistaken for the real thing.
- **No analytics, and `noindex`**, so experiments do not count as visits or show up in search.

Share links carry the address they were made on, so a link made on a preview opens on that preview. A link from an experiment may use a newer link or project format than production understands; production then refuses it with a clear "made by a newer version" message.

## Security

All versions are served from one origin, so code in a preview could read production's data. For that reason:

- only pull requests **from this repository** are published, never from forks;
- the workflow uses `pull_request_target`, so the workflow that runs is always the one on `main`, and a pull request's files are only copied out of git, never executed in CI;
- preview code can still read production's storage if it wants to (the prefixing protects against accidents, not against malicious code), so only open pull requests you trust from people with write access.

**Content-Security-Policy and analytics (accepted risk).** `index.html` carries a CSP `<meta>` that allows scripts only from the site itself and from `scripts.simpleanalyticscdn.com`, so injected markup cannot load other code. The analytics script is the one third-party script in production: it is loaded from a "latest" address, so it cannot be pinned with Subresource Integrity, and whoever controls that address could run code on the page. This is accepted for a static, secret-free app (the original requirement that no user data leaves the browser is therefore relaxed for anonymous page views), and previews do not load it. Styles allow `'unsafe-inline'` and images allow `https:` (themes may name images by web address); a meta tag cannot set `frame-ancestors`.

## Setting it up (once)

1. Merge the pull request that adds the workflow.
2. In the repository, **Settings, Pages, Build and deployment, Source: GitHub Actions** (it was "Deploy from a branch"). Until the first workflow run finishes, the site is not updated, so run the workflow right away (**Actions, Deploy site, Run workflow**) or push to `main`.
3. If the `github-pages` environment restricts deployment branches, it must allow `main` (the default); pull request runs also deploy as `main`.

To go back, set the source to "Deploy from a branch" and choose `main`; the site then contains only production.
