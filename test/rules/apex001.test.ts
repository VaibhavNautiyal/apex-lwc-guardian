import {describe, expect, it} from 'vitest'

import {apex001} from '../../src/lang/apex-rules/apex001-soql-in-loop.js'
import {apexSource, fixture, scanApex} from '../helpers.js'

describe('APEX001 SOQL inside a loop', () => {
  it('reports every query in a loop, including single-statement, nested, while and do loops', () => {
    expect(scanApex(fixture('classes/SoqlInLoopBad.cls'))).toEqual([
      ['APEX001', 4],
      ['APEX001', 11],
      ['APEX001', 17],
      ['APEX001', 26],
      ['APEX001', 35],
    ])
  })

  it('ignores queries before loops, in comments, in strings, in SOQL for-loop headers and in other methods', () => {
    expect(scanApex(fixture('classes/SoqlInLoopGood.cls'))).toEqual([])
  })

  it('fills the finding fields', () => {
    const [f] = apex001.check(fixture('classes/SoqlInLoopBad.cls'), {triggerMaxLines: 15, urlAllowList: []})
    expect(f).toMatchObject({
      ruleId: 'APEX001',
      severity: 'error',
      file: 'force-app/main/default/classes/SoqlInLoopBad.cls',
      line: 4,
    })
    expect(f.explanation.length).toBeGreaterThan(20)
    expect(f.suggestion.length).toBeGreaterThan(20)
  })

  it('reports a query nested in two loops once', () => {
    const src = apexSource(
      'public with sharing class A {\n  void m(List<Id> ids) {\n    for (Id a : ids) for (Id b : ids) System.debug([SELECT Id FROM Account]);\n  }\n}\n',
    )
    expect(scanApex(src, [apex001])).toEqual([['APEX001', 3]])
  })
})
