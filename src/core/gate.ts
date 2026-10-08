import {notifyGateFailure} from '../notify/slack.js'
import {appendAudit, buildAuditEntry} from './audit.js'
import {gitUser} from './git.js'
import {evaluateGate, scan, type ScanOutcome, type ScanRequest} from './scanner.js'
import type {GateResult} from './types.js'

export interface GateRequest extends ScanRequest {
  storyId?: string
}

export interface GateOutcome extends ScanOutcome {
  gate: GateResult
  /** Where the audit line was written, or null when auditing is off or failed. */
  auditPath: string | null
  /** Why the audit line could not be written. Never changes the gate result. */
  auditError: string | null
  /** True when a Slack message was sent (gate failed and GUARDIAN_SLACK_WEBHOOK is set). */
  slackNotified: boolean
}

/** Scans, applies the thresholds and appends an audit line. */
export async function runGate(request: GateRequest): Promise<GateOutcome> {
  const outcome = await scan(request)
  const gate = evaluateGate(outcome.result, outcome.config)
  let auditPath: string | null = null
  let auditError: string | null = null
  if (outcome.config.audit.enabled) {
    try {
      const entry = buildAuditEntry(gate, {
        gitUser: await gitUser(outcome.root).catch(() => null),
        storyId: request.storyId,
        configHash: outcome.configHash,
      })
      auditPath = appendAudit(outcome.root, outcome.config, entry)
    } catch (error) {
      auditError = (error as Error).message
    }
  }
  const slackNotified = await notifyGateFailure(gate, {storyId: request.storyId})
  return {...outcome, gate, auditPath, auditError, slackNotified}
}
