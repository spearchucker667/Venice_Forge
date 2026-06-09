#!/usr/bin/env bash
set -Eeuo pipefail

# clean-repo-zip.sh
# Creates a clean repository ZIP for AI/code review.
# Keeps source, docs, configs, workflows, tests, assets.
# Excludes dependencies, build outputs, caches, logs, archives, secrets, and local junk.

REPO_ROOT="${1:-$(pwd)}"
REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
REPO_NAME="$(basename "$REPO_ROOT")"
STAMP="$(date +"%Y%m%d-%H%M%S")"

OUT_DIR="${2:-$HOME/Desktop}"
OUT_DIR="$(mkdir -p "$OUT_DIR" && cd "$OUT_DIR" && pwd)"

STAGE_ROOT="$(mktemp -d "/tmp/${REPO_NAME}-clean-${STAMP}.XXXXXX")"
STAGE_DIR="$STAGE_ROOT/$REPO_NAME"
ZIP_PATH="$OUT_DIR/${REPO_NAME}-clean-${STAMP}.zip"
META_DIR="$STAGE_DIR/_REPO_EXTRACT_METADATA"

cleanup() {
  rm -rf "$STAGE_ROOT"
}
trap cleanup EXIT

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: required command not found: $1" >&2
    exit 1
  }
}

need_cmd rsync
need_cmd zip
need_cmd find
need_cmd sed
need_cmd sort
need_cmd wc
need_cmd du
need_cmd shasum

if [[ ! -d "$REPO_ROOT" ]]; then
  echo "ERROR: repo path does not exist: $REPO_ROOT" >&2
  exit 1
fi

cd "$REPO_ROOT"

if [[ ! -f "package.json" && ! -d ".git" && ! -f "README.md" && ! -d "src" ]]; then
  echo "ERROR: this does not look like a repo root: $REPO_ROOT" >&2
  echo "Run from the repo root or pass the repo path:" >&2
  echo "  bash scripts/clean-repo-zip.sh /path/to/repo" >&2
  exit 1
fi

echo "==> Repo root: $REPO_ROOT"
echo "==> Output dir: $OUT_DIR"
echo "==> Staging clean copy..."

mkdir -p "$STAGE_DIR"

