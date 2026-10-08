import type {CopadoClient} from '../copado/client.js'
import {countBySeverity} from '../core/scoring.js'
import type {GateResult} from '../core/types.js'
import {allRules} from '../lang/index.js'
import type {TestSummary} from './test-results.js'

export interface PromptInput {
  storyId: string
  gate: GateResult
  files: readonly string[]
  tests: TestSummary | null
}

/**
 * Builds the prompt for the Copado release agent. It contains ONLY file names, rule IDs, rule
 * titles, finding messages, counts and test totals. Never source code, explanations quoting code,
 * or test failure messages (which can contain data).
 */
export function buildReleasePrompt(input: PromptInput): string {
  const {gate, tests} = input
  const counts = countBySeverity(gate.findings)
  const titles = new Map(allRules.map((r) => [r.id, r.title]))
  const findingLines = gate.findings
    .slice(0, 50)
    .map(
      (f) =>
        `- ${f.ruleId} (${titles.get(f.ruleId) ?? f.ruleId}), ${f.severity}, ${f.file}:${f.line}: ${f.message}`,
    )
  return [
    `Write a release summary of 2 to 4 sentences for user story ${input.storyId}, for a release manager.`,
    'Say what kind of components changed, the main risks, and whether it looks ready to promote.',
    'Use only the facts below. Reply with the summary text only, no headings or lists.',
    '',
    `Changed files (${input.files.length}):`,
    ...input.files.slice(0, 100).map((f) => `- ${f}`),
    '',
    `Static analysis: ${counts.error} errors, ${counts.warning} warnings, ${counts.info} info, ` +
      `risk score ${gate.riskScore}/100, gate ${gate.passed ? 'passed' : 'failed'} ` +
      `(${gate.blockingCount} blocking).`,
    ...(findingLines.length ? ['Findings:', ...findingLines] : ['Findings: none']),
    gate.findings.length > 50 ? `(and ${gate.findings.length - 50} more)` : '',
    '',
    tests
      ? `Apex tests: ${tests.outcome}, ${tests.passing}/${tests.testsRan} passing, ${tests.failing} failing` +
        (tests.orgWideCoverage ? `, org-wide coverage ${tests.orgWideCoverage}` : '') +
        '.'
      : 'Apex tests: not provided.',
  ]
    .filter((line, i, all) => line !== '' || all[i - 1] !== '')
    .join('\n')
}

/** Cleans the agent's answer: trims, drops code fences and caps the length. Null when empty. */
export function cleanSummary(text: string | null): string | null {
  if (!text) return null
  const cleaned = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\s+\n/g, '\n')
    .trim()
  if (!cleaned) return null
  return cleaned.length > 1500 ? cleaned.slice(0, 1500).trimEnd() + '...' : cleaned
}

/** Asks the release agent for the summary. Returns null when the AI is unavailable. */
export async function aiSummary(client: CopadoClient, input: PromptInput): Promise<string | null> {
  return cleanSummary(await client.askReleaseAgent(buildReleasePrompt(input), {storyId: input.storyId}))
}
