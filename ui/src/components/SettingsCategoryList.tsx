import { Link, useLocation } from 'react-router-dom'

interface CategoryItem {
  /** Display label */
  label: string
  /** Primary route the link navigates to */
  to: string
  /** Active when current pathname matches any of these prefixes (handles sub-routes like /uta/:id) */
  matches: string[]
}

const CATEGORIES: CategoryItem[] = [
  { label: 'General', to: '/settings', matches: ['/settings'] },
  { label: 'AI Provider', to: '/ai-provider', matches: ['/ai-provider'] },
  { label: 'Trading Accounts', to: '/trading', matches: ['/trading', '/uta'] },
  { label: 'Connectors', to: '/connectors', matches: ['/connectors'] },
  { label: 'Market Data', to: '/market-data', matches: ['/market-data'] },
  { label: 'News Sources', to: '/news-collector', matches: ['/news-collector'] },
]

/**
 * Settings secondary sidebar content — flat list of 5 config categories.
 * Each clicks through to the existing route for that category.
 */
export function SettingsCategoryList() {
  const location = useLocation()

  return (
    <div className="py-1">
      {CATEGORIES.map((item) => {
        const active = item.matches.some(
          (m) => location.pathname === m || location.pathname.startsWith(m + '/'),
        )
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`group relative flex items-center gap-1 px-3 py-1.5 text-sm transition-colors ${
              active ? 'bg-bg-tertiary/60 text-text' : 'text-text-muted hover:text-text hover:bg-bg-tertiary/30'
            }`}
          >
            {active && (
              <span
                className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full"
                style={{ background: '#58a6ff' }}
              />
            )}
            <span className="truncate">{item.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
