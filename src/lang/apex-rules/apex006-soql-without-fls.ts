import type {Rule} from '../../core/types.js'
import {apexOf, finding, isDynamicSoqlAt, isTestClass, soqlOffsets} from './common.js'

const text = {
  explanation:
    'Code exposed through @AuraEnabled or @RestResource runs in system mode, so a query without user mode returns fields and objects the user is not allowed to read.',
  suggestion:
    'Add WITH USER_MODE to the query (or pass AccessLevel.USER_MODE to Database.query), or filter the results with Security.stripInaccessible.',
}

/** `WITH SYSTEM_MODE` is accepted as an explicit, reviewed choice. */
const ENFORCED_IN_QUERY = /\bwith\s+(user_mode|security_enforced|system_mode)\b/i

export const apex006: Rule = {
  id: 'APEX006',
  title: 'Exposed SOQL without user-mode or FLS enforcement',
  language: 'apex',
  defaultSeverity: 'warning',
  check(file) {
    const src = apexOf(file)
    if (!/@(auraenabled|restresource)\b/i.test(src.code)) return []
    if (isTestClass(src) || /\bSecurity\s*\.\s*stripInaccessible\b/i.test(src.code)) return []
    const stringsEnforce = src.strings.some((s) => ENFORCED_IN_QUERY.test(s.value))
    return soqlOffsets(src)
      .filter((offset) => {
        if (isDynamicSoqlAt(src, offset)) {
          const paren = src.code.indexOf('(', offset)
          const args = src.code.slice(paren, src.matchOf(paren) + 1)
          return !/\bAccessLevel\s*\.\s*(user_mode|system_mode)\b/i.test(args) && !stringsEnforce
        }
        const query = src.code.slice(offset, src.matchOf(offset) + 1)
        return !ENFORCED_IN_QUERY.test(query)
      })
      .map((offset) =>
        finding(
          apex006,
          file,
          src.lineAt(offset),
          'Query in an exposed class does not enforce user access.',
          text,
        ),
      )
  },
}
