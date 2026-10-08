import type {Rule} from '../../core/types.js'
import {allMatches} from '../text.js'
import {finding, htmlOf, isHtml, isJs, jsOf} from './common.js'

const text = {
  explanation:
    'Writing HTML strings into the page bypasses Lightning Locker and LWS sanitising patterns and opens the component to cross-site scripting if any part of the string comes from data or user input.',
  suggestion:
    'Render the markup in the template with bindings, set textContent for plain text, or use lightning-formatted-rich-text for rich text.',
}

export const lwc002: Rule = {
  id: 'LWC002',
  title: 'HTML injection (innerHTML, outerHTML, insertAdjacentHTML)',
  language: 'lwc',
  defaultSeverity: 'error',
  check(file) {
    if (isJs(file)) {
      const src = jsOf(file)
      const assignments = allMatches(src.code, /\.\s*(innerHTML|outerHTML)\s*\+?=(?!=)/)
      const inserts = allMatches(src.code, /\binsertAdjacentHTML\s*\(/)
      return [...assignments, ...inserts]
        .sort((a, b) => a - b)
        .map((offset) => finding(lwc002, file, src.lineAt(offset), 'HTML string written into the DOM.', text))
    }
    if (isHtml(file)) {
      const src = htmlOf(file)
      return allMatches(src.code, /\blwc:inner-html\b/).map((offset) =>
        finding(lwc002, file, src.lineAt(offset), 'Template uses lwc:inner-html.', text),
      )
    }
    return []
  },
}
