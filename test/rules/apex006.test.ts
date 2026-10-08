import {describe, expect, it} from 'vitest'

import {apex006} from '../../src/lang/apex-rules/apex006-soql-without-fls.js'
import {apexSource, fixture, scanApex} from '../helpers.js'

describe('APEX006 exposed SOQL without user mode', () => {
  it('reports static and dynamic queries in an @AuraEnabled class', () => {
    expect(scanApex(fixture('classes/ExposedSoqlBad.cls'))).toEqual([
      ['APEX006', 4],
      ['APEX006', 10],
    ])
  })

  it('accepts WITH USER_MODE, WITH SECURITY_ENFORCED and AccessLevel.USER_MODE', () => {
    expect(scanApex(fixture('classes/ExposedSoqlGood.cls'))).toEqual([])
  })

  it('accepts files that use Security.stripInaccessible', () => {
    const src = apexSource(
      'public with sharing class C {\n  @AuraEnabled\n  public static List<Account> get() {\n    return (List<Account>) Security.stripInaccessible(AccessType.READABLE, [SELECT Id FROM Account]).getRecords();\n  }\n}\n',
    )
    expect(scanApex(src, [apex006])).toEqual([])
  })

  it('reports @RestResource classes and ignores classes that are not exposed', () => {
    const query = '  public static List<Account> get() { return [SELECT Id FROM Account]; }\n'
    const rest = apexSource(
      `@RestResource(urlMapping='/a/*')\nglobal with sharing class R {\n  @HttpGet\n${query}}\n`,
    )
    const plain = apexSource(`public with sharing class P {\n${query}}\n`)
    expect(scanApex(rest, [apex006])).toEqual([['APEX006', 4]])
    expect(scanApex(plain, [apex006])).toEqual([])
  })
})
