/**
 * The ONLY place that runs the Agentia CLI. Commands and flags are recorded in
 * docs/agentia-notes.md; if Agentia changes, update that file and then this one.
 *
 * Every call spawns `agentia` with an argument array (never a shell string), enforces a timeout,
 * parses the `--json` envelope `{result} | {error}`, and never throws: failures return null/false
 * and are reported through `log`.
 */
import {spawn} from 'node:child_process'
import {existsSync} from 'node:fs'
import {delimiter, join} from 'node:path'

export interface RunResult {
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

/** Runs `agentia <args>`. Injected in tests so that no process or network is used. */
export type AgentiaRunner = (args: string[], timeoutMs: number) => Promise<RunResult>

export interface CopadoClient {
  /** Asks the Copado `release` agent. Returns the answer text, or null when unavailable. */
  askReleaseAgent(prompt: string, options?: {storyId?: string}): Promise<string | null>
  /** Writes the brief into the story's Technical Specifications field. Returns true on success. */
  attachBriefToStory(storyId: string, markdown: string): Promise<boolean>
}

export interface CopadoClientOptions {
  runner?: AgentiaRunner
  /** Timeout for AI calls. Default 120 s. */
  aiTimeoutMs?: number
  /** Timeout for work item calls. Default 60 s. */
  workTimeoutMs?: number
  /** Receives warnings, for example why an attach was skipped. */
  log?: (message: string) => void
}

/** Maximum length of `--technical-specifications` (from `agentia cicd work update --help`). */
export const TECH_SPEC_MAX = 30000
/** Windows limits a whole command line to 32,767 characters, so keep a margin for paths and quoting. */
const TECH_SPEC_BUDGET = process.platform === 'win32' ? 28000 : TECH_SPEC_MAX
const PROMPT_MAX = 8000

export const GUARDIAN_START = '<!-- guardian:start -->'
export const GUARDIAN_END = '<!-- guardian:end -->'

/**
 * How to start Agentia without a shell. `AGENTIA_BIN` overrides it: a `.js` file runs with this
 * Node, anything else is executed directly. On Windows the global `agentia` is an npm `.cmd` shim,
 * which cannot be spawned without a shell, so the CLI's `bin/run.js` next to it is used instead.
 */
export function resolveAgentiaCommand(
  env: NodeJS.ProcessEnv = process.env,
): {file: string; prefix: string[]} | null {
  const override = env.AGENTIA_BIN
  if (override)
    return override.endsWith('.js')
      ? {file: process.execPath, prefix: [override]}
      : {file: override, prefix: []}
  if (process.platform !== 'win32') return {file: 'agentia', prefix: []}
  for (const dir of (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean)) {
    if (!existsSync(join(dir, 'agentia.cmd'))) continue
    const runJs = join(dir, 'node_modules', '@copado', 'agentia-cli', 'bin', 'run.js')
    if (existsSync(runJs)) return {file: process.execPath, prefix: [runJs]}
  }
  return null
}

export const spawnAgentia: AgentiaRunner = (args, timeoutMs) =>
  new Promise((resolve) => {
    const command = resolveAgentiaCommand()
    if (!command) {
      resolve({
        exitCode: null,
        stdout: '',
        stderr: 'agentia CLI not found on PATH (set AGENTIA_BIN).',
        timedOut: false,
      })
      return
    }
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const child = spawn(command.file, [...command.prefix, ...args], {shell: false, windowsHide: true})
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()))
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({exitCode: null, stdout, stderr: stderr + error.message, timedOut})
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({exitCode: code, stdout, stderr, timedOut})
    })
  })

/** Parses Agentia's `--json` envelope. Returns `result`, or an error message. */
export function parseEnvelope(run: RunResult): {result: unknown} | {error: string} {
  if (run.timedOut) return {error: 'timed out'}
  let json: {result?: unknown; error?: {message?: string}} | undefined
  const text = run.stdout.trim()
  try {
    json = JSON.parse(text.slice(Math.max(0, text.indexOf('{'))))
  } catch {
    json = undefined
  }
  if (json?.error) return {error: json.error.message ?? 'unknown Agentia error'}
  if (run.exitCode !== 0) return {error: lastLine(run.stderr) || `exit code ${run.exitCode}`}
  if (!json || !('result' in json)) return {error: 'no JSON result in Agentia output'}
  return {result: json.result}
}

