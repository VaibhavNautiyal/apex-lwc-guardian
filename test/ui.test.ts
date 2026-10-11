import {existsSync} from 'node:fs'
import {request as httpRequest, type Server} from 'node:http'
import {join} from 'node:path'

import {afterEach, describe, expect, it} from 'vitest'

import type {CopadoClient} from '../src/copado/client.js'
import {ScanJsonSchema} from '../src/core/reporters/json.js'
import {startUi} from '../src/ui/server.js'
import {createSampleRepo, type SampleRepo} from './repo.js'

const CLASSES = 'force-app/main/default/classes'

describe('dashboard server', () => {
  let repo: SampleRepo | undefined
  let server: Server | undefined
  afterEach(async () => {
    await new Promise((done) => (server ? server.close(done) : done(undefined)))
    server = undefined
    repo?.cleanup()
    repo = undefined
  })

  async function start(defaultCwd: string, client?: CopadoClient): Promise<string> {
    const started = await startUi(0, {defaultCwd, client})
    server = started.server
    return started.url
  }

  const post = (url: string, body: unknown) =>
    fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})

  it('serves the page and its assets', async () => {
    const url = await start(process.cwd())
    const page = await fetch(url)
    expect(page.status).toBe(200)
    expect(page.headers.get('content-security-policy')).toContain("default-src 'self'")
    expect(await page.text()).toContain('<script type="module" src="app.js"></script>')
    expect((await fetch(`${url}app.js`)).status).toBe(200)
    expect((await fetch(`${url}styles.css`)).status).toBe(200)
    expect((await fetch(`${url}package.json`)).status).toBe(404)
  })

  it('runs the gate with the same result as the core and writes the audit log', async () => {
    repo = createSampleRepo()
    const url = await start(repo.dir)
    const response = await post(`${url}api/gate`, {storyId: 'US-0001'})
    expect(response.status).toBe(200)
    const data = (await response.json()) as {result: unknown; auditPath: string}
    const result = ScanJsonSchema.parse(data.result)
    expect(result.kind).toBe('gate')
    expect(result.gate?.passed).toBe(false)
    expect(existsSync(data.auditPath)).toBe(true)

    const audit = (await (await fetch(`${url}api/audit`)).json()) as {entries: {storyId: string}[]}
    expect(audit.entries.map((e) => e.storyId)).toEqual(['US-0001'])
  })

  it('reports the project, its branch and the effective rules', async () => {
    repo = createSampleRepo({classes: ['SharingBad.cls']})
    const url = await start(repo.dir)
    const project = (await (await fetch(`${url}api/project`)).json()) as {
      branch: string
      isGitRepository: boolean
      rules: {id: string; enabled: boolean}[]
    }
    expect(project.branch).toBe('feature/US-0001')
    expect(project.isGitRepository).toBe(true)
    expect(project.rules).toHaveLength(16)
  })

  it('returns source files inside the project only', async () => {
    repo = createSampleRepo({classes: ['SharingBad.cls']})
    const url = await start(repo.dir)
    const ok = await fetch(`${url}api/source?file=${encodeURIComponent(`${CLASSES}/SharingBad.cls`)}`)
    expect(ok.status).toBe(200)
    expect(((await ok.json()) as {content: string}).content).toContain('class')
    const outside = await fetch(`${url}api/source?file=${encodeURIComponent('../secret.cls')}`)
    expect(outside.status).toBe(422)
    const notCode = await fetch(`${url}api/source?file=sfdx-project.json`)
    expect(notCode.status).toBe(422)
  })

  it('returns structured errors with the CLI exit code', async () => {
    repo = createSampleRepo({classes: ['SharingBad.cls']})
    const url = await start(repo.dir)
    const missingBase = await post(`${url}api/scan`, {base: 'develop'})
    expect(missingBase.status).toBe(422)
    expect(await missingBase.json()).toMatchObject({error: {name: 'EnvironmentError', exitCode: 3}})
    const relative = await post(`${url}api/scan`, {cwd: 'relative/path'})
    expect(await relative.json()).toMatchObject({error: {name: 'UsageError', exitCode: 2}})
    const noStory = await post(`${url}api/brief`, {})
    expect(await noStory.json()).toMatchObject({error: {name: 'UsageError'}})
  })

  it('refuses requests other web pages could send', async () => {
    const url = await start(process.cwd())
    const plain = await fetch(`${url}api/gate`, {
      method: 'POST',
      headers: {'Content-Type': 'text/plain'},
      body: '{}',
    })
    expect(plain.status).toBe(415)
    const status = await new Promise<number>((done, fail) => {
      const req = httpRequest(`${url}api/info`, {headers: {Host: 'attacker.example'}}, (res) => {
        res.resume()
        done(res.statusCode ?? 0)
      })
      req.on('error', fail)
      req.end()
    })
    expect(status).toBe(403)
  })

  it('writes a brief through the injected adapter', async () => {
    repo = createSampleRepo({classes: ['SharingGood.cls']})
    const client: CopadoClient = {
      askReleaseAgent: async () => null,
      attachBriefToStory: async () => true,
    }
    const url = await start(repo.dir, client)
    const response = await post(`${url}api/brief`, {storyId: 'US-0001', attach: true})
    const data = (await response.json()) as {path: string; markdown: string; attached: boolean}
    expect(data.attached).toBe(true)
    expect(data.markdown).toContain('# Release brief: US-0001')
    expect(data.path).toBe(join(repo.dir, '.guardian', 'briefs', 'US-0001.md'))
    expect(existsSync(data.path)).toBe(true)
  })
})
