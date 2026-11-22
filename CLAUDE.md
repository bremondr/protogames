# Protogames

Browser-based drawing tool for tabletop board prototyping: plain scripts, no build step. See README.md for the structure and how to run it, and `docs/README.md` for the documents. `npm test` runs the unit tests (Node 22+).

## Vendored modules

`app/vendor/` holds copies of modules released in [bremondr/web-kit](https://github.com/bremondr/web-kit), at the
versions in `vendor.json`. Don't edit them here: change the module in web-kit, release it, then run
`node tools/update-vendor.mjs` (or wait for the daily "Update vendored modules" pull request).

The project's own code that uses a module stays outside the vendored folder (for `feedback-kit`: `app/feedback.js`).

## Working from the issues

Feedback from the app arrives as issues with the `feedback` label ("fix the open feedback issues" means those).
Each one has a table of what was on screen (screen size, orientation, theme, browser, page) and, where the app
makes one, a link that reopens the same view. The pasted picture is a redrawn copy of the page (or, if the person switched to it, of just the board canvas): close to what
was on screen but not an exact screenshot, so images, fonts and CSS effects can differ slightly.
