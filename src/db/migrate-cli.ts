import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { migrate } from './migrate.js';
import { contentSeedSql } from './content-seed.js';
if (readFileSync(new URL('../../migrations/002-content.sql',import.meta.url),'utf8') !== contentSeedSql()) {
  throw new Error('Validated content and immutable seed migration do not match.');
}
const {DATABASE_URL,DATABASE_URL_FILE} = process.env;
if (Boolean(DATABASE_URL) === Boolean(DATABASE_URL_FILE)) throw new Error('Set exactly one of DATABASE_URL or DATABASE_URL_FILE.');
const connectionString = DATABASE_URL_FILE ? readFileSync(DATABASE_URL_FILE,'utf8').trim() : DATABASE_URL;
if (!connectionString) throw new Error('Database connection is empty.');
const client = new Client({connectionString,connectionTimeoutMillis:10_000});
try {
  await client.connect();
  const result = await migrate(client);
  console.log(`Migrations complete: ${result.length} newly applied.`);
} catch {
  // Driver errors may contain connection details; do not print a secret-bearing URL.
  console.error('Migration failed. Inspect database state and migration checksums using the operator runbook.');
  process.exitCode=1;
} finally { await client.end(); }
