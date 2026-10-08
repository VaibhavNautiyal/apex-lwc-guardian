import {execFileSync} from 'node:child_process'
import {cpSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {format} from 'node:util'

import {vi} from 'vitest'

import {SAMPLE_ROOT} from './helpers.js'

export const PROJECT_ROOT = join(import.meta.dirname, '..')
const CLASSES = 'force-app/main/default/classes'

export function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {cwd, encoding: 'utf8'})
}

export interface SampleRepo {
  dir: string
  cleanup(): void
}

/**
 * A temporary git repository holding fixtures/sfdx-sample:
 * - `main`: an empty project (sfdx-project.json only);
 * - `feature/US-0001` (checked out): adds the classes listed in `classes` (default: all bad and
 *   good Apex fixtures), committed.
 */
export function createSampleRepo(options: {classes?: string[]; noCommits?: boolean} = {}): SampleRepo {
  const dir = mkdtempSync(join(tmpdir(), 'guardian-'))
  sh(dir, 'init', '-q', '-b', 'main')
  sh(dir, 'config', 'user.email', 'guardian-test@example.com')
  sh(dir, 'config', 'user.name', 'Guardian Test')
  sh(dir, 'config', 'core.autocrlf', 'false')
  if (options.noCommits) return {dir, cleanup: () => rmSync(dir, {recursive: true, force: true})}
  cpSync(join(SAMPLE_ROOT, 'sfdx-project.json'), join(dir, 'sfdx-project.json'))
  sh(dir, 'add', '-A')
  sh(dir, 'commit', '-q', '-m', 'init')
  sh(dir, 'checkout', '-q', '-b', 'feature/US-0001')
  if (options.classes) {
    for (const name of options.classes) {
      cpSync(join(SAMPLE_ROOT, CLASSES, name), join(dir, CLASSES, name), {recursive: true})
    }
  } else {
    cpSync(join(SAMPLE_ROOT, 'force-app'), join(dir, 'force-app'), {recursive: true})
  }
  sh(dir, 'add', '-A')
  sh(dir, 'commit', '-q', '-m', 'US-0001 changes')
  return {dir, cleanup: () => rmSync(dir, {recursive: true, force: true})}
}

export function writeConfig(dir: string, yaml: string): void {
  writeFileSync(join(dir, 'guardian.config.yml'), yaml)
}

export interface CommandRun {
  code: number
  stdout: string
  error?: string
}

/** Runs an oclif command class in-process with `cwd` as the working directory. */
export async function runCommand(
  CommandClass: {run(argv: string[], root: string): Promise<unknown>},
  argv: string[],
  cwd: string,
): Promise<CommandRun> {
  const previous = process.cwd()
  const chunks: string[] = []
  // oclif writes through console.log and console.error.
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    chunks.push(`${format(...args)}\n`)
  })
  const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
  process.chdir(cwd)
  try {
    await CommandClass.run(argv, PROJECT_ROOT)
    return {code: 0, stdout: chunks.join('')}
  } catch (error) {
    const exit = (error as {oclif?: {exit?: number}}).oclif?.exit
    if (exit === undefined) throw error
    return {code: exit, stdout: chunks.join(''), error: (error as Error).message}
  } finally {
    process.chdir(previous)
    spy.mockRestore()
    warn.mockRestore()
  }
}
