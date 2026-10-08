import type {Finding, Rule, SourceFile} from '../core/types.js'

export interface RuleText {
  explanation: string
  suggestion: string
}

export function finding(
  rule: Pick<Rule, 'id' | 'defaultSeverity'>,
  file: SourceFile,
  line: number,
  message: string,
  text: RuleText,
): Finding {
  return {
    ruleId: rule.id,
    severity: rule.defaultSeverity,
    file: file.path,
    line,
    message,
    explanation: text.explanation,
    suggestion: text.suggestion,
  }
}
