/**
 * Landing page for the Workspaces activity. Sidebar carries the actual
 * list + create form; this is just the "no workspace pinned" prompt.
 */

export function WorkspaceListPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-text-muted">
      <h2 className="text-lg font-medium text-text mb-2">Workspaces</h2>
      <p className="text-sm max-w-md text-center">
        Pick a workspace from the sidebar, or create one with the form above. Each
        workspace is an isolated git directory with a persistent terminal session
        attached — Claude Code, Codex, or a plain shell, all wired to OpenAlice over MCP.
      </p>
    </div>
  )
}
