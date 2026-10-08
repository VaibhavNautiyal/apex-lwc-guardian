# Agentia CLI notes (Phase 0 discovery)

Verified on **2026-10-08** on Windows 11, Node v24.14.1, npm 11.11.0, git 2.48.1.
Everything below was run against the real CLI unless marked **UNVERIFIED (no credentials)**.
If Agentia changes, update this file first, then `src/copado/client.ts`.

---

## 1. Install and version

Package and tag are correct as written in the plan.

```console
$ npm view @copado/agentia-cli dist-tags --json
{ "latest": "1.0.0-beta.0", "alpha": "1.0.0-beta.0", "beta": "1.0.0-beta.4" }

$ npm install -g @copado/agentia-cli@beta
added 366 packages in 1m

$ agentia --version
@copado/agentia-cli/1.0.0-beta.4 win32-x64 node-v24.14.1
```

- Engine: `node >= 18`. oclif core plugins: `@oclif/plugin-help`, `@oclif/plugin-plugins`.
- `agentia update` installs the newest beta; the CLI warns in the background when a newer beta exists.
- Note: `latest` is behind `beta`. Always install `@beta`.

```console
$ agentia --help
TOPICS
  ai       Use Copado AI agents
  auth     Manage authentication credentials
  cicd     Manage Copado CICD workflows
  mcp      Start a local Model Context Protocol server for MCP-compatible clients
  plugins  List installed plugins.
  setup    Prepare Agentia local project assets
  testing  Manage Copado Robotic Testing projects, tests, runs, logs, and variables

COMMANDS
  help     Display help for agentia.
  plugins  List installed plugins.
  setup    Prepare this machine and the current project for Agentia. Guides
           CICD, AI, and CRT authentication, Cursor MCP, local quality gates,
           and AGENTS.md. ...
  update   Update the globally installed Agentia CLI to the newest beta release
```

## 2. Authentication and `agentia setup`

Two independent credentials matter to us:

| Purpose                     | How to set                                                                                    | Env var alternative                       |
| --------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------- |
| CICD (user stories, submit) | `agentia auth set --cicd <api-key> --region na\|emea\|emea2\|apac\|apac2` (or `--custom-url`) | `AGENTIA_CICD_API_KEY`                    |
| Copado AI (`ai agent ask`)  | `agentia auth set --ai <pak> --ai-org <org-id> [--ai-domain <host>] [--ai-workspace <uuid>]`  | `AGENTIA_AI_PAK` (+ other `AGENTIA_AI_*`) |

Credentials are stored in the system keychain; `--local` stores them per project and user.

**No credentials are configured on this machine.** Real output:

```console
$ agentia ai quota get --json
{
  "error": {
    "message": "AI PAK is not configured. Run `agentia auth set --ai <pak> --ai-domain <domain> --ai-org <org-id>` or set AGENTIA_AI_PAK.",
    "name": "Error"
  },
  "transactionId": "01a11a31-333f-719d-afeb-29bab435e1ea"
}

$ agentia cicd work list --page-size 1 --json      # exit code 1
{
  "error": {
    "message": "CICD API key is not configured. Run `agentia auth set --cicd <key> [--region <region> | --custom-url <url>]` or set AGENTIA_CICD_API_KEY.",
    "name": "Error"
  },
  "transactionId": "01a11a31-446f-73b7-bea2-517c06f5ed50"
}
```

`agentia setup` is **interactive only** (no flags). Its first prompt, in a fresh git repo:

```console
$ agentia setup
CICD authentication
CICD: not set
? Configure global CICD authentication for all projects? (Y/n)
```

Per its description it then walks through AI auth, CRT auth, Cursor MCP config, local quality-gate
scripts and `AGENTS.md`. It could not be completed here (no credentials, non-interactive shell).

Beta quirk: run inside a git repository that has **no commits**, setup crashes immediately:

```console
 »   Error: Command failed: git rev-parse --abbrev-ref HEAD
 »   fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.
```

## 3. `--json` envelope and exit codes (Agentia's own commands)

- Success (from the CLI README, `work get`): `{ "result": { ... }, "status": 0, "transactionId": "..." }`
- Failure (real, above): `{ "error": { "message": "...", "name": "Error", "oclif"?: { "exit": N } }, "transactionId": "..." }`
  with a non-zero process exit code.
- So the adapter must: parse stdout as JSON, return `json.result` when present, treat `json.error` or a
  non-zero exit as failure.

