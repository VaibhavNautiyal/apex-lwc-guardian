/** Exit codes shared by the CLI commands. */
export const EXIT = {
  pass: 0,
  blocked: 1,
  usage: 2,
  environment: 3,
} as const

/** An expected failure with a user-facing message and the exit code to use. */
export class GuardianError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message)
    this.name = 'GuardianError'
  }
}

/** Bad flags, bad or missing files given by the user, or an invalid config file. Exit code 2. */
export class UsageError extends GuardianError {
  constructor(message: string) {
    super(message, EXIT.usage)
    this.name = 'UsageError'
  }
}

/** The environment is not usable: not a git repository, base branch missing, git not installed. Exit code 3. */
export class EnvironmentError extends GuardianError {
  constructor(message: string) {
    super(message, EXIT.environment)
    this.name = 'EnvironmentError'
  }
}
