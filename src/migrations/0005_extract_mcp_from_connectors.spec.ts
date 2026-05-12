import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rm, unlink } from 'node:fs/promises'

import type { MigrationContext } from './types.js'
import { extractMcpFromConnectors } from './0005_extract_mcp_from_connectors/index.js'

/** Build a real MigrationContext backed by a real temp dir — mirrors
 *  `makeDefaultContext()` from runner.ts but parametrised on dir. */
function makeCtx(dir: string): MigrationContext {
  return {
    async readJson<T>(filename: string): Promise<T | undefined> {
      try {
        return JSON.parse(await readFile(resolve(dir, filename), 'utf-8'))
      } catch (err: unknown) {
        if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
        throw err
      }
    },
    async writeJson(filename: string, data: unknown): Promise<void> {
      await mkdir(dir, { recursive: true })
      await writeFile(resolve(dir, filename), JSON.stringify(data, null, 2) + '\n')
    },
    async removeJson(filename: string): Promise<void> {
      try { await unlink(resolve(dir, filename)) } catch (err) {
        if (err instanceof Error && (err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      }
    },
    configDir(): string { return dir },
  }
}

async function readMaybe(dir: string, filename: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(resolve(dir, filename), 'utf-8'))
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

describe('0005_extract_mcp_from_connectors', () => {
  let dir: string

  beforeEach(async () => {
    dir = join(tmpdir(), `migration-0005-${randomUUID()}`)
    await mkdir(dir, { recursive: true })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('lifts connectors.mcp into mcp.json and strips it from connectors.json', async () => {
    const before = {
      web: { port: 3002 },
      mcp: { port: 4242 },
      mcpAsk: { enabled: false },
      telegram: { enabled: false, chatIds: [] },
    }
    await writeFile(resolve(dir, 'connectors.json'), JSON.stringify(before, null, 2))

    const result = await extractMcpFromConnectors(makeCtx(dir))
    expect(result.moved).toBe(true)

    expect(await readMaybe(dir, 'mcp.json')).toEqual({ port: 4242 })
    expect(await readMaybe(dir, 'connectors.json')).toEqual({
      web: { port: 3002 },
      mcpAsk: { enabled: false },
      telegram: { enabled: false, chatIds: [] },
    })
  })

  it('is idempotent — second run with already-migrated state is a no-op', async () => {
    const before = { web: { port: 3002 }, mcp: { port: 4242 }, mcpAsk: { enabled: false } }
    await writeFile(resolve(dir, 'connectors.json'), JSON.stringify(before, null, 2))

    await extractMcpFromConnectors(makeCtx(dir))
    const mcpAfterFirst = JSON.stringify(await readMaybe(dir, 'mcp.json'))
    const connectorsAfterFirst = JSON.stringify(await readMaybe(dir, 'connectors.json'))

    const result = await extractMcpFromConnectors(makeCtx(dir))
    expect(result.moved).toBe(false)

    expect(JSON.stringify(await readMaybe(dir, 'mcp.json'))).toBe(mcpAfterFirst)
    expect(JSON.stringify(await readMaybe(dir, 'connectors.json'))).toBe(connectorsAfterFirst)
  })

  it('handles missing connectors.json as a no-op', async () => {
    const result = await extractMcpFromConnectors(makeCtx(dir))
    expect(result.moved).toBe(false)
    expect(await readMaybe(dir, 'mcp.json')).toBe(null)
    expect(await readMaybe(dir, 'connectors.json')).toBe(null)
  })

  it('preserves a pre-existing mcp.json without clobbering it', async () => {
    const userMcp = { port: 9999 }
    await writeFile(resolve(dir, 'mcp.json'), JSON.stringify(userMcp, null, 2))

    const connectorsBefore = { web: { port: 3002 }, mcp: { port: 4242 } }
    await writeFile(resolve(dir, 'connectors.json'), JSON.stringify(connectorsBefore, null, 2))

    const result = await extractMcpFromConnectors(makeCtx(dir))
    expect(result.moved).toBe(true)

    // user's mcp.json wins — we never overwrite it
    expect(await readMaybe(dir, 'mcp.json')).toEqual(userMcp)
    // mcp still stripped from connectors.json regardless
    expect(await readMaybe(dir, 'connectors.json')).toEqual({ web: { port: 3002 } })
  })

  it('applies default port when connectors.mcp has no port field', async () => {
    const before = { web: { port: 3002 }, mcp: {} }
    await writeFile(resolve(dir, 'connectors.json'), JSON.stringify(before, null, 2))

    await extractMcpFromConnectors(makeCtx(dir))
    expect(await readMaybe(dir, 'mcp.json')).toEqual({ port: 3001 })
  })
})
