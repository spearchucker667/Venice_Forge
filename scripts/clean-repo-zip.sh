#!/usr/bin/env bash
set -Eeuo pipefail

# clean-repo-zip.sh
# Creates a clean repository ZIP for AI/code review.
# Keeps source, docs, configs, workflows, tests, assets.
# Excludes dependencies, build outputs, caches, logs, archives, secrets, and local junk.

SCRIPT_VERSION="clean-repo-zip-v4"
SCRIPT_PATH="${BASH_SOURCE[0]}"
SCRIPT_ABS_PATH="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)/$(basename "$SCRIPT_PATH")"

REPO_ROOT="${1:-$(pwd)}"
REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
REPO_NAME="$(basename "$REPO_ROOT")"
STAMP="$(date +"%Y%m%d-%H%M%S")"

if [[ "$SCRIPT_ABS_PATH" == "$REPO_ROOT/scripts/clean-repo-zip.sh" ]]; then
  SCRIPT_SOURCE="repo"
else
  SCRIPT_SOURCE="external"
fi

OUT_DIR="${2:-$HOME/Desktop}"
OUT_DIR="$(mkdir -p "$OUT_DIR" && cd "$OUT_DIR" && pwd)"

# Git clean/dirty check
GIT_CLEAN=true
DIRTY_COUNT=0

if command -v git >/dev/null 2>&1 && git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  DIRTY_FILES="$(git -C "$REPO_ROOT" status --short)"
  if [[ -n "$DIRTY_FILES" ]]; then
    GIT_CLEAN=false
    DIRTY_COUNT="$(echo "$DIRTY_FILES" | wc -l | tr -d ' ')"
  fi
fi

if [[ "$GIT_CLEAN" == "false" ]]; then
  if [[ "${ALLOW_DIRTY_REPO_EXTRACT:-0}" != "1" ]]; then
    echo "ERROR: repository has dirty files (count: $DIRTY_COUNT). Refusing to create archive." >&2
    echo "Please commit or stash your changes, or set ALLOW_DIRTY_REPO_EXTRACT=1 to override." >&2
    exit 1
  else
    echo "WARNING: repository is dirty (count: $DIRTY_COUNT), but ALLOW_DIRTY_REPO_EXTRACT=1 is set. Proceeding..." >&2
  fi
fi

STAGE_ROOT="$(mktemp -d "/tmp/${REPO_NAME}-clean-${STAMP}.XXXXXX")"
STAGE_DIR="$STAGE_ROOT/$REPO_NAME"

if [[ "$GIT_CLEAN" == "false" ]]; then
  ZIP_PATH="$OUT_DIR/${REPO_NAME}-clean-${STAMP}-dirty.zip"
else
  ZIP_PATH="$OUT_DIR/${REPO_NAME}-clean-${STAMP}.zip"
fi

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

if ! command -v rsync >/dev/null 2>&1 && ! command -v tar >/dev/null 2>&1; then
  echo "ERROR: neither rsync nor tar is available. One is required." >&2
  exit 1
fi
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

# Source-path guard: reject root-level scratch copies
EXPECTED_TRACKED_SCRIPT="$REPO_ROOT/scripts/clean-repo-zip.sh"
if [[ -f "$EXPECTED_TRACKED_SCRIPT" ]]; then
  EXPECTED_SHA="$(shasum -a 256 "$EXPECTED_TRACKED_SCRIPT" | awk '{print $1}')"
  SCRIPT_SHA256="$(shasum -a 256 "$SCRIPT_ABS_PATH" | awk '{print $1}')"
  if [[ "$SCRIPT_SHA256" != "$EXPECTED_SHA" ]]; then
    echo "ERROR: the running script does not match the repo's tracked scripts/clean-repo-zip.sh." >&2
    echo "Expected SHA: $EXPECTED_SHA" >&2
    echo "Actual SHA:   $SCRIPT_SHA256" >&2
    echo "Actual path:  $SCRIPT_ABS_PATH" >&2
    echo "Refusing to run a stale or scratch copy; use the repo's tracked script." >&2
    exit 1
  fi
else
  SCRIPT_SHA256="$(shasum -a 256 "$SCRIPT_ABS_PATH" | awk '{print $1}')"
fi

if [[ "${INCLUDE_PRIVATE_AUDIT_METADATA:-0}" == "1" ]]; then
  echo "==> Repo root: $REPO_ROOT"
  echo "==> Output dir: $OUT_DIR"
