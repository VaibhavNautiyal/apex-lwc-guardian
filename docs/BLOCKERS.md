# Blockers

Open items that block or change part of the plan. Details and command output are in `agentia-notes.md`.

## B1. No way to attach a file to a user story (affects Phase 5 `--attach`)

- **Found:** Agentia 1.0.0-beta.4 has no attachment or file-upload command for user stories.
- **Closest option:** `agentia cicd work update <id> --technical-specifications <text>` (max 30,000
  characters). It **overwrites** whatever is in that field.
- **Options:**
  1. Write the brief into Technical Specifications (overwrite). Simple, but can destroy existing content.
  2. Read the field first (`work get --json`), replace only a marked Guardian section
     (`<!-- guardian:start --> ... <!-- guardian:end -->`), and write it back. Safer. The JSON field
     name has to be confirmed with real credentials.
  3. Use a different field (`--functional-requirements`), or keep `--attach` local-only until Copado
     ships an attachment API.
- **Decision (2026-10-08):** use the closest option, the Technical Specifications field, written
  the safe way (option 2): `work get --json`, replace only the marked Guardian section, then
  `work update --technical-specifications`. If the story cannot be read, or no Technical
  Specifications field is found in the response, `--attach` does **not** write (to avoid wiping
  content) and prints a warning. `brief` always writes the local file.
- **Status:** decided; implemented in Phase 5. Field name still to confirm live (B3).

## B2. `&` in the project folder name breaks npm scripts on Windows (RESOLVED)

- **Found:** in `F:\My Salesforce Org\Apex & LWC Guardian`, `npm run build` fails because npm's
  cmd.exe shim cuts the path at `&`:
  ```
  'LWC' is not recognized as an internal or external command,
  Error: Cannot find module 'F:\My Salesforce Org\shx\lib\cli.js'
  ```
- **Workaround in use:** `npm run <script> --script-shell="C:/Program Files/Git/bin/bash.exe"`. Works.
  Not committed to `.npmrc`, because that path does not exist on macOS/Linux or other machines.
- **Recommended fix:** rename the folder to something without `&` (for example
  `F:\My Salesforce Org\apex-lwc-guardian`, which also matches the plan's repo name), then re-run
  `agentia plugins link .` from the new path.
- **Resolved (2026-10-08):** folder renamed to `F:\My Salesforce Org\Apex_LWC_Guardian`. Plain
  `npm run build` works, and `agentia plugins link . --no-install` was re-run from the new path
  (`agentia guardian hello` works).

## B3. No Copado credentials on this machine (affects live checks only)

- **Found:** neither a CICD API key nor an AI PAK is configured (see notes section 2).
- **Impact:** could not complete `agentia setup`, could not see a real `work get`, `work update` or
  `ai agent ask` response. Flags and error envelopes are verified; success payloads are from the
  README and CLI source only.
- **Decision (2026-10-08):** follow the plan. Continue offline with the adapter mocked (the plan's rule 6 requires that in tests anyway).
  Before the demo (Phase 8), run once with real credentials and confirm:
  - `ai agent ask --agent release --json` result shape (`result.content`)
  - whether `work update` accepts a story name (`US-0001`) or needs the Salesforce ID
  - the JSON field name for Technical Specifications in `work get --json`

## Minor notes (not blocking)

- `agentia setup` crashes inside a git repo with no commits (`git rev-parse --abbrev-ref HEAD`).
  `C:\Users\hp` is such a repo, so `setup` must be run from a real project repo.
- Users can bypass the quality-gate hook with `agentia cicd work submit --skip-local-tests`. Guardian
  is a guard rail there; CI should also run `agentia guardian gate`.
- The scaffold's dev dependencies report 4 high-severity npm audit advisories.
