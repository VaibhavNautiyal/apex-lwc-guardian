import {Args, Command, Flags} from '@oclif/core'

export default class GuardianHello extends Command {
  static override description = 'Print a greeting from the apex-lwc-guardian plugin'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> World',
    '<%= config.bin %> <%= command.id %> --from apex-lwc-guardian',
  ]
  static override args = {
    name: Args.string({description: 'Name to greet', required: false}),
  }
  static override flags = {
    from: Flags.string({
      char: 'f',
      description: 'Who the greeting is from',
      default: 'apex-lwc-guardian',
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(GuardianHello)
    const name = args.name ?? 'Agentia'
    this.log(`hello ${name} from ${flags.from}`)
  }
}
