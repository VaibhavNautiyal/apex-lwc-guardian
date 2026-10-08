import {countBySeverity} from '../scoring.js'
import type {Finding, GateResult, ScanResult} from '../types.js'
import type {GateThresholds} from './json.js'

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function summaryLine(result: ScanResult): string {
  const c = countBySeverity(result.findings)
  return (
    `${plural(result.filesScanned, 'file')} scanned: ${plural(c.error, 'error')}, ` +
    `${plural(c.warning, 'warning')}, ${c.info} info. Risk score ${result.riskScore}/100.`
  )
}

export function gateLine(result: GateResult, thresholds: GateThresholds): string {
  if (result.passed) return 'Gate: PASSED'
  const reasons: string[] = []
  if (result.blockingCount > 0) {
    reasons.push(
      `${plural(result.blockingCount, 'blocking finding')} (severity ${thresholds.failOn} or higher)`,
    )
  }
  if (result.riskScore > thresholds.maxRiskScore) {
    reasons.push(`risk score ${result.riskScore} is above ${thresholds.maxRiskScore}`)
  }
  return `Gate: FAILED - ${reasons.join('; ')}`
}

/** Human-readable report grouped by file. */
export function renderTable(result: ScanResult | GateResult, thresholds?: GateThresholds): string {
  const out: string[] = []
  const byFile = new Map<string, Finding[]>()
  for (const f of result.findings) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f])

  if (result.filesScanned === 0) {
    out.push('No Apex or LWC files to scan.')
  } else if (result.findings.length === 0) {
    out.push('No findings.')
  }
  for (const [file, findings] of byFile) {
    out.push(file)
    const width = Math.max(...findings.map((f) => String(f.line).length))
    for (const f of findings) {
      out.push(`  ${String(f.line).padStart(width)}  ${f.severity.padEnd(7)}  ${f.ruleId}  ${f.message}`)
      out.push(`  ${' '.repeat(width)}  Fix: ${f.suggestion}`)
    }
    out.push('')
  }
  if (out.at(-1) === '') out.pop()
  out.push('', summaryLine(result))
  if ('passed' in result && thresholds) out.push(gateLine(result, thresholds))
  return out.join('\n')
}
