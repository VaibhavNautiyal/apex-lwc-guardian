import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, it} from 'vitest'

import {defaultConfig, hashConfig, loadConfig, parseConfig} from '../src/core/config.js'
import {UsageError} from '../src/core/errors.js'
import {allRules} from '../src/lang/index.js'

const RULE_IDS = allRules.map((r) => r.id)

describe('config', () => {
  const dirs: string[] = []
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, {recursive: true, force: true})))
  const tempDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'guardian-config-'))
    dirs.push(dir)
    return dir
  }

  it('has documented defaults', () => {
    expect(defaultConfig()).toEqual({
      baseBranch: 'main',
      include: ['force-app/**'],
      ignore: ['**/*.test.js', '**/__tests__/**', '**/node_modules/**'],
      rules: {},
      thresholds: {failOn: 'error', maxRiskScore: 100},
      triggerMaxLines: 15,
      urlAllowList: [],
      audit: {enabled: true, path: '.guardian/audit.jsonl'},
    })
  })

  it('parses the example from the plan and fills in defaults', () => {
    const config = parseConfig(
      [
        'baseBranch: develop',
        'rules:',
        '  APEX004: { severity: error }',
        '  APEX011: { enabled: false }',
        'thresholds:',
        '  failOn: warning',
        'triggerMaxLines: 20',
      ].join('\n'),
      'test',
      RULE_IDS,
    )
    expect(config.baseBranch).toBe('develop')
    expect(config.rules).toEqual({APEX004: {severity: 'error'}, APEX011: {enabled: false}})
    expect(config.thresholds).toEqual({failOn: 'warning', maxRiskScore: 100})
    expect(config.triggerMaxLines).toBe(20)
    expect(config.audit.enabled).toBe(true)
  })

  it('accepts guardian.config.example.yml', () => {
    const text = readFileSync(join(import.meta.dirname, '..', 'guardian.config.example.yml'), 'utf8')
    expect(parseConfig(text, 'example', RULE_IDS).rules.APEX011).toEqual({enabled: false})
  })

  it('treats an empty file as defaults', () => {
    expect(parseConfig('', 'test')).toEqual(defaultConfig())
  })

  it.each([
    ['an invalid severity', 'rules:\n  APEX001: { severity: fatal }', /rules\.APEX001\.severity/],
    ['an unknown key', 'baseBrnch: main', /Unrecognized key/],
    ['a malformed rule ID', 'rules:\n  apex1: { enabled: false }', /APEX001 or LWC001/],
    ['an out-of-range threshold', 'thresholds:\n  maxRiskScore: 150', /maxRiskScore/],
    ['invalid YAML', 'rules: [', /Invalid YAML/],
  ])('rejects %s with a usage error', (_name, yaml, message) => {
    expect(() => parseConfig(yaml, 'test', RULE_IDS)).toThrow(UsageError)
    expect(() => parseConfig(yaml, 'test', RULE_IDS)).toThrow(message)
  })

  it('rejects overrides for rules that do not exist', () => {
    expect(() => parseConfig('rules:\n  APEX099: { enabled: false }', 'test', RULE_IDS)).toThrow(
      /Unknown rule ID in test: APEX099/,
    )
  })

  it('loads guardian.config.yml from the root, or defaults when absent', () => {
    const dir = tempDir()
    expect(loadConfig(dir).path).toBeNull()
    writeFileSync(join(dir, 'guardian.config.yml'), 'baseBranch: release\n')
    const loaded = loadConfig(dir)
    expect(loaded.path).toBe(join(dir, 'guardian.config.yml'))
    expect(loaded.config.baseBranch).toBe('release')
  })

  it('fails when an explicit config file is missing', () => {
    expect(() => loadConfig(tempDir(), {explicitPath: 'nope.yml'})).toThrow(/Config file not found: nope.yml/)
  })

  it('hashes the effective config deterministically', () => {
    expect(hashConfig(defaultConfig())).toBe(hashConfig(parseConfig('baseBranch: main', 'test')))
    expect(hashConfig(defaultConfig())).not.toBe(hashConfig(parseConfig('triggerMaxLines: 3', 'test')))
    expect(hashConfig(defaultConfig())).toMatch(/^[0-9a-f]{12}$/)
  })
})
