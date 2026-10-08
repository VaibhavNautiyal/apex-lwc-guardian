/** Text helpers shared by the Apex and LWC preprocessors. */

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

export const OPENERS: Record<string, string> = {'(': ')', '[': ']', '{': '}'}
const CLOSERS: Record<string, string> = {')': '(', ']': '[', '}': '{'}

/** Returns a function mapping an offset to its 1-based line number. */
export function lineLocator(src: string): (offset: number) => number {
  const starts = [0]
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\n') starts.push(i + 1)
  }
  return (offset) => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= offset) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
}

/** Matches (), [] and {} in code that has comments and strings blanked. Returns `matchOf(offset)`. */
export function bracketMatcher(code: string): (offset: number) => number {
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
  return (offset) => matches.get(offset) ?? -1
}

export function skipSpace(code: string, offset: number): number {
  let i = offset
  while (i < code.length && /\s/.test(code[i])) i++
  return i
}

export function previousNonSpace(code: string, offset: number): number {
  let i = offset - 1
  while (i >= 0 && /\s/.test(code[i])) i--
  return i
}

/** The identifier that ends just before `offset` (ignoring whitespace), lower-cased. */
export function wordBefore(code: string, offset: number): string {
  const end = previousNonSpace(code, offset) + 1
  let start = end
  while (start > 0 && /[\w$]/.test(code[start - 1])) start--
  return code.slice(start, end).toLowerCase()
}

/** Replaces every character in [from, to) except line breaks with a space. */
export function blankRange(out: string[], from: number, to: number): void {
  for (let k = from; k < to; k++) {
    if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' '
  }
}

/** Offsets of every match of `re` in `code`. */
export function allMatches(code: string, re: RegExp): number[] {
  const offsets: number[] = []
  const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  let m: RegExpExecArray | null
  while ((m = global.exec(code))) offsets.push(m.index)
  return offsets
}