else
  echo "==> Repo: $REPO_NAME"
  echo "==> Output: private path omitted"
fi
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
  "--exclude=docs/HQE_AUDIT_REPORT.md"
  "--exclude=todo.md"
  "--exclude=kimi-export-session_*.md"
  "--exclude=*_ledger.py"
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

if command -v rsync >/dev/null 2>&1; then
  rsync -a \
    "${RSYNC_EXCLUDES[@]}" \
    "$REPO_ROOT/" \
    "$STAGE_DIR/"
else
  # tar fallback for environments without rsync (e.g. Windows Git Bash)
  TAR_EXCLUDES=()
  for rule in "${RSYNC_EXCLUDES[@]}"; do
    if [[ "$rule" == --exclude=* ]]; then
      pat="${rule#--exclude=}"
      pat="${pat%/}"
      if [[ "$pat" == *"/**" ]]; then
        pat="${pat%/**}/*"
      fi
      TAR_EXCLUDES+=("--exclude=$pat")
    fi
  done

  (cd "$REPO_ROOT" && tar -cf - "${TAR_EXCLUDES[@]}" .) | (cd "$STAGE_DIR" && tar -xf -)

  # Restore explicitly included items that tar excluded globally
  if [[ -d "$REPO_ROOT/build" ]]; then
    mkdir -p "$STAGE_DIR/build"
    for f in icon.ico icon.icns icon.png; do
      if [[ -f "$REPO_ROOT/build/$f" ]]; then
        cp "$REPO_ROOT/build/$f" "$STAGE_DIR/build/"
      fi
    done
  fi

  if [[ -d "$REPO_ROOT/.config" ]]; then
    mkdir -p "$STAGE_DIR/.config"
    for ext in yaml yml; do
      # Disable failglob just in case
      for f in "$REPO_ROOT/.config/"*.example."$ext"; do
        if [[ -f "$f" ]]; then
          cp "$f" "$STAGE_DIR/.config/"
        fi
      done
    done
  fi

  for f in .env.example .env.sample .env.template .env.defaults; do
    if [[ -f "$REPO_ROOT/$f" ]]; then
      cp "$REPO_ROOT/$f" "$STAGE_DIR/"
    fi
  done
fi

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
  echo "created_at=$STAMP"
  if [[ "${INCLUDE_PRIVATE_AUDIT_METADATA:-0}" == "1" ]]; then
    # PRIVACY: the following fields leak the local user, hostname, and full
    # absolute paths on the build machine. They are gated behind an explicit
    # opt-in env var so that the default extract is safe to share with
    # auditors / external reviewers without scrubbing. Set
    # INCLUDE_PRIVATE_AUDIT_METADATA=1 to include them.
    echo "repo_root=$REPO_ROOT"
    echo "created_by=$(whoami)"
    echo "hostname=$(hostname)"
    echo "output_zip=$ZIP_PATH"
  else
    echo "private_audit_metadata=omitted (set INCLUDE_PRIVATE_AUDIT_METADATA=1 to include repo_root/created_by/hostname/output_zip)"
  fi
  echo
  echo "Tool versions"
  echo "-------------"
  echo "bash=$(bash --version | head -1)"
  echo "rsync=$(rsync --version | head -1)"
  echo "zip=$(zip -v | head -2 | tail -1 | sed 's/^ *//')"
  echo
  echo "Script provenance"
  echo "-----------------"
  echo "script_source=$SCRIPT_SOURCE"
  echo "script_version=$SCRIPT_VERSION"
  # PRIVACY: script_path leaks the absolute filesystem path of the script
  # on the build machine (e.g. /Users/<u>/Projects/.../scripts/clean-repo-zip.sh).
  # The script_name (basename) is safe to share with auditors / external reviewers
  # and is sufficient to identify the script that produced the extract.
  if [[ "${INCLUDE_PRIVATE_AUDIT_METADATA:-0}" == "1" ]]; then
    echo "script_path=$SCRIPT_ABS_PATH"
  else
    echo "script_name=$(basename "$SCRIPT_ABS_PATH")"
    echo "script_path=omitted (set INCLUDE_PRIVATE_AUDIT_METADATA=1 to include absolute path)"
  fi
  echo "script_sha256=$SCRIPT_SHA256"
  if command -v git >/dev/null 2>&1 && git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    script_status="$(git -C "$REPO_ROOT" status --short -- "scripts/clean-repo-zip.sh" 2>/dev/null || true)"
    echo "script_git_status=${script_status:-clean}"
  else
    echo "script_git_status=unavailable-no-git"
  fi

  echo
  echo "Git metadata"
  echo "------------"
  if command -v git >/dev/null 2>&1 && git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "branch=$(git -C "$REPO_ROOT" branch --show-current || true)"
    echo "commit=$(git -C "$REPO_ROOT" rev-parse HEAD || true)"
    echo "commit_short=$(git -C "$REPO_ROOT" rev-parse --short HEAD || true)"
    echo "git_worktree_clean=$GIT_CLEAN"
    echo "dirty_file_count=$DIRTY_COUNT"
    if [[ "$GIT_CLEAN" == "false" ]]; then
      echo "dirty_extract_allowed_by=ALLOW_DIRTY_REPO_EXTRACT"
    fi
    echo
    echo "git_status_short:"
    git -C "$REPO_ROOT" status --short || true
    echo
    echo "recent_commits:"
    git -C "$REPO_ROOT" log --oneline -n 20 || true
  else
    echo "not_a_git_repo=true"
    echo "git_worktree_clean=unknown"
    echo "dirty_file_count=unknown"
  fi

  echo
  echo "Extract summary"
  echo "==============="
  echo "See _REPO_EXTRACT_METADATA/summary.txt for deterministic file/dir counts."
  echo "Counts there include the metadata directory by default and also provide"
  echo "content-only counts excluding metadata."
} > "$META_DIR/EXTRACT_INFO.txt"

