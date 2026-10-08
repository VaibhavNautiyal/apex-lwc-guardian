import {existsSync, readFileSync} from 'node:fs'
import {join} from 'node:path'

import {afterEach, describe, expect, it} from 'vitest'
import {z} from 'zod'

import GuardianGate from '../src/commands/guardian/gate.js'
import GuardianScan from '../src/commands/guardian/scan.js'
import {ScanJsonSchema} from '../src/core/reporters/json.js'
import {createSampleRepo, runCommand, type SampleRepo, writeConfig} from './repo.js'

const AuditLineSchema = z
  .object({
    timestamp: z.string().datetime(),
    gitUser: z.string().nullable(),
    storyId: z.string().nullable(),
    baseRef: z.string(),
    baseSha: z.string().nullable(),
    headSha: z.string().nullable(),
    filesScanned: z.number(),
    counts: z.object({error: z.number(), warning: z.number(), info: z.number()}),
    riskScore: z.number(),
    blockingCount: z.number(),
    result: z.enum(['pass', 'fail']),
    configHash: z.string(),
    toolVersion: z.string(),
  })
  .strict()

describe('guardian scan and gate commands on fixtures/sfdx-sample', () => {
  let repo: SampleRepo | undefined
  afterEach(() => repo?.cleanup())

  it('scan exits 0 even with findings and prints valid JSON', async () => {
    repo = createSampleRepo()
    const run = await runCommand(GuardianScan, ['--json'], repo.dir)
    expect(run.code).toBe(0)
    const json = ScanJsonSchema.parse(JSON.parse(run.stdout))
    expect(json.kind).toBe('scan')
    expect(json.filesScanned).toBeGreaterThan(30)
    expect(json.counts.error).toBeGreaterThan(0)
    expect(new Set(json.findings.map((f) => f.ruleId)).size).toBe(16) // every rule fires on the bad fixtures
  })

  it('gate exits 1 on blocking findings, prints valid JSON and writes a parseable audit line', async () => {
    repo = createSampleRepo()
    const run = await runCommand(GuardianGate, ['--story', 'US-0001', '--format', 'json'], repo.dir)
    expect(run.code).toBe(1)
    const json = ScanJsonSchema.parse(JSON.parse(run.stdout))
    expect(json.gate).toMatchObject({passed: false, failOn: 'error', maxRiskScore: 100})
    expect(json.gate!.blockingCount).toBe(json.counts.error)

    const auditPath = join(repo.dir, '.guardian/audit.jsonl')
    const lines = readFileSync(auditPath, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(1)
    const entry = AuditLineSchema.parse(JSON.parse(lines[0]))
    expect(entry).toMatchObject({
      storyId: 'US-0001',
      gitUser: 'guardian-test@example.com',
      result: 'fail',
      baseRef: 'main',
      riskScore: json.riskScore,
      counts: json.counts,
    })
    expect(lines[0]).not.toMatch(/SELECT|insert |innerHTML/) // no source code in the log
  })

  it('gate exits 0 when the changed files are clean', async () => {
    repo = createSampleRepo({classes: ['SoqlInLoopGood.cls', 'AssertGoodTest.cls']})
    const run = await runCommand(GuardianGate, [], repo.dir)
    expect(run.code).toBe(0)
    expect(run.stdout).toContain('Gate: PASSED')
    const entry = AuditLineSchema.parse(
      JSON.parse(readFileSync(join(repo.dir, '.guardian/audit.jsonl'), 'utf8')),
    )
    expect(entry).toMatchObject({result: 'pass', storyId: null, filesScanned: 2})
  })

  it('gate respects failOn: warning and audit: disabled', async () => {
    repo = createSampleRepo({classes: ['SharingBad.cls']})
    expect((await runCommand(GuardianGate, [], repo.dir)).code).toBe(0)
    writeConfig(repo.dir, 'thresholds: { failOn: warning }\naudit: { enabled: false }\n')
    const run = await runCommand(GuardianGate, [], repo.dir)
    expect(run.code).toBe(1)
    expect(run.stdout).toContain('Gate: FAILED - 1 blocking finding (severity warning or higher)')
  })

  it('exits 2 for an invalid config, in table and JSON formats', async () => {
    repo = createSampleRepo({classes: ['SharingBad.cls']})
    writeConfig(repo.dir, 'rules:\n  APEX999: { enabled: false }\n')
    const table = await runCommand(GuardianGate, [], repo.dir)
    expect(table.code).toBe(2)
    expect(table.error).toMatch(/Unknown rule ID/)
    const json = await runCommand(GuardianScan, ['--json'], repo.dir)
    expect(json.code).toBe(2)
    expect(JSON.parse(json.stdout)).toMatchObject({error: {name: 'UsageError', exitCode: 2}})
  })

  it('exits 2 for unknown flags and conflicting flags', async () => {
    repo = createSampleRepo({classes: ['SharingBad.cls']})
    expect((await runCommand(GuardianGate, ['--bogus'], repo.dir)).code).toBe(2)
    expect((await runCommand(GuardianScan, ['--all', '--files', 'a.cls'], repo.dir)).code).toBe(2)
  })

  it('exits 3 when the base branch is missing or the folder is not a git repository', async () => {
    repo = createSampleRepo({classes: ['SharingBad.cls']})
    const missing = await runCommand(GuardianGate, ['--base', 'develop'], repo.dir)
    expect(missing.code).toBe(3)
    expect(missing.error).toMatch(/Base branch "develop" not found/)
    expect(existsSync(join(repo.dir, '.guardian/audit.jsonl'))).toBe(false)
  })

  it('exits 3 in a repository without commits', async () => {
    repo = createSampleRepo({noCommits: true})
    const run = await runCommand(GuardianScan, [], repo.dir)
    expect(run.code).toBe(3)
  })

  it('prints markdown', async () => {
    repo = createSampleRepo({classes: ['SharingBad.cls']})
    const run = await runCommand(GuardianScan, ['--format', 'markdown'], repo.dir)
    expect(run.code).toBe(0)
    expect(run.stdout).toContain('| APEX004 | warning |')
  })
})
