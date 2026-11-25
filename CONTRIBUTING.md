# Contributing to Protogames

Bug reports, ideas and pull requests are welcome. Report a bug or suggest a feature with an
[issue](https://github.com/bremondr/protogames/issues/new/choose); the templates ask for what is needed to reproduce it.

## Pull requests from a fork

Open the pull request against `main` and make sure `npm test` passes (Node 22+; see the README for the structure).

**A pull request from a fork gets no preview of the site, and it is not merged directly.** Every version of the site
shares one origin (and so one browser storage), so the deploy workflow never builds code from a fork. Instead, a
maintainer reviews the diff and then *mirrors* the pull request: the commits are copied, with their author, to a
branch in this repository, where they get the usual preview. The change is tried there and merged from there. Your
original pull request is closed with a link to the mirror, and the commits keep your name as author.

You don't have to do anything for this. It can take a while, because someone has to read the change first.

## For maintainers: dealing with a pull request from a fork

1. **Read the diff first.** The fork's code has not run anywhere but the contributor's machine (the unit tests do not
   run for forks either), and it may touch workflows, `tools/` or vendored files. Don't mirror what you would not merge.
2. **Mirror it**, from a checkout of this repository:

   ```bash
   node tools/mirror-pr.mjs 140          # branch try-140 from main, the PR's commits cherry-picked, tests run
   git push -u origin try-140
   ```

   The script stops at the first conflict and never pushes. It keeps the original authors.
3. **Open a draft pull request** from `try-<number>` to `main` and give it the label `outside-source`: say in it that it is
   from #<number> by the contributor, what it does, and a short list of what to try on the preview. Don't `@`-mention
   the contributor in it. Link the issue it fixes. The label puts its preview in the section "From outside
   contributors" on the list of previews (`/preview/`), apart from the maintainers' own (see `site.json`'s
   `previewSections`).
4. **Try the preview**, mark the draft ready and merge it. Merge the mirror, never the original.
5. **Close the original** with a comment linking the mirror (or its merge commit), thanking the contributor. If the
   change is not wanted, close it with the reason instead; no mirror is needed.

Never merge a pull request whose head is in a fork, whatever its checks say.
