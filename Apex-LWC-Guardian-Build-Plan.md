# Apex & LWC Guardian: Build Plan for Claude Code

A plugin for **Copado Agentia CLI** that scans the Apex and LWC files changed on a user story, blocks risky changes before `work submit`, and writes a release brief to the story.

This file is the source of truth. Work through the phases in order. Do not skip Phase 0.

---

## 0. How to work (rules for Claude Code)

1. **Never invent Agentia CLI commands or flags.** Agentia CLI is in beta and changes. Anything marked `VERIFY` must be confirmed with `agentia --help`, `agentia <topic> --help`, or the docs before you code against it. Record what you find in `docs/agentia-notes.md`.
2. **Isolate every Copado call** behind one adapter file (`src/copado/client.ts`). If a command changes, only that file breaks.
3. **Keep the rules engine independent of Copado.** The scanner must run with no Copado login, on plain SFDX source.
4. **Work one phase at a time.** At the end of each phase: run lint, typecheck and tests, make sure the acceptance criteria pass, then commit with message `phase N: <summary>`.
5. **Write tests with each rule**, using the fixtures in `fixtures/`. A rule is not done until it has one "bad" and one "good" fixture.
6. **No network calls in tests.** Mock the Copado adapter.
7. **Prefer small, deterministic code** over clever code. If a rule is ambiguous, choose fewer false positives and document the limitation in the rule's docs.
8. If you hit a blocker, write it in `docs/BLOCKERS.md` and continue with the next task that does not depend on it.

---

## 1. Goal and scope

**Problem:** AI-generated and rushed Apex/LWC often contains governor-limit, security and testing risks that are caught late. Release managers have no consistent summary of what a change touches or how to roll it back.

**Solution:** three commands plus an MCP server:

| Command                  | Purpose                                                          |
| ------------------------ | ---------------------------------------------------------------- |
| `agentia guardian scan`  | Analyse changed Apex/LWC files against rules; print findings     |
| `agentia guardian gate`  | Same scan, but exit non-zero if blocking findings exist          |
| `agentia guardian brief` | Generate a release brief; optionally attach it to the user story |

**In scope (MVP):** scan, gate, brief, config file, audit log, MCP server, agent skill file, sample project, README, demo.
**Optional (only if time remains):** Slack webhook notification, Apex AST parser upgrade.
**Out of scope:** hosted services, a UI, Marketing Cloud, data deployments, replacing Copado's own quality gates.

---

## 2. Tech stack

- Node.js 20+, TypeScript (strict mode)
- oclif plugin, scaffolded with `npm init @copado/agentia-plugin` (VERIFY the exact scaffold output and required plugin conventions)
- Test runner: Vitest
- Lint/format: ESLint + Prettier
- Git access: `simple-git` or spawn `git` directly
- Config parsing: `yaml` and `zod` for validation
- MCP: `@modelcontextprotocol/sdk` (stdio transport)
- No runtime dependency on Salesforce CLI. Optional input: a test results JSON file from `sf apex run test --json`

---

## 3. Target repository structure

```
apex-lwc-guardian/
  package.json
  tsconfig.json
  README.md
  AGENTS.md                     # instructions for AI agents using the tool
  guardian.config.example.yml
  docs/
    agentia-notes.md            # what was VERIFIED in Phase 0
    rules.md                    # one section per rule: what, why, fix, limits
    demo-script.md
    BLOCKERS.md
  skills/guardian/SKILL.md      # agent skill file
  src/
    commands/guardian/
      scan.ts
      gate.ts
      brief.ts
    core/
      types.ts                  # Finding, Rule, ScanResult, GateResult
      scanner.ts                # runs rules over files
      changed-files.ts          # git diff vs base branch
      config.ts                 # load/validate config
      scoring.ts                # risk score
      audit.ts                  # JSONL audit log
      reporters/
        table.ts
        json.ts
        markdown.ts
    lang/
      apex-preprocess.ts        # strip comments/strings, track braces, loop context
      apex-rules/               # one file per rule
      lwc-preprocess.ts
      lwc-rules/
    brief/
      builder.ts                # assembles brief sections
      template.ts               # local fallback template
      ai.ts                     # calls Copado AI agent through adapter
    copado/
      client.ts                 # ONLY place that spawns `agentia ...`
    mcp/
      server.ts                 # stdio MCP server (bin: guardian-mcp)
    notify/
      slack.ts                  # optional
  fixtures/
    sfdx-sample/
      force-app/main/default/classes/   # *Bad.cls and *Good.cls pairs
      force-app/main/default/triggers/
      force-app/main/default/lwc/
  test/
    rules/                      # one test file per rule
    scanner.test.ts
    gate.test.ts
    brief.test.ts
    config.test.ts
```

---

## 4. Phases

