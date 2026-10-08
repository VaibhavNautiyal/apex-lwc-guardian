import type {Rule} from '../../core/types.js'
import {apexOf, calloutOffsets, finding} from './common.js'

const text = {
  explanation:
    'A transaction allows at most 100 callouts and 120 seconds of total callout time, so a callout per loop iteration quickly hits the limit.',
  suggestion:
    'Send one batched request for all records, or move the work to Queueable or Batch Apex that processes a bounded number of records per callout.',
}

export const apex003: Rule = {
  id: 'APEX003',
  title: 'HTTP callout inside a loop',
  language: 'apex',
  defaultSeverity: 'error',
  check(file) {
    const src = apexOf(file)
    return calloutOffsets(src)
      .filter((offset) => src.isInLoop(offset))
      .map((offset) => finding(apex003, file, src.lineAt(offset), 'HTTP callout inside a loop.', text))
  },
}
