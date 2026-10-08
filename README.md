# Apex & LWC Guardian

A plugin for the Copado Agentia CLI that scans the Apex and LWC files changed on a user story, blocks
risky changes before `agentia cicd work submit`, and writes a release brief to the story.

```text
agentia guardian scan    Analyse changed Apex/LWC files and print findings
agentia guardian gate    Same scan; exit 1 when blocking findings exist
agentia guardian brief   Write a release brief; optionally attach it to the user story
```

## Install (from source)

```sh
npm ci
npm run build
agentia plugins link .
agentia guardian --help
```

Re-run `npm run build` after TypeScript changes. Linked plugins load the compiled `dist/` output.

## MCP server

`guardian-mcp` is a stdio MCP server with three tools: `guardian_scan`, `guardian_gate` and
`guardian_brief`. They return the same JSON as the CLI with `--json`. Each tool takes an optional
`cwd` (absolute path of the project); without it the server uses `GUARDIAN_PROJECT_ROOT`, then
`AGENTIA_PROJECT_ROOT`, then its own working folder.

When working from source, run the bin with Node: replace `/abs/path/apex-lwc-guardian` below with this
folder. After `npm install -g apex-lwc-guardian` you can use `"command": "guardian-mcp"` with no args.

**Claude Code** ([docs](https://code.claude.com/docs/en/mcp)). From your Salesforce project:

```sh
claude mcp add --transport stdio --scope project guardian -- node /abs/path/apex-lwc-guardian/bin/guardian-mcp.js
```

or add it to the project's `.mcp.json`:

```json
{
  "mcpServers": {
    "guardian": {
      "type": "stdio",
      "command": "node",
      "args": ["/abs/path/apex-lwc-guardian/bin/guardian-mcp.js"]
    }
  }
}
```

**Cursor** ([docs](https://cursor.com/docs/mcp)): `.cursor/mcp.json` in the project, or
`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "guardian": {
      "type": "stdio",
      "command": "node",
      "args": ["/abs/path/apex-lwc-guardian/bin/guardian-mcp.js"],
      "env": {"GUARDIAN_PROJECT_ROOT": "${workspaceFolder}"}
    }
  }
}
```

Check it starts: `npm run build && node scripts/mcp-smoke.mjs /path/to/project`.

Agents should follow [AGENTS.md](AGENTS.md) and [skills/guardian/SKILL.md](skills/guardian/SKILL.md).

## Documentation

- [docs/rules.md](docs/rules.md): every rule, the risk score and known limits
- [guardian.config.example.yml](guardian.config.example.yml): configuration
- [docs/agentia-notes.md](docs/agentia-notes.md): verified Agentia CLI behaviour
- [docs/BLOCKERS.md](docs/BLOCKERS.md): open items
