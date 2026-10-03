import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import type { Client } from 'pg';

export interface Migration { id: string; sql: string; checksum: string }
export function readMigrations(directory: string | URL = new URL('../../migrations/', import.meta.url)): Migration[] {
  return readdirSync(directory).filter(file=>/^\d{3}-[a-z0-9-]+\.sql$/.test(file)).sort().map(id=> {
    const sql = readFileSync(new URL(id, typeof directory==='string'?new URL(`file://${directory.replace(/\/$/,'')}/`):directory),'utf8');
    return {id,sql,checksum:createHash('sha256').update(sql).digest('hex')};
  });
}

export async function migrate(client: Client, migrations: Migration[] = readMigrations()): Promise<string[]> {
  const version = Number((await client.query<{server_version_num:string}>('SHOW server_version_num')).rows[0]?.server_version_num);
  if (version < 180000 || version >= 190000 || !Number.isFinite(version)) throw new Error('PostgreSQL major version 18 is required.');
  // One session owns the lock and all statements. Never use pool.query across a transaction.
  await client.query('SELECT pg_advisory_lock(19460703, 2)');
  const applied: string[] = [];
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS applied_migrations (
      id text PRIMARY KEY, checksum text NOT NULL CHECK(checksum ~ '^[0-9a-f]{64}$'), applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const previous = (await client.query<{id:string;checksum:string}>('SELECT id,checksum FROM applied_migrations ORDER BY id')).rows;
    // Applied migrations cannot disappear, change or become a non-prefix of this release.
    for (let i=0;i<previous.length;i++) {
      const expected = migrations[i]; const actual = previous[i]!;
      if (!expected || expected.id !== actual.id || expected.checksum !== actual.checksum) throw new Error(`Migration drift: ${actual.id}`);
    }
    for (const m of migrations.slice(previous.length)) {
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO applied_migrations(id,checksum) VALUES($1,$2)',[m.id,m.checksum]);
        await client.query('COMMIT');
        applied.push(m.id);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock(19460703, 2)');
  }
}
