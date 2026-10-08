import type {Finding, Rule} from '../../core/types.js'
import {looksLikeRecordId} from '../record-id.js'
import {finding, isJs, jsOf} from './common.js'

const idText = {
  explanation:
    'Record IDs differ between orgs and sandboxes, so a hardcoded ID breaks or points at the wrong record after deployment.',
  suggestion: 'Pass the ID in through @api, read it from the page context (recordId) or look it up in Apex.',
}

const urlText = {
  explanation:
    'Absolute URLs tie the component to one org, My Domain or environment, and break in sandboxes, scratch orgs and after a domain change.',
  suggestion:
    'Use NavigationMixin or relative paths for Salesforce pages, and Named Credentials or Custom Metadata (read through Apex) for external endpoints.',
}

/** XML namespace URIs are identifiers, not links. */
export const DEFAULT_URL_ALLOW_LIST = ['http://www.w3.org/', 'https://www.w3.org/']

const ABSOLUTE_URL = /^https?:\/\/[^\s/$'"`]+/i

export const lwc004: Rule = {
  id: 'LWC004',
  title: 'Hardcoded record ID or absolute URL',
  language: 'lwc',
  defaultSeverity: 'warning',
  check(file, context) {
    if (!isJs(file)) return []
    const src = jsOf(file)
    const allowed = [...DEFAULT_URL_ALLOW_LIST, ...context.urlAllowList].map((u) => u.toLowerCase())
    const findings: Finding[] = []
    for (const s of src.strings) {
      const value = s.value.trim()
      if (looksLikeRecordId(value)) {
        findings.push(
          finding(lwc004, file, src.lineAt(s.start), 'Hardcoded record ID in JavaScript.', idText),
        )
      } else if (
        ABSOLUTE_URL.test(value) &&
        !allowed.some((prefix) => value.toLowerCase().startsWith(prefix))
      ) {
        findings.push(
          finding(lwc004, file, src.lineAt(s.start), 'Hardcoded absolute URL in JavaScript.', urlText),
        )
      }
    }
    return findings
  },
}
