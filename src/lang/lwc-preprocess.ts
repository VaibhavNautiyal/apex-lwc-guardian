/**
 * Lightweight, deterministic preprocessor for LWC JavaScript and HTML. Not a parser.
 *
 * For JavaScript, `code` is the source with comments, string contents, template-literal text and
 * regular-expression literal contents replaced by spaces. Code inside `${...}` stays visible. Offsets
 * and line numbers are identical to the original.
 */

import {
  blankRange,
  bracketMatcher,
  lineLocator,
  previousNonSpace,
  type Range,
  type StringLiteral,
  wordBefore,
} from './text.js'

export interface JsSource {
  original: string
  code: string
  /** String literals and the static text parts of template literals. */
  strings: StringLiteral[]
  comments: Range[]
  lineAt(offset: number): number
  matchOf(offset: number): number
}

export interface HtmlSource {
  original: string
  /** The source with `<!-- -->` comments blanked. */
  code: string
  lineAt(offset: number): number
}

/** Words after which `/` starts a regular expression rather than a division. */
const REGEX_AFTER_WORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new'])
const REGEX_AFTER_CHARS = '(,=:[!&|?{};+-*%<>~^'

const jsCache = new Map<string, JsSource>()

export function preprocessJs(original: string): JsSource {
  const cached = jsCache.get(original)
  if (cached) return cached
  const out = original.split('')
  const strings: StringLiteral[] = []
  const comments: Range[] = []
  const src = original

  const scanString = (start: number): number => {
    const quote = src[start]
    let j = start + 1
    while (j < src.length && src[j] !== quote && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1
    j = Math.min(j, src.length)
    blankRange(out, start + 1, j)
    strings.push({start, end: Math.min(j + 1, src.length), value: src.slice(start + 1, j)})
    return j + 1
  }

  const scanTemplate = (start: number): number => {
    let chunkStart = start + 1
    let j = chunkStart
    const closeChunk = (end: number): void => {
      blankRange(out, chunkStart, end)
      if (end > chunkStart) strings.push({start: chunkStart, end, value: src.slice(chunkStart, end)})
    }
    while (j < src.length) {
      if (src[j] === '\\') {
        j += 2
      } else if (src[j] === '`') {
        closeChunk(j)
        return j + 1
      } else if (src[j] === '$' && src[j + 1] === '{') {
        closeChunk(j)
        j = scanCode(j + 2, true) + 1
        chunkStart = j
      } else {
        j++
      }
    }
    closeChunk(src.length)
    return src.length
  }

  const startsRegex = (offset: number): boolean => {
    // Only the text just before `offset` matters, so look at a short window of the blanked output.
    const from = Math.max(0, offset - 64)
    const window = out.slice(from, offset).join('')
    const p = previousNonSpace(window, window.length)
    if (p < 0) return true
    if (REGEX_AFTER_CHARS.includes(window[p])) return true
    return /[\w$]/.test(window[p]) && REGEX_AFTER_WORDS.has(wordBefore(window, window.length))
  }

  const scanRegex = (start: number): number => {
    let j = start + 1
    let inClass = false
    while (j < src.length && src[j] !== '\n') {
      const c = src[j]
      if (c === '\\') {
        j += 2
        continue
      }
      if (c === '/' && !inClass) {
        blankRange(out, start + 1, j)
        return j + 1
      }
      if (c === '[') inClass = true
      if (c === ']') inClass = false
      j++
    }
    return start + 1 // not a regex after all: treat `/` as division
  }

  /** Scans code from `start`. Inside `${...}` it stops at the closing brace and returns its offset. */
  function scanCode(start: number, inTemplateExpr: boolean): number {
    let depth = 0
    let i = start
    while (i < src.length) {
      const c = src[i]
      const next = src[i + 1]
      if (c === '/' && next === '/') {
        let j = i
        while (j < src.length && src[j] !== '\n') j++
        blankRange(out, i, j)
        comments.push({start: i, end: j})
        i = j
      } else if (c === '/' && next === '*') {
        const close = src.indexOf('*/', i + 2)
        const j = close === -1 ? src.length : close + 2
        blankRange(out, i, j)
        comments.push({start: i, end: j})
        i = j
      } else if (c === "'" || c === '"') {
        i = scanString(i)
      } else if (c === '`') {
        i = scanTemplate(i)
      } else if (c === '/' && startsRegex(i)) {
        i = scanRegex(i)
      } else {
        if (c === '{') depth++
        if (c === '}') {
          if (inTemplateExpr && depth === 0) return i
          depth--
        }
        i++
      }
    }
    return src.length
  }

  scanCode(0, false)
  const code = out.join('')
  const result: JsSource = {
    original,
    code,
    strings: strings.sort((a, b) => a.start - b.start),
    comments,
    lineAt: lineLocator(original),
    matchOf: bracketMatcher(code),
  }
  if (jsCache.size > 500) jsCache.clear()
  jsCache.set(original, result)
  return result
}

export function preprocessHtml(original: string): HtmlSource {
  const out = original.split('')
  let i = original.indexOf('<!--')
  while (i !== -1) {
    const close = original.indexOf('-->', i + 4)
    const end = close === -1 ? original.length : close + 3
    blankRange(out, i, end)
    i = original.indexOf('<!--', end)
  }
  return {original, code: out.join(''), lineAt: lineLocator(original)}
}
