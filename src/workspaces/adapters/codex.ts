import { existsSync, readFileSync } from 'node:fs';
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
 *
 * AI provider config: each workspace owns its own `.codex/` (we set
 * `CODEX_HOME=<cwd>/.codex` via `composeEnv` below). The workspace's
 * `config.toml` carries the OpenAlice MCP server entry + any
 * UI-configured `[model_providers.*]` blocks; `auth.json` starts as a
 * symlink to `~/.codex/auth.json` (graceful fallback to global login)
 * and gets replaced by the UI with a real file when the user picks a
 * workspace-specific provider. The MCP-flag translation that the
 * launcher originally did via `mcpJsonToCodexFlags` is gone — codex
 * reads MCP entries directly from the workspace's `config.toml` now.
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

  composeCommand(_base: readonly string[], ctx: SpawnContext): readonly string[] {
    const head = ['codex'];
    if (ctx.resume === undefined) return head;
    if (ctx.resume === 'last') return [...head, 'resume', '--last'];
    return [...head, 'resume', ctx.resume.sessionId];
  },

  /**
   * Point codex at the workspace's own `.codex/` and inject any
   * UI-configured env vars (api keys named by `[model_providers.X].env_key`
   * in the workspace's `config.toml`).
   *
   * Defensive: only set `CODEX_HOME` when `<cwd>/.codex/auth.json` exists.
   * Codex *crashes* ("Codex requires a login") if `CODEX_HOME` points at a
   * dir without `auth.json`. Workspaces created by the current bootstrap
   * always have it (real file or symlink to `~/.codex/auth.json`); legacy
   * workspaces from before this change don't — those silently fall back
   * to the global `~/.codex/` and lose workspace-MCP wiring until
   * recreated. That's the migration story.
   *
   * `.codex/env.json` is the workspace's per-CLI env contribution. Codex
   * has no notion of "literal api key in config" — its `env_key` field
   * indirects through an env var. The OpenAlice UI writes the user's
   * chosen key into `env.json` (e.g. `{"OPENALICE_WORKSPACE_KEY":"sk-..."}`)
   * and the adapter exports those at spawn so codex's `env_key` lookup
   * resolves. This is the one place we DO bridge a file → env (because
   * codex requires env), but the source of truth is still the workspace
   * file, not OpenAlice's internal state.
   */
  composeEnv(ctx: SpawnContext): Record<string, string> {
    const result: Record<string, string> = {};
    const workspaceCodex = join(ctx.cwd, '.codex');
    if (existsSync(join(workspaceCodex, 'auth.json'))) {
      result['CODEX_HOME'] = workspaceCodex;
    }
    const envFile = join(workspaceCodex, 'env.json');
    if (existsSync(envFile)) {
      try {
        const parsed: unknown = JSON.parse(readFileSync(envFile, 'utf8'));
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof v === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) {
              result[k] = v;
            }
          }
        }
      } catch {
        // ignore parse errors; file is user-editable and v1 doesn't surface
      }
    }
    return result;
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
