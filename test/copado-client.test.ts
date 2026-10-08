import {describe, expect, it, vi} from 'vitest'

import {
  type AgentiaRunner,
  createCopadoClient,
  findTechnicalSpecifications,
  GUARDIAN_END,
  GUARDIAN_START,
  mergeGuardianSection,
  parseEnvelope,
  resolveAgentiaCommand,
  type RunResult,
} from '../src/copado/client.js'

const ok = (result: unknown): RunResult => ({
  exitCode: 0,
  stdout: JSON.stringify({result, status: 0, transactionId: 't'}),
  stderr: '',
  timedOut: false,
})
const fail = (message: string): RunResult => ({
  exitCode: 1,
  stdout: JSON.stringify({error: {message, name: 'Error'}, transactionId: 't'}),
  stderr: '',
  timedOut: false,
})

/** A fake runner that answers by command and records every call. */
function fakeRunner(answers: Record<string, RunResult | Error>): AgentiaRunner & {calls: string[][]} {
  const calls: string[][] = []
  const runner = vi.fn(async (args: string[]) => {
    calls.push(args)
    const key = Object.keys(answers).find((k) => args.join(' ').startsWith(k))
    const answer = key ? answers[key] : fail(`unexpected: ${args.join(' ')}`)
    if (answer instanceof Error) throw answer
    return answer
  })
  return Object.assign(runner, {calls})
}

describe('parseEnvelope', () => {
  it('returns the result of a successful call', () => {
    expect(parseEnvelope(ok({content: 'hi'}))).toEqual({result: {content: 'hi'}})
  })

  it('returns the error message of a failed call', () => {
    expect(parseEnvelope(fail('CICD API key is not configured.'))).toEqual({
      error: 'CICD API key is not configured.',
    })
  })

  it('handles timeouts, non-JSON output and non-zero exits without JSON', () => {
    expect(parseEnvelope({exitCode: null, stdout: '', stderr: '', timedOut: true})).toEqual({
      error: 'timed out',
    })
    expect(parseEnvelope({exitCode: 0, stdout: 'hello', stderr: '', timedOut: false})).toEqual({
      error: 'no JSON result in Agentia output',
    })
    expect(
      parseEnvelope({exitCode: 2, stdout: '', stderr: ' »   Error: bad flag\n', timedOut: false}),
    ).toEqual({
      error: 'Error: bad flag',
    })
  })
})

describe('askReleaseAgent', () => {
  it('calls the release agent with an argument array and returns result.content', async () => {
    const runner = fakeRunner({'ai agent ask': ok({agent: 'release', content: '  Looks safe.  '})})
    const client = createCopadoClient({runner, aiTimeoutMs: 30_000})
    expect(await client.askReleaseAgent('Summarise', {storyId: 'US-0001'})).toBe('Looks safe.')
    expect(runner.calls[0]).toEqual([
      'ai',
      'agent',
      'ask',
      '--agent',
      'release',
      '--json',
      '--no-stream',
      '--no-credential-sync',
      '--timeout',
      '30',
      '--prompt',
      'Summarise',
      '--user-story',
      'US-0001',
    ])
    expect(runner).toHaveBeenCalledWith(expect.any(Array), 40_000)
  })

  it('returns null and logs when the agent fails, times out, answers empty or the runner throws', async () => {
    for (const answer of [
      fail('AI PAK is not configured.'),
      {exitCode: null, stdout: '', stderr: '', timedOut: true},
      ok({content: '   '}),
      new Error('spawn failed'),
    ]) {
      const log = vi.fn()
      const client = createCopadoClient({runner: fakeRunner({'ai agent ask': answer}), log})
      expect(await client.askReleaseAgent('x')).toBeNull()
      if (!(answer instanceof Error) && answer.exitCode === 0) continue
      expect(log).toHaveBeenCalledWith(expect.stringMatching(/release agent unavailable/))
    }
  })
})