echo "==> Creating file inventory..."

(
  cd "$STAGE_DIR"
  # Pre-metadata inventory (content only)
  find . -type f -not -path './_REPO_EXTRACT_METADATA/*' | sort > "$META_DIR/content-file-list.txt"
  find . -type d -not -path './_REPO_EXTRACT_METADATA' -not -path './_REPO_EXTRACT_METADATA/*' | sort > "$META_DIR/content-dir-list.txt"

  {
    echo "path	size_bytes"
    while IFS= read -r file; do
      bytes="$(wc -c < "$file" | tr -d ' ')"
      printf "%s\t%s\n" "$file" "$bytes"
    done < "$META_DIR/content-file-list.txt"
  } > "$META_DIR/file-inventory.tsv"

  {
    echo "Largest files in clean extract"
    echo "=============================="
    find . -type f -not -path "./_REPO_EXTRACT_METADATA/*" -exec du -h {} + | sort -hr | head -100
  } > "$META_DIR/largest-files.txt"

  {
    echo "Extract summary"
    echo "==============="
    # Final inventory after all metadata files are written
    final_files=$(find . -type f | sort | wc -l | tr -d ' ')
    final_dirs=$(find . -type d | sort | wc -l | tr -d ' ')
    meta_files=$(find ./_REPO_EXTRACT_METADATA -type f 2>/dev/null | sort | wc -l | tr -d ' ')
    meta_dirs=$(find ./_REPO_EXTRACT_METADATA -type d 2>/dev/null | sort | wc -l | tr -d ' ')
    # Content counts exclude the metadata directory itself for clarity.
    content_files=$(wc -l < "$META_DIR/content-file-list.txt" | tr -d ' ')
    content_dirs=$(wc -l < "$META_DIR/content-dir-list.txt" | tr -d ' ')
    echo "files_total_including_metadata=${final_files}"
    echo "dirs_total_including_metadata=${final_dirs}"
    echo "files_content_only=${content_files}"
    echo "dirs_content_only=${content_dirs}"
    echo "files_metadata_only=${meta_files}"
    echo "dirs_metadata_only=${meta_dirs}"
    echo "size=$(du -sh . | awk '{print $1}')"
    echo "inventory_content_file=content-file-list.txt"
    echo "inventory_final_file=final-file-list.txt"
    echo
    echo "Note on counting policy"
    echo "-----------------------"
    echo "All counts above INCLUDE the _REPO_EXTRACT_METADATA directory and its"
    echo "contents (files_total / dirs_total). The 'content_only' counts EXCLUDE"
    echo "the metadata directory for users who want repository-content sizing."
    echo "This makes the counts deterministic regardless of metadata file order."
  } > "$META_DIR/summary.txt"

  # Post-metadata final inventory (used to recompute counts after SHA256SUMS is written)
  find . -type f | sort > "$META_DIR/final-file-list.txt"
  find . -type d | sort > "$META_DIR/final-dir-list.txt"
)

