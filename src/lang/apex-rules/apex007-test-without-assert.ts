import type {Rule} from '../../core/types.js'
import type {ApexSource, MethodInfo} from '../apex-preprocess.js'
import {apexOf, finding} from './common.js'

const text = {
  explanation:
    'A test without assertions only proves the code did not throw. It raises coverage without checking behaviour, so regressions pass unnoticed.',
  suggestion:
    'Assert the expected outcome, for example Assert.areEqual(expected, actual) or System.assertEquals(expected, actual, message).',
}

const ASSERT = /\b(System\s*\.\s*assert\w*|Assert\s*\.\s*\w+)\s*\(/i

function bodyOf(src: ApexSource, m: MethodInfo): string {
  return src.code.slice(m.body.start, m.body.end)
}

export const apex007: Rule = {
  id: 'APEX007',
  title: 'Test method without assertions',
  language: 'apex',
  defaultSeverity: 'warning',
  check(file) {
    const src = apexOf(file)
    // Helper methods in the same file that assert count as assertions when a test calls them.
    const assertingHelpers = src.methods.filter((m) => ASSERT.test(bodyOf(src, m))).map((m) => m.name)
    const callsHelper = (body: string): boolean =>
      assertingHelpers.some((name) => new RegExp(`\\b${name}\\s*\\(`, 'i').test(body))
    return src.methods
      .filter((m) => /@istest\b|\btestmethod\b/.test(m.header) && !/@testsetup\b/.test(m.header))
      .filter((m) => {
        const body = bodyOf(src, m)
        return !ASSERT.test(body) && !callsHelper(body)
      })
      .map((m) =>
        finding(apex007, file, src.lineAt(m.nameOffset), `Test method ${m.name} has no assertions.`, text),
      )
  },
}
