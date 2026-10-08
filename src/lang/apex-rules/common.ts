import type {SourceFile} from '../../core/types.js'
import {type ApexSource, preprocessApex} from '../apex-preprocess.js'
import {allMatches, skipSpace} from '../text.js'

export {finding, type RuleText} from '../finding.js'

export function apexOf(file: SourceFile): ApexSource {
  return preprocessApex(file.content)
}

export function isTrigger(file: SourceFile): boolean {
  return file.path.toLowerCase().endsWith('.trigger')
}

export function isClass(file: SourceFile): boolean {
  return file.path.toLowerCase().endsWith('.cls')
}

/** True when a top-level class in the file is annotated `@isTest`. */
export function isTestClass(src: ApexSource): boolean {
  return src.classes.some((c) => c.topLevel && /@istest\b/.test(c.header))
}

const STATIC_SOQL = /\[\s*select\b/i
const DYNAMIC_SOQL = /\bDatabase\s*\.\s*(query|queryWithBinds|countQuery|countQueryWithBinds)\s*\(/i

/** Offsets of SOQL queries: `[SELECT ...]` and `Database.query(...)` style calls. */
export function soqlOffsets(src: ApexSource): number[] {
  return [...allMatches(src.code, STATIC_SOQL), ...allMatches(src.code, DYNAMIC_SOQL)].sort((a, b) => a - b)
}

export function isDynamicSoqlAt(src: ApexSource, offset: number): boolean {
  return src.code[offset] !== '['
}

const DML_KEYWORD = /\b(insert|update|upsert|delete|undelete|merge)\b/i
const DML_METHOD = /\bDatabase\s*\.\s*(insert|update|upsert|delete|undelete|merge|convertLead)\w*\s*\(/i

/** Offsets of DML: statements such as `insert x;` and `Database.insert(...)` style calls. */
export function dmlOffsets(src: ApexSource): number[] {
  const code = src.code
  const statements = allMatches(code, DML_KEYWORD).filter((offset) => {
    let p = offset - 1
    while (p >= 0 && /\s/.test(code[p])) p--
    const atStatementStart =
      p < 0 || ';{})'.includes(code[p]) || /(^|\W)(else|do)$/i.test(code.slice(Math.max(0, p - 4), p + 1))
    if (!atStatementStart) return false
    const keyword = code.slice(offset).match(DML_KEYWORD)![0]
    const after = skipSpace(code, offset + keyword.length)
    // `update = true;`, `insert.foo`, `delete(x)` style uses are not DML statements.
    return after > offset + keyword.length && !/[=.;,)(]/.test(code[after] ?? ';')
  })
  return [...statements, ...allMatches(code, DML_METHOD)].sort((a, b) => a - b)
}

/** Offsets of HTTP callouts: `new Http().send(` and `<httpVar>.send(`. */
export function calloutOffsets(src: ApexSource): number[] {
  const code = src.code
  const offsets = allMatches(code, /\bnew\s+Http\s*\(\s*\)\s*\.\s*send\s*\(/i)
  const vars = new Set<string>()
  const decl = /\bHttp\s+([A-Za-z_]\w*)\s*[=;]/gi
  let m: RegExpExecArray | null
  while ((m = decl.exec(code))) vars.add(m[1])
  for (const name of vars) {
    offsets.push(...allMatches(code, new RegExp(`\\b${name}\\s*\\.\\s*send\\s*\\(`, 'i')))
  }
  return [...new Set(offsets)].sort((a, b) => a - b)
}

export {allMatches}
