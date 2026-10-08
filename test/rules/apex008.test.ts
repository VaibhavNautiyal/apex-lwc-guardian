import {describe, expect, it} from 'vitest'

import {runRules} from '../../src/core/scanner.js'
import {apex008} from '../../src/lang/apex-rules/apex008-trigger-logic.js'
import {apexSource, fixture, hits, scanApex} from '../helpers.js'

describe('APEX008 logic in trigger body', () => {
  it('reports direct SOQL, direct DML and a long trigger body', () => {
    expect(scanApex(fixture('triggers/AccountTriggerBad.trigger'))).toEqual([
      ['APEX008', 1],
      ['APEX008', 7],
      ['APEX008', 22],
    ])
  })

  it('accepts a trigger that delegates to a handler', () => {
    expect(scanApex(fixture('triggers/AccountTriggerGood.trigger'))).toEqual([])
    expect(scanApex(fixture('classes/AccountTriggerHandler.cls'))).toEqual([])
  })

  it('uses the configured line limit', () => {
    const src = apexSource(
      'trigger T on Account (before insert) {\n  Integer a = 1;\n  Integer b = 2;\n  Handler.run(a, b);\n}\n',
      'triggers/T.trigger',
    )
    expect(hits(runRules([src], [apex008], {triggerMaxLines: 2, urlAllowList: []}))).toEqual([['APEX008', 1]])
    expect(hits(runRules([src], [apex008], {triggerMaxLines: 3, urlAllowList: []}))).toEqual([])
  })

  it('only applies to .trigger files', () => {
    expect(scanApex(fixture('classes/SharingGood.cls'), [apex008])).toEqual([])
  })
})
