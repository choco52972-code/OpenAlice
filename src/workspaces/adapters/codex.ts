import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import type { BootstrapContext, CliAdapter, SpawnContext } from '../cli-adapter.js';

/**
 * OpenAI Codex CLI (Rust rewrite, `codex-cli`).
 *
 * Verified empirically against `codex-cli 0.130.0` on macOS:
 * - Resume CLI: `codex resume --last` (= most recent for this cwd; codex
 *   filters by cwd by default), and `codex resume <uuid>` for a specific id.
 *   So the resume model is structurally the same as claude's `--continue` /
 *   `--resume <id>`, just expressed as a subcommand instead of a flag.
 * - Sessions live at `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl`
 *   (uncompressed plain JSONL). The directory tree is **global, not
 *   per-cwd**, so transcript discovery via fs.watch is degenerate here —
 *   we'd see new files from every codex session on the machine, not just
 *   this workspace. v1 punts on this (`transcriptDiscovery: 'none'`); the
 *   `codex resume` picker is cwd-aware and handles the user-facing case.
 * - Trust model: codex prompts on first run for any cwd not in
 *   `~/.codex/config.toml` `[projects."<abs>"] trust_level`. `bootstrap()`
 *   pre-writes that entry so the launcher's spawn doesn't stall on the
 *   prompt.
 */
export const codexAdapter: CliAdapter = {
  id: 'codex',
  displayName: 'Codex',
  namePrefix: 'x',
  capabilities: {
    parallelPerCwd: true,
    resumeLast: true,
    resumeById: true,
    transcriptDiscovery: 'none',
  },

  /**
   * Note we ignore the `base` arg (which carries the env override
   * `WEB_TERMINAL_COMMAND`, claude-shaped). Codex has a distinct binary; if a
   * user wants to override the path, they can wrap `codex` on $PATH.
   *
   * We translate the workspace's agent-agnostic `<cwd>/.mcp.json` (the same
   * file claude reads) into codex `-c mcp_servers.*` flags so the launcher's
   * MCP servers are visible to codex out-of-the-box, without polluting the
   * user's global `~/.codex/config.toml`. `${VAR}` placeholders in .mcp.json
   * are expanded against the spawn env right here (codex itself doesn't
   * substitute env vars in `-c` values).
   */
  composeCommand(_base: readonly string[], ctx: SpawnContext): readonly string[] {
    const mcpFlags = mcpJsonToCodexFlags(ctx.cwd, ctx.env);
    const head = ['codex', ...mcpFlags];
    if (ctx.resume === undefined) return head;
    if (ctx.resume === 'last') return [...head, 'resume', '--last'];
    return [...head, 'resume', ctx.resume.sessionId];
  },

  async bootstrap(ctx: BootstrapContext): Promise<void> {
    await ensureTrustedProject(ctx.cwd);
  },
};

/**
 * Add (or no-op if present) a `[projects."<abs>"] trust_level = "trusted"`
 * entry to `~/.codex/config.toml`. Uses a minimal append-or-rewrite strategy
 * — we don't bring in a TOML library because the section grammar is simple
 * and we only ever touch one section per workspace.
 *
 * If the project is already present we leave the file alone, regardless of
 * what value it has (the user may have set `read_only` deliberately).
 */
async function ensureTrustedProject(cwd: string): Promise<void> {
  const abs = resolve(cwd);
  const configPath = join(homedir(), '.codex', 'config.toml');

  let existing = '';
  try {
    existing = await readFile(configPath, 'utf8');
  } catch (err) {
    if (!isENOENT(err)) throw err;
    await mkdir(dirname(configPath), { recursive: true });
  }

  // Match either single- or triple-bracket [projects."<path>"] headers.
  const headerEsc = abs.replace(/[\\"]/g, (c) => `\\${c}`);
  const headerRe = new RegExp(
    `^\\[projects\\."${headerEsc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\]\\s*$`,
    'm',
  );
  if (headerRe.test(existing)) return; // already configured — don't clobber

  const block = `\n[projects."${headerEsc}"]\ntrust_level = "trusted"\n`;
  const next = existing.endsWith('\n') || existing.length === 0 ? existing + block : existing + '\n' + block;
  await writeFile(configPath, next, 'utf8');
}

function isENOENT(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT';
}

// ── .mcp.json → codex `-c` flags ────────────────────────────────────────────

interface McpServerSpec {
  readonly command?: unknown;
  readonly args?: unknown;
  readonly env?: unknown;
  readonly url?: unknown;
}

function mcpJsonToCodexFlags(cwd: string, env: Readonly<Record<string, string>>): readonly string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(cwd, '.mcp.json'), 'utf8'));
  } catch {
    return [];
  }
  if (typeof parsed !== 'object' || parsed === null) return [];
  const servers = (parsed as { mcpServers?: unknown }).mcpServers;
  if (typeof servers !== 'object' || servers === null) return [];

  const flags: string[] = [];
  for (const [name, raw] of Object.entries(servers as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) continue;
    if (!/^[A-Za-z0-9_-]+$/.test(name)) continue; // skip invalid keys to keep TOML path safe
    const spec = raw as McpServerSpec;

    // Streamable-HTTP MCP server. Codex's TOML key is just `url`; the
    // `command`/`args`/`env` branch is mutually exclusive on codex's side
    // (per `codex mcp add` usage), so we early-continue once we've emitted
    // a url flag for this server name.
    if (typeof spec.url === 'string') {
      flags.push('-c', `mcp_servers.${name}.url=${tomlString(expand(spec.url, env))}`);
      continue;
    }

    if (typeof spec.command === 'string') {
      flags.push('-c', `mcp_servers.${name}.command=${tomlString(expand(spec.command, env))}`);
    }
    if (Array.isArray(spec.args)) {
      const items = spec.args
        .filter((a): a is string => typeof a === 'string')
        .map((a) => tomlString(expand(a, env)))
        .join(', ');
      flags.push('-c', `mcp_servers.${name}.args=[${items}]`);
    }
    if (spec.env && typeof spec.env === 'object') {
      for (const [k, v] of Object.entries(spec.env as Record<string, unknown>)) {
        if (typeof v !== 'string') continue;
        if (!/^[A-Za-z0-9_]+$/.test(k)) continue;
        flags.push('-c', `mcp_servers.${name}.env.${k}=${tomlString(expand(v, env))}`);
      }
    }
  }
  return flags;
}

/** Expand `${VAR}` and `${VAR:-default}` against the spawn env. Missing vars become ''. */
function expand(s: string, env: Readonly<Record<string, string>>): string {
  return s.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
    const sep = expr.indexOf(':-');
    if (sep >= 0) {
      const name = expr.slice(0, sep);
      const fallback = expr.slice(sep + 2);
      return env[name] ?? fallback;
    }
    return env[expr] ?? '';
  });
}

function tomlString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
