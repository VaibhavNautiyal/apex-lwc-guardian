import type {Finding, Rule, RuleContext, SourceFile} from './types.js'

export const DEFAULT_RULE_CONTEXT: RuleContext = {triggerMaxLines: 15, urlAllowList: []}

/** Stable order: file, line, rule ID, message. */
export function compareFindings(a: Finding, b: Finding): number {
  return (
    a.file.localeCompare(b.file) ||
    a.line - b.line ||
    a.ruleId.localeCompare(b.ruleId) ||
    a.message.localeCompare(b.message)
  )
}

/** Runs every rule that matches each file's language and returns sorted findings. */
export function runRules(
  files: readonly SourceFile[],
  rules: readonly Rule[],
  context: RuleContext = DEFAULT_RULE_CONTEXT,
): Finding[] {
  const findings: Finding[] = []
  for (const file of files) {
    for (const rule of rules) {
      if (rule.language === file.language) findings.push(...rule.check(file, context))
    }
  }
  return findings.sort(compareFindings)
}
