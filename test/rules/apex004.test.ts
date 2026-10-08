import {describe, expect, it} from 'vitest'

import {apex004} from '../../src/lang/apex-rules/apex004-missing-sharing.js'
import {apexSource, fixture, scanApex} from '../helpers.js'

describe('APEX004 missing sharing declaration', () => {
  it('reports a top-level class without a sharing keyword', () => {
    expect(scanApex(fixture('classes/SharingBad.cls'))).toEqual([['APEX004', 1]])
  })

  it('ignores inner classes, exceptions and classes named in comments', () => {
    expect(scanApex(fixture('classes/SharingGood.cls'))).toEqual([])
  })

  it('ignores test classes, interfaces, enums and explicit without sharing', () => {
    expect(scanApex(apexSource('@isTest\nprivate class FooTest {}\n'), [apex004])).toEqual([])
    expect(scanApex(apexSource('public interface Greeter { String greet(); }\n'), [apex004])).toEqual([])
    expect(scanApex(apexSource('public enum Color { RED, GREEN }\n'), [apex004])).toEqual([])
    expect(scanApex(apexSource('public without sharing class Sys {}\n'), [apex004])).toEqual([])
  })

  it('reads annotations and modifiers before the class keyword', () => {
    const annotated = apexSource("@JsonAccess(serializable='always')\nglobal with sharing class Api {}\n")
    const virtualClass = apexSource('/* header */\nglobal virtual class Base {}\n')
    expect(scanApex(annotated, [apex004])).toEqual([])
    expect(scanApex(virtualClass, [apex004])).toEqual([['APEX004', 2]])
  })
})
