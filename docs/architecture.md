# Architecture

```mermaid
flowchart LR
  subgraph Entry points
    CLI["agentia guardian scan / gate / brief<br/>(oclif commands)"]
    MCP["guardian-mcp<br/>(stdio MCP server)"]
    HOOK[".agentia_quality_gates.cmd/.sh<br/>(runs before work submit)"]
  end

  subgraph Core["Core (no Copado dependency)"]
    CFG["config.ts<br/>guardian.config.yml + zod"]
    FILES["changed-files.ts<br/>git diff base...HEAD"]
    SCAN["scanner.ts<br/>run rules, overrides"]
    SCORE["scoring.ts<br/>risk 0-100"]
    GATE["gate.ts<br/>thresholds"]
    AUDIT["audit.ts<br/>.guardian/audit.jsonl"]
    REP["reporters<br/>table / json / markdown"]
  end

  subgraph Rules
    APEX["apex-preprocess.ts<br/>+ APEX001-011"]
    LWC["lwc-preprocess.ts<br/>+ LWC001-005"]
  end

  subgraph Brief
    BUILD["builder.ts<br/>sections"]
    TPL["template.ts<br/>fallback summary"]
    AI["ai.ts<br/>prompt: names, IDs, counts only"]
  end

  ADAPTER["copado/client.ts<br/>ONLY place that runs agentia"]
  AGENTIA[("Agentia CLI<br/>ai agent ask --agent release<br/>cicd work get / update")]
  SLACK[("Slack webhook<br/>optional")]

  HOOK --> CLI
  CLI --> SCAN
  MCP --> SCAN
  CLI --> GATE
  MCP --> GATE
  CLI --> BUILD
  MCP --> BUILD
  SCAN --> CFG
  SCAN --> FILES
  SCAN --> APEX
  SCAN --> LWC
  SCAN --> SCORE
  GATE --> SCAN
  GATE --> AUDIT
  GATE --> SLACK
  CLI --> REP
  BUILD --> SCAN
  BUILD --> TPL
  BUILD --> AI
  AI --> ADAPTER
  BUILD -- "--attach" --> ADAPTER
  ADAPTER --> AGENTIA
```

## Design rules

- **Rules engine independent of Copado.** `src/core` and `src/lang` read plain SFDX source and git. They
  run with no Copado login; `scan --all` works without git.
- **One adapter.** `src/copado/client.ts` is the only file that spawns `agentia`, with argument arrays,
  no shell, timeouts and `--json` parsing. It never throws. If Agentia changes, only it breaks.
- **Deterministic.** The same files and config give the same findings, score and brief. The AI only
  writes the summary paragraph, and the brief is complete without it.
- **Privacy.** Source code is never logged, sent to the AI or posted to Slack. Prompts carry file
  names, rule IDs, titles, finding messages and counts only (tested).
- **Lightweight analysis.** Preprocessors blank comments and strings, keep line numbers, and find
  loops, classes and methods. A full Apex parser was measured and not adopted
  ([parser-evaluation.md](parser-evaluation.md)).

## Data flow of `gate`

1. Load and validate `guardian.config.yml` (exit 2 on errors).
2. Find the repository root, resolve the base branch (or `origin/<base>`) and list changed files:
   `git diff --name-only --diff-filter=ACMR <base>...HEAD`, plus uncommitted and untracked files,
   filtered by `include`/`ignore` and file type (exit 3 if not a git repository or the base is missing).
3. Run the enabled rules for each file's language; apply severity overrides; score.
4. Apply `failOn` and `maxRiskScore`; print the report; append the audit line; notify Slack on failure.
5. Exit 0 (pass) or 1 (blocking findings).