## 4. User story (`cicd work`) commands relevant to us

Full command list under `cicd work`: `create, delete, done, environment-sync, get, list, open, promote,
publish, push, set, status, submit, test, test apex, update, commit, deployment-step *`.

### Read a story

```console
$ agentia cicd work get --help
USAGE
  $ agentia cicd work get [ID] [--json] [--user-stories-ahead-behind]
ARGUMENTS
  [ID]  User story ID (defaults to the active work item from `work set`)
```

README example result fields: `id, name ("US-0001"), title, status, project, projectName, pipelineId,
sourceEnvironment, baseBranch, epic{...}, feature{...}`. `baseBranch` is useful as our default `--base`.

`cicd work status [ID] [--json] [--metadata-list-only]` accepts an ID **or name** and defaults to the
active work item; `--metadata-list-only` returns local branch metadata without an API call.

`cicd work set <ID|name>` checks out `feature/<user-story-name>` and records
`lastWorkItemId / lastWorkItem / lastBaseBranch` in `.agentia/config.user.json`.

### Write text to a story (closest thing to "attach")

```console
$ agentia cicd work update --help
USAGE
  $ agentia cicd work update [ID] [--json] ... [--acceptance-criteria <value>] ...
    [--functional-requirements <value>] ... [--technical-specifications <value>] ...
ARGUMENTS
  [ID]  User story ID (defaults to the active work item from `work set`)
FLAGS
  --acceptance-criteria=<value>       Acceptance criteria (maximum 255 characters)
  --functional-requirements=<value>   Functional requirements (maximum 30000 characters)
  --technical-specifications=<value>  Technical specifications (maximum 30000 characters)
  --title=<value>                     Title (maximum 255 characters)
  ...
```

**There is no command to attach a file to a user story.** The only `attach` wording in the CLI is for
data commits (`cicd data commit create/list`), which is a different feature. `cicd job result-file` is
read-only. The usable write path is `cicd work update <id> --technical-specifications <markdown>`
(30,000 char limit), which **overwrites** the field. See BLOCKERS.md B1.

The `ID` argument of `work update` and `work get` is described as "User story ID"; `work set`/`status`
explicitly accept "ID or name". Whether `update` accepts `US-0001` is **UNVERIFIED (no credentials)**
(the README does show `work get US-0001`).

### Submit

```console
$ agentia cicd work submit --help
Submit the current feature/<lastWorkItem> work item for pipeline quality gates and validation. Runs
project-root .agentia_quality_gates.sh (macOS/Linux) or .agentia_quality_gates.cmd (Windows) when
present, pushes and registers commits when the branch is ahead of origin, then calls headless
work/submit (Promote Action with validate=true). ...
USAGE
  $ agentia cicd work submit [--json] [--skip-nested-metadata-detection]
    [--apex-test-classes <value>] [--deploy] [--done] [--skip-local-tests] [--skip-pull-request]
```

Related: `work publish` (alias `work push`) pushes and registers commits; `work done` = `submit --done`;
`work promote` is experimental and skips quality gates; `cicd promotion run <id> --operation merge|merge_and_deploy`.

## 5. Pre-submit hook: local quality gates (answers open question 2)

**Yes, there is a real pre-submit hook.** `cicd work submit` and `cicd work test` run a project-root
script: `.agentia_quality_gates.cmd` on Windows, `.agentia_quality_gates.sh` on macOS/Linux.

Behaviour verified empirically with a probe script in a scratch repo:

```console
# .agentia_quality_gates.cmd = "echo GATE RAN cwd=%CD% classes=%AGENTIA_APEX_TEST_CLASSES% & exit /b 1"
$ agentia cicd work test --json                     # process exit code 1
GATE RAN cwd=C:\...\setup-probe classes=
{
  "error": {
    "oclif": { "exit": 1 },
    "message": "Local quality gates failed (exit 1) when running '.agentia_quality_gates.cmd'. Re-run with --skip-local-tests to bypass local gates.",
    "name": "Error"
  },
  "transactionId": "01a11a35-1ce4-716a-a5c4-9cb1ba41071b"
}

# script exits 0
$ agentia cicd work test                            # exit code 0
Running local quality gates (.agentia_quality_gates.cmd)...
GATE OK
Finished local quality gates (.agentia_quality_gates.cmd).
 »   Warning: Failed to report local quality gates result: not on a feature/US-XXXX branch.

# script exits 3
$ agentia cicd work test                            # exit code 3
 »   Error: Local quality gates failed (exit 3) when running '.agentia_quality_gates.cmd'. ...
```

