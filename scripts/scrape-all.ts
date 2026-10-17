/**
 * scrape-all.ts
 *
 * Orchestrates the full EBK data enrichment pipeline:
 *   1. scrape-salaries  — Basketball Reference career earnings (post-1985 players)
 *   2. scrape-popularity — Wikipedia pageviews + EBK score popularity penalty
 *
 * Designed to run as a one-time Railway job against the production DB.
 * Both sub-scripts are resumable (START_INDEX env var) so if the job is
 * interrupted, re-run with START_INDEX=<last completed index>.
 *
 * Usage (Railway one-time job):
 *   npm run scrape:all
 *
 * Env vars (inherited from Railway environment):
 *   DATABASE_URL  — production PostgreSQL connection string (required)
 *   DRY_RUN       — set to "1" to log without writing
 */

import { execSync } from 'child_process'
import path from 'path'

const root    = path.resolve(__dirname, '..')
const tsNode  = `npx ts-node --project ${path.join(root, 'tsconfig.seed.json')}`
const scripts = path.join(root, 'scripts')

function run(label: string, scriptPath: string) {
  console.log('\n' + '='.repeat(60))
  console.log(`▶  ${label}`)
  console.log('='.repeat(60) + '\n')
  execSync(`${tsNode} ${scriptPath}`, {
    stdio: 'inherit',
    env: process.env,
    cwd: root,
  })
}

async function main() {
  console.log('EBK Full Data Enrichment Pipeline')
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? '✓ set' : '✗ NOT SET — exiting'}`)
  if (!process.env.DATABASE_URL) process.exit(1)

  const start = Date.now()

  run('Phase 1 of 2 — Basketball Reference Salary Scraper', path.join(scripts, 'scrape-salaries.ts'))
  run('Phase 2 of 2 — Wikipedia Pageviews + EBK Score Update', path.join(scripts, 'scrape-popularity.ts'))

  const elapsed = Math.round((Date.now() - start) / 60000)
  console.log(`\n✅  Pipeline complete in ${elapsed} minutes.`)
}

main().catch(err => {
  console.error('Pipeline failed:', err)
  process.exit(1)
})
