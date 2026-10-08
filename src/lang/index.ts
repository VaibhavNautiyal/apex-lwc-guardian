import type {Rule} from '../core/types.js'
import {apexRules} from './apex-rules/index.js'
import {lwcRules} from './lwc-rules/index.js'

export const allRules: readonly Rule[] = [...apexRules, ...lwcRules]
