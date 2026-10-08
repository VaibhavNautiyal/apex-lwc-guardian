import {describe, expect, it} from 'vitest'

import {apex007} from '../../src/lang/apex-rules/apex007-test-without-assert.js'
import {apexSource, fixture, scanApex} from '../helpers.js'

describe('APEX007 test without assertions', () => {
  it('reports @isTest and testMethod methods without asserts, even with an assert in a comment', () => {
    expect(scanApex(fixture('classes/AssertBadTest.cls'))).toEqual([
      ['APEX007', 9],
      ['APEX007', 16],
    ])
  })

  it('accepts System.assert*, Assert.* and helpers that assert; ignores @TestSetup', () => {
    expect(scanApex(fixture('classes/AssertGoodTest.cls'))).toEqual([])
  })

  it('reports annotated tests with parameters', () => {
    const src = apexSource(
      '@isTest\nprivate class T {\n  @IsTest(isParallel=true)\n  static void parallel() {\n    System.debug(1);\n  }\n}\n',
    )
    expect(scanApex(src, [apex007])).toEqual([['APEX007', 4]])
  })
})