### Phase 0: Discovery and setup (do first)

Tasks

1. Install: `npm install -g @copado/agentia-cli@beta` (VERIFY package name and tag). Run `agentia --version` and `agentia --help`.
2. Run `agentia setup` and note what it needs (login, org, API access). If it needs credentials that are not available, continue offline and rely on mocks.
3. List the commands relevant to us and capture their `--help` and `--json` output shapes: anything under `cicd` for user stories (`work` commands), anything for submitting work or promotions, and `ai agent ask`. Save findings in `docs/agentia-notes.md`.
4. Scaffold the plugin with `npm init @copado/agentia-plugin`. Read the generated README and example command to learn how plugin commands, flags and `--json` output are expected to look.
5. Confirm how to link the plugin locally (for example `agentia plugins link .`; VERIFY) and that a hello-world command runs as `agentia guardian hello`.
6. Open questions to answer in the notes:
   - Which command updates a user story with text or an attachment?
   - Is there a hook or pre-submit step where `guardian gate` can run, or is it manual or CI-only?
   - Does `ai agent ask --agent release` return JSON? What are its timeouts and auth needs?

Acceptance criteria

- `docs/agentia-notes.md` exists with real command output pasted in.
- A hello-world plugin command runs through `agentia`.
- Every `VERIFY` item in this plan is resolved or listed in `docs/BLOCKERS.md`.

### Phase 1: Project skeleton and core types

Tasks

1. Set up TypeScript strict, ESLint, Prettier, Vitest, npm scripts: `build`, `lint`, `typecheck`, `test`.
2. Define core types in `src/core/types.ts`:
   ```ts
   type Severity = 'error' | 'warning' | 'info'
   interface Finding {
     ruleId: string // e.g. APEX001
     severity: Severity
     file: string // repo-relative path
     line: number // 1-based
     message: string
     explanation: string // why it matters
     suggestion: string // how to fix
   }
   interface Rule {
     id: string
     title: string
     language: 'apex' | 'lwc'
     defaultSeverity: Severity
     check(file: SourceFile): Finding[]
   }
   interface ScanResult {
     filesScanned: number
     findings: Finding[]
     riskScore: number // 0-100
     baseRef: string
     headRef: string
   }
   interface GateResult extends ScanResult {
     passed: boolean
     blockingCount: number
   }
   ```
3. Create the fixtures folder structure (empty fixture files are fine for now).

Acceptance criteria: `npm run build && npm run lint && npm run test` pass on the skeleton.

### Phase 2: Apex scanner engine and rules

Approach: a **lightweight deterministic preprocessor**, not a full parser.

- `apex-preprocess.ts` takes Apex source and returns a version with comments and string literal contents blanked out (keep line numbers identical), plus helpers: brace-depth tracking, detection of `for`/`while`/`do` loop bodies (including single-statement loops), and class/method boundaries.
- Rules operate on the preprocessed text plus loop and method context.

Rule catalogue (implement in this order; each in `src/lang/apex-rules/`):

| ID      | Default severity | What it detects                                                                                                                                                                                               |
| ------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| APEX001 | error            | SOQL query (`[SELECT ...]` or `Database.query`) inside a loop                                                                                                                                                 |
| APEX002 | error            | DML (`insert`, `update`, `delete`, `upsert`, `undelete`, `merge`, `Database.insert` etc.) inside a loop                                                                                                       |
| APEX003 | error            | Callout (`Http.send`, `.send(` on `Http`) inside a loop                                                                                                                                                       |
| APEX004 | warning          | Class has no `with sharing` / `without sharing` / `inherited sharing` declaration                                                                                                                             |
| APEX005 | error            | Hardcoded 15 or 18 character Salesforce record ID in a string literal (check known prefixes and require at least one digit to limit false positives; evaluate on the original text since strings are blanked) |
| APEX006 | warning          | SOQL in an `@AuraEnabled` or `@RestResource` class with no `WITH USER_MODE` / `WITH SECURITY_ENFORCED` and no `Security.stripInaccessible` in the file                                                        |
| APEX007 | warning          | Test method (`@isTest` or `testMethod`) with no `System.assert*` / `Assert.*` call                                                                                                                            |
| APEX008 | warning          | Trigger body contains SOQL or DML directly, or more than N lines of logic (default N=15) instead of delegating to a handler                                                                                   |
| APEX009 | error            | Trigger uses `Trigger.new[0]` or `Trigger.old[0]` (not bulk safe)                                                                                                                                             |
| APEX010 | warning          | `@isTest(SeeAllData=true)`                                                                                                                                                                                    |
| APEX011 | warning          | Empty `catch` block                                                                                                                                                                                           |

For each rule, `explanation` and `suggestion` must be specific and short (1-2 sentences each).

