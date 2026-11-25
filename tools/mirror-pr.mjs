#!/usr/bin/env node
// Copies the commits of a pull request (typically from a fork) onto a branch of this repository, so the pull
// request can be tried on a preview and merged from there. See "Pull requests from a fork" in CONTRIBUTING.md.
//
//   node tools/mirror-pr.mjs <number> [--base origin/main] [--no-test]
//
// Creates the branch try-<number> from the base, fetches refs/pull/<number>/head from origin, cherry-picks the
// pull request's commits (authors are kept), and runs `npm test`. It never pushes; it prints the command to.
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const number = args.find(a => /^\d+$/.test(a));
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
if (!number) { console.error('Usage: node tools/mirror-pr.mjs <number> [--base origin/main] [--no-test]'); process.exit(2); }

const base = option('--base', 'origin/main');
const branch = `try-${number}`;
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

if (git('status', '--porcelain')) { console.error('The working tree has changes; commit or stash them first.'); process.exit(1); }
const remote = base.split('/')[0];
git('fetch', '-q', remote, base.split('/').slice(1).join('/'), `+refs/pull/${number}/head:refs/remotes/pr/${number}`);
const commits = git('rev-list', '--reverse', '--no-merges', `${base}..pr/${number}`).split('\n').filter(Boolean);
if (!commits.length) { console.error(`#${number} has no commits that ${base} lacks.`); process.exit(1); }

git('checkout', '-q', '-b', branch, base);
try {
    git('cherry-pick', ...commits);
} catch {
    execFileSync('git', ['cherry-pick', '--abort'], { stdio: 'ignore' });
    git('checkout', '-q', '-');
    git('branch', '-q', '-D', branch);
    console.error(`A commit of #${number} does not apply to ${base}. Nothing was left behind; resolve it by hand.`);
    process.exit(1);
}
console.log(`${commits.length} commit(s) of #${number} are on ${branch}:`);
console.log(git('log', '--format=  %h %an: %s', `${base}..${branch}`));
if (!args.includes('--no-test')) execFileSync('npm', ['test'], { stdio: 'inherit' });
console.log(`\nLooks good? Push it and open a draft pull request:\n  git push -u origin ${branch}`);
