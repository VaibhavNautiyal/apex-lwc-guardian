import type {Rule} from '../../core/types.js'
import type {JsSource} from '../lwc-preprocess.js'
import {allMatches, previousNonSpace, type Range, skipSpace, wordBefore} from '../text.js'
import {finding, isJs, jsOf} from './common.js'

const text = {
  explanation:
    'Imperative Apex calls return a Promise. If it rejects (validation rule, governor limit, lost session) and nothing catches it, the user sees no error and the component is left in a broken state.',
  suggestion:
    'Add .catch() to the promise chain, or wrap the await in try/catch, and show the error, for example with a ShowToastEvent.',
}

const APEX_IMPORT = /\bimport\s+([A-Za-z_$][\w$]*)\s+from\s+(['"])/g

function apexImports(src: JsSource): string[] {
  const names: string[] = []
  let m: RegExpExecArray | null
  APEX_IMPORT.lastIndex = 0
  while ((m = APEX_IMPORT.exec(src.code))) {
    const quote = m.index + m[0].length - 1
    const specifier = src.strings.find((s) => s.start === quote)
    if (specifier?.value.startsWith('@salesforce/apex/')) names.push(m[1])
  }
  return names
}

/** Try blocks that have a `catch` clause. */
function tryWithCatchRanges(src: JsSource): Range[] {
  return allMatches(src.code, /\btry\s*\{/).flatMap((offset) => {
    const brace = src.code.indexOf('{', offset)
    const close = src.matchOf(brace)
    if (close === -1) return []
    const after = skipSpace(src.code, close + 1)
    return src.code.startsWith('catch', after) ? [{start: brace, end: close}] : []
  })
}

function hasTopLevelComma(src: JsSource, open: number, close: number): boolean {
  let j = open + 1
  while (j < close) {
    const c = src.code[j]
    if ('([{'.includes(c)) {
      const end = src.matchOf(j)
      if (end === -1) return false
      j = end + 1
      continue
    }
    if (c === ',') return true
    j++
  }
  return false
}

/** True when the `.then/.catch/.finally` chain after `pos` handles rejection. */
function chainHandlesErrors(src: JsSource, pos: number): boolean {
  let j = pos
  for (;;) {
    j = skipSpace(src.code, j)
    const m = /^\.\s*(then|catch|finally)\s*\(/.exec(src.code.slice(j, j + 40))
    if (!m) return false
    const paren = j + m[0].length - 1
    const close = src.matchOf(paren)
    if (close === -1) return false
    if (m[1] === 'catch') return true
    if (m[1] === 'then' && hasTopLevelComma(src, paren, close)) return true // .then(onOk, onError)
    j = close + 1
  }
}

export const lwc001: Rule = {
  id: 'LWC001',
  title: 'Imperative Apex call without error handling',
  language: 'lwc',
  defaultSeverity: 'warning',
  check(file) {
    if (!isJs(file)) return []
    const src = jsOf(file)
    const names = apexImports(src)
    if (names.length === 0) return []
    const tryRanges = tryWithCatchRanges(src)
    const inTry = (offset: number): boolean => tryRanges.some((r) => offset > r.start && offset < r.end)

    return names.flatMap((name) =>
      allMatches(src.code, new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}\\s*\\(`))
        .filter((offset) => {
          const paren = src.code.indexOf('(', offset)
          const close = src.matchOf(paren)
          if (close === -1) return false
          const handled = chainHandlesErrors(src, close + 1)
          const word = wordBefore(src.code, offset)
          if (word === 'await') return !handled && !inTry(offset)
          if (word === 'return') return false // the caller receives the promise and handles it
          const p = previousNonSpace(src.code, offset)
          const atStatementStart = p < 0 || ';{})'.includes(src.code[p])
          // Promises assigned, passed as arguments or returned from arrows are followed elsewhere: not reported.
          return atStatementStart && !handled
        })
        .map((offset) =>
          finding(
            lwc001,
            file,
            src.lineAt(offset),
            `Imperative Apex call ${name}() has no error handling.`,
            text,
          ),
        ),
    )
  },
}
