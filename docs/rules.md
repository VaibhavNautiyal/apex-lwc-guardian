# Guardian rules

Each rule reports a finding with a rule ID, severity, file, 1-based line, a short explanation and a
suggested fix. Severities can be changed, and rules switched off, in `guardian.config.yml`.

## How the Apex rules read code

Guardian does not compile Apex. A small preprocessor (`src/lang/apex-preprocess.ts`):

- blanks out comments and the contents of string literals, keeping every line number the same, so
  text inside comments or strings never triggers a rule (APEX005 is the one rule that reads strings);
- matches brackets and finds loop bodies for `for`, `while` and `do`, including loops without braces;
- finds classes and methods, with the annotations and modifiers written before them.

This approach is fast and deterministic. It follows code **within one file** only: it does not know
which methods are called from a loop, and it does not resolve types. Where a rule is unsure it stays
quiet, because false positives cost more trust than a missed rare case.

| ID                                                                    | Severity | Title                                             |
| --------------------------------------------------------------------- | -------- | ------------------------------------------------- |
| [APEX001](#apex001-soql-query-inside-a-loop)                          | error    | SOQL query inside a loop                          |
| [APEX002](#apex002-dml-inside-a-loop)                                 | error    | DML inside a loop                                 |
| [APEX003](#apex003-http-callout-inside-a-loop)                        | error    | HTTP callout inside a loop                        |
| [APEX004](#apex004-class-has-no-sharing-declaration)                  | warning  | Class has no sharing declaration                  |
| [APEX005](#apex005-hardcoded-salesforce-record-id)                    | error    | Hardcoded Salesforce record ID                    |
| [APEX006](#apex006-exposed-soql-without-user-mode-or-fls-enforcement) | warning  | Exposed SOQL without user-mode or FLS enforcement |
| [APEX007](#apex007-test-method-without-assertions)                    | warning  | Test method without assertions                    |
| [APEX008](#apex008-logic-in-trigger-body)                             | warning  | Logic in trigger body                             |
| [APEX009](#apex009-trigger-reads-a-single-record-by-index)            | error    | Trigger reads a single record by index            |
| [APEX010](#apex010-test-uses-seealldatatrue)                          | warning  | Test uses SeeAllData=true                         |
| [APEX011](#apex011-empty-catch-block)                                 | warning  | Empty catch block                                 |

---

## APEX001 SOQL query inside a loop

- **Detects:** `[SELECT ...]`, `Database.query(`, `Database.queryWithBinds(`, `Database.countQuery(`
  and `Database.countQueryWithBinds(` inside the body of a `for`, `while` or `do` loop.
- **Why:** each query counts toward the limit of 100 SOQL queries per transaction. A 200-record trigger
  batch hits it.
- **Fix:** query once before the loop with `WHERE Id IN :ids`, put the results in a Map and read the Map
  inside the loop.
- **Not reported:** a SOQL for-loop header (`for (Account a : [SELECT ...])`), which is the recommended
  pattern; queries in comments or strings; `FOR UPDATE` clauses.
- **Limits:** a loop that calls a method which runs a query is not reported (no call graph). A query
  nested in several loops is reported once.

## APEX002 DML inside a loop

- **Detects:** DML statements (`insert`, `update`, `upsert`, `delete`, `undelete`, `merge`, including
  `insert as user x`) and `Database.insert/update/upsert/delete/undelete/merge/convertLead` calls
  (including `...Immediate` and `...Async` variants) inside a loop body.
- **Why:** each DML statement counts toward the limit of 150 per transaction.
- **Fix:** add records to a List in the loop and run one DML statement after it.
- **Not reported:** DML words in comments, strings, identifiers (`updated`, `isUpdateable()`), trigger
  event lists (`before update`) and SOQL `FOR UPDATE`.
- **Limits:** a DML keyword is only recognised at the start of a statement (after `;`, `{`, `}`, `)`,
  `else` or `do`). Methods called from a loop are not followed.

## APEX003 HTTP callout inside a loop

- **Detects:** `new Http().send(` and `<name>.send(` where `<name>` is declared in the same file with the
  type `Http` (local variable or field, also through `this.`).
- **Why:** a transaction allows 100 callouts and 120 seconds of total callout time.
- **Fix:** send one batched request, or move the work to Queueable or Batch Apex.
- **Limits:** an `Http` object passed in as a parameter of another type, or created in another class, is
  not recognised. `send(` on objects of other types is never reported.

## APEX004 Class has no sharing declaration

- **Detects:** a top-level `class` in a `.cls` file whose declaration has none of `with sharing`,
  `without sharing` or `inherited sharing`.
- **Why:** without a keyword the class takes the caller's sharing mode, or runs without sharing from
  contexts such as triggers, so users may see records they should not.
- **Fix:** declare `with sharing`, or `inherited sharing` for utilities. Use `without sharing` only on
  purpose.
- **Not reported:** `@isTest` classes, interfaces, enums, exception classes (`extends Exception`) and
  inner classes.
- **Limits:** inner classes do not inherit their outer class's sharing in Apex; they are skipped on
  purpose to avoid noise on simple wrapper classes. Review inner classes that run queries.

## APEX005 Hardcoded Salesforce record ID

- **Detects:** a string literal whose whole value looks like a real record ID:
  15 or 18 letters and digits, at least one digit, a known key prefix (common standard objects such as
  `001`, `003`, `005`, `00G`, `012`, or a custom-object prefix starting with `a`), and either a valid
  18-character checksum or, for 15 characters, the reserved `0` at position 6.
- **Why:** IDs differ between orgs and sandboxes, so the code breaks after deployment.
- **Fix:** look the record up at runtime (for example by `DeveloperName`), or use Custom Metadata or a
  Custom Setting.
- **Not reported:** `@isTest` classes (fake IDs are common in mocks), IDs in comments, IDs embedded in
  longer strings.
- **Limits:** standard objects whose prefix is not in the list are missed. Evaluated on the original
  text, since strings are blanked for every other rule.

## APEX006 Exposed SOQL without user-mode or FLS enforcement

- **Detects:** in a class that contains `@AuraEnabled` or `@RestResource`, each query that does not
  enforce the running user's access:
  - static SOQL without `WITH USER_MODE` or `WITH SECURITY_ENFORCED`;
  - `Database.query(...)` without `AccessLevel.USER_MODE`, unless a string in the file contains one of
    those clauses (the query text is usually built in a string).
- **Why:** these classes are called from the browser or an API and run in system mode, so the query can
  return fields and objects the user cannot read.
- **Fix:** add `WITH USER_MODE`, pass `AccessLevel.USER_MODE`, or filter with
  `Security.stripInaccessible`.
- **Not reported:** files that call `Security.stripInaccessible` anywhere; `@isTest` classes; queries
  with an explicit `WITH SYSTEM_MODE` / `AccessLevel.SYSTEM_MODE` (treated as a reviewed choice).
- **Limits:** the check is per file, not per method: a private helper query in an exposed class is also
  checked. Manual checks such as `isAccessible()` are not recognised.

## APEX007 Test method without assertions

- **Detects:** methods annotated `@isTest` (with or without parameters) or declared `testMethod` whose
  body has no `System.assert*(` or `Assert.*(` call.
- **Why:** such a test only proves the code did not throw. It adds coverage without checking behaviour.
- **Fix:** assert the expected result with `Assert.areEqual` or `System.assertEquals`.
- **Not reported:** `@TestSetup` methods; tests that call a helper method in the same file that asserts.
- **Limits:** helpers are followed one level deep and only within the file. Assertions made through
  other frameworks (for example a custom `Assertions` class) are not recognised; rename or configure
  the rule off if you use one.

## APEX008 Logic in trigger body

- **Detects**, in `.trigger` files:
  - each SOQL query or DML statement written directly in the trigger body;
  - a body with more than `triggerMaxLines` lines of logic (default 15). Blank lines, comments and
    lines that only hold braces do not count. Reported on the `trigger` line.
- **Why:** logic in triggers cannot be reused or unit tested on its own and makes execution order hard
  to control.
- **Fix:** move the logic into a handler class and call it from the trigger.
- **Limits:** a handler call counts as one line regardless of what it does, which is the point.

## APEX009 Trigger reads a single record by index

- **Detects:** `Trigger.new[<number>]` and `Trigger.old[<number>]`, in triggers and in classes (handlers
  often read the trigger context too). Any case and spacing.
- **Why:** triggers receive up to 200 records. Reading one ignores the rest in bulk loads and
  integrations.
- **Fix:** loop over `Trigger.new` / `Trigger.old`.
- **Limits:** indexing a local copy (`List<Account> l = Trigger.new; l[0]`) is not recognised.

## APEX010 Test uses SeeAllData=true

- **Detects:** `@isTest(... SeeAllData=true ...)` on a class or method, any case and spacing.
- **Why:** the test depends on the org's data, so it passes in one org and fails in another.
- **Fix:** create test data in the test or in a `@TestSetup` method.

## APEX011 Empty catch block

- **Detects:** `catch (...) { }` with nothing inside.
- **Why:** the error disappears, so failures go unnoticed.
- **Fix:** log, rethrow or handle the exception.
- **Not reported:** a catch block that contains only a comment. The comment is taken as a deliberate,
  documented choice.
