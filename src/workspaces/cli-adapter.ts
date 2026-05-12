/**
 * Capability-described handle on a coding-agent CLI (claude, codex, shell, …).
 *
 * The pool, watcher, and discovery layers consult an adapter to:
 *   1. Translate a spawn intent (`resume`?) into the CLI's native command flags.
 *   2. Decide whether/how to discover on-disk transcripts for this CLI.
 *   3. Provide CLI-specific env strips/sets and one-time bootstrap (writing
 *      config files, registering MCP servers in the CLI's native format, etc.).
 *
 * In v2.M1 only `claude` is registered; the interface exists so v2.M2+ can
 * land codex/shell without touching the core PTY/protocol/UI plumbing.
 */

export interface OnDiskSession {
  readonly sessionId: string;
  readonly file: string;
  readonly mtime: string;
  readonly sizeBytes: number;
}

export interface SpawnContext {
  readonly resume?: 'last' | { readonly sessionId: string };
  /** Workspace cwd; lets adapters read e.g. `<cwd>/.mcp.json`. */
  readonly cwd: string;
  /**
   * Final env the PTY will be spawned with (after `spawn-env.ts`). Adapters
   * use this for `${VAR}` placeholder expansion when translating a
   * cross-CLI MCP definition into their own native command flags.
   */
  readonly env: Readonly<Record<string, string>>;
}

export interface BootstrapContext {
  readonly wsId: string;
  readonly cwd: string;
  /** Absolute path to the launcher repo, so adapters can compose tool paths. */
  readonly launcherRepoRoot: string;
}

export interface EnvOverrides {
  /**
   * Substrings that, when found anywhere in an env var name, cause the var to
   * be stripped from the spawn env. Layered on top of `spawn-env.ts`'s
   * baseline list. The substring match is the same `STRIP_TOKENS` semantics
   * used by `buildSpawnEnv`.
   */
  readonly strip?: readonly string[];
  readonly set?: Readonly<Record<string, string>>;
}

export interface CliAdapter {
  readonly id: string;                          // 'claude' | 'codex' | 'shell'
  readonly displayName: string;
  /**
   * Short prefix used to name sessions (e.g. `c1`, `x1`, `sh1`). Helps scan a
   * mixed sidebar tree. Defaults to `id[0]` if omitted, but adapters whose
   * first character collides with another adapter (claude / codex both 'c')
   * MUST set this explicitly.
   */
  readonly namePrefix?: string;
  readonly capabilities: {
    readonly parallelPerCwd: boolean;
    readonly resumeLast: boolean;
    readonly resumeById: boolean;
    readonly transcriptDiscovery: 'fs-watch' | 'subprocess' | 'none';
  };

  /**
   * Translate the base command (from `WEB_TERMINAL_COMMAND` / template) +
   * resume intent into the final argv. For claude:
   *   base + 'last'    → [...base, '--continue']
   *   base + { id }    → [...base, '--resume', id]
   * For codex (M2):
   *   base + 'last'    → [...base, 'resume', '--last']
   *   base + { id }    → [...base, 'resume', id]
   */
  composeCommand(base: readonly string[], ctx: SpawnContext): readonly string[];

  /** Optional per-CLI env adjustments on top of `spawn-env.ts`'s baseline. */
  envOverrides?(parent: NodeJS.ProcessEnv): EnvOverrides;

  /**
   * Workspace-creation hook. The launcher calls this once for every adapter
   * enabled on a workspace. Responsible for technical wiring (writing
   * `.mcp.json`, adding trust entries to global config, etc.) — NOT for
   * instruction files like CLAUDE.md / AGENTS.md (template README covers
   * the cross-CLI guidance).
   */
  bootstrap?(ctx: BootstrapContext): Promise<void>;

  // ── Transcript detection (used only when capabilities.transcriptDiscovery === 'fs-watch')
  transcriptDir?(cwd: string): string;
  transcriptFileRe?: RegExp;
  extractSessionId?(filename: string): string | null;

  /** Subprocess discovery (capabilities.transcriptDiscovery === 'subprocess'). */
  listOnDisk?(cwd: string): Promise<readonly OnDiskSession[]>;
}

export class AdapterRegistry {
  private readonly adapters = new Map<string, CliAdapter>();
  private defaultId: string | null = null;

  register(adapter: CliAdapter, opts: { default?: boolean } = {}): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`adapter already registered: ${adapter.id}`);
    }
    this.adapters.set(adapter.id, adapter);
    if (opts.default || this.defaultId === null) this.defaultId = adapter.id;
  }

  get(id: string): CliAdapter | undefined {
    return this.adapters.get(id);
  }

  /** Returns the registered adapter for `id`, falling back to the default. */
  resolve(id: string | null | undefined): CliAdapter {
    if (id) {
      const a = this.adapters.get(id);
      if (a) return a;
    }
    const fallback = this.defaultId ? this.adapters.get(this.defaultId) : undefined;
    if (!fallback) {
      throw new Error('AdapterRegistry has no adapters registered');
    }
    return fallback;
  }

  list(): readonly CliAdapter[] {
    return Array.from(this.adapters.values());
  }
}
