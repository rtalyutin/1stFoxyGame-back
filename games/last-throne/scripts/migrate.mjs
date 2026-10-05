import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const defaultDirectory = fileURLToPath(new URL('../db/migrations/', import.meta.url));
const migrationLock = 8411200;

/** A dedicated client is retained for both the session lock and every transaction. */
export async function migrate(pool, { directory = defaultDirectory } = {}) {
  const client = await pool.connect();
  const applied = [];
  let locked = false;
  try {
    await client.query("SET lock_timeout = '5s'");
    await client.query("SET statement_timeout = '60s'");
    const acquired = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [migrationLock]);
    if (acquired.rows[0]?.locked !== true) throw new Error('MIGRATION_BUSY');
    locked = true;
    await client.query('CREATE SCHEMA IF NOT EXISTS last_throne');
    await client.query(`CREATE TABLE IF NOT EXISTS last_throne.schema_migrations (
      id text PRIMARY KEY,
      checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const names = (await readdir(directory)).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
    for (const name of names) {
      const sql = await readFile(resolve(directory, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query('SELECT checksum FROM last_throne.schema_migrations WHERE id=$1', [name]);
      if (existing.rows.length) {
        if (existing.rows[0].checksum !== checksum) throw new Error(`MIGRATION_CHECKSUM_MISMATCH: ${name}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query('SET LOCAL lock_timeout = \'5s\'');
        await client.query('SET LOCAL statement_timeout = \'60s\'');
        await client.query(sql);
        await client.query('INSERT INTO last_throne.schema_migrations(id,checksum) VALUES($1,$2)', [name, checksum]);
        await client.query('COMMIT');
        applied.push(name);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return applied;
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock($1)', [migrationLock]).catch(() => {});
    await client.query('RESET lock_timeout').catch(() => {});
    await client.query('RESET statement_timeout').catch(() => {});
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the migration role');
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const applied = await migrate(pool);
    console.log(JSON.stringify({ migrationsApplied: applied }));
  } finally { await pool.end(); }
}
