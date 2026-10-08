# Instructions for AI agents

This repository uses **Apex & LWC Guardian** to check Salesforce Apex and Lightning Web Component
changes before they are submitted to a Copado pipeline.

## Rules

- After writing or editing any `.cls`, `.trigger` or `lwc/**/*.js|html` file, run `guardian_scan`
  (MCP) or `agentia guardian scan --json` (CLI).
- Fix every finding with severity `error`. Follow the `suggestion` field. Do not hide code from the
  scanner (comments, strings, renames) and do not disable rules in `guardian.config.yml` to pass.
- Run `guardian_gate` (or `agentia guardian gate --story <id> --json`) and repeat until
  `gate.passed` is `true`.
- Only then run `agentia cicd work submit`. Never pass `--skip-local-tests`.
- For release notes, run `guardian_brief` / `agentia guardian brief --story <id>`.
- Exit codes: 0 pass, 1 blocking findings, 2 bad input or config, 3 environment (not a git
  repository, base branch missing). On 2 or 3, fix the cause instead of retrying.

## Examples

1. You add a loop that calls `[SELECT ... FROM Contact WHERE AccountId = :acc.Id]`. `guardian_scan`
   reports `APEX001` at that line. Query all contacts once before the loop with
   `WHERE AccountId IN :accountIds`, group them in a `Map`, re-run `guardian_gate`, and submit when
   it passes.
2. You write `this.template.querySelector('div').innerHTML = html` in an LWC. `guardian_gate` fails
   with `LWC002`. Render the value in the template instead, re-run the gate, then submit.

See `skills/guardian/SKILL.md` for the full workflow and `docs/rules.md` for every rule.

## Working on Guardian itself

- `npm run build && npm run lint && npm run typecheck && npm test` must pass before a commit.
- Only `src/copado/client.ts` may run the `agentia` CLI. Tests mock it; no network calls in tests.
- A new rule needs a bad and a good fixture in `fixtures/sfdx-sample`, a test in `test/rules/`, and a
  section in `docs/rules.md`.
