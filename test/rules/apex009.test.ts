import {describe, expect, it} from 'vitest'

import {apex009} from '../../src/lang/apex-rules/apex009-trigger-index-zero.js'
import {apexSource, fixture, scanApex} from '../helpers.js'

describe('APEX009 trigger reads one record by index', () => {
  it('reports Trigger.new[0] and Trigger.old[0]', () => {
    expect(scanApex(fixture('triggers/OpportunityTriggerBad.trigger'))).toEqual([
      ['APEX009', 2],
      ['APEX009', 3],
    ])
  })

  it('accepts loops over Trigger.new and mentions in comments', () => {
    expect(scanApex(fixture('triggers/OpportunityTriggerGood.trigger'))).toEqual([])
  })

  it('also reports handler classes, with any spacing or case', () => {
    const src = apexSource(
      'public with sharing class H {\n  void m() {\n    Account a = (Account) trigger.NEW [ 0 ];\n  }\n}\n',
    )
    expect(scanApex(src, [apex009])).toEqual([['APEX009', 3]])
  })
})
