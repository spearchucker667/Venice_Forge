#!/usr/bin/env bash
set -Eeuo pipefail

# clean-repo-zip.sh
# Creates a clean repository ZIP for AI/code review.
# Keeps source, docs, configs, workflows, tests, assets.
# Excludes dependencies, build outputs, caches, logs, archives, secrets, and local junk.
#
# Usage:
#   bash scripts/clean-repo-zip.sh [REPO_ROOT] [OUT_DIR]
#
# Env:
#   ALLOW_DIRTY_REPO_EXTRACT=1         Allow dirty worktrees (ZIP gets -dirty suffix)
#   INCLUDE_PRIVATE_AUDIT_METADATA=1   Include absolute paths / hostname / username

SCRIPT_VERSION="clean-repo-zip-v5"
SCRIPT_PATH="${BASH_SOURCE[0]}"
SCRIPT_ABS_PATH="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)/$(basename "$SCRIPT_PATH")"
SCRIPT_SHA256="$(shasum -a 256 "$SCRIPT_ABS_PATH" | awk '{print $1}')"
SCRIPT_NAME="$(basename "$SCRIPT_ABS_PATH")"

usage() {
  cat <<'EOF'
Usage: clean-repo-zip.sh [REPO_ROOT] [OUT_DIR]

Creates a clean repository ZIP for AI/code review.

Arguments:
  REPO_ROOT   Repository root (default: current directory)
  OUT_DIR     Output directory (default: ~/Desktop)

Environment:
  ALLOW_DIRTY_REPO_EXTRACT=1
      Allow dirty git worktrees. ZIP name gets a -dirty suffix.
  INCLUDE_PRIVATE_AUDIT_METADATA=1
      Include absolute paths, username, and hostname in metadata.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

# Deterministic tooling output across locales
export LC_ALL=C

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: required command not found: $1" >&2
    exit 1
  }
}

