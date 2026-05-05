import { useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ActivityBar } from './components/ActivityBar'
import { Sidebar } from './components/Sidebar'
import { ChannelConfigModal } from './components/ChannelConfigModal'
import { ChannelsProvider, useChannels } from './contexts/ChannelsContext'
import { SECTIONS, STANDALONE_ROUTES, REDIRECT_ROUTES, findActiveSection } from './sections'

/**
 * Activity-bar pages — only items that appear as icons in the ActivityBar.
 * Settings sub-pages (AI Provider, Trading Accounts, etc.) live under
 * /settings/* and are addressed via SettingsCategoryList, not via this enum.
 */
export type Page =
  | 'chat' | 'diary' | 'portfolio' | 'news' | 'automation' | 'market'
  | 'trading-as-git'
  | 'settings' | 'dev'

/** Page type → URL path mapping. Used by the activity bar to know where each icon links. */
export const ROUTES: Record<Page, string> = {
  'chat': '/',
  'diary': '/diary',
  'portfolio': '/portfolio',
  'automation': '/automation',
  'market': '/market',
  'news': '/news',
  'trading-as-git': '/trading-as-git',
  'settings': '/settings',
  'dev': '/dev',
}

export function App() {
  return (
    <ChannelsProvider>
      <AppShell />
    </ChannelsProvider>
  )
}

function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const section = findActiveSection(location.pathname)

  return (
    <div className="flex h-full">
      <ActivityBar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {section && (
        <Sidebar
          title={section.title}
          actions={section.Actions ? <section.Actions /> : undefined}
        >
          <section.Secondary />
        </Sidebar>
      )}

      <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-bg">
        {/* Mobile header — visible only below md */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-bg-secondary shrink-0 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-text-muted hover:text-text p-1 -ml-1"
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 5h14M3 10h14M3 15h14" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-text">OpenAlice</span>
        </div>

        <div key={location.pathname} className="page-fade-in flex-1 flex flex-col min-h-0">
          <Routes>
            {SECTIONS.flatMap((s) => s.routes).map((r) => (
              <Route key={r.path} path={r.path} element={r.element} />
            ))}
            {STANDALONE_ROUTES.map((r) => (
              <Route key={r.path} path={r.path} element={r.element} />
            ))}
            {REDIRECT_ROUTES.map((r) => (
              <Route key={r.path} path={r.path} element={r.element} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>

      <ChannelDialogMount />
    </div>
  )
}

/** Reads dialog state from ChannelsContext and mounts the modal accordingly. */
function ChannelDialogMount() {
  const { channelDialog, closeDialog, onChannelSaved } = useChannels()
  if (!channelDialog) return null
  return (
    <ChannelConfigModal
      channel={channelDialog.mode === 'edit' ? channelDialog.channel : undefined}
      onClose={closeDialog}
      onSaved={onChannelSaved}
    />
  )
}
