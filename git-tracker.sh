#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_SLUG="Ukacha21/Notcha"
REPO_URL="https://github.com/${REPO_SLUG}.git"

cd "$ROOT_DIR"

log()  { printf "\033[1;34m[notcha-git]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[notcha-git]\033[0m %s\n" "$*"; }
err()  { printf "\033[1;31m[notcha-git]\033[0m %s\n" "$*" >&2; }

ensure_tools() {
  if ! command -v git >/dev/null 2>&1; then
    err "git is not installed."
    exit 1
  fi
  if ! command -v gh >/dev/null 2>&1; then
    if command -v brew >/dev/null 2>&1; then
      log "Installing GitHub CLI (gh) via Homebrew..."
      brew install gh
    else
      err "GitHub CLI (gh) is not installed and Homebrew was not found. Install gh from https://cli.github.com/"
      exit 1
    fi
  fi
}

ensure_auth() {
  ensure_tools

  # Persist Git HTTPS credentials in macOS Keychain so sign-in sticks across restarts.
  if [[ "$(uname -s)" == "Darwin" ]]; then
    git config --global credential.helper osxkeychain
  fi

  if ! gh auth status -h github.com >/dev/null 2>&1; then
    log "You are not signed in to GitHub. Opening GitHub sign-in prompt..."
    gh auth login -h github.com -p https -w
  else
    log "Signed in to GitHub (persistent auth active)."
  fi

  # Connect Git HTTPS authentication directly to gh's stored token.
  gh auth setup-git -h github.com >/dev/null 2>&1 || true

  # Ensure local/global git author identity is populated so commits succeed.
  local cur_name cur_email
  cur_name="$(git config user.name || true)"
  cur_email="$(git config user.email || true)"
  if [[ -z "$cur_name" || -z "$cur_email" ]]; then
    local gh_login gh_name gh_email
    gh_login="$(gh api user --jq '.login' 2>/dev/null || true)"
    gh_name="$(gh api user --jq '.name // .login' 2>/dev/null || true)"
    gh_email="$(gh api user --jq '.email // empty' 2>/dev/null || true)"
    if [[ -z "$cur_name" ]]; then
      if [[ -z "$gh_name" ]]; then
        read -rp "Git user.name: " gh_name
      fi
      git config --global user.name "$gh_name"
    fi
    if [[ -z "$cur_email" ]]; then
      if [[ -z "$gh_email" && -n "$gh_login" ]]; then
        gh_email="${gh_login}@users.noreply.github.com"
      elif [[ -z "$gh_email" ]]; then
        read -rp "Git user.email: " gh_email
      fi
      git config --global user.email "$gh_email"
    fi
    log "Configured git identity: $(git config user.name) <$(git config user.email)>"
  fi
}

ensure_local_repo() {
  if [[ ! -d "$ROOT_DIR/.git" ]]; then
    log "Initializing git repository in $ROOT_DIR..."
    git init -b main
  fi
}

track_changes() {
  local msg="${1:-}"
  ensure_local_repo

  log "Checking tracked changes in $ROOT_DIR..."
  if [[ -z "$(git status --porcelain)" ]]; then
    log "Working tree is clean — no uncommitted changes."
    return 0
  fi

  git status -s
  if [[ -z "$msg" ]]; then
    msg="Track Notcha workspace changes ($(date '+%Y-%m-%d %H:%M'))"
  fi

  git add -A
  git commit -m "$msg"
  log "Committed local changes: $msg"
}

extract_release_notes() {
  local readme="$1"
  local version="$2"
  python3 - "$readme" "$version" << 'PY'
import re, sys
path, ver = sys.argv[1], sys.argv[2]
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()
m = re.search(rf'^## What\'s New in {re.escape(ver)}\s*\n(.*?)(?=^## |\Z)', text, re.M | re.S)
if m:
    print(f"## Notcha {ver}\n\n" + m.group(1).strip())
else:
    print(f"Notcha v{ver} release.")
PY
}

