import {describe, expect, it} from 'vitest'

import {apex003} from '../../src/lang/apex-rules/apex003-callout-in-loop.js'
import {apexSource, fixture, scanApex} from '../helpers.js'

describe('APEX003 callout inside a loop', () => {
  it('reports Http variable sends and new Http().send in loops', () => {
    expect(scanApex(fixture('classes/CalloutInLoopBad.cls'))).toEqual([
      ['APEX003', 9],
      ['APEX003', 17],
    ])
  })

  it('ignores a single callout after the loop and send() on non-Http objects', () => {
    expect(scanApex(fixture('classes/CalloutInLoopGood.cls'))).toEqual([])
  })

  it('reports sends through a field accessed with this.', () => {
    const src = apexSource(
      'public with sharing class A {\n  private Http client = new Http();\n  void m(List<HttpRequest> rs) {\n    for (HttpRequest r : rs) this.client.send(r);\n  }\n}\n',
    )
    expect(scanApex(src, [apex003])).toEqual([['APEX003', 4]])
  })
})
