import type {Rule} from '../../core/types.js'
import {allMatches, apexOf, finding} from './common.js'

const text = {
  explanation:
    'Triggers receive up to 200 records at a time. Reading only Trigger.new[0] or Trigger.old[0] silently ignores every other record in data loads, integrations and bulk updates.',
  suggestion:
    'Loop over Trigger.new (or Trigger.old) and handle every record, collecting work into Lists and Maps.',
}

export const apex009: Rule = {
  id: 'APEX009',
  title: 'Trigger reads a single record by index',
  language: 'apex',
  defaultSeverity: 'error',
  check(file) {
    const src = apexOf(file)
    return allMatches(src.code, /\bTrigger\s*\.\s*(new|old)\s*\[\s*\d+\s*\]/i).map((o) =>
      finding(apex009, file, src.lineAt(o), 'Trigger record accessed by fixed index (not bulk safe).', text),
    )
  },
}
