# Protogames

Browser-based drawing tool for tabletop board prototyping: plain scripts, no build step. See README.md for the structure and how to run it, and `docs/README.md` for the documents. `npm test` runs the unit tests (Node 22+).

## Vendored modules

`app/vendor/` holds copies of modules released in [bremondr/web-kit](https://github.com/bremondr/web-kit), at the
versions in `vendor.json`. Don't edit them here: change the module in web-kit, release it, then run
`node tools/update-vendor.mjs` (or wait for the daily "Update vendored modules" pull request).

The project's own code that uses a module stays outside the vendored folder (for `feedback-kit`: `app/feedback.js`; for
`git-store-kit`: `app/repo.js`, `app/repo-projects.js` and the dev-only `app/repo-practice.js`).

## Working from the issues

Feedback from the app arrives as issues with the `feedback` label ("fix the open feedback issues" means those).
Each one has a table of what was on screen (screen size, orientation, theme, browser, page) and, where the app
makes one, a link that reopens the same view. The pasted picture is a redrawn copy of the page (or, if the person switched to it, of just the board canvas): close to what
was on screen but not an exact screenshot, so images, fonts and CSS effects can differ slightly.

## Site build and previews

`tools/build-site.mjs`, `tools/preview-runtime.js` and `.github/workflows/pages.yml` are copies of web-kit's
`consumer/` files. Don't edit them here: what is particular to Protogames goes in `site.json`, and a change the
copies need is made in web-kit. Copy them again when web-kit's `consumer/CHANGELOG.md` says so. See `docs/DEPLOYMENT.md`.

## Pull requests from forks

Never merge a pull request whose head is in a fork: it has no preview and its checks do not run. Read the diff, then
mirror it with `node tools/mirror-pr.mjs <number>` and merge the mirror (see `CONTRIBUTING.md`). Don't `@`-mention
outside contributors in text you write unless asked. "Merge all pull requests" does not include forks: list them and ask.
