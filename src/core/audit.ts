import {appendFileSync, mkdirSync} from 'node:fs'
import {dirname, isAbsolute, join} from 'node:path'

import type {GuardianConfig} from './config.js'
import {countBySeverity, type SeverityCounts} from './scoring.js'
import type {GateResult} from './types.js'
import {TOOL_VERSION} from './version.js'

/** One line of the audit log. Holds counts and references only, never source code or file contents. */
export interface AuditEntry {
  timestamp: string
  gitUser: string | null
  storyId: string | null
  baseRef: string
  baseSha: string | null
  headSha: string | null
  filesScanned: number
  counts: SeverityCounts
  riskScore: number
  blockingCount: number
  result: 'pass' | 'fail'
  configHash: string
  toolVersion: string
}

export function buildAuditEntry(
  gate: GateResult,
  details: {gitUser: string | null; storyId?: string; configHash: string; now?: Date},
): AuditEntry {
  return {
    timestamp: (details.now ?? new Date()).toISOString(),
    gitUser: details.gitUser,
    storyId: details.storyId ?? null,
    baseRef: gate.baseRef,
    baseSha: gate.baseSha,
    headSha: gate.headSha,
    filesScanned: gate.filesScanned,
    counts: countBySeverity(gate.findings),
    riskScore: gate.riskScore,
    blockingCount: gate.blockingCount,
    result: gate.passed ? 'pass' : 'fail',
    configHash: details.configHash,
    toolVersion: TOOL_VERSION,
  }
}

/** Appends one JSON line to the audit file. Returns the absolute path written. */
export function appendAudit(root: string, config: GuardianConfig, entry: AuditEntry): string {
  const path = isAbsolute(config.audit.path) ? config.audit.path : join(root, config.audit.path)
  mkdirSync(dirname(path), {recursive: true})
  appendFileSync(path, JSON.stringify(entry) + '\n', 'utf8')
  return path
}
