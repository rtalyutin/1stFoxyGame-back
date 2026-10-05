import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readContent, canonicalJson } from '../db/content.mjs';

/** Controlled owner command for the existing R0 application_settings only. */
export async function publishR0Content(pool, version, title, sourceVersion = 'r0-content-1') {
  if (!/^r0-content-[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(version)) throw new Error('Expected a new r0-content-* version');
  if (typeof title !== 'string' || !title.trim() || [...title].length > 120) throw new Error('Title must contain 1–120 characters');
  const source = await readContent(pool, sourceVersion);
  if (!source || source.metadataSchemaVersion !== 'r0-meta-1' || source.entities.length !== 1
    || source.entities[0].type !== 'application_settings' || source.entities[0].parameters.gameplay_available !== false) {
    throw new Error('This publisher only clones the existing R0 technical settings');
  }
  const entityId = randomUUID();
  const projection = { ...source, contentVersion: version, sourceRevision: 1, entities: [{ ...source.entities[0], id: entityId, revision: 1, parameters: { ...source.entities[0].parameters, title } }] };
  const projectionHash = createHash('sha256').update(canonicalJson(projection)).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'"); await client.query("SET LOCAL statement_timeout = '60s'");
    const original = (await client.query('SELECT * FROM last_throne.content_releases WHERE content_version=$1 AND status=\'published\'', [sourceVersion])).rows[0];
    await client.query(`INSERT INTO last_throne.content_releases(id,content_version,schema_version,metadata_schema_version,core_compatibility,asset_manifest_hash,projection_hash)
      VALUES($1,$1,$2,$3,$4,$5,$6)`, [version, original.schema_version, original.metadata_schema_version, original.core_compatibility, original.asset_manifest_hash, projectionHash]);
    await client.query(`INSERT INTO last_throne.entities(id,entity_type_id,metadata_schema_version,release_id,pinned_release_id)
      SELECT $1,entity_type_id,metadata_schema_version,$2,$2 FROM last_throne.entities WHERE id=$3`, [entityId, version, source.entities[0].id]);
    await client.query(`INSERT INTO last_throne.entity_parameter_values(entity_id,entity_type_id,parameter_id,data_type,ordinal,text_value,integer_value,numeric_value,boolean_value,timestamp_value,reference_value)
      SELECT $1,v.entity_type_id,v.parameter_id,v.data_type,v.ordinal,
        CASE WHEN p.code='title' THEN $2 ELSE v.text_value END,
        v.integer_value,v.numeric_value,v.boolean_value,v.timestamp_value,v.reference_value
      FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters p ON p.id=v.parameter_id
      WHERE v.entity_id=$3`, [entityId, title, source.entities[0].id]);
    await client.query('SELECT last_throne.publish_content_release($1)', [version]);
    await client.query('COMMIT');
    return { contentVersion: version, metadataSchemaVersion: source.metadataSchemaVersion, projectionHash };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [version, title, sourceVersion] = process.argv.slice(2);
  if (!process.env.DATABASE_MIGRATION_URL) throw new Error('Controlled DATABASE_MIGRATION_URL is required');
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATION_URL, max: 1, connectionTimeoutMillis: 5000 });
  try { console.log(JSON.stringify(await publishR0Content(pool, version, title, sourceVersion), null, 2)); }
  finally { await pool.end(); }
}
