import type {GateResult} from '../core/types.js'

export const SLACK_WEBHOOK_ENV = 'GUARDIAN_SLACK_WEBHOOK'

export interface SlackOptions {
  storyId?: string
  /** Default: the GUARDIAN_SLACK_WEBHOOK environment variable. */
  webhookUrl?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/** Message text: story, risk score and the top 3 findings. Rule IDs, paths and messages only, no source. */
export function slackMessage(gate: GateResult, storyId?: string): string {
  const order = {error: 0, warning: 1, info: 2}
  const top = [...gate.findings].sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 3)
  return [
    `:no_entry: Guardian gate failed${storyId ? ` for ${storyId}` : ''}: risk score ${gate.riskScore}/100, ` +
      `${gate.blockingCount} blocking finding${gate.blockingCount === 1 ? '' : 's'}.`,
    ...top.map((f) => `• ${f.ruleId} (${f.severity}) ${f.file}:${f.line} ${f.message}`),
  ].join('\n')
}

/**
 * Posts a short message to a Slack incoming webhook when the gate failed. Returns true when a
 * message was sent. Never throws: a failed notification must not change the gate result.
 */
export async function notifyGateFailure(gate: GateResult, options: SlackOptions = {}): Promise<boolean> {
  const url = options.webhookUrl ?? process.env[SLACK_WEBHOOK_ENV]
  if (gate.passed || !url) return false
  try {
    if (new URL(url).protocol !== 'https:') return false
    const response = await (options.fetchImpl ?? fetch)(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({text: slackMessage(gate, options.storyId)}),
      signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
    })
    return response.ok
  } catch {
    return false
  }
}