publish_release() {
  local version="${1:-}"
  local folder="${2:-}"

  if [[ -z "$version" ]]; then
    err "Usage: $0 release <version> [folder]"
    err "Example: $0 release 2.0.1 notcha_2_0_1"
    exit 1
  fi

  if [[ -z "$folder" ]]; then
    folder="notcha_${version//./_}"
  fi

  local app_dir="$ROOT_DIR/$folder"
  local dist_dir="$app_dir/electron/dist"
  if [[ ! -d "$app_dir/electron" ]]; then
    err "App directory not found: $app_dir/electron"
    exit 1
  fi
  if [[ ! -d "$dist_dir" ]]; then
    err "Build artifacts not found at $dist_dir. Run 'npm run dist:all' in $app_dir/electron first."
    exit 1
  fi

  ensure_auth
  track_changes "Prepare Notcha v${version} release"

  STAGE_DIR="$ROOT_DIR/.tmp-gh-release"
  local stage_dir="$STAGE_DIR"
  rm -rf "$stage_dir"
  trap 'rm -rf "${STAGE_DIR:-}"' EXIT

  log "Cloning ${REPO_SLUG} (main) into staging area..."
  gh repo clone "$REPO_SLUG" "$stage_dir" -- --branch main --single-branch

  # Sync latest release source into GitHub main layout (root README/logo + electron/)
  rm -rf "$stage_dir/electron"
  mkdir -p "$stage_dir/electron"
  rsync -a --exclude='node_modules' --exclude='dist' --exclude='.DS_Store' \
    "$app_dir/electron/" "$stage_dir/electron/"

  cp "$app_dir/README.md" "$stage_dir/README.md"
  if [[ -f "$app_dir/logo.png" ]]; then
    cp "$app_dir/logo.png" "$stage_dir/logo.png"
    rm -f "$stage_dir/logo2.png" "$stage_dir/electron/logo2.png"
  fi
  if [[ -f "$app_dir/logo.ico" ]]; then
    cp "$app_dir/logo.ico" "$stage_dir/logo.ico"
  fi

  pushd "$stage_dir" >/dev/null
  if [[ -n "$(git status --porcelain)" ]]; then
    git add -A
    git commit -m "v${version}: Update logo and release Notcha ${version}"
    git push origin main
    log "Pushed v${version} source changes to ${REPO_SLUG} (main)."
  else
    log "No source differences to push to ${REPO_SLUG} (main)."
  fi

  local tag="v${version}"
  if git rev-parse "$tag" >/dev/null 2>&1; then
    warn "Tag $tag already exists remotely; reusing it."
  else
    git tag -a "$tag" -m "Notcha ${tag}"
    git push origin "$tag"
    log "Created and pushed tag $tag."
  fi
  popd >/dev/null

  # Collect release artifacts matching this version
  local assets=()
  for candidate in \
    "$dist_dir/Notcha-${version}.dmg" \
    "$dist_dir/Notcha-${version}.dmg.blockmap" \
    "$dist_dir/Notcha-${version}-mac.zip" \
    "$dist_dir/Notcha-${version}-mac.zip.blockmap" \
    "$dist_dir/Notcha Setup ${version}.exe" \
    "$dist_dir/Notcha Setup ${version}.exe.blockmap" \
    "$dist_dir/Notcha-${version}-win.zip"; do
    if [[ -f "$candidate" ]]; then
      assets+=("$candidate")
    fi
  done

  if [[ ${#assets[@]} -eq 0 ]]; then
    err "No release artifacts found in $dist_dir for version $version"
    exit 1
  fi

  local notes
  notes="$(extract_release_notes "$app_dir/README.md" "$version")"

  if gh release view "$tag" -R "$REPO_SLUG" >/dev/null 2>&1; then
    log "Release $tag already exists on GitHub; uploading/updating assets..."
    gh release upload "$tag" "${assets[@]}" --clobber -R "$REPO_SLUG"
  else
    log "Creating GitHub Release $tag with ${#assets[@]} assets..."
    gh release create "$tag" "${assets[@]}" \
      -R "$REPO_SLUG" \
      --title "Notcha ${tag}" \
      --notes "$notes"
  fi

  log "Published release $tag to https://github.com/${REPO_SLUG}/releases/tag/${tag}"
}

show_help() {
  cat << EOF
Notcha Outer-Folder Git Tracker & Release Tool

Usage:
  ./git-tracker.sh                  Check GitHub sign-in & commit any workspace changes
  ./git-tracker.sh login            Prompt GitHub sign-in and save credentials persistently
  ./git-tracker.sh status           Show GitHub auth status and workspace git status
  ./git-tracker.sh commit [msg]     Stage and commit workspace changes locally
  ./git-tracker.sh release <ver> [dir]
                                    Sync <dir> to ${REPO_SLUG} main, tag v<ver>, and publish dist/ release files
EOF
}

cmd="${1:-sync}"
case "$cmd" in
  login)
    ensure_auth
    ;;
  status)
    ensure_tools
    ensure_local_repo
    echo "=== GitHub Auth ==="
    gh auth status -h github.com || true
    echo "=== Workspace Changes ==="
    git status -s
    echo "=== Recent Commits ==="
    git log -n 5 --oneline 2>/dev/null || echo "(no commits yet)"
    ;;
  commit)
    shift || true
    track_changes "${*:-}"
    ;;
  sync)
    shift || true
    ensure_auth
    track_changes "${*:-}"
    ;;
  release)
    shift
    publish_release "${1:-}" "${2:-}"
    ;;
  -h|--help|help)
    show_help
    ;;
  *)
    err "Unknown command: $cmd"
    show_help
    exit 1
    ;;
esac

