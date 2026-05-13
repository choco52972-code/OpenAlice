/**
 * "Workspace chat" section embedded inside the Chat activity sidebar.
 *
 * A curated view of chat-template workspaces — the recommended path for
 * interactive chats because the underlying CLI (claude / codex / ...)
 * brings its own prompt cache + native frontend. See README "Two kinds
 * of chat".
 *
 * Wraps the same `WorkspaceRow` component used in the Workspaces
 * activity, so behavior (spawn / pause / resume / config / delete /
 * navigation) stays identical. The difference is just the lens: this
 * section filters to template === 'chat' and provides its own create
 * form with template locked to chat.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import { useWorkspaces, type SpawnOpts } from '../../contexts/WorkspacesContext'
import { useWorkspace } from '../../tabs/store'
import { getFocusedTab } from '../../tabs/types'
import { createWorkspace, deleteWorkspace } from './api'
import { WorkspaceRow } from './Sidebar'

const CHAT_TEMPLATE = 'chat'
const TAG_HINT = 'a-z, 0-9, "-", "_", up to 33 chars'
const TAG_RE = /^[a-z0-9][a-z0-9_-]{0,32}$/

export function ChatWorkspaceSection() {
  const ctx = useWorkspaces()
  const focused = useWorkspace((s) => getFocusedTab(s)?.spec)
  const openOrFocus = useWorkspace((s) => s.openOrFocus)

  // Filter workspaces to chat template only (this section is the chat
  // lens; non-chat workspaces stay visible in the Workspaces activity).
  const chatWorkspaces = useMemo(
    () => ctx.workspaces.filter((w) => w.template === CHAT_TEMPLATE),
    [ctx.workspaces],
  )

  // Selection state mirrors the workspaces sidebar — driven entirely by
  // which tab is focused, so switching tabs naturally moves the highlight.
  const isWsFocus = focused?.kind === 'workspace'
  const selection = isWsFocus
    ? {
        wsId: focused.params.wsId,
        sessionId: focused.params.sessionId ?? null,
      }
    : null

  const chatTemplate = ctx.templates.find((t) => t.name === CHAT_TEMPLATE)

  // Create-form state. Template is locked to chat — we only collect tag
  // + agent picks. Agent defaults come from the chat template's
  // `defaultAgents`; user can toggle individual agents off/on.
  const [creating, setCreating] = useState(false)
  const [tag, setTag] = useState('')
  const [pickedAgents, setPickedAgents] = useState<Set<string> | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const checkedAgents: ReadonlySet<string> = useMemo(() => {
    if (pickedAgents) return pickedAgents
    return new Set(chatTemplate?.defaultAgents ?? ['claude'])
  }, [pickedAgents, chatTemplate])

  const toggleAgent = (id: string): void => {
    setPickedAgents((prev) => {
      const base = prev ?? new Set(chatTemplate?.defaultAgents ?? ['claude'])
      const next = new Set(base)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const submit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    const t = tag.trim()
    if (!TAG_RE.test(t)) {
      setCreateError(`invalid tag (${TAG_HINT})`)
      return
    }
    if (checkedAgents.size === 0) {
      setCreateError('pick at least one agent')
      return
    }
    setCreating(true)
    setCreateError(null)
    const result = await createWorkspace(t, CHAT_TEMPLATE, Array.from(checkedAgents))
    setCreating(false)
    if (result.ok) {
      setTag('')
      setPickedAgents(null)
      ctx.refresh()
      openOrFocus({ kind: 'workspace', params: { wsId: result.workspace.id } })
    } else {
      const msg = result.error.message ?? result.error.error ?? `HTTP ${result.status}`
      setCreateError(msg)
    }
  }

  // Auto-focus tag input when template becomes available (e.g. first
  // render after templates fetch). Avoids the user having to click the
  // input on a fresh activity switch.
  useEffect(() => {
    // no-op effect placeholder — kept so future "focus on activity switch"
    // logic has a hook to attach to. We intentionally don't auto-focus on
    // every mount because that would steal focus from the channels list.
  }, [chatTemplate])

  const onDelete = async (id: string): Promise<void> => {
    if (!window.confirm('Delete workspace? (registry only — files on disk are kept.)')) return
    const ok = await deleteWorkspace(id)
    if (ok) ctx.refresh()
  }

  // No chat template registered? Render nothing — the section is dead
  // anyway, and the user can still use the Channels list below.
  if (!chatTemplate) return null

  return (
    <aside className="sidebar workspaces-root">
      <form className="sidebar-create" onSubmit={submit}>
        <input
          ref={inputRef}
          type="text"
          placeholder="tag (e.g. may1)"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          disabled={creating}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
        <button type="submit" disabled={creating || tag.length === 0}>
          {creating ? '…' : 'create'}
        </button>
        {ctx.agents.length > 0 && (
          <div className="sidebar-create-agents">
            {ctx.agents.map((a) => (
              <label key={a.id} className="sidebar-agent-toggle" title={a.displayName}>
                <input
                  type="checkbox"
                  checked={checkedAgents.has(a.id)}
                  onChange={() => toggleAgent(a.id)}
                  disabled={creating}
                />
                <span>{a.id}</span>
              </label>
            ))}
          </div>
        )}
      </form>
      {createError && <div className="sidebar-error">{createError}</div>}

      <ul className="sidebar-list">
        {chatWorkspaces.length === 0 && !ctx.listError && (
          <li className="sidebar-empty">no chat workspaces yet</li>
        )}
        {ctx.listError && <li className="sidebar-error">{ctx.listError}</li>}
        {chatWorkspaces.map((w) => (
          <WorkspaceRow
            key={w.id}
            workspace={w}
            agents={ctx.agents}
            selection={selection}
            onSelectWorkspace={(wsId) => {
              if (wsId.length === 0) return
              openOrFocus({ kind: 'workspace', params: { wsId } })
            }}
            onSelectSession={(wsId, sessionId) =>
              openOrFocus({ kind: 'workspace', params: { wsId, sessionId } })
            }
            onSpawn={(wsId, opts?: SpawnOpts) => void ctx.spawn(wsId, opts)}
            onPauseSession={(wsId, id) => void ctx.pauseSession(wsId, id)}
            onResumeSession={(wsId, id) => void ctx.resumeSession(wsId, id)}
            onDeleteSession={(wsId, id) => void ctx.deleteSession(wsId, id)}
            onDelete={onDelete}
            onConfigureWorkspace={(wsId) => ctx.openAgentConfig(wsId)}
          />
        ))}
      </ul>
    </aside>
  )
}