log()  { printf '==> %s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

private_meta_enabled() {
  [[ "${INCLUDE_PRIVATE_AUDIT_METADATA:-0}" == "1" ]]
}

is_git_repo() {
  command -v git >/dev/null 2>&1 \
    && git -C "$1" rev-parse --is-inside-work-tree >/dev/null 2>&1
}

# --- required commands ---
need_cmd zip
need_cmd unzip
need_cmd find
need_cmd sed
need_cmd sort
need_cmd wc
need_cmd du
need_cmd shasum
need_cmd awk
need_cmd mktemp
need_cmd xargs

if ! command -v rsync >/dev/null 2>&1 && ! command -v tar >/dev/null 2>&1; then
  die "neither rsync nor tar is available. One is required."
fi

# --- paths ---
REPO_ROOT="${1:-$(pwd)}"
[[ -d "$REPO_ROOT" ]] || die "repo path does not exist: $REPO_ROOT"
REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
REPO_NAME="$(basename "$REPO_ROOT")"
STAMP="$(date +"%Y%m%d-%H%M%S")"

if [[ "$SCRIPT_ABS_PATH" == "$REPO_ROOT/scripts/clean-repo-zip.sh" ]]; then
  SCRIPT_SOURCE="repo"
else
  SCRIPT_SOURCE="external"
fi

OUT_DIR="${2:-$HOME/Desktop}"
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"

# --- git dirty check ---
GIT_CLEAN=true
DIRTY_COUNT=0
HAS_GIT=false

if is_git_repo "$REPO_ROOT"; then
  HAS_GIT=true
  DIRTY_FILES="$(git -C "$REPO_ROOT" status --short)"
  if [[ -n "$DIRTY_FILES" ]]; then
    GIT_CLEAN=false
    DIRTY_COUNT="$(printf '%s\n' "$DIRTY_FILES" | wc -l | tr -d ' ')"
  fi
fi

if [[ "$GIT_CLEAN" == "false" ]]; then
  if [[ "${ALLOW_DIRTY_REPO_EXTRACT:-0}" != "1" ]]; then
    die "repository has dirty files (count: $DIRTY_COUNT). Commit/stash changes, or set ALLOW_DIRTY_REPO_EXTRACT=1."
  fi
  warn "repository is dirty (count: $DIRTY_COUNT), ALLOW_DIRTY_REPO_EXTRACT=1 set. Proceeding..."
fi

# Safe temp names: avoid odd characters from REPO_NAME in mktemp templates
STAGE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/clean-repo-XXXXXX")"
STAGE_DIR="$STAGE_ROOT/$REPO_NAME"
VERIFY_DIR=""

if [[ "$GIT_CLEAN" == "false" ]]; then
  ZIP_PATH="$OUT_DIR/${REPO_NAME}-clean-${STAMP}-dirty.zip"
else
  ZIP_PATH="$OUT_DIR/${REPO_NAME}-clean-${STAMP}.zip"
fi

META_DIR="$STAGE_DIR/_REPO_EXTRACT_METADATA"

cleanup() {
  local ec=$?
  rm -rf "$STAGE_ROOT"
  [[ -n "${VERIFY_DIR:-}" ]] && rm -rf "$VERIFY_DIR"
  return "$ec"
}
trap cleanup EXIT

cd "$REPO_ROOT"

if [[ ! -f "package.json" && ! -d ".git" && ! -f "README.md" && ! -d "src" ]]; then
  die "this does not look like a repo root: $REPO_ROOT
Run from the repo root or pass the repo path:
  bash scripts/clean-repo-zip.sh /path/to/repo"
fi

# Source-path guard: reject stale/scratch copies when the repo tracks this script
EXPECTED_TRACKED_SCRIPT="$REPO_ROOT/scripts/clean-repo-zip.sh"
if [[ -f "$EXPECTED_TRACKED_SCRIPT" ]]; then
  EXPECTED_SHA="$(shasum -a 256 "$EXPECTED_TRACKED_SCRIPT" | awk '{print $1}')"
  if [[ "$SCRIPT_SHA256" != "$EXPECTED_SHA" ]]; then
    die "running script does not match repo tracked scripts/clean-repo-zip.sh
Expected SHA: $EXPECTED_SHA
Actual SHA:   $SCRIPT_SHA256
Actual path:  $SCRIPT_ABS_PATH
Use the repo's tracked script."
  fi
fi

if private_meta_enabled; then
  log "Repo root: $REPO_ROOT"
  log "Output dir: $OUT_DIR"
else
  log "Repo: $REPO_NAME"
  log "Output: private path omitted"
fi
log "Staging clean copy..."

mkdir -p "$STAGE_DIR"

RSYNC_EXCLUDES=(
  # VCS
  "--exclude=.git/"
  "--exclude=.svn/"
  "--exclude=.hg/"

  # Dependency folders
  "--exclude=node_modules/"
  "--exclude=.node22/"
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
  "--exclude=.superpowers/"
  "--exclude=docs/AGENTS/"
  "--exclude=docs/HQE_AUDIT_REPORT.md"
  "--exclude=todo.md"
  "--exclude=records.json"
  "--exclude=records*.json"
  "--exclude=work done*.md"
  "--exclude=*work*done*.md"
  "--exclude=*session*.json"
  "--exclude=*session*.md"
  "--exclude=chat-history/"
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

copy_tracked_git_files() {
  # Clean Git handoff = tracked-file manifest only. Prevents ignored/untracked
  # audit records, caches, and local history from leaking via missed excludes.
  local relative_path source_path destination_path
  local count=0
  while IFS= read -r -d '' relative_path; do
    source_path="$REPO_ROOT/$relative_path"
    destination_path="$STAGE_DIR/$relative_path"
    mkdir -p "$(dirname "$destination_path")"
    if [[ -L "$source_path" ]]; then
      cp -P "$source_path" "$destination_path"
    elif [[ -f "$source_path" ]]; then
      cp -p "$source_path" "$destination_path"
    else
      # Skip deleted-but-still-index entries and oddities
      continue
    fi
    count=$((count + 1))
  done < <(git -C "$REPO_ROOT" ls-files -z --cached)
  log "Copied $count tracked files from git index"
}

copy_with_rsync() {
  rsync -a \
    "${RSYNC_EXCLUDES[@]}" \
    "$REPO_ROOT/" \
    "$STAGE_DIR/"
}

copy_with_tar() {
  # tar fallback for environments without rsync (e.g. Windows Git Bash)
  local TAR_EXCLUDES=()
  local rule pat
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
    local f
    for f in icon.ico icon.icns icon.png; do
      if [[ -f "$REPO_ROOT/build/$f" ]]; then
        cp -p "$REPO_ROOT/build/$f" "$STAGE_DIR/build/"
      fi
    done
  fi

  if [[ -d "$REPO_ROOT/.config" ]]; then
    mkdir -p "$STAGE_DIR/.config"
    local ext f
    shopt -s nullglob
    for ext in yaml yml; do
      for f in "$REPO_ROOT/.config/"*.example."$ext"; do
        cp -p "$f" "$STAGE_DIR/.config/"
      done
    done
    shopt -u nullglob
  fi

  local f
  for f in .env.example .env.sample .env.template .env.defaults; do
    if [[ -f "$REPO_ROOT/$f" ]]; then
      cp -p "$REPO_ROOT/$f" "$STAGE_DIR/"
    fi
  done
}

if [[ "$HAS_GIT" == "true" ]]; then
  copy_tracked_git_files
elif command -v rsync >/dev/null 2>&1; then
  copy_with_rsync
else
  copy_with_tar
fi

mkdir -p "$META_DIR"

run_verify_archive_clean() {
  local root="$1"
  local label="$2"
  local verifier=""

  if [[ -f "$root/scripts/verify-archive-clean.cjs" ]]; then
    verifier="$root/scripts/verify-archive-clean.cjs"
  elif [[ -f "$REPO_ROOT/scripts/verify-archive-clean.cjs" ]]; then
    verifier="$REPO_ROOT/scripts/verify-archive-clean.cjs"
  else
    warn "verify-archive-clean.cjs not found; skipping ${label}."
    return 0
  fi

  if ! command -v node >/dev/null 2>&1; then
    warn "node not available; skipping ${label}."
    return 0
  fi

  if ! node "$verifier" --root "$root"; then
    die "${label} failed. Fix exclusions and retry."
  fi
}

log "Validating staged archive root..."
run_verify_archive_clean "$STAGE_DIR" "staged archive-clean verification"

tool_version() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    printf 'unavailable'
    return 0
  fi
  case "$cmd" in
    bash)  bash --version 2>/dev/null | head -1 ;;
    rsync) rsync --version 2>/dev/null | head -1 ;;
    zip)   zip -v 2>/dev/null | head -2 | tail -1 | sed 's/^ *//' ;;
    *)     "$cmd" --version 2>/dev/null | head -1 || printf 'unknown' ;;
  esac
}

