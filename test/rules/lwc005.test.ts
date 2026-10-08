import {describe, expect, it} from 'vitest'

import {fixture, scanLwc} from '../helpers.js'

describe('LWC005 console.log or debugger left in', () => {
  it('reports console.log, console.debug and debugger', () => {
    expect(scanLwc(fixture('lwc/debugLeftoversBad/debugLeftoversBad.js'))).toEqual([
      ['LWC005', 7],
      ['LWC005', 8],
      ['LWC005', 12],
    ])
  })

  it('accepts console.error, other objects with a log method, comments and strings', () => {
    expect(scanLwc(fixture('lwc/debugLeftoversGood/debugLeftoversGood.js'))).toEqual([])
  })
})
