/**
 * Per-workspace AI provider config modal.
 *
 * Workspaces are VS-Code-style "open folders" — each owns its CLI config
 * files (.claude/settings.local.json, .codex/config.toml + env.json). This
 * modal is the visual editor for those files. Files are the source of
 * truth; the modal reads + writes via the workspace API. Restart any open
 * sessions for changes to take effect (env is read at CLI startup).
 */

import { useEffect, useMemo, useState } from 'react'
import {
  getAgentConfig,
  listAgentProfiles,
  saveAgentConfig,
  type AgentConfig,
  type AgentConfigBundle,
  type AgentId,
  type AgentProfile,
} from './api'

interface Props {
  wsId: string
  onClose: () => void
}

const inputClass =
  'w-full bg-bg-secondary border border-border rounded-md px-3 py-2 text-[13px] text-text placeholder:text-text-muted/60 focus:outline-none focus:border-accent'

type Tab = 'claude' | 'codex'

interface FormState {
  baseUrl: string
  apiKey: string
  model: string
  wireApi: 'chat' | 'responses'
}

// codex-cli ≥ 0.130 dropped the legacy `wire_api = "chat"` shape; "responses"
// is now the only supported value (see github.com/openai/codex/discussions/7782).
// We still surface "chat" as a labelled-deprecated option so users on older
// codex builds aren't surprised, but the default is "responses".
const EMPTY_FORM: FormState = { baseUrl: '', apiKey: '', model: '', wireApi: 'responses' }

function configToForm(cfg: AgentConfig | null): FormState {
  if (!cfg) return EMPTY_FORM
  return {
    baseUrl: cfg.baseUrl ?? '',
    apiKey: cfg.apiKey ?? '',
    model: cfg.model ?? '',
    wireApi: (cfg.wireApi as 'chat' | 'responses') ?? 'responses',
  }
}

function formToConfig(form: FormState, agent: AgentId): AgentConfig {
  const cfg: AgentConfig = {
    baseUrl: form.baseUrl.trim() || null,
    apiKey: form.apiKey.trim() || null,
    model: form.model.trim() || null,
  }
  if (agent === 'codex') {
    return { ...cfg, wireApi: form.wireApi }
  }
  return cfg
}

