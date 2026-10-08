export type Severity = 'error' | 'warning' | 'info'

/** Severities from most to least serious. */
export const SEVERITIES: readonly Severity[] = ['error', 'warning', 'info']

export type Language = 'apex' | 'lwc'

/** A source file handed to rules. `path` is repo-relative with forward slashes. */
export interface SourceFile {
  path: string
  language: Language
  content: string
}

export interface Finding {
  ruleId: string // e.g. APEX001
  severity: Severity
  file: string // repo-relative path
  line: number // 1-based
  message: string
  explanation: string // why it matters
  suggestion: string // how to fix
}

/** Per-scan settings a rule may read. Rules must not depend on Copado or the file system. */
export interface RuleContext {
  triggerMaxLines: number
  /** Extra absolute URL prefixes that LWC004 accepts. */
  urlAllowList: readonly string[]
}

export interface Rule {
  id: string
  title: string
  language: Language
  defaultSeverity: Severity
  check(file: SourceFile, context: RuleContext): Finding[]
}

export interface ScanResult {
  filesScanned: number
  findings: Finding[]
  riskScore: number // 0-100
  baseRef: string
  headRef: string
}

export interface GateResult extends ScanResult {
  passed: boolean
  blockingCount: number
}

/** Lower number means more serious. */
export function severityRank(severity: Severity): number {
  return SEVERITIES.indexOf(severity)
}

/** True when `severity` is at least as serious as `threshold`. */
export function isAtLeast(severity: Severity, threshold: Severity): boolean {
  return severityRank(severity) <= severityRank(threshold)
}