RSYNC_EXCLUDES=(
  # VCS
  "--exclude=.git/"
  "--exclude=.svn/"
  "--exclude=.hg/"

  # Dependency folders
  "--exclude=node_modules/"
  "--exclude=bower_components/"
  "--exclude=vendor/bundle/"
  "--exclude=.pnpm-store/"
  "--exclude=.yarn/cache/"
  "--exclude=.yarn/unplugged/"
  "--exclude=.yarn/build-state.yml"
  "--exclude=.yarn/install-state.gz"

  # Build outputs
  "--exclude=dist/"
  "--exclude=dist-electron/"
  "--exclude=out/"
  # Keep only the static packaging icon assets under build/.
  "--include=build/"
  "--include=build/icon.ico"
  "--include=build/icon.icns"
  "--include=build/icon.png"
  "--exclude=build/**"
  "--exclude=release/"
  "--exclude=releases/"
  "--exclude=coverage/"
  "--exclude=.next/"
  "--exclude=.nuxt/"
  "--exclude=.svelte-kit/"
  "--exclude=.vite/"
  "--exclude=.turbo/"
  "--exclude=.parcel-cache/"
  "--exclude=.rollup.cache/"
  "--exclude=.cache/"
  "--exclude=tmp/"
  "--exclude=temp/"

  # Electron / packaging outputs
  "--exclude=*.dmg"
  "--exclude=*.pkg"
  "--exclude=*.msi"
  "--exclude=*.exe"
  "--exclude=*.AppImage"
  "--exclude=*.snap"
  "--exclude=*.deb"
  "--exclude=*.rpm"
  "--exclude=*.asar"
  "--exclude=*.blockmap"
  "--exclude=*.nupkg"

  # Archives
  "--exclude=*.zip"
  "--exclude=*.tar"
  "--exclude=*.tar.gz"
  "--exclude=*.tgz"
  "--exclude=*.7z"
  "--exclude=*.rar"
  "--exclude=*.gz"
  "--exclude=*.bz2"
  "--exclude=*.xz"

  # Logs
  "--exclude=*.log"
  "--exclude=npm-debug.log*"
  "--exclude=yarn-debug.log*"
  "--exclude=yarn-error.log*"
  "--exclude=pnpm-debug.log*"
  "--exclude=lerna-debug.log*"

  # OS/editor junk
  "--exclude=.DS_Store"
  "--exclude=Thumbs.db"
  "--exclude=desktop.ini"
  "--exclude=*.swp"
  "--exclude=*.swo"
  "--exclude=*~"
  "--exclude=.idea/"
  "--exclude=.vscode/.history/"
  "--exclude=.history/"

  # Python/env/cache
  "--exclude=.venv/"
  "--exclude=venv/"
  "--exclude=env/"
  "--exclude=__pycache__/"
  "--exclude=.pytest_cache/"
  "--exclude=.mypy_cache/"
  "--exclude=.ruff_cache/"
  "--exclude=.tox/"
  "--exclude=*.pyc"
  "--exclude=*.pyo"

  # Rust/Go/native outputs
  "--exclude=target/"
  "--exclude=bin/"
  "--exclude=obj/"
  "--exclude=*.o"
  "--exclude=*.so"
  "--exclude=*.dylib"
  "--exclude=*.dll"

  # Local DB/cache/state
  "--exclude=*.sqlite"
  "--exclude=*.sqlite3"
  "--exclude=*.db"
  "--exclude=*.db-shm"
  "--exclude=*.db-wal"
  "--exclude=*.localstorage"

  # Local design captures / agent scratch / config files (keep examples only)
  "--exclude=.design-captures/"
  "--exclude=docs/AGENTS/"
  "--exclude=docs/audits/"
  "--exclude=docs/design/"
  "--exclude=docs/HQE_AUDIT_REPORT.md"
  "--exclude=todo.md"
  "--exclude=scripts/dev-tools/venice-styles.json"
  "--include=.config/*.example.yaml"
  "--include=.config/*.example.yml"
  "--exclude=.config/*.local.yaml"
  "--exclude=.config/*.local.yml"
  "--exclude=.config/*.yaml"
  "--exclude=.config/*.yml"

  # AppleDouble / macOS resource forks / Windows metadata
  "--exclude=.AppleDouble/"
  "--exclude=._*"
  "--exclude=__MACOSX/"

  # Secrets: keep examples/templates, exclude real env/key material
  "--include=.env.example"
  "--include=.env.sample"
  "--include=.env.template"
  "--include=.env.defaults"
  "--exclude=.env"
  "--exclude=.env.*"
  "--exclude=*.pem"
  "--exclude=*.key"
  "--exclude=*.p8"
  "--exclude=*.p12"
  "--exclude=*.pfx"
  "--exclude=*.crt"
  "--exclude=*.cer"
  "--exclude=id_rsa"
  "--exclude=id_rsa.pub"
  "--exclude=id_ed25519"
  "--exclude=id_ed25519.pub"
  "--exclude=credentials.json"
  "--exclude=token.json"
  "--exclude=secrets.json"
)

rsync -a \
  "${RSYNC_EXCLUDES[@]}" \
  "$REPO_ROOT/" \
  "$STAGE_DIR/"

mkdir -p "$META_DIR"

echo "==> Validating staged archive root..."

if [[ -f "$REPO_ROOT/scripts/verify-archive-clean.cjs" ]]; then
  if ! node "$REPO_ROOT/scripts/verify-archive-clean.cjs" --root "$STAGE_DIR"; then
    echo "ERROR: staged archive root failed verify-archive-clean. Fix exclusions and retry." >&2
    exit 1
  fi
else
  echo "WARNING: scripts/verify-archive-clean.cjs not found; skipping staged-root verification." >&2
fi

echo "==> Writing metadata..."

{
  echo "Repo extract metadata"
  echo "====================="
  echo
  echo "repo_name=$REPO_NAME"
  echo "repo_root=$REPO_ROOT"
  echo "created_at=$STAMP"
  echo "created_by=$(whoami)"
  echo "hostname=$(hostname)"
  echo "output_zip=$ZIP_PATH"
  echo
  echo "Tool versions"
  echo "-------------"
  echo "bash=$(bash --version | head -1)"
  echo "rsync=$(rsync --version | head -1)"
  echo "zip=$(zip -v | head -2 | tail -1 | sed 's/^ *//')"
  echo
  echo "Git metadata"
  echo "------------"
  if command -v git >/dev/null 2>&1 && git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "branch=$(git -C "$REPO_ROOT" branch --show-current || true)"
    echo "commit=$(git -C "$REPO_ROOT" rev-parse HEAD || true)"
    echo "commit_short=$(git -C "$REPO_ROOT" rev-parse --short HEAD || true)"
    echo
    echo "git_status_short:"
    git -C "$REPO_ROOT" status --short || true
    echo
    echo "recent_commits:"
    git -C "$REPO_ROOT" log --oneline -n 20 || true
  else
    echo "not_a_git_repo=true"
  fi
} > "$META_DIR/EXTRACT_INFO.txt"

