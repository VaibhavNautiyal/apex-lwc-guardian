import type {Rule} from '../../core/types.js'
import {apexOf, dmlOffsets, finding} from './common.js'

const text = {
  explanation:
    'Every DML statement counts toward the 150-statements-per-transaction limit, so DML inside a loop fails on large batches and is slow on small ones.',
  suggestion:
    'Add the records to a List inside the loop and run one DML statement on the whole List after the loop.',
}

export const apex002: Rule = {
  id: 'APEX002',
  title: 'DML inside a loop',
  language: 'apex',
  defaultSeverity: 'error',
  check(file) {
    const src = apexOf(file)
    return dmlOffsets(src)
      .filter((offset) => src.isInLoop(offset))
      .map((offset) => finding(apex002, file, src.lineAt(offset), 'DML statement inside a loop.', text))
  },
}
