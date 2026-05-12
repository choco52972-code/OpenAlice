import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import type { CliAdapter, SpawnContext } from '../cli-adapter.js';

const SESSION_FILE_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;

/** dashed-cwd convention used by Claude Code's project store. */
function projectKey(workspaceDir: string): string {
  const abs = resolve(workspaceDir);
  return abs.replaceAll('/', '-').replaceAll('.', '-');
}

/**
 * The Claude Code adapter is the original launcher target. v2.M1 keeps its
 * behavior bit-identical with what shipped previously (`composeCommand` here
 * is the verbatim move of `index.ts:composeCommand` from before refactor).
 *
 * MCP wiring for claude is handled by the template's `.mcp.json` (the launcher
 * still does the placeholder-substitution at spawn-env-build time). v2.M4
 * generalizes that into `bootstrap()` here.
 */
export const claudeAdapter: CliAdapter = {
  id: 'claude',
  displayName: 'Claude Code',
  namePrefix: 'c',
  capabilities: {
    parallelPerCwd: true,
    resumeLast: true,
    resumeById: true,
    transcriptDiscovery: 'fs-watch',
  },

  composeCommand(base: readonly string[], ctx: SpawnContext): readonly string[] {
    if (ctx.resume === undefined) return base;
    if (ctx.resume === 'last') return [...base, '--continue'];
    return [...base, '--resume', ctx.resume.sessionId];
  },

  transcriptDir(cwd: string): string {
    return join(homedir(), '.claude', 'projects', projectKey(cwd));
  },
  transcriptFileRe: SESSION_FILE_RE,
  extractSessionId(filename: string): string | null {
    const m = SESSION_FILE_RE.exec(filename);
    return m && m[1] ? m[1] : null;
  },
};
