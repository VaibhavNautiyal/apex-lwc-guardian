import {Command, Flags} from '@oclif/core'

import {generateBrief} from '../../brief/index.js'
import {failWith} from '../../cli/shared.js'

export default class GuardianBrief extends Command {
  static override summary = 'Write a release brief for a user story.'
  static override description = `Scans the changed Apex and LWC files and writes a Markdown release brief: summary, changed components, risk findings, test status, rollback plan and gate result.

The summary comes from the Copado AI release agent when available (only file names, rule IDs, counts and messages are sent, never source code), otherwise from a template. The brief is always written to a local file. With --attach it is also written to the Technical Specifications field of the user story, inside a marked Guardian section that is replaced on each run; if that fails, a warning is printed and the local file is kept.

Exit codes: 0 brief written, 2 usage or config error, 3 environment error.`

  static override examples = [
    '<%= config.bin %> <%= command.id %> --story US-0001',
    '<%= config.bin %> <%= command.id %> --story US-0001 --test-results test-results.json --attach',
    '<%= config.bin %> <%= command.id %> --story US-0001 --no-ai --out release/US-0001.md',
  ]

  static override flags = {
    story: Flags.string({description: 'User story ID or name (for example US-0001).', required: true}),
    base: Flags.string({
      description: 'Base branch or ref to compare against. Default: baseBranch from the config.',
    }),
    'test-results': Flags.string({
      description: 'JSON output of "sf apex run test --json" to include in the brief.',
    }),
    ai: Flags.boolean({
      description: 'Ask the Copado AI release agent for the summary. Use --no-ai for the template summary.',
      default: true,
      allowNo: true,
    }),
    attach: Flags.boolean({description: 'Also write the brief to the user story in Copado.'}),
    out: Flags.string({
      description: 'Output file. Default: .guardian/briefs/<story>.md in the repository root.',
    }),
    config: Flags.string({
      description: 'Path to the config file. Default: guardian.config.yml in the repository root.',
    }),
    json: Flags.boolean({description: 'Print the result as JSON.'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(GuardianBrief)
    const format = flags.json ? 'json' : 'table'
    try {
      const outcome = await generateBrief({
        cwd: process.cwd(),
        storyId: flags.story,
        base: flags.base,
        configPath: flags.config,
        testResultsPath: flags['test-results'],
        ai: flags.ai,
        attach: flags.attach,
        out: flags.out,
      })
      if (flags.json) {
        const {path, summarySource, attached, warnings, gate} = outcome
        this.log(
          JSON.stringify(
            {path, summarySource, attached, warnings, gate: {passed: gate.passed, riskScore: gate.riskScore}},
            null,
            2,
          ),
        )
        return
      }
      for (const warning of outcome.warnings) this.warn(warning)
      this.log(`Release brief written to ${outcome.path}`)
      if (outcome.attached)
        this.log(`Brief attached to user story ${flags.story} (Technical Specifications).`)
    } catch (error) {
      failWith(this, error, format)
    }
  }
}
