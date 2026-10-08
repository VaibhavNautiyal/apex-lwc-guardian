import type {Rule} from '../../core/types.js'
import {apexOf, finding, soqlOffsets} from './common.js'

const text = {
  explanation:
    'Every query counts toward the 100-queries-per-transaction limit, so a query inside a loop fails once the loop runs often enough, for example on a 200-record trigger batch.',
  suggestion:
    'Query once before the loop (collect IDs in a Set and use WHERE Id IN :ids), then read the results from a Map inside the loop.',
}

export const apex001: Rule = {
  id: 'APEX001',
  title: 'SOQL query inside a loop',
  language: 'apex',
  defaultSeverity: 'error',
  check(file) {
    const src = apexOf(file)
    return soqlOffsets(src)
      .filter((offset) => src.isInLoop(offset))
      .map((offset) => finding(apex001, file, src.lineAt(offset), 'SOQL query inside a loop.', text))
  },
}
