import type {Finding, Severity} from './types.js'

/**
 * Risk score: the sum of a weight per finding (error 10, warning 3, info 1), capped at 100.
 * For example 2 errors and 3 warnings score 2*10 + 3*3 = 29.
 */
export const SEVERITY_WEIGHTS: Record<Severity, number> = {error: 10, warning: 3, info: 1}

export const MAX_RISK_SCORE = 100

export function riskScore(findings: readonly Finding[]): number {
  const total = findings.reduce((sum, f) => sum + SEVERITY_WEIGHTS[f.severity], 0)
  return Math.min(MAX_RISK_SCORE, total)
}

export type SeverityCounts = Record<Severity, number>

export function countBySeverity(findings: readonly Finding[]): SeverityCounts {
  const counts: SeverityCounts = {error: 0, warning: 0, info: 0}
  for (const f of findings) counts[f.severity]++
  return counts
}
