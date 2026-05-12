/**
 * 0005_extract_mcp_from_connectors — move the MCP server config out of
 * `data/config/connectors.json`'s `mcp` field into its own top-level
 * `data/config/mcp.json`.
 *
 * Rationale: `connectors.mcp` was semantically mis-categorised. The MCP
 * server exports OpenAlice's ToolCenter to external clients (Claude
 * Desktop, codex inside workspaces, etc.) — that's an outbound /
 * export direction. `connectors:` semantically covers chat-input
 * surfaces (web UI's chat, telegram, and `mcpAsk` which is the
 * chat-shaped MCP-as-input flavour). After this migration:
 *
 *   - `data/config/mcp.json`         : `{ port: number }`
 *   - `data/config/connectors.json`  : same shape minus the `mcp` field
 *
 * `mcpAsk` continues to live under connectors.
 *
 * Idempotent: re-running after the move is a no-op. If both files
 * already exist in the post-migration shape, the function returns
 * without writing.
 */

import type { Migration, MigrationContext } from '../types.js'

const DEFAULT_PORT = 3001

interface ConnectorsBefore {
  readonly mcp?: { readonly port?: number }
  readonly [k: string]: unknown
}

interface McpAfter {
  readonly port: number
}

export async function extractMcpFromConnectors(
  ctx: MigrationContext,
): Promise<{ moved: boolean }> {
  const connectors = await ctx.readJson<ConnectorsBefore>('connectors.json')

  // Fresh install or already migrated — connectors.json has no `mcp` key.
  if (!connectors || typeof connectors.mcp === 'undefined') {
    return { moved: false }
  }

  // Lift `port` (or apply the canonical default) into mcp.json. Don't
  // clobber an existing mcp.json — if the user already hand-created one,
  // their value wins; we just strip the stale entry from connectors.json.
  const existingMcp = await ctx.readJson<McpAfter>('mcp.json')
  if (!existingMcp) {
    const port = typeof connectors.mcp.port === 'number' ? connectors.mcp.port : DEFAULT_PORT
    await ctx.writeJson('mcp.json', { port })
  }

  const { mcp: _stripped, ...rest } = connectors
  await ctx.writeJson('connectors.json', rest)

  console.log('[migration 0005] extracted connectors.mcp → mcp.json')
  return { moved: true }
}

export const migration: Migration = {
  id: '0005_extract_mcp_from_connectors',
  appVersion: '0.10.0-beta.3',
  introducedAt: '2026-05-12',
  affects: ['connectors.json', 'mcp.json'],
  summary:
    'Move connectors.mcp → top-level mcp.json (MCP server is a ToolCenter export, not a chat-input connector)',
  rationale:
    'Connectors covers IM/chat input surfaces (web, telegram, mcpAsk). MCP server exports ToolCenter outward and belongs at top-level config.',
  up: async (ctx) => {
    await extractMcpFromConnectors(ctx)
  },
}
