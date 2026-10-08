---
name: guardian
description: Check Salesforce Apex and Lightning Web Component changes for governor-limit, security and testing risks with Apex & LWC Guardian before submitting a Copado user story. Use after writing or editing any .cls, .trigger or lwc .js/.html file, and before running agentia cicd work submit.
---

# Apex & LWC Guardian

Guardian scans the Apex and LWC files changed on the current branch and reports risks such as SOQL
or DML in loops, missing sharing, hardcoded IDs, tests without assertions and unsafe HTML in LWC.

## Tools

Use the MCP tools when they are available, otherwise the CLI.

| Goal                    | MCP tool         | CLI                                         |
| ----------------------- | ---------------- | ------------------------------------------- |
| See findings            | `guardian_scan`  | `agentia guardian scan --json`              |
| Check the gate          | `guardian_gate`  | `agentia guardian gate --story <id> --json` |
| Write the release brief | `guardian_brief` | `agentia guardian brief --story <id>`       |

Every finding has `ruleId`, `severity`, `file`, `line`, `message`, `explanation` and `suggestion`.
Rule details and known limits: `docs/rules.md`.

## Workflow

1. After you write or edit Apex or LWC, run `guardian_scan`. To check only what you just touched,
   pass `files` (paths relative to `cwd`).
2. Fix **every `error` finding**. Use the `suggestion` field; do not silence a rule by moving code into
   a comment or string, renaming, or disabling the rule in `guardian.config.yml`.
3. Fix `warning` findings when the fix is small and safe. If you leave one, say why in your reply.
4. Run `guardian_gate`. Repeat steps 2-4 until `gate.passed` is `true`.
5. Only then submit the work (`agentia cicd work submit`). Never use `--skip-local-tests` to get past
   the gate.
6. When asked for release notes, run `guardian_brief` with the story ID.

If a tool returns `{"error": ...}`: exit code 2 means a bad argument or config (fix the input),
3 means the environment (not a git repository, or the base branch is missing: run
`git fetch origin <base>` or pass `base`). Do not retry the same call unchanged.

## Examples

**Fixing a SOQL query in a loop.** `guardian_scan` returns:

```json
{
  "ruleId": "APEX001",
  "severity": "error",
  "file": "force-app/main/default/classes/AccountService.cls",
  "line": 14,
  "message": "SOQL query inside a loop.",
  "suggestion": "Query once before the loop (collect IDs in a Set and use WHERE Id IN :ids), then read the results from a Map inside the loop."
}
```

Move the query above the loop, collect the IDs first, build a `Map<Id, Contact>` and read from it
inside the loop. Run `guardian_gate`; it reports `"gate": {"passed": true, ...}`. Submit.

**Unsafe HTML in an LWC.** `guardian_gate` fails with `LWC002` on `container.innerHTML = this.message`.
Replace it with a template binding (`<div>{message}</div>`) or `container.textContent = this.message`,
then run `guardian_gate` again before submitting.
