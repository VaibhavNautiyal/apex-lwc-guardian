import {readFileSync} from 'node:fs'
import {join} from 'node:path'

import {allRules} from '../lang/index.js'
import {type FileSelection, languageOf, selectFiles} from './changed-files.js'
import {type GuardianConfig, loadConfig} from './config.js'
import {UsageError} from './errors.js'
import {repoRoot} from './git.js'
import {riskScore} from './scoring.js'
import {
  type Finding,
  type GateResult,
  isAtLeast,
  type Rule,
  type RuleContext,
  type ScanResult,
  type SourceFile,
} from './types.js'

export const DEFAULT_RULE_CONTEXT: RuleContext = {triggerMaxLines: 15, urlAllowList: []}

/** Stable order: file, line, rule ID, message. */
export function compareFindings(a: Finding, b: Finding): number {
  return (
    a.file.localeCompare(b.file) ||
    a.line - b.line ||
    a.ruleId.localeCompare(b.ruleId) ||
    a.message.localeCompare(b.message)
  )
}

/** Runs every rule that matches each file's language and returns sorted findings. */
export function runRules(
  files: readonly SourceFile[],
  rules: readonly Rule[],
  context: RuleContext = DEFAULT_RULE_CONTEXT,
): Finding[] {
  const findings: Finding[] = []
  for (const file of files) {
    for (const rule of rules) {
      if (rule.language === file.language) findings.push(...rule.check(file, context))
    }
  }
  return findings.sort(compareFindings)
}

/** Rules left enabled by the config. */
export function enabledRules(config: GuardianConfig, rules: readonly Rule[] = allRules): Rule[] {
  return rules.filter((rule) => config.rules[rule.id]?.enabled !== false)
}

/** Applies severity overrides from the config. */
export function applySeverityOverrides(findings: Finding[], config: GuardianConfig): Finding[] {
  return findings.map((f) => {
    const severity = config.rules[f.ruleId]?.severity
    return severity && severity !== f.severity ? {...f, severity} : f
  })
}

/** Scans in-memory sources with a config. No git, no file system. */
export function scanSources(
  sources: readonly SourceFile[],
  config: GuardianConfig,
  refs: Pick<ScanResult, 'baseRef' | 'headRef' | 'baseSha' | 'headSha'>,
): ScanResult {
  const context: RuleContext = {triggerMaxLines: config.triggerMaxLines, urlAllowList: config.urlAllowList}
  const findings = applySeverityOverrides(runRules(sources, enabledRules(config), context), config)
  return {filesScanned: sources.length, findings, riskScore: riskScore(findings), ...refs}
}

export interface ScanRequest {
  cwd: string
  /** Base branch; defaults to the config `baseBranch`. */
  base?: string
  all?: boolean
  files?: string[]
  configPath?: string
}

export interface ScanOutcome {
  result: ScanResult
  config: GuardianConfig
  configHash: string
  configPath: string | null
  root: string
  /** Scanned file paths, repo-relative. */
  files: string[]
}

export async function scan(request: ScanRequest): Promise<ScanOutcome> {
  if (request.all && request.files?.length) throw new UsageError('Use either --all or --files, not both.')
  const gitRoot = await repoRoot(request.cwd)
  const root = gitRoot ?? request.cwd
  const loaded = loadConfig(root, {
    explicitPath: request.configPath,
    cwd: request.cwd,
    knownRuleIds: allRules.map((r) => r.id),
  })
  const selection: FileSelection = request.files?.length
    ? {mode: 'files', files: request.files}
    : request.all
      ? {mode: 'all'}
      : {mode: 'diff', base: request.base ?? loaded.config.baseBranch}
  const selected = await selectFiles(request.cwd, root, gitRoot !== null, selection, loaded.config)
  const sources: SourceFile[] = selected.files.map((path) => ({
    path,
    language: languageOf(path)!,
    content: readFileSync(join(root, path), 'utf8'),
  }))
  const result = scanSources(sources, loaded.config, selected)
  return {
    result,
    config: loaded.config,
    configHash: loaded.hash,
    configPath: loaded.path,
    root,
    files: selected.files,
  }
}

/** Applies the gate thresholds to a scan result. */
export function evaluateGate(result: ScanResult, config: GuardianConfig): GateResult {
  const blockingCount = result.findings.filter((f) => isAtLeast(f.severity, config.thresholds.failOn)).length
  const passed = blockingCount === 0 && result.riskScore <= config.thresholds.maxRiskScore
  return {...result, passed, blockingCount}
}