Confirmed facts:

- The script runs with **cwd = project root**; its stdout streams to the user.
- A non-zero exit fails the command and the **script's exit code is propagated** (1 → 1, 3 → 3).
- In `submit`, the gate runs **before** push and before the headless submit call (read in
  `dist/commands/cicd/work/submit.js`: `LocalQualityGatesError` → `this.error(..., {exit: error.exitCode || 1})`).
- `--apex-test-classes` is passed to the script as env var `AGENTIA_APEX_TEST_CLASSES`.
- Users can bypass with `--skip-local-tests`, so this is a guard rail, not an enforcement point.
- `work test` without a project script runs a stock sample; `work submit` without one skips gates.
- Recording the gate result on the story needs a Copado Extension Configuration named
  `Local Quality Gate` (Phase `Test`, Tool `None`, Test Type `Unit Test`) and a `feature/US-XXXX` branch.

**Plan for Guardian:** ship sample `.agentia_quality_gates.cmd` / `.sh` that call
`agentia guardian gate` and exit with its code. Our exit codes 0/1/2/3 pass straight through.

## 6. Copado AI: `ai agent ask` (answers open question 3)

```console
$ agentia ai agent ask --help
USAGE
  $ agentia ai agent ask -p <value> [--json] [--agent plan|build|test|release|operate|knowledge]
    [--component <value>] [--credential-id <value>] [--dialogue <value>] [--timeout <value>]
    [--force-credential-sync] [--no-credential-sync] [--no-stream] [--sf-org <value>]
    [--user-story <value>] [--work-item <value>] [--workspace <value>]
FLAGS
  -p, --prompt=<value>     (required) Natural language instruction for the agent
      --agent=<option>     [default: knowledge] <options: plan|build|test|release|operate|knowledge>
      --timeout=<value>    AI gateway timeout in seconds for workspace, dialogue, and message calls
      --user-story=<value> User story identifier to include in prompt context
      --no-credential-sync Skip Copado CICD workspace credential synchronization
```

- `--agent release` exists. `--json` is supported; the skill docs recommend `--json --no-stream` for tools.
- JSON result fields (read from the CLI source of `runAiAsk`; values UNVERIFIED without credentials):
  `agent, assistantId, completed, content, warnings[], followups[{content}], links[{title?, url?}]`,
  inside the standard `{ result, status, transactionId }` envelope. We only need `result.content`.
- Auth: AI PAK (`auth set --ai ...` or `AGENTIA_AI_PAK`). For `plan|build|test` it may also sync a
  CICD credential; we will pass `--no-credential-sync` since we target `release`.
- Default timeout: not documented, and the bundled runtime is obfuscated. We will pass `--timeout`
  explicitly **and** enforce our own child-process timeout.
- `--user-story` puts the story into the agent's prompt context.

## 7. Agentia MCP server (for reference, Phase 6)

`agentia mcp start` is a stdio MCP server exposing CLI-wrapping tools (`agentia_work_get`,
`agentia_work_update`, `agentia_ai_ask`, `agentia_work_submit`, ...). Documented client config:

```json
// Cursor: .cursor/mcp.json or ~/.cursor/mcp.json
{ "mcpServers": { "agentia": { "type": "stdio", "command": "agentia", "args": ["mcp", "start"],
  "env": { "AGENTIA_PROJECT_ROOT": "${workspaceFolder}" } } } }

// Claude Code: `claude mcp add`, ~/.claude.json, or project .mcp.json
{ "mcpServers": { "agentia": { "type": "stdio", "command": "agentia", "args": ["mcp", "start"] } } }
```

**Plugins cannot register MCP tools** with `agentia mcp start` (scaffold README: "Not supported yet").
So Guardian keeps its own `guardian-mcp` bin, as the plan says.

## 8. Plugin scaffold

`npm init @copado/agentia-plugin` resolves to `@copado/create-agentia-plugin@0.3.0`. It is
interactive only (readline prompts: directory, package name, description, author, topic, command name),
then runs `npm install`. We drove its exported `main()` with fixed answers:
package `apex-lwc-guardian`, topic `guardian`, command `hello`.

Generated files: `.gitignore, package.json, package-lock.json, README.md, tsconfig.json,
src/index.ts, src/commands/guardian/hello.ts`.

