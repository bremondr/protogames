# Changes to feedback-kit

Each version is released as the tag `feedback-kit-vX.Y.Z`. A new major version (the first number) means a project using the kit may need changes; the notes say which.

## 2.2.0 (2026-11-24)

The panel and the issue in another language: Czech is built in.

- **New option `language`** for `createFeedback` and `issueUrl`: `'en'` (the default) or `'cs'`. It changes every text the kit shows or writes: the buttons, notes and messages in the panel, the pens' names, the issue's headings ("Co je špatně a co by se mělo stát", "Snímek obrazovky", "Na obrazovce") and the device's rows (Obrazovka, Okno, Prohlížeč, Stránka, and their values). The panel gets `lang="cs"`. The default `heading` and `pictureLabel` follow the language; given ones win.
- **New option `strings`**: `{key: text}` over the chosen language, to change single texts (`{openIssue: 'Nahlásit na {provider}'}`), or with another language code, to give a whole new language (what it leaves out is English). An unknown language without `strings`, an unknown key or a text that isn't a string throws when `createFeedback` is called.
- **New file `strings.js`**: every text, by language (`STRINGS`), and `texts(language, strings)` and `format(template, values)`. Texts with a value in them are templates (`'Write the issue on {provider}'`, `'{pen} pen'`), so a language puts it where its grammar wants. The provider's name has its own entry per language (`provider.github`), for a language whose grammar changes it.
- `deviceRows(texts)` takes the texts; without them, English.
- **The "too long" note names what didn't fit** (#44). `issueUrl` also returns `gaveWay`, the headings of the sections that gave way to their `fallback`, and the panel's note names them and says what to do: "Too long to put in the issue: Reopen. It has a shorter note in its place, so add that part by hand if it matters." (in Czech: "Do hlášení se nevešlo: Reopen. Je v něm místo toho kratší poznámka, takže pokud na tom záleží, doplňte to ručně."). The English note is new text: before, it was "Some of what was on screen was too long to put in the issue." `tooLong` is a template with `{sections}` now; a project's own `strings.tooLong` without it still shows as it is. New in `strings.js`: `listOf(items, language)`, names joined as the language joins them ("Reopen and Data", "Reopen a Data").
- The Czech texts call the picture the person draws on, copies, saves and pastes "snímek obrazovky" everywhere (the issue's heading is "Snímek obrazovky" too). "Obrázek" is left only for an image file in general, such as a dropped file that isn't one.
- **Czech letters in the pictures are drawn in the web font** (#47). `embedFonts` keeps Latin Extended too by default: the rules whose `unicode-range` has a range that starts at U+0000 or U+0100, which are Google Fonts' `latin` and `latin-ext` (`U+0100-02BA, …`). Before, only `U+0000-00FF` was kept, so ě š č ř ž ů ť ď ň (and Slovak and Polish letters) fell back to another font. Cyrillic, Greek and Vietnamese are still left out; the `unicode` option still picks other subsets (`/U\+0000-00FF/i` for the old default). Pictures can be a little bigger. New `fontFaces(css, family, unicode)` and `LATIN` in `picture.js`: the rules `embedFonts` keeps.

Without `language`, the panel and the issue are exactly as before, apart from the "too long" note. **What to change in a project:** add `strings.js` to the service worker's list of files, if there is one (`kit.js` imports it). Set `language: 'cs'` for a Czech app, and remove the `heading` and `pictureLabel` that only translated the defaults.

## 2.1.2 (2026-11-24)

- **A screen capture no longer fails now and then in WebKit.** `screenPicture()` plays the capture in a hidden video. WebKit's video sometimes never shows a live stream it was given, though the stream keeps sending frames, so after about four seconds the panel fell back to the page's picture. Now, when the video has no frame after half a second (and again after a second and a half), it is given the stream again, which makes it show at once. Other browsers never get there.

Nothing to change in a project.

## 2.1.1 (2026-11-24)

- **The picture fits the panel on upright screens** (iPad portrait, phones): a tall picture is scaled down to fit the picture area instead of being cut off at the bottom. Drawing still lands under the finger (#13).
- **No scrollbars in the whole page's picture where the screen shows none:** an element that scrolls, such as a row of buttons that scrolls sideways, was drawn with classic scrollbars that cut off its content, even where the screen has overlay scrollbars (iPad, phones, macOS) or none. Where the screen does show classic scrollbars (Windows), the picture keeps them (#14).

Nothing to change in a project.

## 2.1.0 (2026-11-24)

GitLab, including a self-hosted server, as well as GitHub.

- **New options** for `createFeedback` and `issueUrl`: `provider` (`'github'`, the default, or `'gitlab'`), `host` (the server; by default https://github.com or https://gitlab.com; also GitHub Enterprise Server) and `urlLimit` (the longest issue address, 8000 characters by default).
- **GitLab:** the issue opens at `{host}/{repo}/-/issues/new` with the title and description filled in. `repo` can have nested groups (`group/subgroup/project`), and `host` a path (`https://example.org/gitlab`). The labels are a `/label ~feedback` line at the end of the description, because GitLab's new-issue page takes no labels from the address; GitLab removes the line when the issue is submitted.
- **Checked at once:** a wrong `provider`, `host` (not `https://`, or with a query, fragment or user name), `repo`, `urlLimit` or GitLab label throws when `createFeedback` is called.
- The button and the panel's note name the provider: "Write the issue on GitLab".
- New `issueTarget(options)` and `PROVIDERS` in `issue.js`.

GitHub addresses are exactly as before. **Nothing to change in a project** that stays on GitHub. To move one to GitLab, set `provider` (and `host` if it isn't gitlab.com), and create the label there (see "Setting it up in a project" in the README).

## 2.0.0 (2026-11-22)

The picture is now the whole page, taken at the tap, and the app's own picture becomes a switch in the panel.

- **New `pagePicture(element, options)`** in the new file `page.js`: a picture of the whole page (or one element), redrawn from what is on screen, in every browser, with no prompt. `area: 'screen'` (default) or `'full'` for the whole scrollable page. It keeps typed values, scroll positions, fixed and sticky parts, canvases and `::before`/`::after`. Elements with `data-fk-skip` are left out.
- **The panel opens with the whole page.** A new `page` option is passed to `pagePicture` (`area`, `fonts`, `element`, `maxSize`, `background`).
- **The person's own screenshot**: "Use my screenshot…" in the panel, or pasting (Ctrl+V, ⌘V) or dropping an image on it, makes it the picture to draw on. Works in every browser; on the iPad the button offers Photos.
- **A real screen capture on desktop browsers**: `screenPicture()` and `canCaptureScreen()` in `page.js`, and a new `capture` option: `'button'` (default; **Take a real screenshot** in the panel), `'tap'` (the browser asks at the tap) or `'off'`. The panel is hidden while capturing; if the person says no, or there is no capture (iPad, phones), the picture is the redrawn page.
- On desktop, the issue's "On screen" table has a **Window** row: the window's size and the screen's.
- **`picture` is now optional, and a switch.** The app's own picture is offered as a button in the panel, labelled with the new `pictureLabel` option (default "Just this part"). If the whole page can't be drawn, the panel shows this picture instead.
- The panel no longer shows **Share…** in browsers that can't share the picture: the kit's own display rules beat the `hidden` attribute there.
- The picture no longer moves when the message under it changes length.

**What to change in a project:**
- Add `page.js` to the service worker's list of files, if there is one.
- Pass the web fonts the page uses as `page: {fonts}` (the same `embedFonts(...)` as for `svgPicture`), and choose `area`.
- Keep `picture` if the app's own part is still useful, and set `pictureLabel` to say what it is, for example "Just the field". Or remove it.
- Give `data-fk-skip` to anything that shouldn't be in the picture.
- Choose `capture` (`'button'` is the default, so nothing changes until someone taps it).
- Open the panel on each kind of page and check that the whole page looks right.

## 1.0.1 (2026-11-22)

- The panel no longer shows an empty canvas next to "Making the picture…" while the picture is being made.
- `embedFonts` keeps `@font-face` rules that have no `unicode-range`, as a stylesheet for self-hosted fonts often has. Before, it dropped them, and the picture fell back to another font without saying so.

## 1.0.0 (2026-11-21)

- First release, taken from Ultimate Playbook.
- `createFeedback`: a panel with a picture to draw on (four pen colours, Undo, Clear), kept on the clipboard, with Share and Save, and a link to a new GitHub issue filled in with what was on screen and the device.
- `svgPicture` and `embedFonts`: a picture of an SVG as it looks now, with web fonts inlined.
- `createSketch`: drawing on a picture with a finger, the Apple Pencil or the mouse.
- `issueUrl`: the new-issue address, kept under GitHub's length limit.
