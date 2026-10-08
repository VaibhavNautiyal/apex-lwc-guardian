import {describe, expect, it} from 'vitest'

import {isAtLeast, SEVERITIES, severityRank} from '../src/core/types.js'

describe('severity helpers', () => {
  it('orders severities from most to least serious', () => {
    expect(SEVERITIES).toEqual(['error', 'warning', 'info'])
    expect(severityRank('error')).toBeLessThan(severityRank('warning'))
    expect(severityRank('warning')).toBeLessThan(severityRank('info'))
  })

  it('compares against a threshold', () => {
    expect(isAtLeast('error', 'warning')).toBe(true)
    expect(isAtLeast('warning', 'warning')).toBe(true)
    expect(isAtLeast('info', 'warning')).toBe(false)
    expect(isAtLeast('warning', 'error')).toBe(false)
  })
})
