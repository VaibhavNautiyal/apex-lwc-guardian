import {readFileSync} from 'node:fs'

/** Version of this package. Works from both `src/core` and `dist/core`. */
export const TOOL_NAME = 'apex-lwc-guardian'

export const TOOL_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
      version?: string
    }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
})()
