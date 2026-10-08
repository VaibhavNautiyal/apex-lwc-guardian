import {execFile} from 'node:child_process'

import {EnvironmentError} from './errors.js'

export interface GitResult {
  ok: boolean
  stdout: string
  stderr: string
}

/** Runs git with an argument array (never through a shell). Never throws for a non-zero exit. */
export function git(args: string[], cwd: string): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    execFile('git', args, {cwd, maxBuffer: 32 * 1024 * 1024, windowsHide: true}, (error, stdout, stderr) => {
      if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new EnvironmentError('git is not installed or not on PATH.'))
        return
      }
      resolve({ok: !error, stdout: stdout.toString(), stderr: stderr.toString()})
    })
  })
}

/** Absolute path of the repository root, or null when `cwd` is not inside a git work tree. */
export async function repoRoot(cwd: string): Promise<string | null> {
  const r = await git(['rev-parse', '--show-toplevel'], cwd)
  return r.ok ? r.stdout.trim() : null
}

/** Full SHA of a commit-ish, or null when it does not exist. */
export async function resolveCommit(ref: string, cwd: string): Promise<string | null> {
  const r = await git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd)
  return r.ok ? r.stdout.trim() : null
}

export async function gitUser(cwd: string): Promise<string | null> {
  const email = await git(['config', 'user.email'], cwd)
  if (email.ok && email.stdout.trim()) return email.stdout.trim()
  const name = await git(['config', 'user.name'], cwd)
  return name.ok && name.stdout.trim() ? name.stdout.trim() : null
}

/** Splits git output into non-empty lines. */
export function lines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}
