# Demo script (about 2 minutes)

**Story:** an AI agent builds an "account health" feature for user story US-0001. Guardian catches
governor-limit and security problems before submit, the agent fixes them, and the release manager
gets a brief.

## Before the demo (5 minutes, once)

```sh
# In the Guardian folder
npm ci && npm run build
agentia plugins link .

# Create the demo Salesforce project (any empty folder)
node scripts/demo.mjs setup ../guardian-demo
cd ../guardian-demo
```

This creates a git repository with `main` (a clean project) and `feature/US-0001` checked out, which
holds the risky change: `AccountHealthService.cls`, its test, and the `accountHealth` LWC. The
branch `feature/US-0001-fixed` holds the fixed version, as a fallback.

Optional, for step 3 over MCP: register the server in Claude Code from the demo folder (see the
README, "MCP server"):

```sh
claude mcp add --transport stdio --scope project guardian -- node /abs/path/apex-lwc-guardian/bin/guardian-mcp.js
```

## 1. The AI agent wrote risky code (20 s)

Open `force-app/main/default/classes/AccountHealthService.cls` and
`force-app/main/default/lwc/accountHealth/accountHealth.js`.

> "An agent wrote this feature in a minute. It compiles, and the test passes. But there's a query
> inside a loop, no sharing keyword, a hardcoded queue ID, a test without assertions, and an LWC that
> injects HTML."

## 2. The gate blocks it (30 s)

```sh
agentia guardian gate --story US-0001
```

Expected: 8 findings with exact lines and fixes (APEX004, APEX005, APEX001, APEX006, APEX002 in the
class, APEX007 in the test, LWC001 and LWC002 in the component), then

```text
4 files scanned: 4 errors, 4 warnings, 0 info. Risk score 52/100.
Gate: FAILED - 4 blocking findings (severity error or higher)
```

and exit code 1. Point at `APEX001 ... line 8` and its `Fix:` line.

> "This is also wired into Agentia's own pre-submit hook (`.agentia_quality_gates.cmd`/`.sh`), so
> `agentia cicd work submit` stops here too."

## 3. The agent fixes it, via MCP (40 s)

In Claude Code (with the `guardian` MCP server registered), ask:

> "Run guardian_gate for story US-0001, fix every error it reports, and run it again until it
> passes."

The agent calls `guardian_gate`, reads `suggestion` for each finding, edits the files and re-runs the
gate. Without Claude Code, simulate the agent's edit:

```sh
node scripts/demo.mjs fix .
```

Show the diff: the query moved out of the loop with `WITH USER_MODE`, `with sharing`, queue looked up
by `DeveloperName`, assertions added, LWC uses a template binding and `try/catch`.

## 4. The gate passes and the brief is written (20 s)

```sh
agentia guardian gate --story US-0001
agentia guardian brief --story US-0001 --test-results .guardian/test-results.json --attach
```

Expected: `Gate: PASSED`, exit code 0. Then `Release brief written to .../.guardian/briefs/US-0001.md`.
Without Copado credentials you will also see two warnings: the AI summary falls back to the template,
and `--attach` cannot read the story, so the local file is kept. With credentials, the summary comes
from the Copado release agent and the brief is written into the story's Technical Specifications.

Open `.guardian/briefs/US-0001.md`: summary, changed components, findings, test status (84%
coverage), rollback plan with the base commit, and gate result.

## 5. The audit log (10 s)

```sh
cat .guardian/audit.jsonl
```

Two lines, one per gate run: `"result":"fail"` then `"result":"pass"`, with story, user, base and
head SHA, counts, risk score and config hash. No source code.

> "Every gate decision is recorded, so the release manager can see what was checked, by whom, and
> against which commit."

## Reset

```sh
git checkout -- . && git checkout feature/US-0001
rm .guardian/audit.jsonl
```
