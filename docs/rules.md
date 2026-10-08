# Guardian rules

Each rule reports a finding with a rule ID, severity, file, 1-based line, a short explanation and a
suggested fix. Severities can be changed, and rules switched off, in `guardian.config.yml`.

## Risk score

Every scan has a risk score from 0 to 100: the sum of a weight per finding, capped at 100.

| Severity | Weight |
| -------- | ------ |
| error    | 10     |
| warning  | 3      |
| info     | 1      |

For example, 2 errors and 3 warnings score `2 x 10 + 3 x 3 = 29`. Severity overrides in the config
change the weight used. `gate` fails when any finding is at or above `thresholds.failOn`, or when the
score is above `thresholds.maxRiskScore`.

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

---

## How the LWC rules read code

LWC rules scan `.js` and `.html` files under `lwc/`. The JavaScript preprocessor
(`src/lang/lwc-preprocess.ts`) blanks comments, string contents, the text parts of template literals
and regular-expression literals, keeping line numbers. Code inside `${...}` stays visible. In HTML,
`<!-- -->` comments are blanked. As with Apex, rules look at one file at a time.

| ID                                                                      | Severity | Title                                                     |
| ----------------------------------------------------------------------- | -------- | --------------------------------------------------------- |
| [LWC001](#lwc001-imperative-apex-call-without-error-handling)           | warning  | Imperative Apex call without error handling               |
| [LWC002](#lwc002-html-injection-innerhtml-outerhtml-insertadjacenthtml) | error    | HTML injection (innerHTML, outerHTML, insertAdjacentHTML) |
| [LWC003](#lwc003-eval-or-function-constructor)                          | error    | eval or Function constructor                              |
| [LWC004](#lwc004-hardcoded-record-id-or-absolute-url)                   | warning  | Hardcoded record ID or absolute URL                       |
| [LWC005](#lwc005-consolelog-or-debugger-left-in)                        | info     | console.log or debugger left in                           |

## LWC001 Imperative Apex call without error handling

- **Detects:** calls to a function imported from `@salesforce/apex/...` where a rejected promise is not
  handled:
  - `await apexMethod()` that is not inside a `try` block with a `catch` clause;
  - `apexMethod().then(...)` used as a statement with no `.catch(...)` and no two-argument `.then(ok, err)`;
  - `apexMethod();` with the promise ignored.
- **Why:** a failed call (validation rule, limit, expired session) is silently lost and the component
  is left half-updated.
- **Fix:** add `.catch()` or wrap the `await` in `try/catch`, and show the error to the user.
- **Not reported:** `@wire` adapters; `return apexMethod()` (the caller handles it); promises stored in
  a variable, passed as an argument (for example to `Promise.all`) or returned from an arrow function.
  These are followed elsewhere and checking them would need data-flow analysis.
- **Limits:** `try/finally` without `catch` does not count as handling. A `try/catch` in a calling
  function is not seen.

## LWC002 HTML injection (innerHTML, outerHTML, insertAdjacentHTML)

- **Detects:** in JavaScript, assignments (`=` and `+=`) to `.innerHTML` or `.outerHTML`, and calls to
  `insertAdjacentHTML(`; in templates, the `lwc:inner-html` directive.
- **Why:** HTML strings built from data allow cross-site scripting.
- **Fix:** render markup in the template, set `textContent`, or use `lightning-formatted-rich-text`.
- **Not reported:** reading `innerHTML`, comparisons (`===`), mentions in comments and strings.
- **Limits:** every write is reported, even of constant strings, because the rule cannot tell where
  the value comes from. Downgrade or disable the rule in config if a component writes trusted markup.

## LWC003 eval or Function constructor

- **Detects:** `eval(`, `window.eval(` / `globalThis.eval(` / `self.eval(`, `new Function(` and
  `Function(`.
- **Why:** strings run as code allow injection and are blocked by Lightning Web Security in many cases.
- **Fix:** use plain functions, a lookup table of handlers, or `JSON.parse` for data.
- **Not reported:** methods named `eval` on other objects (`engine.eval(`), identifiers that end in
  `Function` (`isFunction(`), mentions in comments and strings.
- **Limits:** `setTimeout('code')` with a string argument is not reported.

## LWC004 Hardcoded record ID or absolute URL

- **Detects:** a string (or a static part of a template literal) that is a record ID (same check as
  APEX005) or starts with `http://` or `https://` followed by a host.
- **Why:** IDs and hosts differ between orgs, sandboxes and My Domain settings.
- **Fix:** take IDs from `@api`/`recordId` or Apex; use `NavigationMixin` or relative paths for
  Salesforce pages, and Named Credentials or Custom Metadata for external endpoints.
- **Not reported:** XML namespace URIs under `http://www.w3.org/` (for example the SVG namespace),
  URLs that start with a prefix in the config `urlAllowList`, URLs whose host is an expression
  (`` `https://${host}/x` ``), mentions in comments.
- **Limits:** IDs and URLs built by concatenating short strings are not recognised.

## LWC005 console.log or debugger left in

- **Detects:** `console.log(`, `console.debug(` and `debugger` statements.
- **Why:** development leftovers clutter the console, can expose record data, and `debugger` pauses
  users who have developer tools open.
- **Fix:** remove them before release.
- **Not reported:** `console.error`, `console.warn` and `console.info` (legitimate reporting), `log`
  methods on other objects, mentions in comments and strings.