describe('attachBriefToStory', () => {
  const brief = '# Release brief: US-0001\n\nAll good.'

  it('keeps existing Technical Specifications and appends a marked Guardian section', async () => {
    const runner = fakeRunner({
      'cicd work get US-0001': ok({name: 'US-0001', technicalSpecifications: 'Use the new API.'}),
      'cicd work update US-0001': ok({id: 'a0X'}),
    })
    expect(await createCopadoClient({runner}).attachBriefToStory('US-0001', brief)).toBe(true)
    const update = runner.calls[1]
    expect(update.slice(0, 5)).toEqual(['cicd', 'work', 'update', 'US-0001', '--technical-specifications'])
    expect(update[5]).toBe(`Use the new API.\n\n${GUARDIAN_START}\n${brief}\n${GUARDIAN_END}`)
    expect(update[6]).toBe('--json')
  })

  it('replaces an earlier Guardian section instead of adding a second one', async () => {
    const existing = `Intro\n\n${GUARDIAN_START}\nold brief\n${GUARDIAN_END}\n\nOutro`
    const runner = fakeRunner({
      'cicd work get': ok({copado__Technical_Specifications__c: existing}),
      'cicd work update': ok({}),
    })
    expect(await createCopadoClient({runner}).attachBriefToStory('US-0001', brief)).toBe(true)
    expect(runner.calls[1][5]).toBe(`Intro\n\n${GUARDIAN_START}\n${brief}\n${GUARDIAN_END}\n\nOutro`)
  })

  it('treats an empty field as empty text', async () => {
    const runner = fakeRunner({
      'cicd work get': ok({technicalSpecifications: null}),
      'cicd work update': ok({}),
    })
    expect(await createCopadoClient({runner}).attachBriefToStory('US-0001', brief)).toBe(true)
    expect(runner.calls[1][5]).toBe(`${GUARDIAN_START}\n${brief}\n${GUARDIAN_END}`)
  })

  it('does not write when the story cannot be read or the field is missing', async () => {
    for (const get of [
      fail('CICD API key is not configured.'),
      ok({name: 'US-0001', title: 'No spec field'}),
    ]) {
      const log = vi.fn()
      const runner = fakeRunner({'cicd work get': get, 'cicd work update': ok({})})
      expect(await createCopadoClient({runner, log}).attachBriefToStory('US-0001', brief)).toBe(false)
      expect(runner.calls).toHaveLength(1)
      expect(log).toHaveBeenCalledOnce()
    }
  })

  it('returns false when the update fails or the runner throws', async () => {
    const failing = fakeRunner({
      'cicd work get': ok({technicalSpecifications: ''}),
      'cicd work update': fail('nope'),
    })
    expect(await createCopadoClient({runner: failing}).attachBriefToStory('US-0001', brief)).toBe(false)
    const throwing = fakeRunner({'cicd work get': new Error('boom')})
    expect(await createCopadoClient({runner: throwing}).attachBriefToStory('US-0001', brief)).toBe(false)
  })
})

describe('helpers', () => {
  it('finds the Technical Specifications field under common names', () => {
    expect(findTechnicalSpecifications({technicalSpecifications: 'a'})).toEqual({
      key: 'technicalSpecifications',
      value: 'a',
    })
    expect(findTechnicalSpecifications({copado__Technical_Specifications__c: 'b'})?.value).toBe('b')
    expect(findTechnicalSpecifications({functionalRequirements: 'c'})).toBeNull()
    expect(findTechnicalSpecifications(null)).toBeNull()
  })

  it('truncates the Guardian section to fit the field limit and keeps other text', () => {
    const merged = mergeGuardianSection('Keep me.', 'x'.repeat(5000), 1000)!
    expect(merged.length).toBeLessThanOrEqual(1000)
    expect(merged.startsWith('Keep me.\n\n')).toBe(true)
    expect(merged).toContain('Truncated')
    expect(merged.endsWith(GUARDIAN_END)).toBe(true)
    expect(mergeGuardianSection('y'.repeat(990), 'brief', 1000)).toBeNull()
  })

  it('honours AGENTIA_BIN', () => {
    expect(resolveAgentiaCommand({AGENTIA_BIN: '/opt/agentia/bin/run.js'})).toEqual({
      file: process.execPath,
      prefix: ['/opt/agentia/bin/run.js'],
    })
    expect(resolveAgentiaCommand({AGENTIA_BIN: '/usr/local/bin/agentia'})).toEqual({
      file: '/usr/local/bin/agentia',
      prefix: [],
    })
  })
})
