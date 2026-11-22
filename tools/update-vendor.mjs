#!/usr/bin/env node
/* Update the modules a project copies from web-kit to their newest release.
   The original of this script is consumer/update-vendor.mjs in bremondr/web-kit. Projects keep a copy in their tools/
   folder; take a new copy from there rather than changing it in a project. Plain Node 18+ and git, no packages.

   The project lists what it copies in vendor.json, at its root:
     {"source": "bremondr/web-kit", "dir": "js/vendor", "modules": {"feedback-kit": "1.0.0"}}
   (source: owner/name on GitHub, or any git URL or folder)
   so feedback-kit 1.0.0 is copied into js/vendor/feedback-kit/. A release of a module is a tag
   <module>-v<major>.<minor>.<patch> in the source repository, and what changed is in the module's CHANGELOG.md.
   Run it from the project's root:

     node tools/update-vendor.mjs                     every module to its newest release with the same major version
     node tools/update-vendor.mjs --major             also to new major versions (they may need changes in the project)
     node tools/update-vendor.mjs feedback-kit@1.2.0  one module to a given version (also an older one, or a new module)
     node tools/update-vendor.mjs --check             only say what would change
     node tools/update-vendor.mjs --verify            check that each copy is exactly its release (not edited by hand)
       --notes FILE      also write a pull request description to FILE: what changed, from the changelogs
       --github-output   also write updated=true|false and title=… to $GITHUB_OUTPUT (in GitHub Actions)

   For a private source repository, set VENDOR_GIT_TOKEN to a token that can read it (git's own sign-in works too). */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* ---- pure helpers (tested in consumer/update-vendor.test.mjs) ---- */