Conventions it sets (keep these):

```jsonc
// package.json
"type": "module",                      // ESM
"dependencies": { "@oclif/core": "^4" },
"devDependencies": { "@types/node": "^18", "oclif": "^4", "shx": "^0.3.3", "typescript": "^5" },
"oclif": {
  "bin": "agentia", "dirname": "agentia-cli",
  "commands": "./dist/commands",          // one file per command: src/commands/<topic>/<name>.ts
  "topics": { "guardian": { "description": "..." } }
},
"scripts": { "build": "shx rm -rf dist && tsc -b", "prepack": "npm run build && oclif manifest", ... }
// tsconfig: module/moduleResolution Node16, target es2022, strict, rootDir src, outDir dist
```

Sample command shape (oclif v4): `export default class X extends Command` with `static override
description/examples/args/flags` and `async run()` using `this.parse(X)`. The scaffold does not use
`enableJsonFlag`; for `--json` we will use oclif's built-in `static enableJsonFlag = true` and return
the result object from `run()`.

Scaffold README limits ("Not supported yet"): calling Agentia CLI internals (auth, work items, git),
wrapping existing Agentia commands such as `cicd work submit`, registering MCP tools. A first-party
integration API is "planned". → Our design (spawn `agentia` from one adapter file) is the supported way.

`npm install` reported 4 high-severity advisories in the scaffold's dev dependencies (oclif/shx tree).
Dev-only; revisit when bumping versions in Phase 1.

## 9. Linking and hello world (acceptance)

```console
$ npm run build   # needed --script-shell before the folder rename, see BLOCKERS.md B2
$ agentia plugins link . --no-install
@copado/agentia-cli: Linking plugin .... done

$ agentia plugins
apex-lwc-guardian 0.1.0 (link) F:\My Salesforce Org\Apex_LWC_Guardian

$ agentia guardian hello
hello Agentia from apex-lwc-guardian

$ agentia guardian hello World --from guardian
hello World from guardian

$ agentia guardian --help
Apex and LWC risk scanning, gating and release briefs
USAGE
  $ agentia guardian COMMAND
COMMANDS
  guardian hello  Print a greeting from the apex-lwc-guardian plugin
```

Every invocation of a linked ESM plugin prints this to **stderr** (stdout stays clean, so JSON output
is safe to pipe):

```
 »   Warning: apex-lwc-guardian is a linked ESM module and cannot be auto-transpiled. Existing compiled source will be used instead.
```

Rebuild (`npm run build`) after every TypeScript change; linked plugins load `dist/`.

## 10. Other plan VERIFY items

| Item                                               | Result                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `@copado/agentia-cli@beta` package/tag             | Verified (1.0.0-beta.4)                                                              |
| Scaffold output and conventions                    | Verified (section 8)                                                                 |
| Plugin link command                                | Verified: `agentia plugins link .`                                                   |
| Command that updates a story with text/attachment  | Text only: `cicd work update --technical-specifications`. No attachment. BLOCKERS B1 |
| Pre-submit hook                                    | Verified: `.agentia_quality_gates.cmd/.sh` (section 5)                               |
| `ai agent ask --agent release` JSON, timeout, auth | Flags verified; live response UNVERIFIED (BLOCKERS B3)                               |
| Claude Code / Cursor MCP config format             | Documented formats captured (section 7); re-check in Phase 6                         |
| `@apexdevtools/apex-parser` exists and maintained  | Yes: v5.2.0, last published 2026-08-22, github.com/apex-dev-tools/apex-parser        |

## 11. Adapter design consequences (for `src/copado/client.ts`)

- Spawn `agentia` with an argument array, `shell: false`. On Windows the global `agentia` is an npm
  `.cmd` shim, so resolve and run it as `node <npm-root>/@copado/agentia-cli/bin/run.js` (or allow an
  `AGENTIA_BIN` override) rather than `shell: true`.
- `askReleaseAgent(prompt)` → `agentia ai agent ask --agent release --json --no-stream
--no-credential-sync --timeout <s> -p <prompt> [--user-story <id>]`; return `result.content` or `null`.
- `attachBriefToStory(id, md)` → `agentia cicd work update <id> --technical-specifications <md> --json`,
  pending the decision in BLOCKERS B1; return `true` only on exit 0 and no `error` key.
- Truncate to 30,000 characters before sending; note truncation in the brief.
