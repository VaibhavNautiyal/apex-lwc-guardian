import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {afterEach, describe, expect, it, vi} from 'vitest'

import {buildReleasePrompt, cleanSummary} from '../src/brief/ai.js'
import {generateBrief, safeFileName} from '../src/brief/index.js'
import {parseTestResults} from '../src/brief/test-results.js'
import GuardianBrief from '../src/commands/guardian/brief.js'
import type {CopadoClient} from '../src/copado/client.js'
import {UsageError} from '../src/core/errors.js'
import {lines} from '../src/core/git.js'
import {createSampleRepo, runCommand, type SampleRepo, sh} from './repo.js'

const SECTIONS = [
  '## Summary',
  '## Changed components',
  '## Risk findings',
  '## Test status',
  '## Rollback plan',
  '## Gate result',
]

const SF_TEST_RESULTS = {
  status: 100,
  result: {
    summary: {
      outcome: 'Failed',
      testsRan: 3,
      passing: 2,
      failing: 1,
      skipped: 0,
      orgWideCoverage: '81%',
      testRunCoverage: '90%',
    },
    tests: [
      {FullName: 'AssertGoodTest.classicAssert', Outcome: 'Pass', MethodName: 'classicAssert'},
      {FullName: 'AssertGoodTest.assertClass', Outcome: 'Pass', MethodName: 'assertClass'},
      {
        ApexClass: {Name: 'AssertGoodTest'},
        MethodName: 'usesHelper',
        Outcome: 'Fail',
        Message: 'System.AssertException: Expected: Acme, Actual: | Other',
      },
    ],
  },
}

function mockClient(summary: string | null, attached = true): CopadoClient & {prompts: string[]} {
  const prompts: string[] = []
  return {
    prompts,
    askReleaseAgent: vi.fn(async (prompt: string) => {
      prompts.push(prompt)
      return summary
    }),
    attachBriefToStory: vi.fn(async () => attached),
  }
}

