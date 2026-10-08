import {execFileSync} from 'node:child_process'
import {mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, it} from 'vitest'

import GuardianBrief from '../src/commands/guardian/brief.js'
import GuardianGate from '../src/commands/guardian/gate.js'
import {ScanJsonSchema} from '../src/core/reporters/json.js'
import {PROJECT_ROOT, runCommand, sh} from './repo.js'

const demo = (...args: string[]): string =>
  execFileSync(process.execPath, [join(PROJECT_ROOT, 'scripts', 'demo.mjs'), ...args], {encoding: 'utf8'})

describe('demo project (docs/demo-script.md)', () => {
  let dir: string | undefined
  afterEach(() => dir && rmSync(dir, {recursive: true, force: true}))

  it('fails the gate on the risky story, passes after the fix and writes the brief', async () => {
    dir = join(mkdtempSync(join(tmpdir(), 'guardian-demo-')), 'project')
    demo('setup', dir)
    expect(sh(dir, 'branch', '--show-current').trim()).toBe('feature/US-0001')

    const failed = await runCommand(GuardianGate, ['--story', 'US-0001', '--json'], dir)
    expect(failed.code).toBe(1)
    const bad = ScanJsonSchema.parse(JSON.parse(failed.stdout))
    // These numbers are quoted in docs/demo-script.md.
    expect(bad).toMatchObject({filesScanned: 4, riskScore: 52, counts: {error: 4, warning: 4, info: 0}})
    expect(bad.findings.map((f) => `${f.ruleId}:${f.file.split('/').at(-1)}:${f.line}`)).toEqual([
      'APEX004:AccountHealthService.cls:1',
      'APEX005:AccountHealthService.cls:2',
      'APEX001:AccountHealthService.cls:8',
      'APEX006:AccountHealthService.cls:8',
      'APEX002:AccountHealthService.cls:17',
      'APEX007:AccountHealthServiceTest.cls:4',
      'LWC001:accountHealth.js:8',
      'LWC002:accountHealth.js:9',
    ])

    demo('fix', dir)
    const passed = await runCommand(GuardianGate, ['--story', 'US-0001'], dir)
    expect(passed.code).toBe(0)
    expect(passed.stdout).toContain('Gate: PASSED')

    const brief = await runCommand(
      GuardianBrief,
      ['--story', 'US-0001', '--no-ai', '--test-results', '.guardian/test-results.json', '--json'],
      dir,
    )
    expect(brief.code).toBe(0)
    const markdown = readFileSync(JSON.parse(brief.stdout).path, 'utf8')
    expect(markdown).toContain('| Gate | **PASSED** |')
    expect(markdown).toContain('- Outcome: **Passed**')

    const audit = readFileSync(join(dir, '.guardian', 'audit.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    expect(audit.map((a) => a.result)).toEqual(['fail', 'pass'])
  })

  it('the fixed branch passes the gate as committed', async () => {
    dir = join(mkdtempSync(join(tmpdir(), 'guardian-demo-')), 'project')
    demo('setup', dir)
    sh(dir, 'checkout', '-q', 'feature/US-0001-fixed')
    expect((await runCommand(GuardianGate, [], dir)).code).toBe(0)
  })
})
