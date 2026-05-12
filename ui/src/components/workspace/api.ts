/**
 * Thin fetch wrapper for /api/workspaces*. Types mirror the server's
 * `WorkspaceMeta` (plus a synthetic `claudeRunning` field derived by the
 * server from the SessionPool).
 */

export interface Workspace {
  readonly id: string;
  readonly tag: string;
  readonly dir: string;
  readonly createdAt: string;
  readonly template?: string;
  /** Adapter ids enabled for this workspace; agents[0] is the default for `+`. */
  readonly agents: readonly string[];
  /**
   * Single ordered list of all session records (running + paused) the
   * launcher tracks for this workspace. Source of truth for sidebar + main
   * pane state.
   */
  readonly sessions: readonly SessionRecord[];
}

export interface CreateError {
  readonly error:
    | 'invalid_tag'
    | 'tag_in_use'
    | 'tag_required'
    | 'bootstrap_failed'
    | 'unknown_template'
    | 'unknown_agent'
    | 'no_templates_configured';
  readonly message?: string;
  readonly stderr?: string;
}

export type CreateResult =
  | { readonly ok: true; readonly workspace: Workspace }
  | { readonly ok: false; readonly status: number; readonly error: CreateError };

export async function listWorkspaces(): Promise<Workspace[]> {
  const res = await fetch('/api/workspaces');
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  const body = (await res.json()) as { workspaces: Workspace[] };
  return body.workspaces;
}

export async function createWorkspace(
  tag: string,
  template: string,
  agents: readonly string[],
): Promise<CreateResult> {
  const res = await fetch('/api/workspaces', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tag, template, agents }),
  });
  if (res.ok) {
    const body = (await res.json()) as { workspace: Workspace };
    return { ok: true, workspace: body.workspace };
  }
  let err: CreateError;
  try {
    err = (await res.json()) as CreateError;
  } catch {
    err = { error: 'bootstrap_failed', message: `HTTP ${res.status}` };
  }
  return { ok: false, status: res.status, error: err };
}

export interface TemplateInfo {
  readonly name: string;
  readonly description?: string;
  readonly defaultAgents: readonly string[];
}

export async function listTemplates(): Promise<TemplateInfo[]> {
  const res = await fetch('/api/workspaces/templates');
  if (!res.ok) throw new Error(`list templates failed: ${res.status}`);
  const body = (await res.json()) as { templates: TemplateInfo[] };
  return body.templates;
}

export interface AgentCapabilities {
  readonly parallelPerCwd: boolean;
  readonly resumeLast: boolean;
  readonly resumeById: boolean;
  readonly transcriptDiscovery: 'fs-watch' | 'subprocess' | 'none';
}

export interface AgentInfo {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: AgentCapabilities;
}

export async function listAgents(): Promise<AgentInfo[]> {
  const res = await fetch('/api/workspaces/agents');
  if (!res.ok) throw new Error(`list agents failed: ${res.status}`);
  const body = (await res.json()) as { agents: AgentInfo[] };
  return body.agents;
}

// ── sessions ─────────────────────────────────────────────────────────────────
//
// V3.S4 — single SessionRecord type that covers both running PTYs and paused
// records. `pid` + `startedAt` are non-null only when `state === 'running'`.
// Persisted server-side at ~/.auto-quant-launcher/state/sessions/<wsId>.json
// so records survive PTY death and server restarts.

export interface SessionRecord {
  readonly id: string;
  readonly wsId: string;
  readonly agent: string;            // 'claude' | 'codex' | 'shell'
  readonly name: string;              // sticky 'c1' / 'x1' / 'sh1'
  readonly createdAt: string;
  readonly lastActiveAt: string;
  readonly state: 'running' | 'paused';
  readonly agentSessionId: string | null;
  readonly pid: number | null;
  readonly startedAt: number | null;
}

export interface SpawnedSession {
  readonly sessionId: string;
  readonly wsId: string;
  readonly name: string;
  readonly pid: number;
  readonly startedAt: number;
  readonly agent: string;
  readonly agentSessionId: string | null;
}

export interface SpawnOptions {
  /** `'last'` → adapter-specific "continue", any UUID → adapter-specific resume-by-id. */
  readonly resume?: 'last' | string;
  /** Override workspace's default adapter (workspace.agents[0]). */
  readonly agent?: string;
}

