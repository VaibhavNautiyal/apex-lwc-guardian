#!/usr/bin/env node
// Local web dashboard for Apex & LWC Guardian. Run `npm run build` first when working from source.
//   guardian-ui [--port 4870] [--no-open] [project folder]
import {resolve} from 'node:path'

import {openBrowser} from '../dist/commands/guardian/ui.js'
import {startUi} from '../dist/ui/server.js'

const args = process.argv.slice(2)
const portIndex = args.indexOf('--port')
const port = portIndex >= 0 ? Number(args[portIndex + 1]) : 4870
const folder = args.find((a, i) => !a.startsWith('--') && (portIndex < 0 || i !== portIndex + 1))

startUi(port, {defaultCwd: folder ? resolve(folder) : process.cwd()})
  .then(({url}) => {
    console.log(`Guardian dashboard running at ${url}`)
    console.log('Press Ctrl+C to stop.')
    if (!args.includes('--no-open')) openBrowser(url)
  })
  .catch((error) => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Try --port 0.` : error)
    process.exit(1)
  })