export function WorkspaceAIConfigModal({ wsId, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('claude')
  const [profiles, setProfiles] = useState<AgentProfile[]>([])
  const [bundle, setBundle] = useState<AgentConfigBundle | null>(null)
  const [claudeForm, setClaudeForm] = useState<FormState>(EMPTY_FORM)
  const [codexForm, setCodexForm] = useState<FormState>(EMPTY_FORM)
  const [pickedProfile, setPickedProfile] = useState<string>('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    void Promise.all([listAgentProfiles(), getAgentConfig(wsId)])
      .then(([ps, b]) => {
        setProfiles(ps)
        setBundle(b)
        setClaudeForm(configToForm(b.claude))
        setCodexForm(configToForm(b.codex))
      })
      .catch((err: Error) => setError(err.message))
  }, [wsId])

  const form = tab === 'claude' ? claudeForm : codexForm
  const setForm = tab === 'claude' ? setClaudeForm : setCodexForm
  const dirty = useMemo(() => {
    if (!bundle) return false
    const saved = tab === 'claude' ? bundle.claude : bundle.codex
    const savedForm = configToForm(saved)
    return (
      savedForm.baseUrl !== form.baseUrl ||
      savedForm.apiKey !== form.apiKey ||
      savedForm.model !== form.model ||
      (tab === 'codex' && savedForm.wireApi !== form.wireApi)
    )
  }, [bundle, form, tab])

  const applyProfile = () => {
    const p = profiles.find((x) => x.name === pickedProfile)
    if (!p) return
    setForm({
      ...form,
      baseUrl: p.baseUrl ?? '',
      apiKey: p.apiKey ?? '',
      model: p.model ?? '',
    })
  }

  const handleSave = async () => {
    setError(null)
    setSaving(true)
    try {
      await saveAgentConfig(wsId, tab, formToConfig(form, tab))
      const fresh = await getAgentConfig(wsId)
      setBundle(fresh)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1800)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setError(null)
    setSaving(true)
    try {
      await saveAgentConfig(wsId, tab, { baseUrl: null, apiKey: null, model: null })
      const fresh = await getAgentConfig(wsId)
      setBundle(fresh)
      if (tab === 'claude') setClaudeForm(EMPTY_FORM)
      else setCodexForm(EMPTY_FORM)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1800)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-bg border border-border rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-[15px] font-semibold text-text">Workspace AI Provider</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border bg-bg-secondary/50">
          {(['claude', 'codex'] as const).map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 px-4 py-2.5 text-[13px] font-medium transition-colors ${
                tab === id
                  ? 'text-accent border-b-2 border-accent -mb-px'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              {id === 'claude' ? 'Claude Code' : 'Codex'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Quick pick */}
          <div className="rounded-lg border border-border bg-bg-secondary/30 p-3">
            <label className="block text-xs font-medium text-text-muted mb-2">
              Apply from OpenAlice profile
            </label>
            <div className="flex gap-2">
              <select
                value={pickedProfile}
                onChange={(e) => setPickedProfile(e.target.value)}
                className={inputClass + ' flex-1'}
              >
                <option value="">— select a profile —</option>
                {profiles.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                onClick={applyProfile}
                disabled={!pickedProfile}
                className="px-3 py-2 rounded-md bg-accent text-bg text-[13px] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors"
              >
                Apply
              </button>
            </div>
          </div>

          {/* Manual fields */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Base URL</label>
            <input
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder={tab === 'claude' ? 'https://api.anthropic.com (default)' : 'https://api.openai.com/v1 (default)'}
              className={inputClass}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">API Key</label>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder="sk-..."
                className={inputClass + ' flex-1'}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="px-3 rounded-md border border-border text-text-muted hover:text-text text-[12px]"
                type="button"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Model</label>
            <input
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder={tab === 'claude' ? 'claude-sonnet-4-6' : 'gpt-4o'}
              className={inputClass}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>

          {tab === 'codex' && (
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">
                Wire Format
              </label>
              <select
                value={form.wireApi}
                onChange={(e) => setForm({ ...form, wireApi: e.target.value as 'chat' | 'responses' })}
                className={inputClass}
              >
                <option value="responses">responses (OpenAI Responses API — required by codex ≥ 0.130)</option>
                <option value="chat">chat (legacy, OpenAI Chat Completions — removed in codex 0.130+)</option>
              </select>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red/40 bg-red/10 text-red text-[12px] px-3 py-2">
              {error}
            </div>
          )}
          {savedFlash && (
            <div className="rounded-md border border-green/40 bg-green/10 text-green text-[12px] px-3 py-2">
              Saved. Pause + resume any open session to reload.
            </div>
          )}

          <p className="text-[11px] text-text-muted/80 leading-snug pt-1">
            Empty fields fall back to the CLI's global default. Changes apply to
            <strong className="text-text"> new sessions</strong>; pause and resume
            any open session to re-load.
            {tab === 'claude' && ' Claude reads `.claude/settings.local.json` from the workspace cwd.'}
            {tab === 'codex' && ' Codex reads `.codex/config.toml` + `.codex/env.json` (via CODEX_HOME).'}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 p-3 border-t border-border bg-bg-secondary/30">
          <button
            onClick={handleReset}
            disabled={saving}
            className="px-3 py-2 rounded-md border border-border text-text-muted hover:text-text text-[12px] disabled:opacity-40"
          >
            Reset to global default
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-3 py-2 rounded-md text-text-muted hover:text-text text-[13px]"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="px-4 py-2 rounded-md bg-accent text-bg text-[13px] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