export async function spawnSession(
  id: string,
  opts: SpawnOptions = {},
): Promise<SpawnedSession> {
  const body: Record<string, unknown> = {};
  if (opts.resume !== undefined) body['resume'] = opts.resume;
  if (opts.agent !== undefined) body['agent'] = opts.agent;
  const res = await fetch(
    `/api/workspaces/${encodeURIComponent(id)}/sessions/spawn`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`spawn session failed: ${res.status} ${msg}`);
  }
  return (await res.json()) as SpawnedSession;
}

/** Pause a session — kills its PTY but keeps the record so it can be resumed later. */
export async function pauseSession(wsId: string, sessionId: string): Promise<boolean> {
  const res = await fetch(
    `/api/workspaces/${encodeURIComponent(wsId)}/sessions/${encodeURIComponent(sessionId)}/pause`,
    { method: 'POST' },
  );
  return res.ok;
}

/**
 * Resume a paused session. Server re-spawns the PTY using the adapter's resume
 * semantic (claude: --resume <id> or --continue; codex: resume --last; shell:
 * fresh PTY w/ scrollback restore in S5).
 */
export async function resumeSession(wsId: string, sessionId: string): Promise<SpawnedSession | null> {
  const res = await fetch(
    `/api/workspaces/${encodeURIComponent(wsId)}/sessions/${encodeURIComponent(sessionId)}/resume`,
    { method: 'POST' },
  );
  if (!res.ok) return null;
  return (await res.json()) as SpawnedSession;
}

/** Permanently remove a session record (kills PTY first if running). */
export async function deleteSession(wsId: string, sessionId: string): Promise<boolean> {
  const res = await fetch(
    `/api/workspaces/${encodeURIComponent(wsId)}/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' },
  );
  return res.ok;
}

export async function deleteWorkspace(id: string): Promise<boolean> {
  const res = await fetch(`/api/workspaces/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return res.ok;
}

/**
 * Kill the PTY for this workspace. Server-side PersistentSession disposes,
 * memory is freed, on-disk Claude Code session JSONLs are preserved. The
 * workspace itself stays in the registry. Idempotent.
 */
export async function stopWorkspace(id: string): Promise<boolean> {
  const res = await fetch(`/api/workspaces/${encodeURIComponent(id)}/stop`, {
    method: 'POST',
  });
  return res.ok;
}

// ── git ──────────────────────────────────────────────────────────────────────

export interface GitLogEntry {
  readonly hash: string;
  readonly subject: string;
  readonly relTime: string;
  readonly authorTime: string;
}

export interface GitStatusFile {
  readonly path: string;
  readonly status: string;
}

export interface GitStatus {
  readonly branch: string | null;
  readonly clean: boolean;
  readonly files: readonly GitStatusFile[];
}

export async function getGitLog(id: string, limit = 30): Promise<GitLogEntry[]> {
  const res = await fetch(
    `/api/workspaces/${encodeURIComponent(id)}/git/log?limit=${limit}`,
  );
  if (!res.ok) throw new Error(`git log failed: ${res.status}`);
  const body = (await res.json()) as { entries: GitLogEntry[] };
  return body.entries;
}

export async function getGitStatus(id: string): Promise<GitStatus> {
  const res = await fetch(`/api/workspaces/${encodeURIComponent(id)}/git/status`);
  if (!res.ok) throw new Error(`git status failed: ${res.status}`);
  return (await res.json()) as GitStatus;
}

// ── files ────────────────────────────────────────────────────────────────────

export interface FileEntry {
  readonly name: string;
  readonly kind: 'file' | 'dir' | 'symlink' | 'other';
  readonly sizeBytes: number | null;
  readonly mtime: string;
}

export interface DirListing {
  readonly path: string;
  readonly entries: readonly FileEntry[];
}

export async function listFiles(id: string, relPath: string): Promise<DirListing> {
  const qs = relPath ? `?path=${encodeURIComponent(relPath)}` : '';
  const res = await fetch(`/api/workspaces/${encodeURIComponent(id)}/files${qs}`);
  if (!res.ok) throw new Error(`list files failed: ${res.status}`);
  return (await res.json()) as DirListing;
}
