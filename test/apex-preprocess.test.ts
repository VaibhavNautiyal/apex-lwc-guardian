import {describe, expect, it} from 'vitest'

import {preprocessApex} from '../src/lang/apex-preprocess.js'

describe('preprocessApex', () => {
  it('blanks comments and string contents but keeps length and line breaks', () => {
    const source = "Integer a = 1; // insert x;\r\n/* [SELECT\r\n Id] */ String s = 'it\\'s [SELECT]';\r\n"
    const src = preprocessApex(source)
    expect(src.code).toHaveLength(source.length)
    expect(src.code).not.toMatch(/insert|SELECT/)
    expect(src.code.split('\n')).toHaveLength(source.split('\n').length)
    expect(src.strings).toEqual([expect.objectContaining({value: "it\\'s [SELECT]"})])
  })

  it('maps offsets to 1-based line numbers', () => {
    const src = preprocessApex('a\nbb\n\nccc')
    expect(src.lineAt(0)).toBe(1)
    expect(src.lineAt(2)).toBe(2)
    expect(src.lineAt(5)).toBe(3)
    expect(src.lineAt(6)).toBe(4)
  })

  it('finds block, single-statement and do-while loop bodies', () => {
    const code = 'for (X x : xs) { a(); }\nwhile (c) b();\ndo { d(); } while (e);\nf();'
    const src = preprocessApex(code)
    expect(src.loops.map((r) => code.slice(r.start, r.end))).toEqual(['{ a(); }', 'b();', '{ d(); }'])
    expect(src.isInLoop(code.indexOf('f()'))).toBe(false)
  })

  it('extends a single-statement if/else loop body to the else branch', () => {
    const code = 'for (X x : xs) if (x.a) a(); else b();\nc();'
    const src = preprocessApex(code)
    expect(src.isInLoop(code.indexOf('b()'))).toBe(true)
    expect(src.isInLoop(code.indexOf('c()'))).toBe(false)
  })

  it('finds classes and methods with their headers', () => {
    const src = preprocessApex(
      '@isTest\nprivate class T {\n  class Inner {}\n  @isTest static void run() { x(); }\n}\n',
    )
    expect(src.classes.map((c) => [c.name, c.topLevel])).toEqual([
      ['T', true],
      ['Inner', false],
    ])
    expect(src.classes[0].header).toContain('@istest')
    expect(src.methods.map((m) => m.name)).toEqual(['run'])
    expect(src.methods[0].header).toContain('@istest static void')
  })
})
