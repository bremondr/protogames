#!/usr/bin/env bash
# Sets up an Ubuntu machine for Protogames tactile-table (TMB) work.
# Installs build tools, OpenCV (with aruco), Node 22, tmux, the GitHub CLI and
# Claude Code, clones the repo and writes a hardware report.
# Interactive steps: sudo password, `gh auth login`, `claude` login. Nothing else.
# Safe to re-run: every step skips what is already done.
set -euo pipefail

REPO_SLUG="bremondr/protogames"
REPO_REMOTE="protogames"
BRANCH="docs-tabletop-integration"
WORKDIR="${WORKDIR:-$HOME/protogames}"

say() { printf '\n==> %s\n' "$*"; }

if [ "$(id -u)" -eq 0 ]; then
  echo "Run as your normal user, not root (the script uses sudo where needed)." >&2
  exit 1
fi
. /etc/os-release
[ "$ID" = "ubuntu" ] || { echo "This script targets Ubuntu (found: $ID)." >&2; exit 1; }

say "System packages"
sudo apt-get update
sudo apt-get install -y \
  git curl ca-certificates gnupg build-essential cmake pkg-config \
  libopencv-dev python3 python3-pip python3-venv python3-opencv \
  v4l-utils liblo-dev tmux jq

say "Camera access (video group)"
if ! id -nG "$USER" | tr ' ' '\n' | grep -qx video; then
  sudo usermod -aG video "$USER"
  echo "Added $USER to the video group: log out and in (or reboot) before using the camera."
fi

say "Node.js 22 (repo needs >=22)"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node --version

say "GitHub CLI"
if ! command -v gh >/dev/null; then
  sudo mkdir -p -m 755 /etc/apt/keyrings
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null
  sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y gh
fi

say "Claude Code"
if ! command -v claude >/dev/null && [ ! -x "$HOME/.local/bin/claude" ]; then
  curl -fsSL https://claude.ai/install.sh | bash
fi
export PATH="$HOME/.local/bin:$PATH"
grep -q '.local/bin' "$HOME/.profile" 2>/dev/null \
  || echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.profile"

say "GitHub login (follow the prompts; pick HTTPS, device code works from any browser)"
if ! gh auth status >/dev/null 2>&1; then
  gh auth login --hostname github.com --git-protocol https --web
fi
gh auth setup-git

say "Git identity (taken from your GitHub account)"
if [ -z "$(git config --global user.name || true)" ]; then
  gh_login="$(gh api user --jq .login)"
  gh_id="$(gh api user --jq .id)"
  gh_name="$(gh api user --jq '.name // .login')"
  git config --global user.name "$gh_name"
  git config --global user.email "${gh_id}+${gh_login}@users.noreply.github.com"
fi
git config --global init.defaultBranch main
git config --global pull.ff only

say "Clone $REPO_SLUG into $WORKDIR"
if [ ! -d "$WORKDIR/.git" ]; then
  git clone -o "$REPO_REMOTE" "https://github.com/$REPO_SLUG.git" "$WORKDIR"
fi
git -C "$WORKDIR" fetch "$REPO_REMOTE"
if git -C "$WORKDIR" show-ref --verify --quiet "refs/remotes/$REPO_REMOTE/$BRANCH"; then
  git -C "$WORKDIR" checkout "$BRANCH"
  git -C "$WORKDIR" pull --ff-only "$REPO_REMOTE" "$BRANCH"
else
  echo "Branch $BRANCH is not on GitHub yet (not pushed). Staying on the default branch."
fi

say "Repo tests (sanity check of Node setup)"
( cd "$WORKDIR" && npm test --silent ) || echo "Tests failed: report this, it is not a setup problem to ignore."

say "Hardware and OpenCV report"
REPORT="$WORKDIR/machine-report.txt"
{
  echo "# machine report $(date -Is)"
  lsb_release -a 2>/dev/null || true
  uname -a
  echo; echo "## CPU / RAM"; lscpu | grep -E 'Model name|^CPU\(s\)'; free -h | head -2
  echo; echo "## Cameras"; v4l2-ctl --list-devices 2>&1 || true
  echo; echo "## Displays"; (command -v xrandr >/dev/null && xrandr --query 2>&1 | grep -E ' connected|^Screen') || echo "xrandr unavailable or no X session"
  echo; echo "## OpenCV C++"; pkg-config --modversion opencv4 2>&1 || true
  echo; echo "## OpenCV python aruco"
  python3 -c 'import cv2; print(cv2.__version__, "aruco:", hasattr(cv2, "aruco"))' 2>&1
  echo; echo "## Versions"; node --version; npm --version; git --version; gh --version | head -1
} | tee "$REPORT"
# keep the report out of git
grep -qx 'machine-report.txt' "$WORKDIR/.git/info/exclude" 2>/dev/null \
  || echo 'machine-report.txt' >> "$WORKDIR/.git/info/exclude"

say "Claude login (opens a login flow; do this once)"
if [ ! -s "$HOME/.claude/.credentials.json" ] && [ ! -s "$HOME/.claude.json" ]; then
  echo "Starting Claude Code for login. Finish the login, then type /exit."
  ( cd "$WORKDIR" && claude )
fi

cat <<EOF

Done. Next:
  1. If it said you were added to the video group, log out and back in.
  2. tmux new -s table
  3. cd $WORKDIR && claude        # then /remote-control to drive it from your other machine
  4. Tell Claude: "read machine-report.txt and docs/TABLETOP_INTEGRATION.md"
EOF
