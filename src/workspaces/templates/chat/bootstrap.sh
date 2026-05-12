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

git init -q
git add .
git -c user.email=launcher@local -c user.name=launcher commit -q -m "chat: $TAG"

echo "bootstrapped chat workspace '$TAG' at $OUT_DIR"
