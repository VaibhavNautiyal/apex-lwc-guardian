import {describe, expect, it} from 'vitest'

import {apex011} from '../../src/lang/apex-rules/apex011-empty-catch.js'
import {apexSource, fixture, scanApex} from '../helpers.js'

describe('APEX011 empty catch block', () => {
  it('reports empty catch blocks on one or several lines', () => {
    expect(scanApex(fixture('classes/EmptyCatchBad.cls'))).toEqual([
      ['APEX011', 5],
      ['APEX011', 12],
    ])
  })

  it('accepts handled exceptions and catch blocks with an explaining comment', () => {
    expect(scanApex(fixture('classes/EmptyCatchGood.cls'))).toEqual([])
  })

  it('ignores the word catch in strings', () => {
    const src = apexSource("public with sharing class A {\n  String s = 'catch (Exception e) {}';\n}\n")
    expect(scanApex(src, [apex011])).toEqual([])
  })
})