export function parseVersion(v){ const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v)); return m ? m.slice(1).map(Number) : null; }
export function compare(a, b){ const x = parseVersion(a), y = parseVersion(b); for (let k = 0; k < 3; k++) if (x[k] !== y[k]) return x[k] - y[k]; return 0; }
export function parseTag(tag){ const m = /^(.+)-v(\d+\.\d+\.\d+)$/.exec(tag); return m ? {module: m[1], version: m[2]} : null; }
// the released versions of `module` among the tag names, oldest first
export function versionsOf(tags, module){ return tags.map(parseTag).filter(t => t && t.module === module).map(t => t.version).sort(compare); }
// the version to move to, or null: the newest one, with the same major version unless `major`
export function pick(versions, current, {major = false} = {}){
  const now = parseVersion(current);
  const allowed = versions.filter(v => major || parseVersion(v)[0] === now[0]);
  const best = allowed[allowed.length - 1];
  return best && compare(best, current) > 0 ? best : null;
}
// the changelog's sections for the versions after `from` up to and including `to`, newest first
export function changesBetween(changelog, from, to){
  return changelog.split(/^(?=## )/m)
    .map(part => ({part: part.trim(), v: (/^## (\d+\.\d+\.\d+)/.exec(part) || [])[1]}))
    .filter(({v}) => v && (from === null || compare(v, from) > 0) && compare(v, to) <= 0)
    .sort((a, b) => compare(b.v, a.v)).map(({part}) => part).join('\n\n');
}
// the pull request's title and description for a list of {module, from, to, changes}
export function describe(updates){
  const title = updates.length === 1
    ? `Update ${updates[0].module} to ${updates[0].to}`
    : `Update ${updates.map(u => `${u.module} to ${u.to}`).join(', ')}`;
  const parts = updates.map(u => {
    const major = u.from && parseVersion(u.to)[0] !== parseVersion(u.from)[0];
    const back = u.from && compare(u.to, u.from) < 0;
    return [
      `## ${u.module}: ${u.from || 'new'} → ${u.to}`, '',
      ...(major && !back ? ['**A new major version: it may need changes in this project. The changes below say which.**', ''] : []),
      back ? `Back to an older version.` : (u.changes ? u.changes.replace(/^## /gm, '### ') : '_No changelog entries._'), ''
    ].join('\n');
  });
  const body = [...parts, '<sub>Opened by tools/update-vendor.mjs. The modules come from their release tags; don’t edit the copies here.</sub>'].join('\n');
  return {title, body};
}

/* ---- git and files ---- */

const git = (...args) => execFileSync('git', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
function repoUrl(source){
  if (!/^[\w.-]+\/[\w.-]+$/.test(source)) return source;   // a git URL or a folder, rather than owner/name on GitHub
  const token = process.env.VENDOR_GIT_TOKEN;
  return token ? `https://x-access-token:${token}@github.com/${source}.git` : `https://github.com/${source}.git`;
}
const remoteTags = source => git('ls-remote', '--tags', '--refs', repoUrl(source)).split('\n').map(l => l.split('refs/tags/')[1]).filter(Boolean);
function checkout(source, tag){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-'));
  git('clone', '--quiet', '--depth', '1', '--branch', tag, repoUrl(source), dir);
  return dir;
}
// the module's files, as paths inside its folder; its tests stay behind
function filesOf(dir){
  const out = [];
  (function walk(sub){
    for (const f of fs.readdirSync(path.join(dir, sub)).sort()){
      const rel = sub ? `${sub}/${f}` : f;
      if (fs.statSync(path.join(dir, rel)).isDirectory()) walk(rel);
      else if (!/\.test\.m?js$/.test(f)) out.push(rel);
    }
  })('');
  return out;
}
function install(from, to){
  fs.rmSync(to, {recursive: true, force: true});
  for (const f of filesOf(from)){ fs.mkdirSync(path.dirname(path.join(to, f)), {recursive: true}); fs.copyFileSync(path.join(from, f), path.join(to, f)); }
}
function differences(release, copy){
  if (!fs.existsSync(copy)) return ['the folder is missing'];
  const a = filesOf(release), b = filesOf(copy), out = [];
  a.filter(f => !b.includes(f)).forEach(f => out.push(`${f} is missing`));
  b.filter(f => !a.includes(f)).forEach(f => out.push(`${f} is not in the release`));
  a.filter(f => b.includes(f) && !fs.readFileSync(path.join(release, f)).equals(fs.readFileSync(path.join(copy, f)))).forEach(f => out.push(`${f} differs`));
  return out;
}

/* ---- the command ---- */

function main(argv){
  const flags = new Set(), asked = [];
  let notesFile = null;
  for (let k = 0; k < argv.length; k++){
    if (argv[k] === '--notes'){ notesFile = argv[++k]; if (!notesFile) throw new Error('--notes needs a file name.'); }
    else if (argv[k].startsWith('--')) flags.add(argv[k]);
    else asked.push(argv[k]);
  }
  const known = ['--major', '--check', '--verify', '--github-output'];
  [...flags].forEach(f => { if (!known.includes(f)) throw new Error(`Unknown option ${f}`); });

  const cfgFile = path.resolve('vendor.json');
  if (!fs.existsSync(cfgFile)) throw new Error('No vendor.json here: run this from the project’s root.');
  const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  cfg.modules ||= {};
  const tags = remoteTags(cfg.source);
  const output = (updated, title = '') => {
    if (flags.has('--github-output') && process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `updated=${updated}\ntitle=${title}\n`);
  };

  if (flags.has('--verify')){
    let bad = 0;
    for (const [module, version] of Object.entries(cfg.modules)){
      const dir = checkout(cfg.source, `${module}-v${version}`);
      const diff = differences(path.join(dir, module), path.join(cfg.dir, module));
      fs.rmSync(dir, {recursive: true, force: true});
      console.log(diff.length ? `${module} ${version}: differs from its release:\n  ${diff.join('\n  ')}` : `${module} ${version}: same as its release`);
      bad += diff.length ? 1 : 0;
    }
    if (bad) process.exitCode = 1;
    return;
  }

  // what to move where
  const plan = [];
  if (asked.length){
    for (const a of asked){
      const m = /^(.+)@(\d+\.\d+\.\d+)$/.exec(a);
      if (!m) throw new Error(`Give a module as name@version, like feedback-kit@1.2.0 (not ${a}).`);
      if (!versionsOf(tags, m[1]).includes(m[2])) throw new Error(`${cfg.source} has no release ${m[1]}-v${m[2]}.`);
      if (cfg.modules[m[1]] !== m[2]) plan.push({module: m[1], from: cfg.modules[m[1]] || null, to: m[2]});
    }
  } else {
    for (const [module, version] of Object.entries(cfg.modules)){
      const to = pick(versionsOf(tags, module), version, {major: flags.has('--major')});
      if (to) plan.push({module, from: version, to});
      else if (!flags.has('--major')){
        const newer = versionsOf(tags, module).filter(v => compare(v, version) > 0);
        if (newer.length) console.log(`${module}: ${newer[newer.length - 1]} is a new major version; update with --major or ${module}@${newer[newer.length - 1]}.`);
      }
    }
  }
  if (!plan.length){ console.log('Everything is up to date.'); output(false); return; }
  if (flags.has('--check')){ plan.forEach(u => console.log(`${u.module}: ${u.from || 'new'} → ${u.to}`)); return; }

  for (const u of plan){
    const dir = checkout(cfg.source, `${u.module}-v${u.to}`);
    if (!fs.existsSync(path.join(dir, u.module))) throw new Error(`The tag ${u.module}-v${u.to} has no ${u.module} folder.`);
    install(path.join(dir, u.module), path.join(cfg.dir, u.module));
    const changelog = path.join(dir, u.module, 'CHANGELOG.md');
    u.changes = fs.existsSync(changelog) ? changesBetween(fs.readFileSync(changelog, 'utf8'), u.from, u.to) : '';
    fs.rmSync(dir, {recursive: true, force: true});
    cfg.modules[u.module] = u.to;
    console.log(`${u.module}: ${u.from || 'new'} → ${u.to}`);
  }
  fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + '\n');
  const {title, body} = describe(plan);
  if (notesFile) fs.writeFileSync(notesFile, body + '\n');
  output(true, title);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href){
  try { main(process.argv.slice(2)); }
  catch (err){ console.error(String(err.stderr || err.message || err).trim()); process.exitCode = 1; }
}
