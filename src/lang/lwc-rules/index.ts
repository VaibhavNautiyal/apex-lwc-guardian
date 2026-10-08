import type {Rule} from '../../core/types.js'
import {lwc001} from './lwc001-unhandled-apex-call.js'
import {lwc002} from './lwc002-unsafe-html.js'
import {lwc003} from './lwc003-dynamic-code.js'
import {lwc004} from './lwc004-hardcoded-values.js'
import {lwc005} from './lwc005-debug-leftovers.js'

export const lwcRules: readonly Rule[] = [lwc001, lwc002, lwc003, lwc004, lwc005]
