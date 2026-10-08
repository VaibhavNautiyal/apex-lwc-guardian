import {z} from 'zod'

import {countBySeverity} from '../scoring.js'
import {type GateResult, type ScanResult, SEVERITIES, type Severity} from '../types.js'
import {TOOL_NAME, TOOL_VERSION} from '../version.js'

/** Bump when a field is removed or changes meaning. Adding fields does not change the version. */
export const JSON_SCHEMA_VERSION = 1

const SeveritySchema = z.enum(SEVERITIES as [Severity, ...Severity[]])

export const FindingJsonSchema = z.object({
  ruleId: z.string().regex(/^(APEX|LWC)\d{3}$/),
  severity: SeveritySchema,
  file: z.string().min(1),
  line: z.number().int().positive(),
  message: z.string().min(1),
  explanation: z.string().min(1),
  suggestion: z.string().min(1),
})

export const ScanJsonSchema = z.object({
  schemaVersion: z.literal(JSON_SCHEMA_VERSION),
  tool: z.object({name: z.literal(TOOL_NAME), version: z.string()}),
  kind: z.enum(['scan', 'gate']),
  baseRef: z.string(),
  headRef: z.string(),
  baseSha: z.string().nullable(),
  headSha: z.string().nullable(),
  filesScanned: z.number().int().nonnegative(),
  riskScore: z.number().int().min(0).max(100),
  counts: z.object({error: z.number().int(), warning: z.number().int(), info: z.number().int()}),
  findings: z.array(FindingJsonSchema),
  gate: z
    .object({
      passed: z.boolean(),
      blockingCount: z.number().int().nonnegative(),
      failOn: z.enum(['error', 'warning']),
      maxRiskScore: z.number().int(),
    })
    .optional(),
})

export type ScanJson = z.infer<typeof ScanJsonSchema>

export interface GateThresholds {
  failOn: 'error' | 'warning'
  maxRiskScore: number
}

export function toJson(result: ScanResult | GateResult, thresholds?: GateThresholds): ScanJson {
  const isGate = 'passed' in result && thresholds !== undefined
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    tool: {name: TOOL_NAME, version: TOOL_VERSION},
    kind: isGate ? 'gate' : 'scan',
    baseRef: result.baseRef,
    headRef: result.headRef,
    baseSha: result.baseSha,
    headSha: result.headSha,
    filesScanned: result.filesScanned,
    riskScore: result.riskScore,
    counts: countBySeverity(result.findings),
    findings: result.findings.map((f) => ({
      ruleId: f.ruleId,
      severity: f.severity,
      file: f.file,
      line: f.line,
      message: f.message,
      explanation: f.explanation,
      suggestion: f.suggestion,
    })),
    ...(isGate ? {gate: {passed: result.passed, blockingCount: result.blockingCount, ...thresholds}} : {}),
  }
}

export function renderJson(result: ScanResult | GateResult, thresholds?: GateThresholds): string {
  return JSON.stringify(toJson(result, thresholds), null, 2)
}
