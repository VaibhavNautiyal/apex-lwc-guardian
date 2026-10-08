# Apex & LWC Guardian: one-page summary

**What it is.** A plugin for the Copado Agentia CLI that checks the Apex and Lightning Web Component
files changed on a user story, blocks risky changes before `agentia cicd work submit`, and writes a
release brief to the story. It also runs as an MCP server, so AI coding agents check their own work.

**Problem.** AI-generated and rushed Salesforce code often hides governor-limit, security and testing
risks (queries in loops, missing sharing, hardcoded IDs, tests without assertions, HTML injection in
LWC). They are found late, and release managers lack a consistent summary of what changed and how to
roll it back.

**How it works.**

| Step   | Command / tool                                                        | Result                                                                          |
| ------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Check  | `agentia guardian scan`, MCP `guardian_scan`                          | Findings with rule, file, line, why it matters and how to fix                   |
| Block  | `agentia guardian gate`, MCP `guardian_gate`, Agentia pre-submit hook | Exit 1 on blocking findings; audit line per run                                 |
| Report | `agentia guardian brief`, MCP `guardian_brief`                        | Release brief: summary, components, findings, tests, rollback plan, gate result |

- 16 rules: 11 Apex (SOQL/DML/callouts in loops, sharing, hardcoded IDs, user-mode SOQL in exposed
  classes, test assertions, trigger logic, `Trigger.new[0]`, `SeeAllData`, empty catch) and 5 LWC
  (unhandled Apex calls, HTML injection, `eval`, hardcoded IDs/URLs, debug leftovers).
- Risk score 0-100, configurable thresholds and per-rule severity in `guardian.config.yml`.
- Copado integration through one adapter: the AI release agent writes the brief's summary; the brief
  goes into the story's Technical Specifications field without overwriting other content.

**Design choices.**

- **Trustworthy:** deterministic, fast lightweight analysis; every rule has bad/good fixtures and
  documented limits; rules prefer missing a rare case over false alarms.
- **Private:** source code is never logged, sent to the AI or posted to Slack (tested).
- **Robust to a beta CLI:** every Agentia call is isolated in `src/copado/client.ts`, verified against
  the real CLI, and fails soft: the brief is always written locally.
- **Fits existing flow:** Agentia's own pre-submit hook, CI exit codes, and MCP for Claude Code and
  Cursor.

**Status.** All phases done; 140+ automated tests (no network). Demo: `node scripts/demo.mjs setup`
builds a project where the gate fails on a risky story, passes after the fix, and writes the brief and
audit log. Still to confirm with real Copado credentials: the success payloads of the AI and user
story calls (docs/BLOCKERS.md, B3).

**Architecture.** See the diagram in [architecture.md](architecture.md).
