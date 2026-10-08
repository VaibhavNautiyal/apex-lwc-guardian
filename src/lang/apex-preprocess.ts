/**
 * Lightweight, deterministic Apex preprocessor. Not a parser.
 *
 * `code` is the source with comments and string literal contents replaced by spaces. It has the
 * same length as the original, so offsets and line numbers are identical in both. Rules match on
 * `code` so that text inside comments or strings never triggers them.
 */

export interface Range {
  /** Inclusive start offset. */
  start: number
  /** Exclusive end offset. */
  end: number
}

export interface StringLiteral extends Range {
  /** The literal's content, without quotes, as written in the original source. */
  value: string
}

export interface MethodInfo {
  name: string
  nameOffset: number
  /** Modifiers and annotations before the name, e.g. `@isTest static void`. Lower-cased. */
  header: string
  /** From the opening `{` to just after the closing `}`. */
  body: Range
}

export interface ClassInfo {
  kind: 'class' | 'interface' | 'enum'
  name: string
  keywordOffset: number
  /** Modifiers and annotations before the `class` keyword. Lower-cased. */
  header: string
  body: Range
  topLevel: boolean
}

export interface ApexSource {
  original: string
  code: string
  strings: StringLiteral[]
  comments: Range[]
  loops: Range[]
  methods: MethodInfo[]
  classes: ClassInfo[]
  lineAt(offset: number): number
  /** Offset of the bracket matching the one at `offset`, or -1. */
  matchOf(offset: number): number
  isInLoop(offset: number): boolean
}

const OPENERS: Record<string, string> = {'(': ')', '[': ']', '{': '}'}
const CLOSERS: Record<string, string> = {')': '(', ']': '[', '}': '{'}

/** Words followed by `(` that are never method declarations. */
const NOT_METHOD_NAMES = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'do',
  'else',
  'return',
  'new',
  'when',
  'try',
  'finally',
  'super',
  'this',
  'throw',
])

const cache = new Map<string, ApexSource>()

/** Preprocesses Apex source. Results are cached by content. */
export function preprocessApex(original: string): ApexSource {
  const cached = cache.get(original)
  if (cached) return cached
  const result = build(original)
  if (cache.size > 500) cache.clear()
  cache.set(original, result)
  return result
}

function build(original: string): ApexSource {
  const {code, strings, comments} = blank(original)
  const lineStarts = computeLineStarts(original)
  const matches = matchBrackets(code)
  const matchOf = (offset: number): number => matches.get(offset) ?? -1
  const loops = findLoops(code, matchOf)
  const methods = findMethods(code, matchOf)
  const classes = findClasses(code, matchOf)

  return {
    original,
    code,
    strings,
    comments,
    loops,
    methods,
    classes,
    lineAt: (offset) => lineAt(lineStarts, offset),
    matchOf,
    isInLoop: (offset) => loops.some((loop) => offset >= loop.start && offset < loop.end),
  }
}

function blank(src: string): {code: string; strings: StringLiteral[]; comments: Range[]} {
  const out = src.split('')
  const strings: StringLiteral[] = []
  const comments: Range[] = []
  const blankRange = (from: number, to: number): void => {
    for (let k = from; k < to; k++) {
      if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' '
    }
  }

  let i = 0
  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]
    if (c === '/' && next === '/') {
      let j = i
      while (j < src.length && src[j] !== '\n') j++
      blankRange(i, j)
      comments.push({start: i, end: j})
      i = j
    } else if (c === '/' && next === '*') {
      const close = src.indexOf('*/', i + 2)
      const j = close === -1 ? src.length : close + 2
      blankRange(i, j)
      comments.push({start: i, end: j})
      i = j
    } else if (c === "'") {
      let j = i + 1
      while (j < src.length && src[j] !== "'" && src[j] !== '\n') {
        j += src[j] === '\\' ? 2 : 1
      }
      j = Math.min(j, src.length)
      blankRange(i + 1, j)
      strings.push({start: i, end: Math.min(j + 1, src.length), value: src.slice(i + 1, j)})
      i = j + 1
    } else {
      i++
    }
  }
  return {code: out.join(''), strings, comments}
}

function computeLineStarts(src: string): number[] {
  const starts = [0]
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\n') starts.push(i + 1)
  }
  return starts
}