log "Writing metadata..."

{
  echo "Repo extract metadata"
  echo "====================="
  echo
  echo "repo_name=$REPO_NAME"
  echo "created_at=$STAMP"
  if private_meta_enabled; then
    # PRIVACY: absolute paths / user / host leak build-machine identity.
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
  echo "bash=$(tool_version bash)"
  echo "rsync=$(tool_version rsync)"
  echo "zip=$(tool_version zip)"
  echo
  echo "Script provenance"
  echo "-----------------"
  echo "script_source=$SCRIPT_SOURCE"
  echo "script_version=$SCRIPT_VERSION"
  if private_meta_enabled; then
    echo "script_path=$SCRIPT_ABS_PATH"
  else
    echo "script_name=$SCRIPT_NAME"
    echo "script_path=omitted (set INCLUDE_PRIVATE_AUDIT_METADATA=1 to include absolute path)"
  fi
  echo "script_sha256=$SCRIPT_SHA256"
  if [[ "$HAS_GIT" == "true" ]]; then
    script_status="$(git -C "$REPO_ROOT" status --short -- "scripts/clean-repo-zip.sh" 2>/dev/null || true)"
    echo "script_git_status=${script_status:-clean}"
  else
    echo "script_git_status=unavailable-no-git"
  fi

  echo
  echo "Git metadata"
  echo "------------"
  if [[ "$HAS_GIT" == "true" ]]; then
    echo "branch=$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || true)"
    echo "commit=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || true)"
    echo "commit_short=$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || true)"
    echo "git_worktree_clean=$GIT_CLEAN"
    echo "dirty_file_count=$DIRTY_COUNT"
    echo "extract_source=git-ls-files-cached"
    if [[ "$GIT_CLEAN" == "false" ]]; then
      echo "dirty_extract_allowed_by=ALLOW_DIRTY_REPO_EXTRACT"
      echo "note=dirty worktree allowed; archive still contains tracked files only"
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
    echo "extract_source=rsync-or-tar-with-excludes"
  fi

  echo
  echo "Extract summary"
  echo "==============="
  echo "See _REPO_EXTRACT_METADATA/summary.txt for deterministic file/dir counts."
  echo "Counts there include the metadata directory by default and also provide"
  echo "content-only counts excluding metadata."
} > "$META_DIR/EXTRACT_INFO.txt"

