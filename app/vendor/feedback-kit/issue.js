/* feedback-kit: the address of a new GitHub issue, filled in. No DOM, so it runs in plain Node too.

   issueUrl({repo, title, labels, sections, rows, footer}) → {url, shortened}
     repo      'owner/name'
     labels    ['feedback'], put on the issue when the person may label (the repository's owner can)
     sections  [{heading, text, fallback}] after "What's wrong" and "Picture": app-specific blocks, such as a link
               that reopens what was on screen. A section with a `fallback` gives way to it when the address would
               be too long (the longest first); GitHub refuses addresses over about 8 KB.
     rows      [[name, value]] for the table at the end (the kit adds the device's own rows)
     footer    a small line at the very end */

export const URL_LIMIT = 8000;

// one line of plain text in a Markdown table cell
export const cell = v => String(v ?? '').replace(/\s+/g, ' ').trim().replace(/\\/g, '\\\\').replace(/\|/g, '\\|') || '–';

export function issueBody({sections = [], rows = [], footer = ''}){
  return [
    '## What’s wrong, and what should happen', '', '', '',
    '## Picture', '', '<!-- The picture was copied: paste it here, or attach the saved picture. -->', '', '',
    ...sections.flatMap(s => [`## ${s.heading}`, '', s.text, '']),
    ...(rows.length ? ['## On screen', '', '| | |', '|---|---|', ...rows.map(([k, v]) => `| ${cell(k)} | ${cell(v)} |`), ''] : []),
    ...(footer ? [`<sub>${footer}</sub>`] : [])
  ].join('\n');
}

export function issueUrl(issue, limit = URL_LIMIT){
  const address = it => `https://github.com/${issue.repo}/issues/new?title=${encodeURIComponent(it.title || '')}`
    + ((it.labels || []).length ? `&labels=${encodeURIComponent(it.labels.join(','))}` : '')
    + `&body=${encodeURIComponent(issueBody(it))}`;
  let it = {...issue, sections: [...(issue.sections || [])]}, url = address(it), shortened = false;
  // give way section by section, the longest first, until the address fits
  const order = it.sections.map((s, k) => k).filter(k => it.sections[k].fallback !== undefined)
    .sort((a, b) => it.sections[b].text.length - it.sections[a].text.length);
  for (const k of order){
    if (url.length <= limit) break;
    it.sections[k] = {...it.sections[k], text: it.sections[k].fallback}; shortened = true; url = address(it);
  }
  return {url, shortened};
}
