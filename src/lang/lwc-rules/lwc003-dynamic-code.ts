import type {Rule} from '../../core/types.js'
import {allMatches} from '../text.js'
import {finding, isJs, jsOf} from './common.js'

const text = {
  explanation:
    'eval and the Function constructor run strings as code. They are blocked by Lightning Web Security in many contexts and allow code injection if the string contains data.',
  suggestion:
    'Replace the dynamic code with ordinary functions, a lookup table of handlers, or JSON.parse for data.',
}

const PATTERNS = [
  /(?<![\w$.])eval\s*\(/,
  /\b(window|globalThis|self)\s*\.\s*eval\s*\(/,
  /(?<![\w$.])(new\s+)?Function\s*\(/,
]

export const lwc003: Rule = {
  id: 'LWC003',
  title: 'eval or Function constructor',
  language: 'lwc',
  defaultSeverity: 'error',
  check(file) {
    if (!isJs(file)) return []
    const src = jsOf(file)
    return PATTERNS.flatMap((re) => allMatches(src.code, re))
      .sort((a, b) => a - b)
      .map((offset) =>
        finding(lwc003, file, src.lineAt(offset), 'Dynamic code execution (eval or Function).', text),
      )
  },
}
