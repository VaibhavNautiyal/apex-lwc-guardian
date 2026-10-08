import {describe, expect, it} from 'vitest'

import {fixture, scanApex} from '../helpers.js'

describe('APEX010 SeeAllData=true', () => {
  it('reports class and method annotations in any case and spacing', () => {
    expect(scanApex(fixture('classes/SeeAllDataBadTest.cls'))).toEqual([
      ['APEX010', 1],
      ['APEX010', 3],
    ])
  })

  it('accepts SeeAllData=false, other parameters and mentions in comments', () => {
    expect(scanApex(fixture('classes/SeeAllDataGoodTest.cls'))).toEqual([])
  })
})
