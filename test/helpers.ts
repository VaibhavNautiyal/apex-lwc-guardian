import {readFileSync} from 'node:fs'
import {join} from 'node:path'

import {runRules} from '../src/core/scanner.js'
import type {Finding, Language, Rule, SourceFile} from '../src/core/types.js'
import {apexRules} from '../src/lang/apex-rules/index.js'

export const SAMPLE_ROOT = join(import.meta.dirname, '..', 'fixtures', 'sfdx-sample')
export const DEFAULT_DIR = 'force-app/main/default'

/** Loads a fixture by its path under force-app/main/default, e.g. `classes/Foo.cls`. */
export function fixture(relative: string): SourceFile {
  const path = `${DEFAULT_DIR}/${relative}`
  const language: Language = relative.startsWith('lwc/') ? 'lwc' : 'apex'
  return {path, language, content: readFileSync(join(SAMPLE_ROOT, path), 'utf8')}
}

export function apexSource(content: string, name = 'classes/Inline.cls'): SourceFile {
  return {path: `${DEFAULT_DIR}/${name}`, language: 'apex', content}
}

/** `[ruleId, line]` pairs, in scanner order. */
export function hits(findings: Finding[]): [string, number][] {
  return findings.map((f) => [f.ruleId, f.line])
}

export function scanApex(file: SourceFile, rules: readonly Rule[] = apexRules): [string, number][] {
  return hits(runRules([file], rules))
}
