import {Command, Flags} from '@oclif/core'

import {failWith, formatOf, render, scanFlags} from '../../cli/shared.js'
import {EXIT} from '../../core/errors.js'
import {runGate} from '../../core/gate.js'

export default class GuardianGate extends Command {
  static override summary = 'Scan changed Apex and LWC files and fail when blocking findings exist.'
  static override description = `Runs the same scan as "guardian scan", then applies the thresholds from the config (failOn, maxRiskScore) and appends a line to the audit log.

Exit codes: 0 passed, 1 blocking findings, 2 usage or config error, 3 environment error (not a git repository, base branch missing).`

  static override examples = [
    '<%= config.bin %> <%= command.id %> --story US-0001',
    '<%= config.bin %> <%= command.id %> --base origin/main --json',
  ]

  static override flags = {
    ...scanFlags,
    story: Flags.string({
      description: 'User story ID or name, recorded in the audit log (for example US-0001).',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(GuardianGate)
    const format = formatOf(flags)
    let passed = false
    try {
      const outcome = await runGate({
        cwd: process.cwd(),
        base: flags.base,
        all: flags.all,
        files: flags.files,
        configPath: flags.config,
        storyId: flags.story,
      })
      this.log(render(format, outcome.gate, outcome.config.thresholds))
      if (outcome.auditError) this.warn(`Could not write the audit log: ${outcome.auditError}`)
      passed = outcome.gate.passed
    } catch (error) {
      failWith(this, error, format)
    }
    if (!passed) this.exit(EXIT.blocked)
  }
}
