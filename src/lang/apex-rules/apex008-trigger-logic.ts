import type {Finding, Rule} from '../../core/types.js'
import {apexOf, dmlOffsets, finding, isTrigger, soqlOffsets} from './common.js'

const directText = {
  explanation:
    'SOQL and DML written directly in a trigger cannot be reused or unit tested on their own and make the order of operations hard to control.',
  suggestion:
    'Move the logic into a handler class (for example AccountTriggerHandler) and call it from the trigger with Trigger.new and Trigger.oldMap.',
}

const lengthText = {
  explanation:
    'Long triggers mix logic for many events in one place, which makes them hard to test and maintain.',
  suggestion: 'Keep the trigger to a few lines that delegate to a handler class.',
}

export const apex008: Rule = {
  id: 'APEX008',
  title: 'Logic in trigger body',
  language: 'apex',
  defaultSeverity: 'warning',
  check(file, context) {
    if (!isTrigger(file)) return []
    const src = apexOf(file)
    const header = /\btrigger\s+\w+\s+on\s+\w+\s*\(/i.exec(src.code)
    if (!header) return []
    const paren = header.index + header[0].length - 1
    const brace = src.code.indexOf('{', src.matchOf(paren))
    const end = brace === -1 ? -1 : src.matchOf(brace)
    if (end === -1) return []

    const inBody = (offset: number): boolean => offset > brace && offset < end
    const findings: Finding[] = [
      ...soqlOffsets(src)
        .filter(inBody)
        .map((o) =>
          finding(apex008, file, src.lineAt(o), 'SOQL query written directly in the trigger.', directText),
        ),
      ...dmlOffsets(src)
        .filter(inBody)
        .map((o) =>
          finding(apex008, file, src.lineAt(o), 'DML written directly in the trigger.', directText),
        ),
    ]

    const logicLines = src.code
      .slice(brace + 1, end)
      .split('\n')
      .filter((line) => /[^\s{}]/.test(line)).length
    if (logicLines > context.triggerMaxLines) {
      findings.push(
        finding(
          apex008,
          file,
          src.lineAt(header.index),
          `Trigger body has ${logicLines} lines of logic (limit ${context.triggerMaxLines}).`,
          lengthText,
        ),
      )
    }
    return findings
  },
}
