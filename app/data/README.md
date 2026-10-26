# Data

## countries-50m.json

Country outlines for the **Country** board shape (`js/countryBoard.js`, regions in `js/countryRegions.js`). The editor fetches the file (`data/countries-50m.json`, relative to the page) the first time a country board has to be generated, never earlier; opening a saved country board does not need it (see "Country boards" in `docs/SPECIFICATION.md`). `scripts/build-site.js` publishes it with `app/` to production and to every preview.

- Source: [world-atlas](https://github.com/topojson/world-atlas) 2.0.2, file `countries-50m.json` (TopoJSON, 1:50 million scale), built from [Natural Earth](https://www.naturalearthdata.com/) data. Natural Earth is in the public domain; world-atlas is ISC-licensed.
- Fetched from `https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json`, stored unchanged.
- SHA-256: `04342cdc1e3016bcd7db1630de95684d67b79fe3c8c460321e87aef469502394` (of the file as committed: `git show HEAD:app/data/countries-50m.json | sha256sum`, or of the download above. A Windows checkout that converts line endings gives another hash.)
- It is shipped with the app instead of being loaded from a CDN, so the page needs no third-party request for it: the Content-Security-Policy only allows connections to this site (plus the analytics service of production).

To update: download the new version of the file, replace this one, update the version, the URL and the hash above, and run the tests (`tests/countryBoard.test.js` and `tests/countryRegions.test.js` read the real file). The outlines are only read by name and shape, so a newer file normally needs no code change; check the country names used by `js/countryRegions.js`, because Natural Earth renames countries between releases.

### Licence notice for `countries-50m.json`

The file is distributed under the ISC licence of world-atlas; its notice is reproduced here as that licence requires:

```
Copyright 2013-2019 Michael Bostock

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
```

The underlying Natural Earth data is in the public domain and needs no notice.
