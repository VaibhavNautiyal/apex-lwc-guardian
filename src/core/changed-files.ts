import {existsSync, readdirSync, statSync} from 'node:fs'
import {isAbsolute, join, relative, resolve, sep} from 'node:path'

import picomatch from 'picomatch'

import type {GuardianConfig} from './config.js'
import {EnvironmentError, UsageError} from './errors.js'
import {git, lines, resolveCommit} from './git.js'
import type {Language} from './types.js'

export type FileSelection = {mode: 'diff'; base: string} | {mode: 'all'} | {mode: 'files'; files: string[]}

export interface SelectedFiles {
  /** Repository root (or the working directory outside git). */
  root: string
  /** Repo-relative paths with forward slashes, sorted. */
  files: string[]
  baseRef: string
  headRef: string
  baseSha: string | null
  headSha: string | null
}

/** Directories never walked by `--all`. */
const SKIP_DIRS = new Set(['.git', 'node_modules', '.sfdx', '.sf', '.guardian', '.agentia'])

/** Which rule set applies to a path, or null when Guardian does not scan it. */
export function languageOf(path: string): Language | null {
  const lower = path.toLowerCase()
  if (lower.endsWith('.cls') || lower.endsWith('.trigger')) return 'apex'
  if (/(^|\/)lwc\//.test(lower) && (lower.endsWith('.js') || lower.endsWith('.html'))) return 'lwc'
  return null
}

export function matchesConfig(path: string, config: Pick<GuardianConfig, 'include' | 'ignore'>): boolean {
  const opts = {dot: true}
  return picomatch(config.include, opts)(path) && !picomatch(config.ignore, opts)(path)
}

function toPosix(path: string): string {
  return path.split(sep).join('/')
}

function walk(root: string, dir = root, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(root, join(dir, entry.name), out)
    } else if (entry.isFile()) {
      out.push(toPosix(relative(root, join(dir, entry.name))))
    }
  }
  return out
}

/**
 * Picks the files to scan.
 * - `diff`: files added, copied, modified or renamed in `<base>...HEAD`, plus uncommitted and
 *   untracked changes, filtered by config include/ignore and by file type.
 * - `all`: every matching file under the root (works outside git).
 * - `files`: exactly the given files (relative to `cwd`), filtered by file type only.
 */
export async function selectFiles(
  cwd: string,
  root: string,
  inGit: boolean,
  selection: FileSelection,
  config: GuardianConfig,
): Promise<SelectedFiles> {
  const headSha = inGit ? await resolveCommit('HEAD', root) : null
  const headRef = inGit ? 'HEAD' : 'WORKTREE'

  if (selection.mode === 'files') {
    const files = selection.files.map((given) => {
      const abs = isAbsolute(given) ? given : resolve(cwd, given)
      if (!existsSync(abs) || !statSync(abs).isFile()) throw new UsageError(`File not found: ${given}`)
      const rel = toPosix(relative(root, abs))
      if (rel.startsWith('..')) throw new UsageError(`File is outside the project: ${given}`)
      return rel
    })
    return {
      root,
      files: unique(files.filter((f) => languageOf(f))),
      baseRef: 'none',
      headRef,
      baseSha: null,
      headSha,
    }
  }

  if (selection.mode === 'all') {
    const files = walk(root).filter((f) => languageOf(f) && matchesConfig(f, config))
    return {root, files: unique(files), baseRef: 'none', headRef, baseSha: null, headSha}
  }

  if (!inGit) {
    throw new EnvironmentError('Not a git repository. Run inside a git repository, or use --all or --files.')
  }
  if (!headSha) throw new EnvironmentError('The repository has no commits yet.')
  let baseRef = selection.base
  let baseSha = await resolveCommit(baseRef, root)
  if (!baseSha && !baseRef.startsWith('origin/')) {
    const remote = await resolveCommit(`origin/${baseRef}`, root)
    if (remote) {
      baseRef = `origin/${baseRef}`
      baseSha = remote
    }
  }
  if (!baseSha) {
    throw new EnvironmentError(
      `Base branch "${selection.base}" not found. Fetch it (git fetch origin ${selection.base}) or pass --base.`,
    )
  }

  const quiet = ['-c', 'core.quotepath=off']
  const committed = await git(
    [...quiet, 'diff', '--name-only', '--diff-filter=ACMR', `${baseRef}...HEAD`],
    root,
  )
  if (!committed.ok) throw new EnvironmentError(`git diff failed: ${committed.stderr.trim()}`)
  const uncommitted = await git([...quiet, 'diff', '--name-only', '--diff-filter=ACMR', 'HEAD'], root)
  const untracked = await git([...quiet, 'ls-files', '--others', '--exclude-standard'], root)
  const candidates = [committed, uncommitted, untracked].flatMap((r) => (r.ok ? lines(r.stdout) : []))
  const files = candidates.filter(
    (f) => languageOf(f) && matchesConfig(f, config) && existsSync(join(root, f)),
  )
  return {root, files: unique(files), baseRef, headRef, baseSha, headSha}
}

function unique(files: string[]): string[] {
  return [...new Set(files)].sort()
}