function lineAt(lineStarts: number[], offset: number): number {
  let lo = 0
  let hi = lineStarts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (lineStarts[mid] <= offset) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

function matchBrackets(code: string): Map<number, number> {
  const matches = new Map<number, number>()
  const stacks: Record<string, number[]> = {'(': [], '[': [], '{': []}
  for (let i = 0; i < code.length; i++) {
    const c = code[i]
    if (c in OPENERS) {
      stacks[c].push(i)
    } else if (c in CLOSERS) {
      const open = stacks[CLOSERS[c]].pop()
      if (open !== undefined) {
        matches.set(open, i)
        matches.set(i, open)
      }
    }
  }
  return matches
}

export function skipSpace(code: string, offset: number): number {
  let i = offset
  while (i < code.length && /\s/.test(code[i])) i++
  return i
}

function previousNonSpace(code: string, offset: number): number {
  let i = offset - 1
  while (i >= 0 && /\s/.test(code[i])) i--
  return i
}

function wordAt(code: string, offset: number): string {
  const m = /^[A-Za-z_]\w*/.exec(code.slice(offset, offset + 64))
  return m ? m[0].toLowerCase() : ''
}

function wordBefore(code: string, offset: number): string {
  const end = previousNonSpace(code, offset) + 1
  let start = end
  while (start > 0 && /\w/.test(code[start - 1])) start--
  return code.slice(start, end).toLowerCase()
}

/** Body range of a statement starting at `start` (a block or a single statement). */
function statementRange(code: string, start: number, matchOf: (o: number) => number): Range | undefined {
  if (code[start] === '{') {
    const close = matchOf(start)
    return close === -1 ? undefined : {start, end: close + 1}
  }
  if (code[start] === ';') return undefined // empty statement, e.g. `do {...} while (x);`
  let j = start
  while (j < code.length) {
    const c = code[j]
    if (c === ';') return withElse(j + 1)
    if (c === '}') return {start, end: j} // enclosing block closed without `;`
    if (c in OPENERS) {
      const close = matchOf(j)
      if (close === -1) return {start, end: code.length}
      const before = code[previousNonSpace(code, j)]
      const isBlock =
        c === '{' && (before === ')' || ['else', 'try', 'finally', 'do'].includes(wordBefore(code, j)))
      j = close + 1
      if (isBlock) return withElse(j)
      continue
    }
    j++
  }
  return {start, end: code.length}

  function withElse(end: number): Range {
    const next = skipSpace(code, end)
    if (wordAt(code, next) === 'else') {
      const rest = statementRange(code, skipSpace(code, next + 4), matchOf)
      if (rest) return {start, end: rest.end}
    }
    return {start, end}
  }
}

function findLoops(code: string, matchOf: (o: number) => number): Range[] {
  const loops: Range[] = []
  const re = /\b(for|while|do)\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(code))) {
    if (m.index > 0 && code[m.index - 1] === '.') continue
    const keyword = m[1].toLowerCase()
    let bodyStart: number
    if (keyword === 'do') {
      bodyStart = skipSpace(code, m.index + 2)
    } else {
      const paren = skipSpace(code, m.index + keyword.length)
      if (code[paren] !== '(') continue // e.g. SOQL `FOR UPDATE`
      const close = matchOf(paren)
      if (close === -1) continue
      bodyStart = skipSpace(code, close + 1)
    }
    const body = statementRange(code, bodyStart, matchOf)
    if (body) loops.push(body)
  }
  return loops
}

function headerBefore(code: string, offset: number): string {
  let i = offset - 1
  while (i >= 0 && !';{}'.includes(code[i])) i--
  return code.slice(i + 1, offset).toLowerCase()
}

function findMethods(code: string, matchOf: (o: number) => number): MethodInfo[] {
  const methods: MethodInfo[] = []
  const re = /\b([A-Za-z_]\w*)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(code))) {
    const name = m[1]
    if (NOT_METHOD_NAMES.has(name.toLowerCase())) continue
    if (m.index > 0 && /[.@]/.test(code[previousNonSpace(code, m.index)] ?? '')) continue
    if (wordBefore(code, m.index) === 'on') continue // trigger header: `trigger T on Account (...)`
    const paren = m.index + m[0].length - 1
    const close = matchOf(paren)
    if (close === -1) continue
    const brace = skipSpace(code, close + 1)
    if (code[brace] !== '{') continue
    const end = matchOf(brace)
    if (end === -1) continue
    if (methods.some((outer) => m!.index > outer.body.start && m!.index < outer.body.end)) continue
    methods.push({
      name,
      nameOffset: m.index,
      header: headerBefore(code, m.index),
      body: {start: brace, end: end + 1},
    })
  }
  return methods
}

function findClasses(code: string, matchOf: (o: number) => number): ClassInfo[] {
  const classes: ClassInfo[] = []
  const re = /\b(class|interface|enum)\s+([A-Za-z_]\w*)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(code))) {
    if (m.index > 0 && code[previousNonSpace(code, m.index)] === '.') continue
    const brace = code.indexOf('{', m.index)
    if (brace === -1) continue
    const close = matchOf(brace)
    if (close === -1) continue
    const keywordOffset = m.index
    classes.push({
      kind: m[1].toLowerCase() as ClassInfo['kind'],
      name: m[2],
      keywordOffset,
      header: headerBefore(code, keywordOffset),
      body: {start: brace, end: close + 1},
      topLevel: !classes.some((outer) => keywordOffset > outer.body.start && keywordOffset < outer.body.end),
    })
  }
  return classes
}