write_summary() {
  # Regenerable summary so totals stay correct after late metadata writes
  # (e.g. SHA256SUMS.txt).
  local final_files final_dirs meta_files meta_dirs content_files content_dirs
  final_files=$(wc -l < "$META_DIR/final-file-list.txt" | tr -d ' ')
  final_dirs=$(wc -l < "$META_DIR/final-dir-list.txt" | tr -d ' ')
  meta_files=$(find "$META_DIR" -type f 2>/dev/null | wc -l | tr -d ' ')
  meta_dirs=$(find "$META_DIR" -type d 2>/dev/null | wc -l | tr -d ' ')
  content_files=$(wc -l < "$META_DIR/content-file-list.txt" | tr -d ' ')
  content_dirs=$(wc -l < "$META_DIR/content-dir-list.txt" | tr -d ' ')

  {
    echo "Extract summary"
    echo "==============="
    echo "files_total_including_metadata=${final_files}"
    echo "dirs_total_including_metadata=${final_dirs}"
    echo "files_content_only=${content_files}"
    echo "dirs_content_only=${content_dirs}"
    echo "files_metadata_only=${meta_files}"
    echo "dirs_metadata_only=${meta_dirs}"
    echo "size=$(du -sh "$STAGE_DIR" | awk '{print $1}')"
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
}

refresh_final_inventory() {
  (
    cd "$STAGE_DIR"
    find . -type f | sort > "$META_DIR/final-file-list.txt"
    find . -type d | sort > "$META_DIR/final-dir-list.txt"
  )
  write_summary
}

file_size_bytes() {
  # Portable size in bytes (macOS stat first, GNU stat fallback, wc last)
  local f="$1"
  if stat -f%z "$f" >/dev/null 2>&1; then
    stat -f%z "$f"
  elif stat -c%s "$f" >/dev/null 2>&1; then
    stat -c%s "$f"
  else
    wc -c < "$f" | tr -d ' '
  fi
}

log "Creating file inventory..."

(
  cd "$STAGE_DIR"
  # Pre-metadata inventory (content only)
  find . -type f -not -path './_REPO_EXTRACT_METADATA/*' | sort > "$META_DIR/content-file-list.txt"
  find . -type d -not -path './_REPO_EXTRACT_METADATA' -not -path './_REPO_EXTRACT_METADATA/*' | sort > "$META_DIR/content-dir-list.txt"

  {
    printf 'path\tsize_bytes\n'
    while IFS= read -r file; do
      printf '%s\t%s\n' "$file" "$(file_size_bytes "$file")"
    done < "$META_DIR/content-file-list.txt"
  } > "$META_DIR/file-inventory.tsv"

  {
    echo "Largest files in clean extract"
    echo "=============================="
    find . -type f -not -path "./_REPO_EXTRACT_METADATA/*" -exec du -h {} + 2>/dev/null \
      | sort -hr \
      | head -100 || true
  } > "$META_DIR/largest-files.txt"
)

# Initial final inventory (updated again after checksums)
refresh_final_inventory

log "Running lightweight secret-pattern scan..."

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
  printf 'path\tline\tpattern\tcategory\n'

  if command -v grep >/dev/null 2>&1; then
    (
      cd "$STAGE_DIR"

      # Emit path/line/pattern/category rows. Summary counters are derived from
      # the TSV afterward so subshell scoping cannot drop counts.
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
              local line_text="${rest#*:}"
              # Skip length-probe helpers like has_api_key: value.length
              if [[ "$line_text" =~ has_[A-Za-z0-9_]*(api_key|secret|token|password)[A-Za-z0-9_]*[[:space:]]*:[[:space:]]*[A-Za-z0-9_.]+\.length[[:space:]]* ]]; then
                continue
              fi
              case "$filepath" in
                *.test.ts|*.test.tsx|*.test.js|*.test.jsx|*.spec.ts|*.spec.tsx|*.spec.js|*.spec.jsx)
                  # Intentional fixtures: report, but do not block as high-risk.
                  printf '%s\t%s\t%s\t%s\n' "$filepath" "$lineno" "$name" "test-fixture"
                  ;;
                ./docs/*|./CHANGELOG.md|./README.md|./.config/*.example.yaml|./.config/*.example.yml|./.env.example|./.env.sample|./.env.template|./.env.defaults)
                  printf '%s\t%s\t%s\t%s\n' "$filepath" "$lineno" "$name" "example-or-docs"
                  ;;
                *)
                  printf '%s\t%s\t%s\t%s\n' "$filepath" "$lineno" "$name" "$category"
                  ;;
              esac
            done || true
      }

      # Assignment/value-shaped matches only. Bare prose keywords are noise.
      scan_pattern "secret-assignment" \
        "([A-Za-z0-9_]*(API_KEY|ACCESS_KEY|SECRET_KEY|PRIVATE_KEY|VENICE_KEY|JINA_KEY|_TOKEN|_SECRET|PASSWORD)[A-Za-z0-9_]*)[[:space:]]*[:=][[:space:]]*['\"]?[A-Za-z0-9_./+=-]{16,}" \
        "high-risk-source"
      scan_pattern "api-key-or-secret" \
        "(api[_-]?key|secret|password|passwd)[[:space:]]*[:=][[:space:]]*['\"]?[A-Za-z0-9_./+=-]{16,}" \
        "high-risk-source"
      scan_pattern "token-assignment" \
        "(auth[_-]?token|access[_-]?token|token)[[:space:]]*[:=][[:space:]]*[\"'][^\"']{8,}" \
        "high-risk-source"
      scan_pattern "bearer-token" \
        "bearer[[:space:]]+[A-Za-z0-9._~+/=-]{20,}" \
        "high-risk-source"
      scan_pattern "sk-token" \
        "\\bsk-[A-Za-z0-9._~+/=-]{8,}" \
        "high-risk-source"
      scan_pattern "venice-vn-token" \
        "\\bvn-[A-Za-z0-9._~+/=-]{8,}" \
        "high-risk-source"
      scan_pattern "github-token" \
        "ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}" \
        "high-risk-source"
      scan_pattern "aws-access-key" \
        "AKIA[0-9A-Z]{16}" \
        "high-risk-source"
    )
  else
    echo "grep not available; skipped."
  fi
} > "$SECRET_WARNINGS_TSV"

high_risk_hits="$(awk -F '\t' 'NR > 1 && $4 == "high-risk-source" { count++ } END { print count + 0 }' "$SECRET_WARNINGS_TSV")"
example_hits="$(awk -F '\t' 'NR > 1 && $4 == "example-or-docs" { count++ } END { print count + 0 }' "$SECRET_WARNINGS_TSV")"
fixture_hits="$(awk -F '\t' 'NR > 1 && $4 == "test-fixture" { count++ } END { print count + 0 }' "$SECRET_WARNINGS_TSV")"
{
  echo "high_risk_hits=${high_risk_hits}"
  echo "example_hits=${example_hits}"
  echo "test_fixture_hits=${fixture_hits}"
  echo "raw_line_content_emitted=false"
} > "$SECRET_SCAN_SUMMARY"

warning_rows=$(( $(wc -l < "$SECRET_WARNINGS_TSV" | tr -d ' ') - 1 ))
if [[ "$warning_rows" -lt 0 ]]; then
  warning_rows=0
fi

if [[ "$warning_rows" -gt 0 ]]; then
  warn "possible secret-like strings found (${warning_rows} row(s))."
  warn "Review _REPO_EXTRACT_METADATA/POSSIBLE_SECRET_WARNINGS.tsv inside the ZIP."
fi

if [[ "$high_risk_hits" -gt 0 ]]; then
  die "high-risk source secret-like strings found (${high_risk_hits}).
Review _REPO_EXTRACT_METADATA/POSSIBLE_SECRET_WARNINGS.tsv and remove or dynamically construct fixtures before archiving."
fi

log "Writing checksums..."

(
  cd "$STAGE_DIR"
  # Avoid xargs running shasum with no args on empty input (Bash 3.2-safe).
  if find . -type f -not -path "./_REPO_EXTRACT_METADATA/SHA256SUMS.txt" -print -quit | grep -q .; then
    find . -type f -not -path "./_REPO_EXTRACT_METADATA/SHA256SUMS.txt" -print0       | sort -z       | xargs -0 shasum -a 256 > "$META_DIR/SHA256SUMS.txt"
  else
    : > "$META_DIR/SHA256SUMS.txt"
  fi
)

# Regenerate summary/final inventory now that SHA256SUMS.txt exists
refresh_final_inventory

log "Running final archive-clean verification on staged root..."
run_verify_archive_clean "$STAGE_DIR" "final archive-clean verification"

log "Creating ZIP..."

(
  cd "$STAGE_ROOT"
  zip -qry "$ZIP_PATH" "$REPO_NAME"
)

ZIP_SHA="$(shasum -a 256 "$ZIP_PATH" | awk '{print $1}')"
ZIP_SIZE="$(du -h "$ZIP_PATH" | awk '{print $1}')"

log "Running post-zip self-check..."

VERIFY_DIR="$(mktemp -d "${TMPDIR:-/tmp}/clean-repo-zip-verify-XXXXXX")"

unzip -q "$ZIP_PATH" -d "$VERIFY_DIR"
VERIFY_ROOT="$VERIFY_DIR/$REPO_NAME"

[[ -d "$VERIFY_ROOT" ]] || die "ZIP did not contain expected root directory: $REPO_NAME"

actual_final_count="$(cd "$VERIFY_ROOT" && find . -type f | sort | wc -l | tr -d ' ')"
recorded_final_count="$(grep '^files_total_including_metadata=' "$VERIFY_ROOT/_REPO_EXTRACT_METADATA/summary.txt" | cut -d= -f2 | tr -d '[:space:]')"

if [[ "$actual_final_count" != "$recorded_final_count" ]]; then
  die "ZIP metadata count mismatch: actual=$actual_final_count recorded=$recorded_final_count"
fi

run_verify_archive_clean "$VERIFY_ROOT" "post-zip archive-clean verification"

echo
echo "DONE"
echo "===="
if private_meta_enabled; then
  echo "ZIP:     $ZIP_PATH"
else
  echo "ZIP:     $(basename "$ZIP_PATH") (output path omitted)"
fi
echo "SIZE:    $ZIP_SIZE"
echo "SHA256:  $ZIP_SHA"
echo "VERSION: $SCRIPT_VERSION"
echo
echo "Clean extract ready."
