import {describe, expect, it} from 'vitest'

import {lwc001} from '../../src/lang/lwc-rules/lwc001-unhandled-apex-call.js'
import {fixture, lwcSource, scanLwc} from '../helpers.js'

describe('LWC001 imperative Apex call without error handling', () => {
  it('reports bare awaits, then() without catch, ignored promises and try/finally without catch', () => {
    expect(scanLwc(fixture('lwc/imperativeApexBad/imperativeApexBad.js'))).toEqual([
      ['LWC001', 10],
      ['LWC001', 14],
      ['LWC001', 20],
      ['LWC001', 26],
    ])
  })

  it('accepts try/catch, .catch(), two-argument then(), returned promises and @wire', () => {
    expect(scanLwc(fixture('lwc/imperativeApexGood/imperativeApexGood.js'))).toEqual([])
  })

  it('only follows functions imported from @salesforce/apex', () => {
    const src = lwcSource(
      "import load from 'c/loader';\nexport default class A {\n  async go() {\n    await load();\n  }\n}\n",
    )
    expect(scanLwc(src, [lwc001])).toEqual([])
  })

  it('does not report promises stored for later handling', () => {
    const src = lwcSource(
      "import getA from '@salesforce/apex/C.getA';\nexport default class A {\n  go() {\n    const p = getA();\n    Promise.all([getA()]).catch(() => {});\n    return p.catch(() => null);\n  }\n}\n",
    )
    expect(scanLwc(src, [lwc001])).toEqual([])
  })
})
