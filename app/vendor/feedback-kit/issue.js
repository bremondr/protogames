/* feedback-kit: the address of a new issue on GitHub or GitLab, filled in. No DOM, so it runs in plain Node too.

   issueUrl({provider, host, repo, urlLimit, title, labels, sections, rows, footer}) → {url, shortened}
     provider  'github' (default) or 'gitlab'
     host      the server, such as 'https://gitlab.example.com' or 'https://example.org/gitlab'; by default the
               provider's public one (https://github.com, https://gitlab.com)
     repo      'owner/name' on GitHub; 'group/project' or 'group/subgroup/project' on GitLab
     urlLimit  the longest address to make, in characters (default: the provider's, see PROVIDERS)
     labels    ['feedback'], put on the issue when the person may label (the repository's owner can)
     sections  [{heading, text, fallback}] after "What's wrong" and "Picture": app-specific blocks, such as a link
               that reopens what was on screen. A section with a `fallback` gives way to it when the address would
               be too long (the longest first).
     rows      [[name, value]] for the table at the end (the kit adds the device's own rows)
     footer    a small line at the very end

   issueTarget({provider, host, repo, urlLimit, labels}) checks those and throws if one is wrong; createFeedback calls
   it at once, so a mistake shows when the kit is made, not when someone taps the button. */

export const URL_LIMIT = 8000;

// one line of plain text in a Markdown table cell
export const cell = v => String(v ?? '').replace(/\s+/g, ' ').trim().replace(/\\/g, '\\\\').replace(/\|/g, '\\|') || '–';

// GitLab's /label quick action: a label is written bare if it has only these characters, and in quotes otherwise
const labelRef = name => /^[A-Za-z0-9_\-?.&@]+$/.test(name) ? `~${name}` : `~"${name}"`;

/* What differs between the providers. Gitea, Forgejo and Codeberg (/issues/new?title=&body=) would fit here too.
   - GitHub refuses addresses over about 8 KB. The labels go in the address.
   - GitLab: gitlab.com answered addresses up to about 10,200 characters and refused longer ones (400) in November
     2026; 8000 leaves room for a self-hosted server's proxy, which may accept less. The new-issue page takes only the
     title and the description from the address (no labels), so the labels are a /label quick action on the
     description's last line. GitLab takes that line out of the issue whether or not the person may label, and
     applies it only if they may. /-/issues/new works on older servers too; newer ones send it on to
     /-/work_items/new with everything in the address. */
export const PROVIDERS = {
  github: {
    name: 'GitHub', host: 'https://github.com', urlLimit: 8000, levels: [2, 2],
    address: (base, it, body) => `${base}/issues/new?title=${encodeURIComponent(it.title || '')}`
      + ((it.labels || []).length ? `&labels=${encodeURIComponent(it.labels.join(','))}` : '')
      + `&body=${encodeURIComponent(body)}`
  },
  gitlab: {
    name: 'GitLab', host: 'https://gitlab.com', urlLimit: 8000, levels: [2, 21],
    labelLine: labels => labels.length ? `/label ${labels.map(labelRef).join(' ')}` : '',
    checkLabel: name => { if (/["\r\n]/.test(name) || !name.trim()) throw new Error(`feedback-kit: GitLab can't set the label ${JSON.stringify(name)} from the issue's text`); },
    address: (base, it, body) => `${base}/-/issues/new?${encodeURIComponent('issue[title]')}=${encodeURIComponent(it.title || '')}`
      + `&${encodeURIComponent('issue[description]')}=${encodeURIComponent(body)}`
  }
};

const SEGMENT = /^[A-Za-z0-9._-]+$/;
const segmentOk = s => SEGMENT.test(s) && /[A-Za-z0-9]/.test(s);   // not '.', '..' or GitLab's '-'

/* The provider, and the project's address on it (no trailing slash). The host is part of a link the person opens,
   so it is checked strictly: https only, a name and maybe a port, maybe a path (a server installed under one), a
   trailing slash ignored, and no user, query or fragment. */
export function issueTarget({provider = 'github', host, repo, urlLimit, labels = []} = {}){
  const p = Object.hasOwn(PROVIDERS, provider) ? PROVIDERS[provider] : null;
  if (!p) throw new Error(`feedback-kit: unknown provider ${JSON.stringify(provider)} (use ${Object.keys(PROVIDERS).map(k => `'${k}'`).join(' or ')})`);
  let server = p.host;
  if (host !== undefined && host !== null){
    const m = typeof host === 'string' && /^https:\/\/([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*)(:\d{1,5})?((?:\/[A-Za-z0-9._~-]+)*)\/?$/.exec(host);
    const path = m ? m[3].split('/').slice(1) : [];
    if (!m || path.some(s => s === '.' || s === '..') || (m[2] && +m[2].slice(1) > 65535))
      throw new Error(`feedback-kit: host must be an https:// address with no query or fragment, like 'https://gitlab.example.com' (got ${JSON.stringify(host)})`);
    server = `https://${m[1].toLowerCase()}${m[2] || ''}${m[3]}`;
  }
  const parts = typeof repo === 'string' ? repo.split('/') : [];
  const [min, max] = p.levels;
  if (!parts.every(segmentOk) || parts.length < min || parts.length > max)
    throw new Error(`feedback-kit: repo must be ${provider === 'github' ? "'owner/name'" : "'group/project' or 'group/subgroup/project'"}, made of letters, digits, '.', '-' and '_' (got ${JSON.stringify(repo)})`);
  if (urlLimit !== undefined && !(Number.isInteger(urlLimit) && urlLimit >= 1000))
    throw new Error(`feedback-kit: urlLimit must be a whole number of characters, at least 1000 (got ${JSON.stringify(urlLimit)})`);
  if (!Array.isArray(labels) || !labels.every(l => typeof l === 'string')) throw new Error('feedback-kit: labels must be a list of names');
  if (p.checkLabel) labels.forEach(p.checkLabel);
  return {provider: p, base: `${server}/${parts.join('/')}`};
}

export function issueBody({sections = [], rows = [], footer = ''}, last = ''){
  return [
    '## What’s wrong, and what should happen', '', '', '',
    '## Picture', '', '<!-- The picture was copied: paste it here, or attach the saved picture. -->', '', '',
    ...sections.flatMap(s => [`## ${s.heading}`, '', s.text, '']),
    ...(rows.length ? ['## On screen', '', '| | |', '|---|---|', ...rows.map(([k, v]) => `| ${cell(k)} | ${cell(v)} |`), ''] : []),
    ...(footer ? [`<sub>${footer}</sub>`] : []),
    ...(last ? ['', last] : [])
  ].join('\n');
}

export function issueUrl(issue, limit){
  const {provider: p, base} = issueTarget({...issue, labels: issue.labels || []});
  const labels = issue.labels || [];
  limit ??= issue.urlLimit ?? p.urlLimit;
  const last = p.labelLine ? p.labelLine(labels) : '';
  const address = it => p.address(base, it, issueBody(it, last));
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