echo "==> Running lightweight secret-pattern scan..."

SECRET_WARNINGS_TSV="$META_DIR/POSSIBLE_SECRET_WARNINGS.tsv"
SECRET_SCAN_SUMMARY="$META_DIR/SECRET_SCAN_SUMMARY.txt"

{
  echo "Possible secret warnings"
  echo "========================"
  echo
  echo "This is a heuristic scan. Review matches manually."
  echo "Real .env/key/cert files were excluded before this scan."
  echo "Only path:line:pattern-name is emitted; raw secret-like values are redacted."
  echo
  echo -e "path\tline\tpattern\tcategory"

  if command -v grep >/dev/null 2>&1; then
    (
      cd "$STAGE_DIR"

      # Emit path:line:pattern:category rows for each match. The bash variable
      # counters that used to live here were never visible to the parent shell
      # (they ran inside a `while read` subshell), so the summary below is now
      # derived from the TSV itself for deterministic counting.
      scan_pattern() {
        local name="$1"
        local pattern="$2"
        local category="$3"
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
          "$pattern" . 2>/dev/null \
          | while IFS= read -r matchline; do
              local filepath="${matchline%%:*}"
              local rest="${matchline#*:}"
              local lineno="${rest%%:*}"
              case "$filepath" in
                ./docs/*|./CHANGELOG.md|./README.md|./.config/*.example.yaml|./.config/*.example.yml|./.env.example)
                  # Excluded: docs/examples don't count as high-risk.
                  ;;
                *)
                  printf '%s\t%s\t%s\t%s\n' "$filepath" "$lineno" "$name" "$category"
                  ;;
              esac
            done || true
      }

      scan_pattern "api-key-or-secret"    "(api[_-]?key|secret|token|password|passwd)"    "example-or-docs"
      scan_pattern "bearer-token"         "bearer[[:space:]]+[A-Za-z0-9._~+/=-]{20,}"    "high-risk-source"
      scan_pattern "sk-token"             "sk-[A-Za-z0-9._~+/=-]{8,}"                     "high-risk-source"
      scan_pattern "venice-vn-token"      "vn-[A-Za-z0-9._~+/=-]{8,}"                     "high-risk-source"
      scan_pattern "github-token"         "ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}" "high-risk-source"
      scan_pattern "aws-access-key"       "AKIA[0-9A-Z]{16}"                              "high-risk-source"
    )
  else
    echo "grep not available; skipped."
  fi
} > "$SECRET_WARNINGS_TSV"

# Derive summary counters from the TSV itself so they always reflect what
# actually got written (the previous subshell-counter approach lost updates
# because `while read` runs in a subshell).
high_risk_hits="$(grep -c $'\t''high-risk-source' "$SECRET_WARNINGS_TSV" 2>/dev/null || echo 0)"
example_hits="$(grep -c $'\t''example-or-docs' "$SECRET_WARNINGS_TSV" 2>/dev/null || echo 0)"
{
  echo "high_risk_hits=${high_risk_hits}"
  echo "example_hits=${example_hits}"
  echo "raw_line_content_emitted=false"
} > "$SECRET_SCAN_SUMMARY"

if [[ "$(wc -l < "$SECRET_WARNINGS_TSV" | tr -d ' ')" -gt 10 ]]; then
  echo "WARNING: possible secret-like strings found."
  echo "Review this file inside the ZIP:"
  echo "  _REPO_EXTRACT_METADATA/POSSIBLE_SECRET_WARNINGS.tsv"
fi

echo "==> Writing checksums..."

(
  cd "$STAGE_DIR"
  find . -type f -not -path "./_REPO_EXTRACT_METADATA/SHA256SUMS.txt" -print0 \
    | sort -z \
    | xargs -0 shasum -a 256 > "$META_DIR/SHA256SUMS.txt"
)

# Regenerate summary.txt and final inventory now that SHA256SUMS.txt exists, so
# files_total_including_metadata matches the file count in the final ZIP.
(
  cd "$STAGE_DIR"
  find . -type f | sort > "$META_DIR/final-file-list.txt"
  find . -type d | sort > "$META_DIR/final-dir-list.txt"
  {
    echo "Extract summary"
    echo "==============="
    final_files=$(wc -l < "$META_DIR/final-file-list.txt" | tr -d ' ')
    final_dirs=$(wc -l < "$META_DIR/final-dir-list.txt" | tr -d ' ')
    meta_files=$(find ./_REPO_EXTRACT_METADATA -type f 2>/dev/null | sort | wc -l | tr -d ' ')
    meta_dirs=$(find ./_REPO_EXTRACT_METADATA -type d 2>/dev/null | sort | wc -l | tr -d ' ')
    content_files=$(wc -l < "$META_DIR/content-file-list.txt" | tr -d ' ')
    content_dirs=$(wc -l < "$META_DIR/content-dir-list.txt" | tr -d ' ')
    echo "files_total_including_metadata=${final_files}"
    echo "dirs_total_including_metadata=${final_dirs}"
    echo "files_content_only=${content_files}"
    echo "dirs_content_only=${content_dirs}"
    echo "files_metadata_only=${meta_files}"
    echo "dirs_metadata_only=${meta_dirs}"
    echo "size=$(du -sh . | awk '{print $1}')"
    echo "inventory_content_file=content-file-list.txt"
    echo "inventory_final_file=final-file-list.txt"
    echo
    echo "Note on counting policy"
    echo "-----------------------"
    echo "All counts above INCLUDE the _REPO_EXTRACT_METADATA directory and its"
    echo "contents (files_total / dirs_total). The 'content_only' counts EXCLUDE"
    echo "the metadata directory for users who want repository-content sizing."
    echo "This makes the counts deterministic regardless of metadata file order."
  } > "$META_DIR/summary.txt"
)

echo "==> Running final archive-clean verification on staged root..."

if [[ -f "$REPO_ROOT/scripts/verify-archive-clean.cjs" ]]; then
  if ! node "$REPO_ROOT/scripts/verify-archive-clean.cjs" --root "$STAGE_DIR"; then
    echo "ERROR: final archive-clean verification failed. Fix exclusions and retry." >&2
    exit 1
  fi
else
  echo "WARNING: scripts/verify-archive-clean.cjs not found; skipping final verification." >&2
fi

echo "==> Creating ZIP..."

(
  cd "$STAGE_ROOT"
  zip -qry "$ZIP_PATH" "$REPO_NAME"
)

ZIP_SHA="$(shasum -a 256 "$ZIP_PATH" | awk '{print $1}')"
ZIP_SIZE="$(du -h "$ZIP_PATH" | awk '{print $1}')"

echo "==> Running post-zip self-check..."

VERIFY_DIR="$(mktemp -d "/tmp/${REPO_NAME}-zip-verify-${STAMP}.XXXXXX")"
cleanup_verify() {
  rm -rf "$VERIFY_DIR"
}
trap 'cleanup; cleanup_verify' EXIT

unzip -q "$ZIP_PATH" -d "$VERIFY_DIR"
VERIFY_ROOT="$VERIFY_DIR/$REPO_NAME"

actual_final_count="$(cd "$VERIFY_ROOT" && find . -type f | sort | wc -l | tr -d ' ')"
recorded_final_count="$(grep '^files_total_including_metadata=' "$VERIFY_ROOT/_REPO_EXTRACT_METADATA/summary.txt" | cut -d= -f2)"

if [[ "$actual_final_count" != "$recorded_final_count" ]]; then
  echo "ERROR: ZIP metadata count mismatch: actual=$actual_final_count recorded=$recorded_final_count" >&2
  exit 1
fi

if [[ -f "$VERIFY_ROOT/scripts/verify-archive-clean.cjs" ]]; then
  if ! node "$VERIFY_ROOT/scripts/verify-archive-clean.cjs" --root "$VERIFY_ROOT"; then
    echo "ERROR: post-zip archive-clean verification failed." >&2
    exit 1
  fi
else
  echo "WARNING: verify-archive-clean.cjs not found in ZIP; skipping post-zip hygiene check." >&2
fi

echo
echo "DONE"
echo "===="
if [[ "${INCLUDE_PRIVATE_AUDIT_METADATA:-0}" == "1" ]]; then
  echo "ZIP:     $ZIP_PATH"
else
  echo "ZIP:     $(basename "$ZIP_PATH") (output path omitted)"
fi
echo "SIZE:    $ZIP_SIZE"
echo "SHA256:  $ZIP_SHA"
echo
echo "Upload this ZIP here so I can compare the repo state against Kimi's audit findings."
