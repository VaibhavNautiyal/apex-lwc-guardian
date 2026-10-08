import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js'
import {afterEach, describe, expect, it, vi} from 'vitest'

import GuardianGate from '../src/commands/guardian/gate.js'
import type {CopadoClient} from '../src/copado/client.js'
import {ScanJsonSchema} from '../src/core/reporters/json.js'
import {createGuardianServer} from '../src/mcp/server.js'
import {createSampleRepo, runCommand, type SampleRepo} from './repo.js'

async function connect(defaultCwd: string, client?: CopadoClient): Promise<Client> {
  const server = createGuardianServer({defaultCwd, client})
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const mcp = new Client({name: 'guardian-test', version: '1.0.0'})
  await mcp.connect(clientTransport)
  return mcp
}

function textOf(result: unknown): string {
  return (result as {content: {type: string; text: string}[]}).content[0].text
}

describe('MCP server', () => {
  let repo: SampleRepo | undefined
  afterEach(() => repo?.cleanup())

  it('lists the three Guardian tools with input schemas', async () => {
    const mcp = await connect(process.cwd())
    const {tools} = await mcp.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['guardian_brief', 'guardian_gate', 'guardian_scan'])
    const brief = tools.find((t) => t.name === 'guardian_brief')!
    expect(brief.inputSchema.required).toEqual(['storyId'])
    await mcp.close()
  })

  it('guardian_gate returns the same result as the CLI for the same input', async () => {
    repo = createSampleRepo()
    const mcp = await connect(repo.dir)
    const viaMcp = await mcp.callTool({name: 'guardian_gate', arguments: {storyId: 'US-0001'}})
    expect(viaMcp.isError).toBeFalsy()
    const cli = await runCommand(GuardianGate, ['--story', 'US-0001', '--json'], repo.dir)
    expect(cli.code).toBe(1)
    const fromMcp = ScanJsonSchema.parse(JSON.parse(textOf(viaMcp)))
    expect(fromMcp).toEqual(ScanJsonSchema.parse(JSON.parse(cli.stdout)))
    expect(fromMcp.gate?.passed).toBe(false)
    await mcp.close()
  })

  it('guardian_scan supports files and an explicit cwd', async () => {
    repo = createSampleRepo()
    const mcp = await connect(process.cwd())
    const result = await mcp.callTool({
      name: 'guardian_scan',
      arguments: {cwd: repo.dir, files: ['force-app/main/default/classes/SharingBad.cls']},
    })
    const json = ScanJsonSchema.parse(JSON.parse(textOf(result)))
    expect(json.findings.map((f) => [f.ruleId, f.line])).toEqual([['APEX004', 1]])
    await mcp.close()
  })

  it('returns structured errors instead of failing', async () => {
    repo = createSampleRepo({classes: ['SharingBad.cls']})
    const mcp = await connect(repo.dir)
    const missingBase = await mcp.callTool({name: 'guardian_gate', arguments: {base: 'develop'}})
    expect(missingBase.isError).toBe(true)
    expect(JSON.parse(textOf(missingBase))).toMatchObject({error: {name: 'EnvironmentError', exitCode: 3}})
    const relative = await mcp.callTool({name: 'guardian_scan', arguments: {cwd: 'relative/path'}})
    expect(JSON.parse(textOf(relative))).toMatchObject({error: {name: 'UsageError', exitCode: 2}})
    const invalid = await mcp.callTool({name: 'guardian_brief', arguments: {}})
    expect(invalid.isError).toBe(true)
    await mcp.close()
  })

  it('guardian_brief writes the brief through the injected adapter', async () => {
    repo = createSampleRepo({classes: ['SharingGood.cls']})
    const client: CopadoClient = {
      askReleaseAgent: vi.fn(async () => 'Low risk change.'),
      attachBriefToStory: vi.fn(async () => false),
    }
    const mcp = await connect(repo.dir, client)
    const result = await mcp.callTool({name: 'guardian_brief', arguments: {storyId: 'US-0001', attach: true}})
    const json = JSON.parse(textOf(result))
    expect(json).toMatchObject({summarySource: 'ai', attached: false, gate: {passed: true}})
    expect(json.markdown).toContain('Low risk change.')
    expect(existsSync(json.path)).toBe(true)
    expect(json.path).toBe(join(repo.dir, '.guardian', 'briefs', 'US-0001.md'))
    await mcp.close()
  })
})
