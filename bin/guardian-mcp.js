#!/usr/bin/env node
// Stdio MCP server for Apex & LWC Guardian. Run `npm run build` first when working from source.
import {main} from '../dist/mcp/server.js'

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
