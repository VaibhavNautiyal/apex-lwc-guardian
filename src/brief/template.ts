import {countBySeverity} from '../core/scoring.js'
import type {Finding, GateResult} from '../core/types.js'
import {allRules} from '../lang/index.js'
import {groupComponents} from './components.js'
import type {TestSummary} from './test-results.js'

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : word.endsWith('s') ? 'es' : 's'}`
}

/** Rule IDs ordered by how often they fired, most frequent first, with their titles. */
export function topRules(
  findings: readonly Finding[],
  limit = 3,
): {id: string; title: string; count: number}[] {
  const counts = new Map<string, number>()
  for (const f of findings) counts.set(f.ruleId, (counts.get(f.ruleId) ?? 0) + 1)
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([id, count]) => ({id, count, title: allRules.find((r) => r.id === id)?.title ?? id}))
}

/** Deterministic 2-4 sentence summary used when the AI is off or unavailable. */
export function templateSummary(
  gate: GateResult,
  files: readonly string[],
  tests: TestSummary | null,
): string {
  const c = groupComponents(files)
  const counts = countBySeverity(gate.findings)
  const sentences = [
    `This change touches ${plural(c.apexClasses.length, 'Apex class')}, ` +
      `${plural(c.triggers.length, 'trigger')} and ${plural(c.lwc.length, 'Lightning web component')}.`,
    `Guardian found ${plural(counts.error, 'error')}, ${plural(counts.warning, 'warning')} and ` +
      `${counts.info} info finding${counts.info === 1 ? '' : 's'} (risk score ${gate.riskScore}/100), ` +
      `and the gate ${gate.passed ? 'passed' : 'failed'}.`,
  ]
  const top = topRules(gate.findings)
  if (top.length > 0) {
    sentences.push(`Most frequent: ${top.map((r) => `${r.title} (${r.id}, ${r.count})`).join('; ')}.`)
  }
  sentences.push(
    tests
      ? `Apex tests: ${tests.passing} of ${tests.testsRan} passed${tests.failing ? `, ${tests.failing} failed` : ''}.`
      : 'Apex test results were not provided.',
  )
  return sentences.join(' ')
}
