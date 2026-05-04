import type { ReactNode } from 'react'

interface SecondarySidebarProps {
  /** Header title — uppercase tracking like VS Code's "EXPLORER", "SEARCH", etc. */
  title: string
  /** Optional action buttons rendered right-aligned in the header (e.g. "+ new"). */
  actions?: ReactNode
  /** Scrollable body content. */
  children: ReactNode
}

/**
 * VS Code-style secondary sidebar — sits between the activity bar and the
 * main panel. Page-specific content (channel list, workspace tree, search
 * results, etc.) lives here. Desktop only — hidden on mobile.
 */
export function SecondarySidebar({ title, actions, children }: SecondarySidebarProps) {
  return (
    <aside className="hidden md:flex w-[240px] h-full flex-col bg-bg-secondary border-r border-border shrink-0">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <h2 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
          {title}
        </h2>
        {actions && <div className="flex items-center gap-0.5">{actions}</div>}
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </aside>
  )
}
