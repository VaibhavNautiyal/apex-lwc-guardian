import {mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, it} from 'vitest'

import {languageOf, matchesConfig} from '../src/core/changed-files.js'
import {defaultConfig, parseConfig} from '../src/core/config.js'
import {EnvironmentError, UsageError} from '../src/core/errors.js'
import {ScanJsonSchema, toJson} from '../src/core/reporters/json.js'
import {renderMarkdown} from '../src/core/reporters/markdown.js'
import {renderTable} from '../src/core/reporters/table.js'
import {evaluateGate, scan, scanSources} from '../src/core/scanner.js'
import {countBySeverity, riskScore} from '../src/core/scoring.js'
import type {Finding} from '../src/core/types.js'
import {fixture} from './helpers.js'
import {createSampleRepo, type SampleRepo, sh} from './repo.js'

const NO_REFS = {baseRef: 'none', headRef: 'WORKTREE', baseSha: null, headSha: null}

function findingOf(severity: Finding['severity']): Finding {
  return {
    ruleId: 'APEX001',
    severity,
    file: 'a.cls',
    line: 1,
    message: 'm',
    explanation: 'e',
    suggestion: 's',
  }
}

describe('scoring', () => {
  it('weights error 10, warning 3, info 1 and caps at 100', () => {
    expect(riskScore([])).toBe(0)
    expect(riskScore([findingOf('error'), findingOf('warning'), findingOf('info')])).toBe(14)
    expect(riskScore(Array.from({length: 11}, () => findingOf('error')))).toBe(100)
    expect(countBySeverity([findingOf('error'), findingOf('info')])).toEqual({error: 1, warning: 0, info: 1})
  })
})

describe('file selection helpers', () => {
  it('maps paths to languages', () => {
    expect(languageOf('force-app/main/default/classes/A.cls')).toBe('apex')
    expect(languageOf('force-app/main/default/triggers/T.trigger')).toBe('apex')
    expect(languageOf('force-app/main/default/lwc/c/c.js')).toBe('lwc')
    expect(languageOf('force-app/main/default/lwc/c/c.html')).toBe('lwc')
    expect(languageOf('force-app/main/default/aura/c/cController.js')).toBeNull()
    expect(languageOf('force-app/main/default/classes/A.cls-meta.xml')).toBeNull()
  })

  it('applies include and ignore globs', () => {
    const config = defaultConfig()
    expect(matchesConfig('force-app/main/default/classes/A.cls', config)).toBe(true)
    expect(matchesConfig('other/classes/A.cls', config)).toBe(false)
    expect(matchesConfig('force-app/main/default/lwc/c/c.test.js', config)).toBe(false)
    expect(matchesConfig('force-app/main/default/lwc/c/__tests__/c.js', config)).toBe(false)
  })
})

describe('scanSources', () => {
  it('applies severity overrides and disabled rules from the config', () => {
    const sources = [fixture('classes/SharingBad.cls'), fixture('classes/EmptyCatchBad.cls')]
    expect(
      scanSources(sources, defaultConfig(), NO_REFS).findings.map((f) => [f.ruleId, f.severity]),
    ).toEqual([
      ['APEX011', 'warning'],
      ['APEX011', 'warning'],
      ['APEX004', 'warning'],
    ])
    const config = parseConfig(
      'rules:\n  APEX004: { severity: error }\n  APEX011: { enabled: false }',
      'test',
    )
    const result = scanSources(sources, config, NO_REFS)
    expect(result.findings.map((f) => [f.ruleId, f.severity])).toEqual([['APEX004', 'error']])
    expect(result.riskScore).toBe(10)
    expect(result.filesScanned).toBe(2)
  })

  it('is deterministic', () => {
    const sources = [fixture('classes/SoqlInLoopBad.cls'), fixture('lwc/unsafeHtmlBad/unsafeHtmlBad.js')]
    expect(scanSources(sources, defaultConfig(), NO_REFS)).toEqual(
      scanSources(sources, defaultConfig(), NO_REFS),
    )
  })
})

describe('gate thresholds', () => {
  const result = {...NO_REFS, filesScanned: 1, findings: [findingOf('warning')], riskScore: 3}

  it('passes warnings when failOn is error and blocks them when failOn is warning', () => {
    expect(evaluateGate(result, defaultConfig())).toMatchObject({passed: true, blockingCount: 0})
    const strict = parseConfig('thresholds: { failOn: warning }', 'test')
    expect(evaluateGate(result, strict)).toMatchObject({passed: false, blockingCount: 1})
  })

  it('fails when the risk score exceeds maxRiskScore', () => {
    expect(evaluateGate(result, parseConfig('thresholds: { maxRiskScore: 2 }', 'test')).passed).toBe(false)
    expect(evaluateGate(result, parseConfig('thresholds: { maxRiskScore: 3 }', 'test')).passed).toBe(true)
  })
})

