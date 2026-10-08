import {Command} from '@oclif/core'

import {failWith, formatOf, render, scanFlags} from '../../cli/shared.js'
import {scan} from '../../core/scanner.js'

export default class GuardianScan extends Command {
  static override summary = 'Scan changed Apex and LWC files and print findings.'
  static override description = `Compares the current branch with the base branch (plus uncommitted changes) and runs the Apex and LWC rules on changed .cls, .trigger and lwc .js/.html files.

Always exits 0 when the scan runs, whatever it finds. Use "guardian gate" to fail on findings.
Exit codes: 0 scan ran, 2 usage or config error, 3 environment error (not a git repository, base branch missing).`

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --base develop',
    '<%= config.bin %> <%= command.id %> --all --format markdown',
    '<%= config.bin %> <%= command.id %> --files force-app/main/default/classes/AccountService.cls --json',
  ]

  static override flags = scanFlags

  public async run(): Promise<void> {
    const {flags} = await this.parse(GuardianScan)
    const format = formatOf(flags)
    try {
      const outcome = await scan({
        cwd: process.cwd(),
        base: flags.base,
        all: flags.all,
        files: flags.files,
        configPath: flags.config,
      })
      this.log(render(format, outcome.result))
    } catch (error) {
      failWith(this, error, format)
    }
  }
}
