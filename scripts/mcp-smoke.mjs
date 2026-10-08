// Starts the built guardian-mcp bin over stdio, lists its tools and runs guardian_scan.
// Usage: npm run build && node scripts/mcp-smoke.mjs [project-folder]
import {fileURLToPath} from 'node:url'

import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js'

const bin = fileURLToPath(new URL('../bin/guardian-mcp.js', import.meta.url))
const project = process.argv[2] ?? process.cwd()

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [bin],
  env: {...process.env, GUARDIAN_PROJECT_ROOT: project},
})
const client = new Client({name: 'guardian-smoke', version: '1.0.0'})
await client.connect(transport)

const {tools} = await client.listTools()
console.log('tools:', tools.map((t) => t.name).join(', '))

const result = await client.callTool({name: 'guardian_scan', arguments: {all: true}})
const json = JSON.parse(result.content[0].text)
console.log(
  json.error
    ? `scan error: ${json.error.message}`
    : `scan: ${json.filesScanned} files, risk ${json.riskScore}`,
)

await client.close()