function lastLine(text: string): string {
  return (
    text
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .at(-1)
      ?.replace(/^\s*»\s*/, '') ?? ''
  )
}

/** Finds the Technical Specifications value in a `work get` result. Null when the field is absent. */
export function findTechnicalSpecifications(result: unknown): {key: string; value: string} | null {
  if (!result || typeof result !== 'object') return null
  for (const [key, value] of Object.entries(result)) {
    if (/technical_?specifications?/i.test(key.replace(/^copado__/i, '').replace(/__c$/i, ''))) {
      return {key, value: typeof value === 'string' ? value : ''}
    }
  }
  return null
}

/**
 * Replaces the Guardian section in `existing`, or appends one. Text outside the markers is kept.
 * Returns null when the result cannot fit in `limit` characters.
 */
export function mergeGuardianSection(
  existing: string,
  markdown: string,
  limit = TECH_SPEC_BUDGET,
): string | null {
  const start = existing.indexOf(GUARDIAN_START)
  const end = existing.indexOf(GUARDIAN_END, start)
  const [before, after] =
    start !== -1 && end !== -1
      ? [existing.slice(0, start), existing.slice(end + GUARDIAN_END.length)]
      : [existing.trimEnd() ? existing.trimEnd() + '\n\n' : '', '']
  const wrap = (body: string): string => `${before}${GUARDIAN_START}\n${body}\n${GUARDIAN_END}${after}`
  const full = wrap(markdown.trim())
  if (full.length <= limit) return full
  const note = '\n\n_Truncated. The full brief is in the local file._'
  const room = limit - wrap('').length - note.length
  if (room < 200) return null
  return wrap(markdown.trim().slice(0, room).trimEnd() + note)
}

export function createCopadoClient(options: CopadoClientOptions = {}): CopadoClient {
  const run = options.runner ?? spawnAgentia
  const aiTimeoutMs = options.aiTimeoutMs ?? 120_000
  const workTimeoutMs = options.workTimeoutMs ?? 60_000
  const log = options.log ?? (() => {})

  return {
    async askReleaseAgent(prompt, opts = {}) {
      const args = [
        'ai',
        'agent',
        'ask',
        '--agent',
        'release',
        '--json',
        '--no-stream',
        '--no-credential-sync',
        '--timeout',
        String(Math.ceil(aiTimeoutMs / 1000)),
        '--prompt',
        prompt.slice(0, PROMPT_MAX),
        ...(opts.storyId ? ['--user-story', opts.storyId] : []),
      ]
      try {
        // Give the gateway its own timeout first, then stop the process 10 s later.
        const parsed = parseEnvelope(await run(args, aiTimeoutMs + 10_000))
        if ('error' in parsed) {
          log(`Copado AI release agent unavailable: ${parsed.error}`)
          return null
        }
        const content = (parsed.result as {content?: unknown} | null)?.content
        return typeof content === 'string' && content.trim() ? content.trim() : null
      } catch (error) {
        log(`Copado AI release agent unavailable: ${(error as Error).message}`)
        return null
      }
    },

    async attachBriefToStory(storyId, markdown) {
      try {
        const got = parseEnvelope(await run(['cicd', 'work', 'get', storyId, '--json'], workTimeoutMs))
        if ('error' in got) {
          log(`Could not read user story ${storyId}: ${got.error}`)
          return false
        }
        const field = findTechnicalSpecifications(got.result)
        if (!field) {
          log(
            `User story ${storyId} has no Technical Specifications field in "work get" output; not writing, to avoid overwriting existing content.`,
          )
          return false
        }
        const merged = mergeGuardianSection(field.value, markdown)
        if (merged === null) {
          log(`Technical Specifications of ${storyId} is too full to add the brief.`)
          return false
        }
        const updated = parseEnvelope(
          await run(
            ['cicd', 'work', 'update', storyId, '--technical-specifications', merged, '--json'],
            workTimeoutMs,
          ),
        )
        if ('error' in updated) {
          log(`Could not update user story ${storyId}: ${updated.error}`)
          return false
        }
        return true
      } catch (error) {
        log(`Could not attach the brief to ${storyId}: ${(error as Error).message}`)
        return false
      }
    },
  }
}
