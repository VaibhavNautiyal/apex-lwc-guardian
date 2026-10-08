import type {Rule} from '../../core/types.js'
import {skipSpace} from '../apex-preprocess.js'
import {allMatches, apexOf, finding} from './common.js'

const text = {
  explanation: 'An empty catch block hides the error, so failures go unnoticed and are hard to diagnose.',
  suggestion:
    'Log the exception, rethrow it, or handle it explicitly. If ignoring it is intended, add a comment saying why.',
}

export const apex011: Rule = {
  id: 'APEX011',
  title: 'Empty catch block',
  language: 'apex',
  defaultSeverity: 'warning',
  check(file) {
    const src = apexOf(file)
    return allMatches(src.code, /\bcatch\s*\(/i)
      .filter((offset) => {
        const paren = src.code.indexOf('(', offset)
        const brace = skipSpace(src.code, src.matchOf(paren) + 1)
        if (src.code[brace] !== '{') return false
        const close = src.matchOf(brace)
        if (close === -1 || src.code.slice(brace + 1, close).trim() !== '') return false
        // A comment in the block documents a deliberate choice, so it is not reported.
        return !/\/\/|\/\*/.test(src.original.slice(brace + 1, close))
      })
      .map((offset) => finding(apex011, file, src.lineAt(offset), 'Empty catch block.', text))
  },
}
