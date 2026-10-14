# Data

## countries-50m.json

Country outlines for the **Country** board shape (`js/countryBoard.js`).

- Source: [world-atlas](https://github.com/topojson/world-atlas) 2.0.2, file `countries-50m.json` (TopoJSON, 1:50 million scale), built from [Natural Earth](https://www.naturalearthdata.com/) data. Natural Earth is in the public domain; world-atlas is ISC-licensed.
- Fetched from `https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json`, stored unchanged.
- SHA-256: `04342cdc1e3016bcd7db1630de95684d67b79fe3c8c460321e87aef469502394`
- It is shipped with the app instead of being loaded from a CDN, because the Content-Security-Policy only allows connections to this site (and works offline).

To update: download the new version of the file, replace this one, update the version and hash above, and run the tests (the outlines are only read by name and shape, so a newer file normally needs no code change; check the country names used by `js/countryRegions.js`).

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
