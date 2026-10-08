import {afterEach, describe, expect, it, vi} from 'vitest'

import {runGate} from '../src/core/gate.js'
import type {Finding, GateResult} from '../src/core/types.js'
import {notifyGateFailure, slackMessage} from '../src/notify/slack.js'
import {createSampleRepo, type SampleRepo} from './repo.js'

const finding = (ruleId: string, severity: Finding['severity'], line: number): Finding => ({
  ruleId,
  severity,
  file: 'force-app/main/default/classes/A.cls',
  line,
  message: `${ruleId} message.`,
  explanation: 'e',
  suggestion: 's',
})

const failed: GateResult = {
  filesScanned: 1,
  findings: [
    finding('LWC005', 'info', 1),
    finding('APEX004', 'warning', 2),
    finding('APEX001', 'error', 9),
    finding('APEX002', 'error', 12),
  ],
  riskScore: 24,
  baseRef: 'main',
  headRef: 'HEAD',
  baseSha: null,
  headSha: null,
  passed: false,
  blockingCount: 2,
}

const okResponse = () => vi.fn(async () => new Response('ok', {status: 200}))

describe('Slack notification', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('lists the story, risk score and the 3 most severe findings', () => {
    expect(slackMessage(failed, 'US-0001')).toBe(
      [
        ':no_entry: Guardian gate failed for US-0001: risk score 24/100, 2 blocking findings.',
        '• APEX001 (error) force-app/main/default/classes/A.cls:9 APEX001 message.',
        '• APEX002 (error) force-app/main/default/classes/A.cls:12 APEX002 message.',
        '• APEX004 (warning) force-app/main/default/classes/A.cls:2 APEX004 message.',
      ].join('\n'),
    )
  })

  it('posts JSON to the webhook when the gate failed', async () => {
    const fetchImpl = okResponse()
    expect(
      await notifyGateFailure(failed, {webhookUrl: 'https://hooks.slack.test/x', fetchImpl, storyId: 'US-1'}),
    ).toBe(true)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://hooks.slack.test/x')
    expect(JSON.parse(init.body as string).text).toContain('US-1')
  })

  it('sends nothing when the gate passed, no webhook is set, or the URL is not https', async () => {
    const fetchImpl = okResponse()
    expect(
      await notifyGateFailure({...failed, passed: true}, {webhookUrl: 'https://h.test', fetchImpl}),
    ).toBe(false)
    expect(await notifyGateFailure(failed, {fetchImpl})).toBe(false)
    expect(await notifyGateFailure(failed, {webhookUrl: 'http://h.test', fetchImpl})).toBe(false)
    expect(await notifyGateFailure(failed, {webhookUrl: 'not a url', fetchImpl})).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('never throws when Slack fails', async () => {
    const throwing = vi.fn(async () => {
      throw new Error('network down')
    })
    expect(await notifyGateFailure(failed, {webhookUrl: 'https://h.test', fetchImpl: throwing})).toBe(false)
    const rejected = vi.fn(async () => new Response('no', {status: 500}))
    expect(await notifyGateFailure(failed, {webhookUrl: 'https://h.test', fetchImpl: rejected})).toBe(false)
  })

  describe('from the gate', () => {
    let repo: SampleRepo | undefined
    afterEach(() => repo?.cleanup())

    it('notifies on failure without changing the gate result, even when Slack is down', async () => {
      repo = createSampleRepo({classes: ['SoqlInLoopBad.cls']})
      vi.stubEnv('GUARDIAN_SLACK_WEBHOOK', 'https://hooks.slack.test/x')
      const fetchMock = okResponse()
      vi.stubGlobal('fetch', fetchMock)
      const sent = await runGate({cwd: repo.dir, storyId: 'US-0001'})
      expect(sent).toMatchObject({slackNotified: true, gate: {passed: false}})
      const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
      expect(body.text).not.toMatch(/SELECT|\[/)

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Promise.reject(new Error('down'))),
      )
      const down = await runGate({cwd: repo.dir, storyId: 'US-0001'})
      expect(down).toMatchObject({slackNotified: false, gate: {passed: false, blockingCount: 5}})
    })
  })
})
