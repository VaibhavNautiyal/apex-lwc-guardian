/**
 * Local web dashboard for Guardian. Serves the static page in `ui/` and a small JSON API that calls
 * the core functions directly (not the CLI), like the MCP server. Listens on 127.0.0.1 only.
 *
 * Requests that change files (gate, brief) must be POSTed as application/json, which browsers only
 * send cross-origin after a CORS preflight this server never answers, and the Host header must be
 * localhost, so other web pages cannot drive the dashboard.
 */
import {existsSync, readFileSync, statSync} from 'node:fs'
import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import {isAbsolute, join, relative, resolve, sep} from 'node:path'
import {fileURLToPath} from 'node:url'

import {generateBrief} from '../brief/index.js'
import type {CopadoClient} from '../copado/client.js'
import {languageOf} from '../core/changed-files.js'
import {loadConfig} from '../core/config.js'
import {GuardianError, UsageError} from '../core/errors.js'
import {runGate} from '../core/gate.js'
import {git, repoRoot} from '../core/git.js'
import {toJson} from '../core/reporters/json.js'
import {scan} from '../core/scanner.js'
import {TOOL_NAME, TOOL_VERSION} from '../core/version.js'
import {allRules} from '../lang/index.js'

export interface UiServerOptions {
  /** Project folder shown when the page opens. Default: GUARDIAN_PROJECT_ROOT, AGENTIA_PROJECT_ROOT or the process folder. */
  defaultCwd?: string
  /** Copado adapter for briefs. Default: the real adapter. */
  client?: CopadoClient
  /** Folder holding index.html, app.js and styles.css. Default: `ui/` in the package. */
  staticDir?: string
}

const STATIC_FILES: Record<string, {file: string; type: string}> = {
  '/': {file: 'index.html', type: 'text/html; charset=utf-8'},
  '/app.js': {file: 'app.js', type: 'text/javascript; charset=utf-8'},
  '/styles.css': {file: 'styles.css', type: 'text/css; charset=utf-8'},
}

const MAX_BODY_BYTES = 1_000_000
const AUDIT_LIMIT = 200
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

interface ScanBody {
  cwd?: string
  base?: string
  all?: boolean
  files?: string[]
  config?: string
  storyId?: string
  testResults?: string
  ai?: boolean
  attach?: boolean
}

function send(res: ServerResponse, status: number, body: string, type: string): void {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
  })
  res.end(body)
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  send(res, status, JSON.stringify(value), 'application/json; charset=utf-8')
}

function errorJson(error: unknown): {error: {name: string; message: string; exitCode?: number}} {
  if (error instanceof GuardianError) {
    return {error: {name: error.name, message: error.message, exitCode: error.exitCode}}
  }
  return {error: {name: 'Error', message: (error as Error).message ?? String(error)}}
}

async function readBody(req: IncomingMessage): Promise<ScanBody> {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
    throw new HttpError(415, 'Send requests as application/json.')
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request body is too large.')
    chunks.push(chunk as Buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    const value: unknown = text ? JSON.parse(text) : {}
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error()
    return value as ScanBody
  } catch {
    throw new HttpError(400, 'Request body is not a JSON object.')
  }
}

function resolveCwd(cwd: string | undefined, fallback: string): string {
  const dir = cwd?.trim() || fallback
  if (!isAbsolute(dir)) throw new UsageError(`Project folder must be an absolute path: ${dir}`)
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new UsageError(`Not a folder: ${dir}`)
  return dir
}

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

function fileList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const files = value
    .filter((f): f is string => typeof f === 'string' && f.trim() !== '')
    .map((f) => f.trim())
  return files.length ? files : undefined
}

async function project(cwd: string): Promise<unknown> {
  const gitRoot = await repoRoot(cwd)
  const root = gitRoot ?? cwd
  const loaded = loadConfig(root, {cwd, knownRuleIds: allRules.map((r) => r.id)})
  const branch = gitRoot ? await git(['rev-parse', '--abbrev-ref', 'HEAD'], root) : null
  return {
    cwd,
    root,
    isGitRepository: gitRoot !== null,
    branch: branch?.ok ? branch.stdout.trim() : null,
    configPath: loaded.path,
    config: loaded.config,
    rules: allRules.map((r) => {
      const override = loaded.config.rules[r.id]
      return {
        id: r.id,
        title: r.title,
        language: r.language,
        defaultSeverity: r.defaultSeverity,
        severity: override?.severity ?? r.defaultSeverity,
        enabled: override?.enabled !== false,
      }
    }),
  }
}

async function audit(cwd: string): Promise<unknown> {
  const root = (await repoRoot(cwd)) ?? cwd
  const {config} = loadConfig(root, {cwd, knownRuleIds: allRules.map((r) => r.id)})
  const path = isAbsolute(config.audit.path) ? config.audit.path : join(root, config.audit.path)
  if (!existsSync(path)) return {path, entries: []}
  const entries = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as unknown]
      } catch {
        return []
      }
    })
  return {path, entries: entries.slice(-AUDIT_LIMIT)}
}

