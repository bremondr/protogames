# Keeping projects in a GitHub repo

Protogames can keep your projects in a GitHub repository instead of only in this browser. Each project is one file, every **Save to repo** is a commit with an optional note, and GitHub keeps every earlier version. Use it for:

- **a repo per game design**, so its boards are in one place with their history;
- **sharing with playtesters**: they open a link, see the repo's projects and open them (read only unless they have a token);
- **a group or class library** that several people read from.

This page is the setup guide. How it works inside, and the file format, are in [SPECIFICATION.md](SPECIFICATION.md#projects-in-github-repos).

## Set up a repo (once)

You need a GitHub account. The commands use the [GitHub CLI](https://cli.github.com/) (`gh`) and work in PowerShell and in a Unix shell. Replace `OWNER/REPO` with your account and a name for the repo, for example `bremondr/protogames-designs`. You can do the same on github.com instead (**New repository**).

1. **Create the repo.** Public means anyone with the name can read the projects and their history, without a token. Private means every reader needs a token.

   ```
   gh repo create OWNER/REPO --public --description "Protogames projects"
   ```

   or

   ```
   gh repo create OWNER/REPO --private --description "Protogames projects"
   ```

   That is all the repo needs. The projects go in a folder called `projects/`, which the first **Save to repo** creates. The repo can hold other things too (rules, notes, art); Protogames reads only `projects/`.

2. **Make a token** so the app can save. `gh` cannot make this kind of token, so use the page **[New fine-grained token](https://github.com/settings/personal-access-tokens/new)** (GitHub: Settings → Developer settings → Personal access tokens → Fine-grained tokens):
   - **Token name:** anything, for example "Protogames on my iPad"
   - **Resource owner:** the account or organisation that owns the repo
   - **Expiration:** a date, for example in a year
   - **Repository access:** Only select repositories → the repo
   - **Repository permissions** → **Contents: Read and write**. Nothing else (GitHub adds *Metadata: Read-only* itself).
   - **Generate token** and copy it. It starts with `github_pat_`, and GitHub shows it only once.

3. **Follow the repo in Protogames.** Open `https://protogames.eu/app/#repo=OWNER/REPO`. The **Load…** dialog lists the repo's projects (none yet). Choose **Repos and tokens…** → **Add a token…** next to the repo, paste the token and **Save token**. The panel then says "you can edit".

4. **Save a project to it.** Open or make a project. In the **Project** panel, **GitHub repo** → **Save to a repo…**, pick the repo, add a note if you like, and **Save**. Check on GitHub, or with:

   ```
   gh api "repos/OWNER/REPO/commits?path=projects" --jq ".[] | .commit.message"
   ```

Do steps 2 and 3 on every device you edit on. The token stays in that browser and is sent only to GitHub. If it expires, the app says so and asks for a new one.

## Day to day

- **Open** a project: **Load…** → **From a GitHub repo**. It becomes a project of this browser, autosaved as you work, as usual.
- **Save to repo** (Project panel) writes a new version, only when you tap it. Add a note to say what changed; it becomes the commit message.
- **If it changed meanwhile** (another device, someone else, an edit on GitHub), the app asks: **Overwrite with mine**, **Keep theirs, drop mine**, or **Save mine as a copy**. Nothing is lost either way: the other version stays in the history.
- **History** (Project panel) lists the versions. **Open** shows one as a picture, read only, where you can **Open as a new project** or **Restore this version** (it becomes the newest version and goes on your board).
- The Project panel says when the repo has a newer version than your board ("A newer version is in the repo. Open it").

## Share with playtesters

- **Copy link** next to the repo in **Load…** copies `https://protogames.eu/app/#repo=OWNER/REPO`. Whoever opens it follows the repo and sees its projects.
- **Public repo:** nothing else is needed. They can open projects and change their own copy, but not save to the repo.
- **Private repo:** each playtester needs a token to read it. Make one with the steps above but with **Contents: Read-only**, and send it to them; they paste it the same way. The app then shows the repo as "Read only".
- To let someone else **save**, they need their own token with write access. A fine-grained token only reaches repos of the account or organisation it is made for, so for several editors, put the repo in a GitHub organisation.

## What the repo looks like

```
OWNER/REPO
├─ projects/
│  ├─ island-settlers.json     one project per file
│  ├─ star-race.json
│  └─ README.md                anything that is not a project is ignored
└─ anything else you like      (Protogames reads only projects/)
```

- A file is a normal Protogames project file (the same as **Export… → Project file**), written as indented JSON so that GitHub's history shows what changed. You can also add one by hand: export a project and put it in `projects/` as `<name>.json`, where the name uses letters, digits, `-` and `_` only.
- Files that are not valid projects, or that come from a newer version of Protogames, are left out (the panel counts them).
- **Limits:** 5 MB per file (about 5,000 tiles); GitHub lists at most 1,000 files in a folder. Reading a public repo without a token is limited by GitHub to 60 requests an hour per network; a token lifts that.

## Good to know

- **Public repos are public**, including every earlier version. Use a private repo for anything else.
- **One token per repo**, only *Contents*, with an expiry date. If a token leaks, the worst case is changes to that one repo, which git's history can undo. To remove a token from a device: **Repos and tokens…** → **Token…** → **Remove token**. To cancel it everywhere, delete it on GitHub's token page.
- **Previews** of pull requests keep their own storage, so a token pasted on protogames.eu is not used there.
- **Trying it without GitHub:** `https://protogames.eu/app/?fake-github` runs everything against a pretend GitHub in the tab, with sample repos; the **Practice GitHub** button in the header shows the tokens to paste. `?fake-github=off` turns it off.

## When something goes wrong

| The app says | What to do |
|---|---|
| "GitHub shows this repo only with a token" | The repo is private (or the name is wrong): add a token for it. |
| "GitHub can't find this repo with the token on this device" | The token is for another repo: make one for this repo and replace it. |
| "GitHub didn't accept the token" | It expired or was deleted: make a new one and replace it. |
| "The token can't do that in this repo" / "Read only" | The token has Contents: Read-only: make one with Read and write. |
| "Too big for the repo" | The board is over 5 MB as a file: keep it as a project file (Export… → Project file). |
| The 60 reads an hour are used up | Wait for the time shown, or add a token (even a read-only one). |
