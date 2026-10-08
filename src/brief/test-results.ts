import {existsSync, readFileSync} from 'node:fs'

import {z} from 'zod'

import {UsageError} from '../core/errors.js'

/** The parts of `sf apex run test --json` output that the brief uses. All fields are optional. */
const SfTestRunSchema = z.object({
  result: z
    .object({
      summary: z
        .object({
          outcome: z.string().optional(),
          testsRan: z.coerce.number().optional(),
          passing: z.coerce.number().optional(),
          failing: z.coerce.number().optional(),
          skipped: z.coerce.number().optional(),
          orgWideCoverage: z.string().optional(),
          testRunCoverage: z.string().optional(),
        })
        .passthrough(),
      tests: z
        .array(
          z
            .object({
              FullName: z.string().optional(),
              MethodName: z.string().optional(),
              Outcome: z.string().optional(),
              Message: z.string().nullable().optional(),
              ApexClass: z.object({Name: z.string().optional()}).passthrough().optional(),
            })
            .passthrough(),
        )
        .optional(),
    })
    .passthrough(),
})

export interface TestFailure {
  name: string
  message: string
}

export interface TestSummary {
  outcome: string
  testsRan: number
  passing: number
  failing: number
  skipped: number
  orgWideCoverage: string | null
  testRunCoverage: string | null
  failures: TestFailure[]
}

export function parseTestResults(json: unknown, source = 'test results'): TestSummary {
  const parsed = SfTestRunSchema.safeParse(json)
  if (!parsed.success) {
    throw new UsageError(`${source} is not the output of "sf apex run test --json" (no result.summary).`)
  }
  const {summary, tests = []} = parsed.data.result
  const failures = tests
    .filter((t) => /^fail/i.test(t.Outcome ?? ''))
    .map((t) => ({
      name: (t.FullName ?? [t.ApexClass?.Name, t.MethodName].filter(Boolean).join('.')) || 'unknown test',
      message: (t.Message ?? '').replace(/\s+/g, ' ').trim(),
    }))
  const failing = summary.failing ?? failures.length
  return {
    outcome: summary.outcome ?? (failing > 0 ? 'Failed' : 'Passed'),
    testsRan: summary.testsRan ?? tests.length,
    passing: summary.passing ?? tests.filter((t) => /^pass/i.test(t.Outcome ?? '')).length,
    failing,
    skipped: summary.skipped ?? 0,
    orgWideCoverage: summary.orgWideCoverage ?? null,
    testRunCoverage: summary.testRunCoverage ?? null,
    failures,
  }
}

export function readTestResults(path: string): TestSummary {
  if (!existsSync(path)) throw new UsageError(`Test results file not found: ${path}`)
  let json: unknown
  try {
    json = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
  } catch (error) {
    throw new UsageError(`Test results file is not valid JSON: ${path} (${(error as Error).message})`)
  }
  return parseTestResults(json, path)
}
