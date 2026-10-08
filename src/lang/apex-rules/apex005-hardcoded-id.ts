import type {Rule} from '../../core/types.js'
import {looksLikeRecordId} from '../record-id.js'
import {apexOf, finding, isTestClass} from './common.js'

export {looksLikeRecordId}

const text = {
  explanation:
    'Record IDs differ between orgs and sandboxes, so a hardcoded ID breaks or points at the wrong record after deployment.',
  suggestion:
    'Look the record up at runtime (for example by DeveloperName), or store the value in Custom Metadata or a Custom Setting.',
}

export const apex005: Rule = {
  id: 'APEX005',
  title: 'Hardcoded Salesforce record ID',
  language: 'apex',
  defaultSeverity: 'error',
  check(file) {
    const src = apexOf(file)
    if (isTestClass(src)) return []
    return src.strings
      .filter((s) => looksLikeRecordId(s.value))
      .map((s) =>
        finding(apex005, file, src.lineAt(s.start), 'Hardcoded record ID in a string literal.', text),
      )
  },
}
