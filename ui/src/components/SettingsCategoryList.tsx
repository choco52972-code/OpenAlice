import { Link, useLocation } from 'react-router-dom'

interface CategoryItem {
  /** Display label */
  label: string
  /** Canonical route the link navigates to. Active on exact match. */
  to: string
  /** Extra prefixes that also count as "active" (sub-routes like /settings/uta/:id under Trading Accounts). */
  prefixes?: string[]
}

const CATEGORIES: CategoryItem[] = [
  { label: 'General', to: '/settings' },
  { label: 'AI Provider', to: '/settings/ai-provider' },
  { label: 'Trading Accounts', to: '/settings/trading', prefixes: ['/settings/uta'] },
  { label: 'Connectors', to: '/settings/connectors' },
  { label: 'Market Data', to: '/settings/market-data' },
  { label: 'News Sources', to: '/settings/news-collector' },
]

/**
 * Settings sidebar content — flat list of config categories.
 * Active on exact pathname match for `to`, plus any pathname under `prefixes` (used
 * for things like Trading Accounts → /settings/uta/:id sub-routes).
 *
 * Note: General's `to` is `/settings` and intentionally has no prefixes so it
 * doesn't light up when other settings sub-pages are active.
 */
export function SettingsCategoryList() {
  const location = useLocation()

  return (
    <div className="py-0.5">
      {CATEGORIES.map((item) => {
        const active =
          location.pathname === item.to ||
          (item.prefixes?.some((p) => location.pathname.startsWith(p + '/')) ?? false)
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`flex items-center gap-1 px-3 py-1 text-[13px] transition-colors ${
              active
                ? 'bg-bg-tertiary text-text'
                : 'text-text-muted hover:text-text hover:bg-bg-tertiary/50'
            }`}
          >
            <span className="truncate">{item.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
