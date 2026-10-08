import type {Rule} from '../../core/types.js'
import {apexOf, finding, isClass} from './common.js'

const text = {
  explanation:
    'Without a sharing keyword the class runs with the sharing mode of its caller, or without sharing when called from a context such as a trigger, so users may see records they should not.',
  suggestion:
    'Declare the class `with sharing` (or `inherited sharing` for utilities). Use `without sharing` only on purpose and document why.',
}

export const apex004: Rule = {
  id: 'APEX004',
  title: 'Class has no sharing declaration',
  language: 'apex',
  defaultSeverity: 'warning',
  check(file) {
    if (!isClass(file)) return []
    const src = apexOf(file)
    return src.classes
      .filter((c) => c.topLevel && c.kind === 'class')
      .filter((c) => !/@istest\b/.test(c.header))
      .filter((c) => !/\b(with|without|inherited)\s+sharing\b/.test(c.header))
      .filter((c) => !/\bextends\s+exception\b/i.test(src.code.slice(c.keywordOffset, c.body.start)))
      .map((c) =>
        finding(
          apex004,
          file,
          src.lineAt(c.keywordOffset),
          `Class ${c.name} has no sharing declaration.`,
          text,
        ),
      )
  },
}
