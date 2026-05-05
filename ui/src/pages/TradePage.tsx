import { PageHeader } from '../components/PageHeader'

/**
 * Main panel for the Trading activity.
 *
 * The actual approval / commit / reject controls live in the activity's
 * left Sidebar (PushApprovalPanel). This main panel is a placeholder for
 * richer trading views to come — pending operations detail, trade history,
 * order entry, etc.
 */
export function TradePage() {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <PageHeader title="Trading" />
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <p className="text-sm max-w-md text-center px-6">
          Pending operations and approval history are listed in the sidebar on the left.
          Order entry and trading detail views will live here.
        </p>
      </div>
    </div>
  )
}
