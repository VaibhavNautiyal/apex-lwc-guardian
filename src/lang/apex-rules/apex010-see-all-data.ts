import type {Finding, Rule} from '../../core/types.js'
import {apexOf, finding} from './common.js'

const text = {
  explanation:
    'SeeAllData=true makes tests depend on the records in the org, so they pass in one org and fail in another, and they can be slow.',
  suggestion: 'Remove SeeAllData=true and create the test records in the test or in a @TestSetup method.',
}

export const apex010: Rule = {
  id: 'APEX010',
  title: 'Test uses SeeAllData=true',
  language: 'apex',
  defaultSeverity: 'warning',
  check(file) {
    const src = apexOf(file)
    const findings: Finding[] = []
    const re = /@isTest\s*\(([^)]*)\)/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(src.code))) {
      if (/\bseealldata\s*=\s*true\b/i.test(m[1])) {
        findings.push(
          finding(apex010, file, src.lineAt(m.index), 'Test annotated with SeeAllData=true.', text),
        )
      }
    }
    return findings
  },
}
