/**
 * Stdio MCP server exposing guardian_scan, guardian_gate and guardian_brief. Each tool calls the
 * core functions directly (not the CLI) and returns the same JSON the CLI prints with --json.
 * Nothing may be written to stdout except MCP messages.
 */
import {existsSync, statSync} from 'node:fs'
import {isAbsolute} from 'node:path'

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {z} from 'zod'

import {generateBrief} from '../brief/index.js'
import type {CopadoClient} from '../copado/client.js'
import {GuardianError, UsageError} from '../core/errors.js'
import {runGate} from '../core/gate.js'
import {toJson} from '../core/reporters/json.js'
import {scan} from '../core/scanner.js'
import {TOOL_NAME, TOOL_VERSION} from '../core/version.js'

export interface ServerOptions {
  /** Project folder used when a call has no `cwd`. Default: GUARDIAN_PROJECT_ROOT, AGENTIA_PROJECT_ROOT or the process folder. */
  defaultCwd?: string
  /** Copado adapter for guardian_brief. Default: the real adapter. */
  client?: CopadoClient
}

const scanInput = {
  cwd: z
    .string()
    .optional()
    .describe(
      'Absolute path of the project (any folder inside the git repository). Default: the server folder.',
    ),
  base: z
    .string()
    .min(1)
    .optional()
    .describe('Base branch to compare with. Default: baseBranch from guardian.config.yml.'),
  all: z.boolean().optional().describe('Scan every Apex and LWC file instead of only changed files.'),
  files: z
    .array(z.string().min(1))
    .optional()
    .describe('Scan only these files (paths relative to cwd), for example the files you just edited.'),
  config: z
    .string()
    .min(1)
    .optional()
    .describe('Path to a config file. Default: guardian.config.yml in the repository root.'),
}

const gateInput = {
  ...scanInput,
  storyId: z
    .string()
    .min(1)
    .optional()
    .describe('User story ID or name for the audit log, for example US-0001.'),
}

const briefInput = {
  cwd: scanInput.cwd,
  base: scanInput.base,
  config: scanInput.config,
  storyId: z.string().min(1).describe('User story ID or name, for example US-0001.'),
  testResults: z.string().min(1).optional().describe('Path to the JSON output of "sf apex run test --json".'),
  ai: z.boolean().optional().describe('Ask the Copado AI release agent for the summary. Default true.'),
  attach: z.boolean().optional().describe('Also write the brief to the user story in Copado. Default false.'),
  out: z.string().min(1).optional().describe('Output file. Default: .guardian/briefs/<story>.md.'),
}

type ToolResult = {content: {type: 'text'; text: string}[]; isError?: boolean}

function jsonResult(value: unknown): ToolResult {
  return {content: [{type: 'text', text: JSON.stringify(value, null, 2)}]}
}

function errorResult(error: unknown): ToolResult {
  if (error instanceof GuardianError) {
    return {
      ...jsonResult({error: {name: error.name, message: error.message, exitCode: error.exitCode}}),
      isError: true,
    }
  }
  return {
    ...jsonResult({error: {name: 'Error', message: (error as Error).message ?? String(error)}}),
    isError: true,
  }
}

function resolveCwd(cwd: string | undefined, fallback: string): string {
  const dir = cwd ?? fallback
  if (!isAbsolute(dir)) throw new UsageError(`cwd must be an absolute path: ${dir}`)
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new UsageError(`cwd is not a folder: ${dir}`)
  return dir
}

async function safely(run: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return jsonResult(await run())
  } catch (error) {
    return errorResult(error)
  }
}

export function createGuardianServer(options: ServerOptions = {}): McpServer {
  const defaultCwd =
    options.defaultCwd ??
    process.env.GUARDIAN_PROJECT_ROOT ??
    process.env.AGENTIA_PROJECT_ROOT ??
    process.cwd()
  const server = new McpServer({name: TOOL_NAME, version: TOOL_VERSION})

  server.registerTool(
    'guardian_scan',
    {
      title: 'Scan Apex and LWC',
      description:
        'Scan changed Apex classes, triggers and Lightning web components for governor-limit, security and testing risks. ' +
        'Run it after writing or editing Apex or LWC. Returns findings with rule ID, severity, file, line, explanation and suggested fix.',
      inputSchema: scanInput,
      annotations: {readOnlyHint: true, openWorldHint: false},
    },
    async (args) =>
      safely(async () => {
        const outcome = await scan({
          cwd: resolveCwd(args.cwd, defaultCwd),
          base: args.base,
          all: args.all,
          files: args.files,
          configPath: args.config,
        })
        return toJson(outcome.result)
      }),
  )

  server.registerTool(
    'guardian_gate',
    {
      title: 'Apex and LWC quality gate',
      description:
        'Run the Guardian quality gate: the same scan plus the thresholds from guardian.config.yml. ' +
        'gate.passed must be true before submitting work (agentia cicd work submit). Appends a line to the audit log.',
      inputSchema: gateInput,
      annotations: {readOnlyHint: false, openWorldHint: false},
    },
    async (args) =>
      safely(async () => {
        const outcome = await runGate({
          cwd: resolveCwd(args.cwd, defaultCwd),
          base: args.base,
          all: args.all,
          files: args.files,
          configPath: args.config,
          storyId: args.storyId,
        })
        return toJson(outcome.gate, outcome.config.thresholds)
      }),
  )

  server.registerTool(
    'guardian_brief',
    {
      title: 'Release brief',
      description:
        'Write a Markdown release brief for a user story (summary, changed components, findings, test status, rollback plan, gate result) ' +
        'to a local file, and optionally attach it to the user story in Copado.',
      inputSchema: briefInput,
      annotations: {readOnlyHint: false, openWorldHint: true},
    },
    async (args) =>
      safely(async () => {
        const outcome = await generateBrief({
          cwd: resolveCwd(args.cwd, defaultCwd),
          storyId: args.storyId,
          base: args.base,
          configPath: args.config,
          testResultsPath: args.testResults,
          ai: args.ai,
          attach: args.attach,
          out: args.out,
          client: options.client,
        })
        return {
          path: outcome.path,
          summarySource: outcome.summarySource,
          attached: outcome.attached,
          warnings: outcome.warnings,
          gate: {
            passed: outcome.gate.passed,
            riskScore: outcome.gate.riskScore,
            blockingCount: outcome.gate.blockingCount,
          },
          markdown: outcome.markdown,
        }
      }),
  )

  return server
}

/** Entry point of the `guardian-mcp` bin. */
export async function main(): Promise<void> {
  const server = createGuardianServer()
  await server.connect(new StdioServerTransport())
}
