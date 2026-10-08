import {describe, expect, it} from 'vitest'

import {runRules} from '../../src/core/scanner.js'
import {lwc004} from '../../src/lang/lwc-rules/lwc004-hardcoded-values.js'
import {fixture, hits, lwcSource, scanLwc} from '../helpers.js'

describe('LWC004 hardcoded record ID or absolute URL', () => {
  it('reports IDs and absolute URLs in strings and template literals', () => {
    expect(scanLwc(fixture('lwc/hardcodedValuesBad/hardcodedValuesBad.js'))).toEqual([
      ['LWC004', 3],
      ['LWC004', 4],
      ['LWC004', 10],
      ['LWC004', 18],
    ])
  })

  it('accepts relative paths, dynamic hosts, XML namespaces and comments', () => {
    expect(scanLwc(fixture('lwc/hardcodedValuesGood/hardcodedValuesGood.js'))).toEqual([])
  })

  it('honours the configured URL allow-list', () => {
    const src = lwcSource("const CDN = 'https://cdn.acme.com/lib.js';\n")
    expect(hits(runRules([src], [lwc004], {triggerMaxLines: 15, urlAllowList: []}))).toEqual([['LWC004', 1]])
    expect(
      hits(runRules([src], [lwc004], {triggerMaxLines: 15, urlAllowList: ['https://cdn.acme.com/']})),
    ).toEqual([])
  })
})
