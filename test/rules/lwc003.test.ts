import {describe, expect, it} from 'vitest'

import {lwc003} from '../../src/lang/lwc-rules/lwc003-dynamic-code.js'
import {fixture, lwcSource, scanLwc} from '../helpers.js'

describe('LWC003 eval or Function constructor', () => {
  it('reports eval, window.eval and new Function', () => {
    expect(scanLwc(fixture('lwc/dynamicCodeBad/dynamicCodeBad.js'))).toEqual([
      ['LWC003', 7],
      ['LWC003', 11],
      ['LWC003', 16],
    ])
  })

  it('accepts lookup tables, JSON.parse, methods named eval on other objects and mentions in comments', () => {
    expect(scanLwc(fixture('lwc/dynamicCodeGood/dynamicCodeGood.js'))).toEqual([])
  })

  it('reports Function() without new and ignores identifiers ending in Function', () => {
    const src = lwcSource('const f = Function("return 1");\nconst g = isFunction(x);\n')
    expect(scanLwc(src, [lwc003])).toEqual([['LWC003', 1]])
  })
})
