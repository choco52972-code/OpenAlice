/**
 * Single workspace/session detail page.
 *
 * Renders the launcher's WorkspaceView (terminal + git/files panels) bound
 * to whatever workspace+session this tab's spec points at:
 *
 *   { wsId }                — workspace selected, no session pinned: shows
 *                             a CTA prompting the user to spawn one.
 *   { wsId, sessionId }     — session pinned: shows the terminal slot for
 *                             that session, with the workspace's git/files
 *                             panels alongside.
 *
 * Each session is its own tab; multiple session tabs for the same workspace
 * each carry their own WorkspaceView (with their own git/files polling).
 * Closing a tab via the X button does NOT terminate the session — the PTY
 * keeps running on the server. Use the sidebar's × to actually delete.
 */

import { useEffect } from 'react'
import '@xterm/xterm/css/xterm.css'

import { useWorkspaces } from '../contexts/WorkspacesContext'
import { WorkspaceView } from '../components/workspace/WorkspaceView'
import type { KeyMap } from '../components/workspace/Terminal'
import type { ViewSpec } from '../tabs/types'

const APP_KEY_MAP: KeyMap = {
  'shift+enter': '\x1b\r',
}

interface Props {
  spec: Extract<ViewSpec, { kind: 'workspace' }>
  visible: boolean
}

export function WorkspacePage({ spec, visible }: Props) {
  const ctx = useWorkspaces()
  const wsId = spec.params.wsId
  const sessionId = spec.params.sessionId ?? null

  const workspace = ctx.workspaces.find((w) => w.id === wsId)
  const sessions = workspace?.sessions ?? []
  const activeRecord = sessionId
    ? sessions.find((s) => s.id === sessionId) ?? null
    : null

  // Cmd+T / Ctrl+T: spawn fresh session in this workspace; only when this
  // tab is visible, to avoid double-spawns when multiple workspace tabs are
  // open.
  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 't' && e.key !== 'T') return
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.shiftKey || e.altKey) return
      e.preventDefault()
      e.stopPropagation()
      void ctx.spawn(wsId, {})
    }
    document.addEventListener('keydown', handler, { capture: true })
    return () => document.removeEventListener('keydown', handler, { capture: true })
  }, [visible, ctx, wsId])

  if (!workspace) {
    return (
      <div className="workspaces-root flex flex-col items-center justify-center h-full text-text-muted text-sm">
        Workspace not found. It may have been deleted.
      </div>
    )
  }

  // One session per tab: pass only this tab's record to WorkspaceView so it
  // mounts a single TerminalView. TabHost's display:none keeps hidden tabs'
  // xterm + WS alive, so tab switching doesn't re-mount or re-stream — the
  // launcher's old multi-slot-in-one-pane trick is moot at this layer.
  return (
    <div className="workspaces-root flex-1 min-h-0 flex flex-col p-3">
      <WorkspaceView
        wsId={wsId}
        sessionId={sessionId}
        activeRecord={activeRecord}
        sessions={activeRecord ? [activeRecord] : []}
        label={workspace.tag}
        keyMap={APP_KEY_MAP}
        onSpawnFresh={() => void ctx.spawn(wsId, {})}
        onResume={(id) => void ctx.resumeSession(wsId, id)}
        onSessionLost={() => {
          // 4404 from the WS upgrade — the session is gone server-side.
          // Refresh the list; the reconcile effect will close this tab.
          void ctx.refresh()
        }}
      />
    </div>
  )
}