describe('release brief', () => {
  let repo: SampleRepo | undefined
  afterEach(() => repo?.cleanup())
  const now = new Date('2026-10-08T10:00:00Z')

  it('uses the AI summary and keeps every other section deterministic', async () => {
    repo = createSampleRepo()
    const client = mockClient('This story adds risky Apex. Fix the SOQL in loops before promoting.')
    const brief = await generateBrief({cwd: repo.dir, storyId: 'US-0001', client, now})
    expect(brief.summarySource).toBe('ai')
    for (const section of SECTIONS) expect(brief.markdown).toContain(section)
    expect(brief.markdown).toContain('This story adds risky Apex. Fix the SOQL in loops before promoting.')
    expect(brief.markdown).toContain('_Summary written by the Copado AI release agent')
    expect(brief.markdown).toContain(
      '| APEX001 | error | `force-app/main/default/classes/SoqlInLoopBad.cls:4` |',
    )
    expect(brief.markdown).toContain('| Gate | **FAILED** |')
    expect(brief.path).toBe(join(repo.dir, '.guardian', 'briefs', 'US-0001.md'))
    expect(readFileSync(brief.path, 'utf8')).toBe(brief.markdown)
    expect(brief.attached).toBeNull()
  })

  it('falls back to the template when the adapter returns null, and the brief is still complete', async () => {
    repo = createSampleRepo({classes: ['SoqlInLoopBad.cls', 'SharingGood.cls']})
    const client = mockClient(null)
    const brief = await generateBrief({cwd: repo.dir, storyId: 'US-0001', client, now})
    expect(client.askReleaseAgent).toHaveBeenCalledOnce()
    expect(brief.summarySource).toBe('template')
    expect(brief.warnings).toContain('AI summary unavailable; used the template summary.')
    for (const section of SECTIONS) expect(brief.markdown).toContain(section)
    expect(brief.markdown).toContain(
      'This change touches 2 Apex classes, 0 triggers and 0 Lightning web components. ' +
        'Guardian found 5 errors, 0 warnings and 0 info findings (risk score 50/100), and the gate failed. ' +
        'Most frequent: SOQL query inside a loop (APEX001, 5). Apex test results were not provided.',
    )
    expect(brief.markdown).toContain('**Apex classes (2)**')
    expect(brief.markdown).toContain('- `SoqlInLoopBad` (`force-app/main/default/classes/SoqlInLoopBad.cls`)')
    expect(brief.markdown).toContain('Not provided. Run `sf apex run test --json')
  })

  it('does not call the AI with --no-ai', async () => {
    repo = createSampleRepo({classes: ['SharingGood.cls']})
    const client = mockClient('unused')
    const brief = await generateBrief({cwd: repo.dir, storyId: 'US-0001', client, ai: false, now})
    expect(client.askReleaseAgent).not.toHaveBeenCalled()
    expect(brief.summarySource).toBe('template')
    expect(brief.warnings).toEqual([])
    expect(brief.markdown).toContain('| Gate | **PASSED** |')
  })

  it('never sends source code to the AI', async () => {
    repo = createSampleRepo()
    const client = mockClient(null)
    const brief = await generateBrief({cwd: repo.dir, storyId: 'US-0001', client, now})
    const [prompt] = client.prompts
    expect(prompt).toContain('force-app/main/default/classes/SoqlInLoopBad.cls')
    expect(prompt).toContain('APEX001')
    // No line of any scanned file may appear in the prompt.
    const files = lines(sh(repo.dir, 'ls-files', 'force-app')).filter((f) => !f.endsWith('.gitkeep'))
    expect(files.length).toBe(brief.gate.filesScanned)
    let checked = 0
    for (const file of files) {
      for (const line of readFileSync(join(repo.dir, file), 'utf8').split('\n')) {
        const text = line.trim()
        if (text.length < 15) continue
        checked++
        expect(prompt, `${file}: ${text}`).not.toContain(text)
      }
    }
    expect(checked).toBeGreaterThan(200)
    for (const snippet of ['SELECT', 'innerHTML =', 'eval(', '005000000000001', 'https://api.example.com']) {
      expect(prompt).not.toContain(snippet)
    }
  })

  it('includes test results and keeps failure messages out of the AI prompt', async () => {
    repo = createSampleRepo({classes: ['AssertGoodTest.cls']})
    writeFileSync(join(repo.dir, 'results.json'), '﻿' + JSON.stringify(SF_TEST_RESULTS))
    const client = mockClient(null)
    const brief = await generateBrief({
      cwd: repo.dir,
      storyId: 'US-0001',
      client,
      testResultsPath: 'results.json',
      now,
    })
    expect(brief.markdown).toContain('- Outcome: **Failed**')
    expect(brief.markdown).toContain('- Tests: 3 ran, 2 passed, 1 failed, 0 skipped')
    expect(brief.markdown).toContain('- Org-wide coverage: 81%')
    expect(brief.markdown).toContain(
      '| AssertGoodTest.usesHelper | System.AssertException: Expected: Acme, Actual: \\| Other |',
    )
    expect(client.prompts[0]).toContain('Apex tests: Failed, 2/3 passing, 1 failing, org-wide coverage 81%.')
    expect(client.prompts[0]).not.toContain('AssertException')
  })

  it('writes the rollback plan with the base SHA, changed files and added files', async () => {
    repo = createSampleRepo({classes: ['SharingGood.cls']})
    const brief = await generateBrief({
      cwd: repo.dir,
      storyId: 'US-0001',
      client: mockClient(null),
      ai: false,
      now,
    })
    expect(brief.markdown).toContain(`- Base commit: \`${brief.gate.baseSha}\` (\`main\`)`)
    expect(brief.markdown).toContain('  - `force-app/main/default/classes/SharingGood.cls` (added)')
    expect(brief.markdown).toContain(
      `git revert --no-edit ${brief.gate.baseSha!.slice(0, 10)}..${brief.gate.headSha!.slice(0, 10)}`,
    )
    expect(brief.markdown).toContain('does not delete the 1 added file(s)')
  })

  it('attaches through the adapter and keeps the local file when attaching fails', async () => {
    repo = createSampleRepo({classes: ['SharingGood.cls']})
    const good = mockClient(null, true)
    const ok = await generateBrief({
      cwd: repo.dir,
      storyId: 'US-0001',
      client: good,
      ai: false,
      attach: true,
      now,
    })
    expect(ok.attached).toBe(true)
    expect(good.attachBriefToStory).toHaveBeenCalledWith('US-0001', ok.markdown)

    const bad = mockClient(null, false)
    const failed = await generateBrief({
      cwd: repo.dir,
      storyId: 'US-0001',
      client: bad,
      ai: false,
      attach: true,
      out: 'out/brief.md',
      now,
    })
    expect(failed.attached).toBe(false)
    expect(failed.path).toBe(join(repo.dir, 'out', 'brief.md'))
    expect(existsSync(failed.path)).toBe(true)
    expect(failed.warnings.at(-1)).toMatch(/Could not attach the brief to US-0001. The local file is kept/)
  })

  it('rejects a missing or invalid test results file', async () => {
    repo = createSampleRepo({classes: ['SharingGood.cls']})
    await expect(
      generateBrief({
        cwd: repo.dir,
        storyId: 'US-0001',
        client: mockClient(null),
        testResultsPath: 'none.json',
      }),
    ).rejects.toThrow(UsageError)
    expect(() => parseTestResults({status: 0}, 'x.json')).toThrow(
      /not the output of "sf apex run test --json"/,
    )
  })
})