Tests: for each rule, one bad and one good fixture, including edge cases such as: query inside a comment or string (must NOT trigger), query before a loop (must NOT trigger), single-statement loop without braces, nested loops, loop in a different method than the query.

Acceptance criteria

- All 11 rules implemented with tests, all passing.
- Bad fixtures produce exactly the expected findings (assert rule ID and line number). Good fixtures produce zero findings.
- `docs/rules.md` documents each rule, including known limitations.

### Phase 3: LWC rules

Rules (in `src/lang/lwc-rules/`, scanning `.js` and `.html` under `lwc/`):

| ID     | Default severity | What it detects                                                                                                                   |
| ------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| LWC001 | warning          | Imperative Apex call (`import x from '@salesforce/apex/...'` then `x(...)`) with no `.catch` and no `try/catch` around an `await` |
| LWC002 | error            | `innerHTML` / `outerHTML` assignment, or `insertAdjacentHTML`                                                                     |
| LWC003 | error            | `eval(` or `new Function(`                                                                                                        |
| LWC004 | warning          | Hardcoded record ID or absolute `https://` URL in JS (allow-list configurable)                                                    |
| LWC005 | info             | `console.log` / `debugger` left in                                                                                                |

Acceptance criteria: same standard as Phase 2 (tests, fixtures, docs).

### Phase 4: Config, changed files, scan and gate commands, audit log

Tasks

1. **Config** `guardian.config.yml` (validated with zod, with defaults):
   ```yaml
   baseBranch: main
   include: ['force-app/**']
   ignore: ['**/*.test.js', '**/node_modules/**']
   rules:
     APEX004: {severity: error}
     APEX011: {enabled: false}
   thresholds:
     failOn: error # error | warning
     maxRiskScore: 100 # gate fails if score exceeds this
   triggerMaxLines: 15
   audit: {enabled: true, path: .guardian/audit.jsonl}
   ```
2. **Changed files** (`changed-files.ts`): use `git diff --name-only --diff-filter=ACMR <baseBranch>...HEAD`, filtered by config include/ignore, and only `.cls`, `.trigger`, and `lwc/**/*.js|html`. Add `--all` flag to scan every matching file, and `--files <list>` to scan specific files.
3. **Scoring** (`scoring.ts`): weights error=10, warning=3, info=1, capped at 100. Document the formula.
4. **Reporters:** `table` (default, human readable, grouped by file), `json` (stable schema, used by agents and the MCP server), `markdown` (used by the brief).
5. **Commands:**
   - `scan`: flags `--base`, `--all`, `--files`, `--format table|json|markdown`, `--config`. Always exits 0 unless there is a usage or environment error.
   - `gate`: same flags, plus `--story <id>`. Exit codes: `0` pass, `1` blocking findings, `2` usage/config error, `3` environment error (not a git repo, base branch missing).
6. **Audit log** (`audit.ts`): append one JSON line per gate run: timestamp, git user, story id, base and head SHA, counts per severity, risk score, result, config hash, tool version. Never log source code.

Acceptance criteria

- `agentia guardian scan` and `agentia guardian gate` work on `fixtures/sfdx-sample` inside a temporary git repo created by the tests.
- Exit codes verified by tests.
- JSON output validated against a zod schema in tests.
- Audit file written and parseable.

### Phase 5: Release brief and Copado adapter

Tasks

1. **Copado adapter** (`src/copado/client.ts`): the only place that runs `agentia ...`. Use `child_process.spawn` with an argument array (never a shell string), a timeout, and `--json` output parsing. Expose:
   - `askReleaseAgent(prompt): Promise<string | null>`
   - `attachBriefToStory(storyId, markdown): Promise<boolean>`
     The exact commands come from `docs/agentia-notes.md` (Phase 0). If not available or failing, return `null` / `false` without throwing.
2. **Brief builder** (`builder.ts`) produces markdown with these sections: Summary (2-4 sentences), Changed components (grouped by Apex classes, triggers, LWC), Risk findings (table: rule, severity, file:line, fix), Test status (read an optional `--test-results <path>` JSON from `sf apex run test`; if absent, state "not provided"), Rollback plan (the base SHA, the list of changed files, and step-by-step: revert the commit(s), re-run validation, re-promote), and Gate result with risk score.
3. **AI mode:** build a prompt from the scan result and changed file list; call `askReleaseAgent`; use the response for the Summary section only. Everything else stays deterministic so the brief is reliable even if the AI is unavailable. Flag `--no-ai` skips it. Never send source code to the AI, only file names, rule IDs, counts and messages.
4. **Command** `brief`: flags `--story <id>` (required), `--base`, `--test-results`, `--no-ai`, `--attach` (try to attach to the story), `--out <path>` (default `.guardian/briefs/<story>.md`). Always write the file locally; if `--attach` fails, print a clear warning and keep the local file.

