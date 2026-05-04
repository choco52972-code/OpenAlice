import { Link, useLocation } from 'react-router-dom'

interface CategoryItem {
  label: string
  to: string
}

const CATEGORIES: CategoryItem[] = [
  { label: 'Connectors', to: '/dev/connectors' },
  { label: 'Tools', to: '/dev/tools' },
  { label: 'Sessions', to: '/dev/sessions' },
  { label: 'Snapshots', to: '/dev/snapshots' },
  { label: 'Logs', to: '/dev/logs' },
]

/**
 * Dev secondary sidebar — replaces the in-page tab bar with URL-routed
 * sub-pages. Each tab becomes its own /dev/:tab route so they can be
 * bookmarked and survive refresh.
 */
export function DevCategoryList() {
  const location = useLocation()

  return (
    <div className="py-1">
      {CATEGORIES.map((item) => {
        const active = location.pathname === item.to
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
