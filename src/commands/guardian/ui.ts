import {spawn} from 'node:child_process'

import {Command, Flags} from '@oclif/core'

import {startUi} from '../../ui/server.js'

/** Opens a URL in the default browser. Failures are ignored; the URL is printed anyway. */
export function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '""', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]]
  try {
    const child = spawn(cmd, args, {stdio: 'ignore', detached: true, windowsHide: true})
    child.on('error', () => {})
    child.unref()
  } catch {
    // No browser available; the user can open the printed URL.
  }
}

export default class GuardianUi extends Command {
  static override summary = 'Open the Guardian dashboard in your browser.'
  static override description = `Starts a local web dashboard (on 127.0.0.1 only) for scanning, running the gate, writing release briefs, and browsing the audit log and rules. Press Ctrl+C to stop it.`

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --port 5000 --no-open',
  ]

  static override flags = {
    port: Flags.integer({
      description: 'Port to listen on. 0 picks a free port.',
      default: 4870,
      min: 0,
      max: 65535,
    }),
    open: Flags.boolean({
      description: 'Open the dashboard in the default browser.',
      default: true,
      allowNo: true,
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(GuardianUi)
    const {url} = await startUi(flags.port, {defaultCwd: process.cwd()})
    this.log(`Guardian dashboard running at ${url}`)
    this.log('Press Ctrl+C to stop.')
    if (flags.open) openBrowser(url)
    await new Promise(() => {})
  }
}
