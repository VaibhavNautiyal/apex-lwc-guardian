import type {Rule} from '../../core/types.js'
import {allMatches} from '../text.js'
import {finding, isJs, jsOf} from './common.js'

const text = {
  explanation:
    'console.log output and debugger statements are development leftovers. They clutter the browser console, can expose record data, and debugger pauses users who have dev tools open.',
  suggestion: 'Remove the statement before release. Use console.error only for real error reporting.',
}

export const lwc005: Rule = {
  id: 'LWC005',
  title: 'console.log or debugger left in',
  language: 'lwc',
  defaultSeverity: 'info',
  check(file) {
    if (!isJs(file)) return []
    const src = jsOf(file)
    const logs = allMatches(src.code, /(?<![\w$.])console\s*\.\s*(log|debug)\s*\(/)
    const breakpoints = allMatches(src.code, /\bdebugger\b/)
    return [
      ...logs.map((o) => ({o, message: 'console.log left in.'})),
      ...breakpoints.map((o) => ({o, message: 'debugger statement left in.'})),
    ]
      .sort((a, b) => a.o - b.o)
      .map(({o, message}) => finding(lwc005, file, src.lineAt(o), message, text))
  },
}
