import type {Finding, GateResult, ScanResult} from '../types.js'
import type {GateThresholds} from './json.js'
import {gateLine, summaryLine} from './table.js'

/** Escapes text for a Markdown table cell. */
export function cell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

/** Findings as a Markdown table (Rule, Severity, Location, Fix). */
export function findingsTable(findings: readonly Finding[]): string {
  if (findings.length === 0) return '_No findings._'
  const rows = findings.map(
    (f) =>
      `| ${f.ruleId} | ${f.severity} | \`${cell(f.file)}:${f.line}\` | ${cell(f.message)} ${cell(f.suggestion)} |`,
  )
  return ['| Rule | Severity | Location | Issue and fix |', '|---|---|---|---|', ...rows].join('\n')
}

export function renderMarkdown(result: ScanResult | GateResult, thresholds?: GateThresholds): string {
  const lines = ['## Guardian scan', '', summaryLine(result)]
  if ('passed' in result && thresholds) lines.push('', `**${gateLine(result, thresholds)}**`)
  lines.push('', findingsTable(result.findings))
  return lines.join('\n')
}