describe('brief command', () => {
  let repo: SampleRepo | undefined
  afterEach(() => repo?.cleanup())

  it('writes the brief without AI and exits 0', async () => {
    repo = createSampleRepo({classes: ['SoqlInLoopBad.cls']})
    const run = await runCommand(GuardianBrief, ['--story', 'US-0001', '--no-ai', '--json'], repo.dir)
    expect(run.code).toBe(0)
    const json = JSON.parse(run.stdout)
    expect(json).toMatchObject({
      summarySource: 'template',
      attached: null,
      gate: {passed: false, riskScore: 50},
    })
    expect(readFileSync(json.path, 'utf8')).toContain('# Release brief: US-0001')
  })

  it('exits 2 without --story or with a missing test results file', async () => {
    repo = createSampleRepo({classes: ['SoqlInLoopBad.cls']})
    expect((await runCommand(GuardianBrief, ['--no-ai'], repo.dir)).code).toBe(2)
    const missing = await runCommand(
      GuardianBrief,
      ['--story', 'US-1', '--no-ai', '--test-results', 'x.json'],
      repo.dir,
    )
    expect(missing.code).toBe(2)
    expect(missing.error).toMatch(/Test results file not found/)
  })
})

describe('brief helpers', () => {
  it('makes story IDs safe as file names', () => {
    expect(safeFileName('US-0001')).toBe('US-0001')
    expect(safeFileName('../../etc/passwd')).toBe('__.._etc_passwd')
    expect(safeFileName('a0X5g00000AbCdE')).toBe('a0X5g00000AbCdE')
  })

  it('cleans the AI answer', () => {
    expect(cleanSummary('  Ready.\n```apex\nSELECT\n```  ')).toBe('Ready.')
    expect(cleanSummary('   ')).toBeNull()
    expect(cleanSummary('x'.repeat(2000))!.length).toBe(1503)
  })

  it('builds a prompt from facts only', () => {
    const prompt = buildReleasePrompt({
      storyId: 'US-9',
      files: ['a.cls'],
      tests: null,
      gate: {
        filesScanned: 1,
        findings: [],
        riskScore: 0,
        baseRef: 'main',
        headRef: 'HEAD',
        baseSha: null,
        headSha: null,
        passed: true,
        blockingCount: 0,
      },
    })
    expect(prompt).toContain('user story US-9')
    expect(prompt).toContain('Findings: none')
    expect(prompt).toContain('Apex tests: not provided.')
  })
})
