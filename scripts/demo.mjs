// Builds the demo Salesforce project from fixtures/sfdx-sample/demo as a git repository.
//
//   node scripts/demo.mjs setup <folder>   main (clean project) + feature/US-0001 (risky change, checked out)
//                                          + feature/US-0001-fixed (risky change + fix commit)
//   node scripts/demo.mjs fix <folder>     copy the fixed files into the working tree (what the agent does)
import {execFileSync} from 'node:child_process'
import {cpSync, existsSync, mkdirSync, readdirSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const DEMO = fileURLToPath(new URL('../fixtures/sfdx-sample/demo/', import.meta.url))
const [command, target] = process.argv.slice(2)

function git(cwd, ...args) {
  execFileSync('git', args, {cwd, stdio: ['ignore', 'ignore', 'inherit']})
}

function hasGitIdentity(cwd) {
  try {
    return execFileSync('git', ['config', 'user.email'], {cwd, encoding: 'utf8'}).trim() !== ''
  } catch {
    return false
  }
}

function copyLayer(layer, dir) {
  cpSync(join(DEMO, layer), dir, {recursive: true})
}

function setup(dir) {
  if (existsSync(dir) && readdirSync(dir).length > 0) {
    throw new Error(`Folder is not empty: ${dir}`)
  }
  mkdirSync(dir, {recursive: true})
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'core.autocrlf', 'false')
  if (!hasGitIdentity(dir)) {
    git(dir, 'config', 'user.name', 'Guardian Demo')
    git(dir, 'config', 'user.email', 'guardian-demo@example.com')
  }
  copyLayer('base', dir)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'Initial project')

  git(dir, 'checkout', '-q', '-b', 'feature/US-0001')
  copyLayer('bad', dir)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'US-0001: account health service and component')

  git(dir, 'checkout', '-q', '-b', 'feature/US-0001-fixed')
  copyLayer('fixed', dir)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'US-0001: fix Guardian findings')
  git(dir, 'checkout', '-q', 'feature/US-0001')

  mkdirSync(join(dir, '.guardian'), {recursive: true})
  cpSync(join(DEMO, 'test-results.json'), join(dir, '.guardian', 'test-results.json'))
  console.log(`Demo project ready in ${dir} on branch feature/US-0001.`)
}

function fix(dir) {
  copyLayer('fixed', dir)
  console.log(`Fixed files copied into ${dir}.`)
}

if (!target || !['setup', 'fix'].includes(command)) {
  console.error('Usage: node scripts/demo.mjs setup|fix <folder>')
  process.exit(2)
}
try {
  ;(command === 'setup' ? setup : fix)(resolve(target))
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
