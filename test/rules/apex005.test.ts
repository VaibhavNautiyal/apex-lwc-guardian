import {describe, expect, it} from 'vitest'

import {apex005, looksLikeRecordId} from '../../src/lang/apex-rules/apex005-hardcoded-id.js'
import {apexSource, fixture, scanApex} from '../helpers.js'

describe('APEX005 hardcoded record ID', () => {
  it('reports 15 and 18 character IDs in strings, including inside SOQL', () => {
    expect(scanApex(fixture('classes/HardcodedIdBad.cls'))).toEqual([
      ['APEX005', 2],
      ['APEX005', 5],
      ['APEX005', 12],
      ['APEX005', 16],
    ])
  })

  it('ignores words, numbers, IDs in comments and values with a bad checksum', () => {
    expect(scanApex(fixture('classes/HardcodedIdGood.cls'))).toEqual([])
  })

  it('ignores test classes, where fake IDs are common', () => {
    const src = apexSource("@isTest\nprivate class FooTest {\n  static Id fake = '001000000000001AAA';\n}\n")
    expect(scanApex(src, [apex005])).toEqual([])
  })

  it('validates the shape of an ID', () => {
    expect(looksLikeRecordId('001000000000001AAA')).toBe(true)
    expect(looksLikeRecordId('0015g00000XyZ1aAAF')).toBe(true)
    expect(looksLikeRecordId('0015g00000XyZ1aAAA')).toBe(false) // wrong checksum
    expect(looksLikeRecordId('0015g10000XyZ1a')).toBe(false) // reserved character is not 0
    expect(looksLikeRecordId('zzz000000000001')).toBe(false) // unknown prefix
    expect(looksLikeRecordId('00100000000001')).toBe(false) // 14 characters
  })
})
