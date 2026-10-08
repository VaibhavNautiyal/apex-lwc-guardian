import {describe, expect, it} from 'vitest'

import {apex002} from '../../src/lang/apex-rules/apex002-dml-in-loop.js'
import {apexSource, fixture, scanApex} from '../helpers.js'

describe('APEX002 DML inside a loop', () => {
  it('reports DML statements and Database methods in loops', () => {
    expect(scanApex(fixture('classes/DmlInLoopBad.cls'))).toEqual([
      ['APEX002', 5],
      ['APEX002', 12],
      ['APEX002', 18],
      ['APEX002', 25],
      ['APEX002', 26],
    ])
  })

  it('ignores DML after the loop and DML words in comments, strings and identifiers', () => {
    expect(scanApex(fixture('classes/DmlInLoopGood.cls'))).toEqual([])
  })

  it('ignores trigger event lists', () => {
    const src = apexSource(
      'trigger T on Account (before insert, after update) {\n  Handler.run(Trigger.new);\n}\n',
      'triggers/T.trigger',
    )
    expect(scanApex(src, [apex002])).toEqual([])
  })

  it('reports `merge` and `insert as user` forms', () => {
    const src = apexSource(
      'public with sharing class A {\n  void m(List<Account> a) {\n    for (Account x : a) {\n      merge x a[0];\n      insert as user x;\n    }\n  }\n}\n',
    )
    expect(scanApex(src, [apex002])).toEqual([
      ['APEX002', 4],
      ['APEX002', 5],
    ])
  })
})