/** Returns a scannable source file inside the repository. Other paths are refused. */
async function source(cwd: string, file: string | undefined): Promise<unknown> {
  if (!file) throw new UsageError('file is required.')
  const root = (await repoRoot(cwd)) ?? cwd
  const path = resolve(root, file)
  const rel = relative(root, path)
  if (rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes('..')) {
    throw new UsageError(`File is outside the project: ${file}`)
  }
  if (!languageOf(rel.split(sep).join('/'))) throw new UsageError(`Not an Apex or LWC file: ${file}`)
  if (!existsSync(path) || !statSync(path).isFile()) throw new UsageError(`File not found: ${file}`)
  return {file: rel.split(sep).join('/'), content: readFileSync(path, 'utf8')}
}

export function createUiServer(options: UiServerOptions = {}): Server {
  const defaultCwd =
    options.defaultCwd ??
    process.env.GUARDIAN_PROJECT_ROOT ??
    process.env.AGENTIA_PROJECT_ROOT ??
    process.cwd()
  const staticDir = options.staticDir ?? fileURLToPath(new URL('../../ui/', import.meta.url))

  async function api(req: IncomingMessage, url: URL): Promise<unknown> {
    const route = `${req.method} ${url.pathname}`
    if (route === 'GET /api/info') {
      return {tool: {name: TOOL_NAME, version: TOOL_VERSION}, defaultCwd}
    }
    if (route === 'GET /api/project')
      return project(resolveCwd(url.searchParams.get('cwd') ?? undefined, defaultCwd))
    if (route === 'GET /api/audit')
      return audit(resolveCwd(url.searchParams.get('cwd') ?? undefined, defaultCwd))
    if (route === 'GET /api/source') {
      return source(
        resolveCwd(url.searchParams.get('cwd') ?? undefined, defaultCwd),
        optionalString(url.searchParams.get('file')),
      )
    }
    if (req.method !== 'POST') throw new HttpError(404, `Not found: ${url.pathname}`)

    const body = await readBody(req)
    const request = {
      cwd: resolveCwd(optionalString(body.cwd), defaultCwd),
      base: optionalString(body.base),
      all: body.all === true,
      files: fileList(body.files),
      configPath: optionalString(body.config),
    }
    if (url.pathname === '/api/scan') {
      const outcome = await scan(request)
      return {result: toJson(outcome.result), files: outcome.files, configPath: outcome.configPath}
    }
    if (url.pathname === '/api/gate') {
      const outcome = await runGate({...request, storyId: optionalString(body.storyId)})
      return {
        result: toJson(outcome.gate, outcome.config.thresholds),
        files: outcome.files,
        configPath: outcome.configPath,
        auditPath: outcome.auditPath,
        auditError: outcome.auditError,
        slackNotified: outcome.slackNotified,
      }
    }
    if (url.pathname === '/api/brief') {
      const storyId = optionalString(body.storyId)
      if (!storyId) throw new UsageError('Enter a user story ID to write a brief.')
      const outcome = await generateBrief({
        cwd: request.cwd,
        storyId,
        base: request.base,
        configPath: request.configPath,
        testResultsPath: optionalString(body.testResults),
        ai: body.ai === true,
        attach: body.attach === true,
        client: options.client,
      })
      return {
        path: outcome.path,
        markdown: outcome.markdown,
        summarySource: outcome.summarySource,
        attached: outcome.attached,
        warnings: outcome.warnings,
        gate: {
          passed: outcome.gate.passed,
          riskScore: outcome.gate.riskScore,
          blockingCount: outcome.gate.blockingCount,
        },
      }
    }
    throw new HttpError(404, `Not found: ${url.pathname}`)
  }

  return createServer((req, res) => {
    const host = (req.headers.host ?? '').replace(/:\d+$/, '')
    if (!LOCAL_HOSTS.has(host)) {
      sendJson(res, 403, {error: {name: 'Forbidden', message: 'The dashboard only answers on localhost.'}})
      return
    }
    const url = new URL(req.url ?? '/', 'http://localhost')

    if (!url.pathname.startsWith('/api/')) {
      const asset = req.method === 'GET' ? STATIC_FILES[url.pathname] : undefined
      if (!asset) {
        send(res, 404, 'Not found', 'text/plain; charset=utf-8')
        return
      }
      try {
        send(res, 200, readFileSync(join(staticDir, asset.file), 'utf8'), asset.type)
      } catch (error) {
        send(
          res,
          500,
          `Could not read ${asset.file}: ${(error as Error).message}`,
          'text/plain; charset=utf-8',
        )
      }
      return
    }

    api(req, url).then(
      (value) => sendJson(res, 200, value),
      (error: unknown) => {
        if (error instanceof HttpError) {
          sendJson(res, error.status, {error: {name: 'HttpError', message: error.message}})
        } else {
          sendJson(res, error instanceof GuardianError ? 422 : 500, errorJson(error))
        }
      },
    )
  })
}

export interface StartedUi {
  server: Server
  url: string
}

/** Starts the dashboard on 127.0.0.1. Port 0 picks a free port. */
export function startUi(port: number, options: UiServerOptions = {}): Promise<StartedUi> {
  const server = createUiServer(options)
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject)
      const address = server.address()
      const actual = typeof address === 'object' && address ? address.port : port
      resolvePromise({server, url: `http://localhost:${actual}/`})
    })
  })
}