describe('scan in a git repository', () => {
  let repo: SampleRepo | undefined
  afterEach(() => repo?.cleanup())

  it('scans only files changed since the base branch', async () => {
    repo = createSampleRepo({classes: ['SoqlInLoopBad.cls', 'SharingGood.cls']})
    const outcome = await scan({cwd: repo.dir})
    expect(outcome.files).toEqual([
      'force-app/main/default/classes/SharingGood.cls',
      'force-app/main/default/classes/SoqlInLoopBad.cls',
    ])
    expect(outcome.result.findings.map((f) => f.ruleId)).toEqual(Array(5).fill('APEX001'))
    expect(outcome.result).toMatchObject({baseRef: 'main', headRef: 'HEAD', filesScanned: 2, riskScore: 50})
    expect(outcome.result.baseSha).toBe(sh(repo.dir, 'rev-parse', 'main').trim())
  })

  it('includes uncommitted and untracked changes and skips deleted files', async () => {
    repo = createSampleRepo({classes: ['SoqlInLoopBad.cls', 'SharingGood.cls']})
    const classes = join(repo.dir, 'force-app/main/default/classes')
    unlinkSync(join(classes, 'SharingGood.cls'))
    writeFileSync(join(classes, 'NewClass.cls'), 'public class NewClass {}\n')
    writeFileSync(join(classes, 'NewClass.cls-meta.xml'), '<ApexClass/>\n')
    const outcome = await scan({cwd: repo.dir})
    expect(outcome.files).toEqual([
      'force-app/main/default/classes/NewClass.cls',
      'force-app/main/default/classes/SoqlInLoopBad.cls',
    ])
  })

  it('finds no files on the base branch itself', async () => {
    repo = createSampleRepo({classes: ['SoqlInLoopBad.cls']})
    sh(repo.dir, 'checkout', '-q', 'main')
    expect((await scan({cwd: repo.dir})).result.filesScanned).toBe(0)
  })

  it('works from a subdirectory and honours the config base branch', async () => {
    repo = createSampleRepo({classes: ['SoqlInLoopBad.cls']})
    writeFileSync(join(repo.dir, 'guardian.config.yml'), 'baseBranch: feature/US-0001\n')
    const outcome = await scan({cwd: join(repo.dir, 'force-app')})
    expect(outcome.result.baseRef).toBe('feature/US-0001')
    expect(outcome.files).toEqual([])
  })

  it('--files scans exactly the given files, relative to the working directory', async () => {
    repo = createSampleRepo({classes: ['SoqlInLoopBad.cls', 'SharingBad.cls']})
    const outcome = await scan({
      cwd: join(repo.dir, 'force-app/main/default'),
      files: ['classes/SharingBad.cls', '../../../sfdx-project.json'],
    })
    expect(outcome.files).toEqual(['force-app/main/default/classes/SharingBad.cls'])
    expect(outcome.result.baseRef).toBe('none')
    await expect(scan({cwd: repo.dir, files: ['missing.cls']})).rejects.toThrow(UsageError)
  })

  it('reports environment errors for a missing base branch and an empty repository', async () => {
    repo = createSampleRepo({classes: ['SoqlInLoopBad.cls']})
    await expect(scan({cwd: repo.dir, base: 'develop'})).rejects.toThrow(EnvironmentError)
    repo.cleanup()
    repo = createSampleRepo({noCommits: true})
    await expect(scan({cwd: repo.dir})).rejects.toThrow(/no commits/)
  })
})

describe('scan outside git', () => {
  let dir: string | undefined
  afterEach(() => dir && rmSync(dir, {recursive: true, force: true}))

  it('needs git for the default diff mode but not for --all', async () => {
    dir = mkdtempSync(join(tmpdir(), 'guardian-nogit-'))
    mkdirSync(join(dir, 'force-app/classes'), {recursive: true})
    writeFileSync(join(dir, 'force-app/classes/A.cls'), 'public class A {}\n')
    await expect(scan({cwd: dir})).rejects.toThrow(EnvironmentError)
    const outcome = await scan({cwd: dir, all: true})
    expect(outcome.result).toMatchObject({filesScanned: 1, headRef: 'WORKTREE', headSha: null})
    expect(outcome.result.findings.map((f) => f.ruleId)).toEqual(['APEX004'])
  })

  it('rejects --all together with --files', async () => {
    await expect(scan({cwd: tmpdir(), all: true, files: ['a.cls']})).rejects.toThrow(UsageError)
  })
})

describe('reporters', () => {
  const sources = [fixture('classes/SharingBad.cls'), fixture('lwc/debugLeftoversBad/debugLeftoversBad.js')]
  const result = scanSources(sources, defaultConfig(), NO_REFS)

  it('json output matches the schema', () => {
    const json = JSON.parse(JSON.stringify(toJson(result)))
    expect(ScanJsonSchema.parse(json)).toEqual(json)
    expect(json).toMatchObject({kind: 'scan', counts: {error: 0, warning: 1, info: 3}, riskScore: 6})
    expect(json.gate).toBeUndefined()
  })

  it('table output groups findings by file and ends with a summary', () => {
    const text = renderTable(result)
    expect(text).toContain('force-app/main/default/classes/SharingBad.cls\n  1  warning  APEX004')
    expect(text).toContain('Fix: Declare the class')
    expect(text.trim().split('\n').at(-1)).toBe(
      '2 files scanned: 0 errors, 1 warning, 3 info. Risk score 6/100.',
    )
  })

  it('markdown output has a findings table with escaped cells', () => {
    const md = renderMarkdown(evaluateGate(result, defaultConfig()), defaultConfig().thresholds)
    expect(md).toContain('**Gate: PASSED**')
    expect(md).toContain('| APEX004 | warning | `force-app/main/default/classes/SharingBad.cls:1` |')
  })
})
