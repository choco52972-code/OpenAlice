/**
 * Workspaces Overview dashboard.
 *
 * Card-based at-a-glance view of every workspace. Each card shows the
 * workspace's running/paused sessions, its AI-provider override status,
 * and its latest commit. Card body opens the workspace's main tab;
 * session rows drill straight into that session; the override row opens
 * the AI-provider modal.
 *
 * Future-friendly for "publish workspace state externally" (status-page
 * feel) — no secrets surface, no internal paths.
 */

import { useEffect, useMemo, useState } from 'react'

import { useWorkspaces } from '../contexts/WorkspacesContext'
import { useWorkspace } from '../tabs/store'
import { OverviewCard } from '../components/workspace/OverviewCard'
import { getGitLog, type GitLogEntry, type Workspace } from '../components/workspace/api'

function lastActivityMs(w: Workspace): number {
  const sessionTs = w.sessions
    .map((s) => new Date(s.lastActiveAt).getTime())
    .filter((n) => Number.isFinite(n))
  if (sessionTs.length === 0) return new Date(w.createdAt).getTime()
  return Math.max(...sessionTs)
}

export function WorkspaceListPage() {
  const { workspaces, openAgentConfig } = useWorkspaces()
  const openOrFocus = useWorkspace((s) => s.openOrFocus)

  // Latest commit per workspace. Fetched in parallel on mount + whenever
  // the set of workspace IDs changes. Polled separately from the regular
  // workspaces refresh because git log is expensive — we don't want it
  // running every 3s on the list poll.
  const [commits, setCommits] = useState<Record<string, GitLogEntry | null>>({})
  const idsKey = useMemo(() => workspaces.map((w) => w.id).join(','), [workspaces])
  useEffect(() => {
    if (workspaces.length === 0) return
    let cancelled = false
    void Promise.all(
      workspaces.map(async (w) => {
        try {
          const entries = await getGitLog(w.id, 1)
          return [w.id, entries[0] ?? null] as const
        } catch {
          return [w.id, null] as const
        }
      }),
    ).then((pairs) => {
      if (cancelled) return
      setCommits(Object.fromEntries(pairs))
    })
    return () => {
      cancelled = true
    }
  }, [idsKey, workspaces])

  const sorted = useMemo(() => {
    return [...workspaces].sort((a, b) => lastActivityMs(b) - lastActivityMs(a))
  }, [workspaces])

  if (workspaces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted px-6">
        <h2 className="text-lg font-medium text-text mb-2">Workspaces</h2>
        <p className="text-sm max-w-md text-center">
          No workspaces yet. Create one from the sidebar — each is an isolated git
          directory with a persistent terminal session attached, wired to OpenAlice
          over MCP.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 className="text-[18px] font-semibold text-text">Workspaces Overview</h2>
          <span className="text-[12px] text-text-muted">
            {workspaces.length} workspace{workspaces.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sorted.map((w) => (
            <OverviewCard
              key={w.id}
              workspace={w}
              lastCommit={commits[w.id] ?? null}
              onOpen={() =>
                openOrFocus({ kind: 'workspace', params: { wsId: w.id } })
              }
              onOpenSession={(sid) =>
                openOrFocus({
                  kind: 'workspace',
                  params: { wsId: w.id, sessionId: sid },
                })
              }
              onConfigure={() => openAgentConfig(w.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
