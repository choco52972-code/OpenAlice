/**
 * Section config — declarative description of every section that has a
 * secondary sidebar (navigator), plus standalone routes that don't.
 *
 * Adding a new section here adds it to the layout in one place; App.tsx
 * doesn't need to grow if-then chains.
 */

import { Navigate, useParams } from 'react-router-dom'
import type { ComponentType, ReactElement } from 'react'

import { ChatPage } from './pages/ChatPage'
import { DiaryPage } from './pages/DiaryPage'
import { PortfolioPage } from './pages/PortfolioPage'
import { AutomationPage } from './pages/AutomationPage'
import { SettingsPage } from './pages/SettingsPage'
import { AIProviderPage } from './pages/AIProviderPage'
import { MarketDataPage } from './pages/MarketDataPage'
import { MarketPage } from './pages/MarketPage'
import { MarketDetailPage } from './pages/MarketDetailPage'
import { NewsPage } from './pages/NewsPage'
import { NewsCollectorPage } from './pages/NewsCollectorPage'
import { TradingPage } from './pages/TradingPage'
import { TradingAsGitPage } from './pages/TradingAsGitPage'
import { UTADetailPage } from './pages/UTADetailPage'
import { ConnectorsPage } from './pages/ConnectorsPage'
import { DevPage } from './pages/DevPage'

import { ChatChannelListContainer } from './components/ChatChannelListContainer'
import { NewChannelButton } from './components/NewChannelButton'
import { PushApprovalPanel } from './components/PushApprovalPanel'
import { SettingsCategoryList } from './components/SettingsCategoryList'
import { DevCategoryList } from './components/DevCategoryList'

export interface RouteSpec {
  path: string
  element: ReactElement
}

export interface AppSection {
  /** URL prefixes that activate this section. '/' matches exact-only; others match prefix. */
  paths: string[]
  /** Header text in the secondary sidebar. */
  title: string
  /** Navigator UI rendered inside the secondary sidebar body. */
  Secondary: ComponentType
  /** Optional right-aligned action buttons in the secondary sidebar header. */
  Actions?: ComponentType
  /** Routes contributed by this section — rendered at app level by <Routes>. */
  routes: RouteSpec[]
}

export const SECTIONS: AppSection[] = [
  {
    paths: ['/'],
    title: 'Chat',
    Secondary: ChatChannelListContainer,
    Actions: NewChannelButton,
    routes: [
      { path: '/', element: <ChatPage /> },
    ],
  },
  {
    paths: ['/trading-as-git'],
    title: 'Trading as Git',
    Secondary: PushApprovalPanel,
    routes: [
      { path: '/trading-as-git', element: <TradingAsGitPage /> },
    ],
  },
  {
    paths: ['/settings'],
    title: 'Settings',
    Secondary: SettingsCategoryList,
    routes: [
      { path: '/settings', element: <SettingsPage /> },
      { path: '/settings/ai-provider', element: <AIProviderPage /> },
      { path: '/settings/trading', element: <TradingPage /> },
      { path: '/settings/uta/:id', element: <UTADetailPage /> },
      { path: '/settings/connectors', element: <ConnectorsPage /> },
      { path: '/settings/market-data', element: <MarketDataPage /> },
      { path: '/settings/news-collector', element: <NewsCollectorPage /> },
    ],
  },
  {
    paths: ['/dev'],
    title: 'Dev',
    Secondary: DevCategoryList,
    routes: [
      { path: '/dev', element: <Navigate to="/dev/connectors" replace /> },
      { path: '/dev/:tab', element: <DevPage /> },
    ],
  },
]

/**
 * Top-level routes that don't (yet) have a secondary-sidebar navigator.
 * Will become full sections when their navigator is designed.
 */
export const STANDALONE_ROUTES: RouteSpec[] = [
  { path: '/diary', element: <DiaryPage /> },
  { path: '/portfolio', element: <PortfolioPage /> },
  { path: '/automation', element: <AutomationPage /> },
  { path: '/market', element: <MarketPage /> },
  { path: '/market/:assetClass/:symbol', element: <MarketDetailPage /> },
  { path: '/news', element: <NewsPage /> },
]

/** Redirect /uta/:id → /settings/uta/:id while preserving the param. */
function RedirectUta() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/settings/uta/${id ?? ''}`} replace />
}

/** Old URLs preserved as redirects to their current locations. */
export const REDIRECT_ROUTES: RouteSpec[] = [
  // Logs / events / agent-status — moved into Dev
  { path: '/logs', element: <Navigate to="/dev/logs" replace /> },
  { path: '/events', element: <Navigate to="/dev/logs" replace /> },
  { path: '/agent-status', element: <Navigate to="/dev/logs" replace /> },
  // Heartbeat / scheduler — folded into Automation
  { path: '/heartbeat', element: <Navigate to="/automation" replace /> },
  { path: '/scheduler', element: <Navigate to="/automation" replace /> },
  // Settings sub-pages — old flat paths now nested under /settings
  { path: '/ai-provider', element: <Navigate to="/settings/ai-provider" replace /> },
  { path: '/trading', element: <Navigate to="/settings/trading" replace /> },
  { path: '/uta/:id', element: <RedirectUta /> },
  { path: '/connectors', element: <Navigate to="/settings/connectors" replace /> },
  { path: '/market-data', element: <Navigate to="/settings/market-data" replace /> },
  { path: '/news-collector', element: <Navigate to="/settings/news-collector" replace /> },
  { path: '/data-sources', element: <Navigate to="/settings/market-data" replace /> },
  // Tools — was an old activity, now folded into Settings
  { path: '/tools', element: <Navigate to="/settings" replace /> },
]

/**
 * Find which section (if any) is active for the given pathname.
 * Returns undefined for routes that don't belong to any section
 * (e.g. STANDALONE_ROUTES — no secondary sidebar to render).
 */
export function findActiveSection(pathname: string): AppSection | undefined {
  return SECTIONS.find((s) =>
    s.paths.some((p) => {
      if (p === '/') return pathname === '/'
      return pathname === p || pathname.startsWith(p + '/')
    }),
  )
}
