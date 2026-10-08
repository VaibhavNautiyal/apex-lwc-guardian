import {describe, expect, it} from 'vitest'

import {lwc002} from '../../src/lang/lwc-rules/lwc002-unsafe-html.js'
import {fixture, lwcSource, scanLwc} from '../helpers.js'

describe('LWC002 HTML injection', () => {
  it('reports innerHTML/outerHTML assignments and insertAdjacentHTML in JavaScript', () => {
    expect(scanLwc(fixture('lwc/unsafeHtmlBad/unsafeHtmlBad.js'))).toEqual([
      ['LWC002', 8],
      ['LWC002', 9],
      ['LWC002', 10],
    ])
  })

  it('reports lwc:inner-html in templates', () => {
    expect(scanLwc(fixture('lwc/unsafeHtmlBad/unsafeHtmlBad.html'))).toEqual([['LWC002', 3]])
  })

  it('accepts reading innerHTML, comparisons, textContent, comments and strings', () => {
    expect(scanLwc(fixture('lwc/unsafeHtmlGood/unsafeHtmlGood.js'))).toEqual([])
    expect(scanLwc(fixture('lwc/unsafeHtmlGood/unsafeHtmlGood.html'))).toEqual([])
  })

  it('reports += appends', () => {
    expect(scanLwc(lwcSource('el.innerHTML += row;\n'), [lwc002])).toEqual([['LWC002', 1]])
  })
})