echo "==> Creating file inventory..."

(
  cd "$STAGE_DIR"
  find . -type f | sort > "$META_DIR/file-list.txt"
  find . -type d | sort > "$META_DIR/dir-list.txt"

  {
    echo "path	size_bytes"
    while IFS= read -r file; do
      bytes="$(wc -c < "$file" | tr -d ' ')"
      printf "%s\t%s\n" "$file" "$bytes"
    done < "$META_DIR/file-list.txt"
  } > "$META_DIR/file-inventory.tsv"

  {
    echo "Largest files in clean extract"
    echo "=============================="
    find . -type f -not -path "./_REPO_EXTRACT_METADATA/*" -exec du -h {} + | sort -hr | head -100
  } > "$META_DIR/largest-files.txt"

  {
    echo "Extract summary"
    echo "==============="
    echo "files=$(find . -type f | wc -l | tr -d ' ')"
    echo "dirs=$(find . -type d | wc -l | tr -d ' ')"
    echo "size=$(du -sh . | awk '{print $1}')"
  } > "$META_DIR/summary.txt"
)

echo "==> Running lightweight secret-pattern scan..."

SECRET_WARNINGS="$META_DIR/POSSIBLE_SECRET_WARNINGS.txt"

{
  echo "Possible secret warnings"
  echo "========================"
  echo
  echo "This is a heuristic scan. Review matches manually."
  echo "Real .env/key/cert files were excluded before this scan."
  echo

  if command -v grep >/dev/null 2>&1; then
    (
      cd "$STAGE_DIR"

      grep -RInE \
        --exclude-dir="_REPO_EXTRACT_METADATA" \
        --exclude-dir=".git" \
        --exclude-dir="node_modules" \
        --exclude="*.png" \
        --exclude="*.jpg" \
        --exclude="*.jpeg" \
        --exclude="*.webp" \
        --exclude="*.gif" \
        --exclude="*.ico" \
        --exclude="*.svg" \
        --exclude="*.lock" \
        --exclude="pnpm-lock.yaml" \
        --exclude="package-lock.json" \
        --exclude="yarn.lock" \
        '(api[_-]?key|secret|token|password|passwd|bearer[[:space:]]+[A-Za-z0-9._~+/=-]{20,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})' \
        . 2>/dev/null || true
    )
  else
    echo "grep not available; skipped."
  fi
} > "$SECRET_WARNINGS"

if [[ "$(wc -l < "$SECRET_WARNINGS" | tr -d ' ')" -gt 8 ]]; then
  echo "WARNING: possible secret-like strings found."
  echo "Review this file inside the ZIP:"
  echo "  _REPO_EXTRACT_METADATA/POSSIBLE_SECRET_WARNINGS.txt"
fi

echo "==> Writing checksums..."

(
  cd "$STAGE_DIR"
  find . -type f -not -path "./_REPO_EXTRACT_METADATA/SHA256SUMS.txt" -print0 \
    | sort -z \
    | xargs -0 shasum -a 256 > "$META_DIR/SHA256SUMS.txt"
)

echo "==> Creating ZIP..."

(
  cd "$STAGE_ROOT"
  zip -qry "$ZIP_PATH" "$REPO_NAME"
)

ZIP_SHA="$(shasum -a 256 "$ZIP_PATH" | awk '{print $1}')"
ZIP_SIZE="$(du -h "$ZIP_PATH" | awk '{print $1}')"

echo
echo "DONE"
echo "===="
echo "ZIP:     $ZIP_PATH"
echo "SIZE:    $ZIP_SIZE"
echo "SHA256:  $ZIP_SHA"
echo
echo "Upload this ZIP here so I can compare the repo state against Kimi's audit findings."
