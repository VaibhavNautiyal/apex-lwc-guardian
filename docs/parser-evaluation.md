# Apex parser upgrade: evaluation (Phase 7)

**Decision: not adopted.** APEX001-APEX003 keep the lightweight preprocessor
(`src/lang/apex-preprocess.ts`).

## Candidate

`@apexdevtools/apex-parser` 5.2.0 (ANTLR4 grammar, github.com/apex-dev-tools/apex-parser), last
published 2026-08-22. It is maintained and parses classes, triggers and inline SOQL/SOSL.

## Measurement (2026-10-08, Windows 11, Node 24.14.1)

All 23 `.cls` and `.trigger` files in `fixtures/sfdx-sample`, parsed with
`ApexParserFactory.createLexerAndParser(...).compilationUnit()` / `triggerUnit()`:

|                                                | Time     |
| ---------------------------------------------- | -------- |
| Parser: module load                            | 165 ms   |
| Parser: first pass (cold, as in every CLI run) | 1,365 ms |
| Parser: later passes (warm)                    | 70 ms    |
| Guardian preprocessor: per pass                | 7.5 ms   |

The parser reported no syntax errors on the fixtures. It adds about 17 MB to `node_modules`.

## Why not adopted

- The plan's condition is "only adopt if it does not slow the scan noticeably". Each `scan` or `gate`
  is a new process, so users would pay the cold cost (about 1.5 s) on every run, about 200 times the
  current cost. That is noticeable in an interactive agent loop and in the pre-submit hook.
- The current rules already pass every edge case in the tests (comments, strings, single-statement
  and nested loops, SOQL for-loop headers, do-while). A parse tree would not remove the main
  limitation, which is that loops calling other methods are not followed. That needs a call graph
  in either approach.
- A full parser rejects files with syntax errors, while the preprocessor still scans them.

## When to revisit

- If a rule needs real type or scope information (for example, following a method called from a
  loop within the same class), use the parser for that rule only and load it lazily, so other scans
  do not pay the start-up cost.
- If the MCP server becomes the main entry point: it is long-lived, so the warm cost (70 ms for 23
  files) is acceptable there.
