import {mkdirSync, writeFileSync} from 'node:fs'
import {dirname, isAbsolute, join, resolve} from 'node:path'

import {type CopadoClient, createCopadoClient} from '../copado/client.js'
import {UsageError} from '../core/errors.js'
import {git, lines} from '../core/git.js'
import {evaluateGate, scan} from '../core/scanner.js'
import type {GateResult} from '../core/types.js'
import {aiSummary} from './ai.js'
import {buildBrief} from './builder.js'
import {templateSummary} from './template.js'
import {readTestResults, type TestSummary} from './test-results.js'

export interface BriefRequest {
  cwd: string
  storyId: string
  base?: string
  configPath?: string
  testResultsPath?: string
  /** Ask the Copado AI release agent for the summary. Default true. */
  ai?: boolean
  /** Try to write the brief to the user story. Default false. */
  attach?: boolean
  /** Output path, relative to `cwd`. Default `.guardian/briefs/<story>.md` in the repository root. */
  out?: string
  /** Injected in tests; defaults to the real Agentia adapter. */
  client?: CopadoClient
  now?: Date
}

export interface BriefOutcome {
  markdown: string
  path: string
  gate: GateResult
  summarySource: 'ai' | 'template'
  /** null when --attach was not requested. */
  attached: boolean | null
  warnings: string[]
}

export function safeFileName(storyId: string): string {
  return storyId.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_') || 'story'
}

async function addedFiles(root: string, baseRef: string, baseSha: string | null): Promise<string[]> {
  if (!baseSha) return []
  const committed = await git(
    ['-c', 'core.quotepath=off', 'diff', '--name-only', '--diff-filter=A', `${baseRef}...HEAD`],
    root,
  )
  const untracked = await git(
    ['-c', 'core.quotepath=off', 'ls-files', '--others', '--exclude-standard'],
    root,
  )
  return [committed, untracked].flatMap((r) => (r.ok ? lines(r.stdout) : []))
}

/**
 * Scans, builds the brief, always writes it to a local file, and optionally attaches it to the
 * user story. AI and attach failures become warnings; they never fail the brief.
 */
export async function generateBrief(request: BriefRequest): Promise<BriefOutcome> {
  const storyId = request.storyId.trim()
  if (!storyId) throw new UsageError('--story is required.')
  const warnings: string[] = []
  const client = request.client ?? createCopadoClient({log: (m) => warnings.push(m)})

  const tests: TestSummary | null = request.testResultsPath
    ? readTestResults(resolve(request.cwd, request.testResultsPath))
    : null
  const outcome = await scan({cwd: request.cwd, base: request.base, configPath: request.configPath})
  const gate = evaluateGate(outcome.result, outcome.config)

  let summary: string | null = null
  if (request.ai !== false) {
    summary = await aiSummary(client, {storyId, gate, files: outcome.files, tests})
    if (!summary) warnings.push('AI summary unavailable; used the template summary.')
  }
  const summarySource = summary ? 'ai' : 'template'

  const added = new Set(await addedFiles(outcome.root, gate.baseRef, gate.baseSha))
  const markdown = buildBrief({
    storyId,
    gate,
    thresholds: outcome.config.thresholds,
    files: outcome.files,
    addedFiles: outcome.files.filter((f) => added.has(f)),
    tests,
    summary: summary ?? templateSummary(gate, outcome.files, tests),
    summarySource,
    generatedAt: request.now ?? new Date(),
  })

  const path = request.out
    ? isAbsolute(request.out)
      ? request.out
      : resolve(request.cwd, request.out)
    : join(outcome.root, '.guardian', 'briefs', `${safeFileName(storyId)}.md`)
  mkdirSync(dirname(path), {recursive: true})
  writeFileSync(path, markdown, 'utf8')

  let attached: boolean | null = null
  if (request.attach) {
    attached = await client.attachBriefToStory(storyId, markdown)
    if (!attached) warnings.push(`Could not attach the brief to ${storyId}. The local file is kept: ${path}`)
  }
  return {markdown, path, gate, summarySource, attached, warnings}
}
