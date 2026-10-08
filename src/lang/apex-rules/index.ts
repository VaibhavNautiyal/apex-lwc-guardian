import type {Rule} from '../../core/types.js'
import {apex001} from './apex001-soql-in-loop.js'
import {apex002} from './apex002-dml-in-loop.js'
import {apex003} from './apex003-callout-in-loop.js'
import {apex004} from './apex004-missing-sharing.js'
import {apex005} from './apex005-hardcoded-id.js'
import {apex006} from './apex006-soql-without-fls.js'
import {apex007} from './apex007-test-without-assert.js'
import {apex008} from './apex008-trigger-logic.js'
import {apex009} from './apex009-trigger-index-zero.js'
import {apex010} from './apex010-see-all-data.js'
import {apex011} from './apex011-empty-catch.js'

export const apexRules: readonly Rule[] = [
  apex001,
  apex002,
  apex003,
  apex004,
  apex005,
  apex006,
  apex007,
  apex008,
  apex009,
  apex010,
  apex011,
]