Acceptance criteria

- Brief generated for the sample project with and without AI (adapter mocked).
- When the adapter returns null, the template fallback is used and the brief is still complete.
- No source code appears in any prompt sent to the adapter (tested).

### Phase 6: MCP server and agent skill

Tasks

1. `src/mcp/server.ts`: stdio MCP server exposing tools `guardian_scan`, `guardian_gate`, `guardian_brief`. Each calls the core functions directly (not the CLI) and returns the JSON result. Validate inputs with zod. Add a `guardian-mcp` bin entry in `package.json`.
2. `skills/guardian/SKILL.md` and `AGENTS.md`: instruct AI agents to run `guardian_scan` after writing or editing Apex/LWC, fix every `error` finding, re-run until `guardian_gate` passes, and only then submit work. Include 2 short examples.
3. README snippet showing how to register the MCP server in Claude Code and Cursor (use each tool's documented config format; verify before writing).

Acceptance criteria

- MCP server starts and lists three tools (test with the SDK client or a script).
- `guardian_gate` over MCP returns the same result as the CLI for the same input.

### Phase 7: Optional extras (only if Phases 0-6 are done)

- **Slack notification** (`src/notify/slack.ts`): on gate failure, POST a short message to a webhook URL from env var `GUARDIAN_SLACK_WEBHOOK`. Message includes story, risk score, top 3 findings. No source code. Failure to send must never change the gate result.
- **Apex parser upgrade:** evaluate `@apexdevtools/apex-parser` (VERIFY it exists and is maintained) to replace the preprocessor for APEX001/002/003. Only adopt if it does not slow the scan noticeably and tests still pass.

### Phase 8: Demo, docs, submission

Tasks

1. **Demo project:** make `fixtures/sfdx-sample` a realistic mini SFDX project with a "bad" branch (a class with SOQL in a loop, no sharing, hardcoded ID, plus an LWC using innerHTML) and a "fixed" branch.
2. **`docs/demo-script.md`** (about 2 minutes):
   1. An AI agent writes the risky class.
   2. `agentia guardian gate --story US-0001` fails and shows exact lines and fixes.
   3. The agent fixes it (show via MCP).
   4. The gate passes, and `agentia guardian brief --story US-0001 --attach` writes the brief.
   5. Show the audit log line.
3. **README:** what it is, the problem, install, quick start, command reference, rule list (link to `docs/rules.md`), config reference, MCP setup, architecture diagram (Mermaid), limitations, roadmap.
4. **Final checks:** fresh clone, `npm ci`, `npm run build && npm test`, plugin link works, demo script runs end to end.
5. Prepare a short architecture diagram and a one-page summary for the submission.

Acceptance criteria: a stranger can follow the README and run the demo in under 10 minutes.

---

## 5. Suggested schedule (adjust to the real deadline)

| Day | Phases          |
| --- | --------------- |
| 1   | 0, 1            |
| 2   | 2               |
| 3   | 3, 4            |
| 4   | 5, 6            |
| 5   | 7 (optional), 8 |

If time is short, cut in this order: Slack notifications, parser upgrade, LWC rules LWC004 and LWC005, AI mode in the brief. Do **not** cut: scan, gate, brief (local file), tests, README, demo.

---

## 6. Quality bar and risks

- **False positives hurt trust.** Prefer missing a rare case over flagging valid code. Every rule documents its limits.
- **Beta CLI risk:** isolated in `src/copado/client.ts` and documented in `docs/agentia-notes.md`.
- **Privacy:** source code is never logged, never sent to AI, never posted to Slack.
- **Security:** spawn processes with argument arrays only; validate all inputs; no secrets in the repo (webhook URL via env var).
- **Determinism:** same input gives same findings and score; AI only affects the summary paragraph.

---

## 7. Definition of done

- [ ] `scan`, `gate`, `brief` work through `agentia guardian ...`
- [ ] 11 Apex rules and 5 LWC rules implemented, documented and tested
- [ ] Config file, audit log and exit codes implemented and tested
- [ ] Brief works with AI and with the fallback; attach failure never loses the local file
- [ ] MCP server exposes three tools; skill file and AGENTS.md written
- [ ] Sample project and demo script run end to end
- [ ] README complete; clean install verified
- [ ] Everything in `docs/agentia-notes.md` matches the real CLI behaviour

---

## 8. Starter prompt to paste into Claude Code

> Read `Apex-LWC-Guardian-Build-Plan.md` fully. Start with Phase 0 only. Do not write plugin code until you have verified the real Agentia CLI commands and recorded them in `docs/agentia-notes.md`. After Phase 0, show me a summary of what you found and any blockers, then wait for my go-ahead before starting Phase 1. For every later phase: implement, run lint, typecheck and tests, confirm the acceptance criteria, commit, and summarise.
