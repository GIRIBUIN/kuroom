import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url))

// Set TZ before each Node process starts; do not depend on changing TZ in a worker.
for (const timezone of ['Asia/Seoul', 'UTC', 'America/Los_Angeles']) {
  console.log(`\nSystem timezone: ${timezone}`)
  const result = spawnSync(process.execPath, [vitest, 'run', 'tests/search.test.ts', 'tests/timezone.test.ts'], {
    cwd: root,
    env: { ...process.env, TZ: timezone, KUROOM_TEST_TIMEZONE: timezone },
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
