import {type Command, Flags} from '@oclif/core'

import {GuardianError} from '../core/errors.js'
import {type GateThresholds, renderJson} from '../core/reporters/json.js'
import {renderMarkdown} from '../core/reporters/markdown.js'
import {renderTable} from '../core/reporters/table.js'
import type {GateResult, ScanResult} from '../core/types.js'

export type Format = 'table' | 'json' | 'markdown'

/** Flags shared by `scan` and `gate`. */
export const scanFlags = {
  base: Flags.string({
    description: 'Base branch or ref to compare against. Default: baseBranch from the config (main).',
  }),
  all: Flags.boolean({
    description: 'Scan every matching Apex and LWC file, not only changed ones.',
    exclusive: ['files'],
  }),
  files: Flags.string({
    description: 'Comma-separated files to scan instead of the changed files.',
    multiple: true,
    delimiter: ',',
    exclusive: ['all'],
  }),
  format: Flags.option({options: ['table', 'json', 'markdown'] as const, default: 'table' as const})({
    char: 'f',
    description: 'Output format.',
  }),
  json: Flags.boolean({description: 'Same as --format json.'}),
  config: Flags.string({
    description: 'Path to the config file. Default: guardian.config.yml in the repository root.',
  }),
}

export function formatOf(flags: {format: Format; json: boolean}): Format {
  return flags.json ? 'json' : flags.format
}

export function render(format: Format, result: ScanResult | GateResult, thresholds?: GateThresholds): string {
  if (format === 'json') return renderJson(result, thresholds)
  if (format === 'markdown') return renderMarkdown(result, thresholds)
  return renderTable(result, thresholds)
}

/**
 * Reports an expected error with its exit code. In JSON mode the error is printed to stdout as
 * `{"error": {...}}` so agents can parse it. Unexpected errors are rethrown.
 */
export function failWith(command: Command, error: unknown, format: Format): never {
  if (!(error instanceof GuardianError)) throw error
  if (format === 'json') {
    command.log(
      JSON.stringify({error: {name: error.name, message: error.message, exitCode: error.exitCode}}, null, 2),
    )
    command.exit(error.exitCode)
  }
  command.error(error.message, {exit: error.exitCode})
}
