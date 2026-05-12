import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { pruneInternalCronJobs } from './0004_prune_internal_cron_jobs/index.js'

function tempPath(ext: string): string {
  return join(tmpdir(), `migration-0004-${randomUUID()}.${ext}`)
}

interface JobsFile {
  jobs: Array<{
    id: string
    name: string
    enabled: boolean
    schedule: { kind: 'every'; every: string }
    payload: string
    state: { nextRunAtMs: number | null; lastRunAtMs: number | null; lastStatus: string | null; consecutiveErrors: number }
    createdAt: number
  }>
}

function makeJob(name: string): JobsFile['jobs'][number] {
  return {
    id: randomUUID().slice(0, 8),
    name,
    enabled: true,
    schedule: { kind: 'every', every: '15m' },
    payload: '',
    state: { nextRunAtMs: null, lastRunAtMs: null, lastStatus: null, consecutiveErrors: 0 },
    createdAt: Date.now(),
  }
}

async function writeJobs(path: string, data: JobsFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(data, null, 2))
}

async function readJobs(path: string): Promise<JobsFile> {
  return JSON.parse(await readFile(path, 'utf-8')) as JobsFile
}

describe('0004_prune_internal_cron_jobs', () => {
  let jobsPath: string

  beforeEach(() => {
    jobsPath = tempPath('json')
  })

  afterEach(async () => {
    await rm(jobsPath, { force: true })
  })

  it('removes __snapshot__ and __heartbeat__ entries', async () => {
    await writeJobs(jobsPath, {
      jobs: [makeJob('__snapshot__'), makeJob('__heartbeat__'), makeJob('my-job')],
    })

    const result = await pruneInternalCronJobs(jobsPath)

    expect(result.removed.sort()).toEqual(['__heartbeat__', '__snapshot__'])
    const after = await readJobs(jobsPath)
    expect(after.jobs.map((j) => j.name)).toEqual(['my-job'])
  })

  it('preserves user-named entries when no orphans are present', async () => {
    await writeJobs(jobsPath, {
      jobs: [makeJob('morning-briefing'), makeJob('eod-check')],
    })

    const result = await pruneInternalCronJobs(jobsPath)

    expect(result.removed).toEqual([])
    const after = await readJobs(jobsPath)
    expect(after.jobs.map((j) => j.name).sort()).toEqual(['eod-check', 'morning-briefing'])
  })

  it('no-op when file does not exist', async () => {
    const result = await pruneInternalCronJobs(jobsPath)
    expect(result.removed).toEqual([])
  })

  it('idempotent — second run is a no-op on a freshly-pruned file', async () => {
    await writeJobs(jobsPath, {
      jobs: [makeJob('__snapshot__'), makeJob('my-job')],
    })

    await pruneInternalCronJobs(jobsPath)
    const afterFirst = await readFile(jobsPath, 'utf-8')

    const result = await pruneInternalCronJobs(jobsPath)
    const afterSecond = await readFile(jobsPath, 'utf-8')

    expect(result.removed).toEqual([])
    expect(afterSecond).toBe(afterFirst)
  })
})
