import {createHash} from 'node:crypto'
import {existsSync, readFileSync} from 'node:fs'
import {isAbsolute, join, resolve} from 'node:path'

import {parse as parseYaml} from 'yaml'
import {z} from 'zod'

import {UsageError} from './errors.js'
import {SEVERITIES, type Severity} from './types.js'

export const CONFIG_FILE_NAMES = ['guardian.config.yml', 'guardian.config.yaml']

const SeveritySchema = z.enum(SEVERITIES as [Severity, ...Severity[]])

const RuleOverrideSchema = z
  .object({
    severity: SeveritySchema.optional(),
    enabled: z.boolean().optional(),
  })
  .strict()

export const ConfigSchema = z
  .object({
    baseBranch: z.string().min(1).default('main'),
    include: z.array(z.string().min(1)).default(['force-app/**']),
    ignore: z.array(z.string().min(1)).default(['**/*.test.js', '**/__tests__/**', '**/node_modules/**']),
    rules: z
      .record(
        z.string().regex(/^(APEX|LWC)\d{3}$/, 'rule IDs look like APEX001 or LWC001'),
        RuleOverrideSchema,
      )
      .default({}),
    thresholds: z
      .object({
        failOn: z.enum(['error', 'warning']).default('error'),
        maxRiskScore: z.number().int().min(0).max(100).default(100),
      })
      .strict()
      .default({}),
    triggerMaxLines: z.number().int().positive().default(15),
    urlAllowList: z.array(z.string().min(1)).default([]),
    audit: z
      .object({
        enabled: z.boolean().default(true),
        path: z.string().min(1).default('.guardian/audit.jsonl'),
      })
      .strict()
      .default({}),
  })
  .strict()

export type GuardianConfig = z.infer<typeof ConfigSchema>

export interface LoadedConfig {
  config: GuardianConfig
  /** Absolute path of the file that was read, or null when defaults are used. */
  path: string | null
  /** Short hash of the effective config, recorded in the audit log. */
  hash: string
}

export function defaultConfig(): GuardianConfig {
  return ConfigSchema.parse({})
}

export function hashConfig(config: GuardianConfig): string {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 12)
}

/**
 * Parses and validates config text. `knownRuleIds`, when given, rejects overrides for rules that
 * do not exist (usually a typo).
 */
export function parseConfig(text: string, source: string, knownRuleIds?: readonly string[]): GuardianConfig {
  let raw: unknown
  try {
    raw = parseYaml(text) ?? {}
  } catch (error) {
    throw new UsageError(`Invalid YAML in ${source}: ${(error as Error).message}`)
  }
  const parsed = ConfigSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new UsageError(`Invalid config in ${source}:\n${issues}`)
  }
  if (knownRuleIds) {
    const unknown = Object.keys(parsed.data.rules).filter((id) => !knownRuleIds.includes(id))
    if (unknown.length > 0) throw new UsageError(`Unknown rule ID in ${source}: ${unknown.join(', ')}`)
  }
  return parsed.data
}

/**
 * Loads `explicitPath` (relative to `cwd`) or the first default config file in `root`. Missing
 * default files mean defaults; a missing explicit file is a usage error.
 */
export function loadConfig(
  root: string,
  options: {explicitPath?: string; cwd?: string; knownRuleIds?: readonly string[]} = {},
): LoadedConfig {
  let path: string | null = null
  if (options.explicitPath) {
    path = isAbsolute(options.explicitPath)
      ? options.explicitPath
      : resolve(options.cwd ?? root, options.explicitPath)
    if (!existsSync(path)) throw new UsageError(`Config file not found: ${options.explicitPath}`)
  } else {
    path = CONFIG_FILE_NAMES.map((name) => join(root, name)).find((p) => existsSync(p)) ?? null
  }
  const config = path ? parseConfig(readFileSync(path, 'utf8'), path, options.knownRuleIds) : defaultConfig()
  return {config, path, hash: hashConfig(config)}
}
