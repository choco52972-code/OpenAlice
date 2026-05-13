#!/usr/bin/env bash
# Bootstrap a chat workspace: an empty git directory wired to OpenAlice's
# MCP server, with Alice's persona dropped in as both CLAUDE.md (Claude
# Code's convention) and AGENTS.md (Codex / general convention) so the
# agent — whichever the user picks — boots already "as Alice".
#
# Contract:
#   argv:  $1 = tag, $2 = outDir
#   env:   AQ_TEMPLATE_FILES_DIR  — abs path to this template's files/
#          AQ_LAUNCHER_REPO_ROOT  — abs path to the OpenAlice repo root
#                                   (used to find Alice's live persona)
# exit:  0 ok, non-zero on any failure

set -euo pipefail

TAG="${1:?tag required}"
OUT_DIR="${2:?outDir required}"
: "${AQ_TEMPLATE_FILES_DIR:?AQ_TEMPLATE_FILES_DIR must be set by the launcher}"

if [[ -e "$OUT_DIR" ]]; then
  echo "outDir already exists: $OUT_DIR" >&2
  exit 2
fi

mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

# MCP config — leave ${AQ_LAUNCHER_REPO_ROOT} / ${OPENALICE_MCP_URL}
# placeholders unexpanded so the agent CLI does its own expansion at spawn
# time.
cp "$AQ_TEMPLATE_FILES_DIR/mcp.json" .mcp.json

# Locate Alice's persona — prefer the user's live edit, fall back to the
# shipped default. If neither is reachable (e.g. AQ_LAUNCHER_REPO_ROOT
# unset), skip the persona prepend gracefully.
PERSONA_SRC=""
if [[ -n "${AQ_LAUNCHER_REPO_ROOT:-}" ]]; then
  if [[ -f "$AQ_LAUNCHER_REPO_ROOT/data/brain/persona.md" ]]; then
    PERSONA_SRC="$AQ_LAUNCHER_REPO_ROOT/data/brain/persona.md"
  elif [[ -f "$AQ_LAUNCHER_REPO_ROOT/default/persona.default.md" ]]; then
    PERSONA_SRC="$AQ_LAUNCHER_REPO_ROOT/default/persona.default.md"
  fi
fi

# Compose agent instructions: persona on top, workspace context below.
{
  if [[ -n "$PERSONA_SRC" ]]; then
    cat "$PERSONA_SRC"
    printf '\n\n---\n\n'
  fi
  cat "$AQ_TEMPLATE_FILES_DIR/CLAUDE.md"
} > CLAUDE.md

# Same content under AGENTS.md so Codex / other AGENTS.md-aware CLIs pick
# up the same identity. Keeping a single source-of-truth (CLAUDE.md) avoids
# drift; this is a literal copy, not a separate compose pass.
cp CLAUDE.md AGENTS.md

# ── Codex workspace skeleton ────────────────────────────────────────────────
# Each workspace is its own VS-Code-style "open folder" — claude reads
# `.claude/settings*.json` from cwd, codex reads `$CODEX_HOME` (which the
# codex adapter points at this `.codex/` dir at spawn). We seed:
#   - `.codex/config.toml` with the OpenAlice MCP block so codex sees the
#     OpenAlice tool surface from day 1. The OpenAlice UI later patches
#     `[model_providers.*]` + `model` / `model_provider` keys when the user
#     picks a provider; we deliberately do not write provider config at
#     create time (workspaces inherit the user's global CLI auth until
#     explicitly configured).
#   - `.codex/auth.json` symlinked to the user's global codex login so a
#     fresh-config workspace still has a valid auth. The UI replaces this
#     symlink with a real file when the user assigns a workspace-specific
#     key (so global rotation doesn't leak into configured workspaces).
mkdir -p .codex
ln -sf "$HOME/.codex/auth.json" .codex/auth.json
cat > .codex/config.toml <<'TOML'
[mcp_servers.openalice]
url = "${OPENALICE_MCP_URL:-http://127.0.0.1:3001/mcp}"
TOML

git init -q

# `.git/info/exclude` is per-clone, untracked. Belt-and-suspenders against
# UI-saved secrets ever entering a push:
#   - .claude/settings.local.json — claude itself auto-ignores this, but
#     the entry here defends against any future tooling reading from
#     `.gitignore` instead of trusting claude's runtime behaviour.
#   - .codex/auth.json — codex's auth (symlink or real file). Never push.
{
  echo '.claude/settings.local.json'
  echo '.codex/auth.json'
} >> .git/info/exclude

git add .
git -c user.email=launcher@local -c user.name=launcher commit -q -m "chat: $TAG"

echo "bootstrapped chat workspace '$TAG' at $OUT_DIR"
