import { spawnSync } from 'node:child_process';
import { verifyTestDatabase } from './test-database.js';
await verifyTestDatabase(process.env.TEST_DATABASE_URL);
const result = spawnSync(
  process.execPath,
  ['../../node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    stdio: 'inherit',
  },
);
process.exitCode = result.status ?? 1;
