import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readContent, canonicalJson } from '../db/content.mjs';
import { parseContentProjection } from '../core/content-r3.ts';

const column = { text: 'text_value', integer: 'integer_value', numeric: 'numeric_value', boolean: 'boolean_value' };
/** Owner-only publication of scalar R3 balance rows; old versions remain immutable. */
export async function publishR3Content(pool, version, patch, sourceVersion = 'r3-content-1') {
  if (!/^r3-content-[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(version)) throw new Error('Expected a new r3-content-* version');
  if (!patch || !Array.isArray(patch.updates) || patch.updates.length < 1 || patch.updates.length > 64) throw new Error('Expected 1–64 scalar updates');
  const source = await readContent(pool, sourceVersion);
  if (!source || source.metadataSchemaVersion !== 'r3-meta-1' || !source.coreCompatibility.includes('r3-core-1')) throw new Error('Published compatible R3 source content is required');
  parseContentProjection(source);
  const definitions = (await pool.query(`SELECT t.code AS type,p.code AS parameter,p.data_type
    FROM last_throne.metadata_schema_types s JOIN last_throne.entity_types t ON t.id=s.entity_type_id
    JOIN last_throne.entity_parameters p ON p.entity_type_id=t.id WHERE s.metadata_schema_version=$1`, [source.metadataSchemaVersion])).rows;
  const parameterTypes = new Map(definitions.map(row => [`${row.type}\0${row.parameter}`, row.data_type]));
  const replacements = new Map(); const seen = new Set();
  const entities = source.entities.map(entity => {
    const id = randomUUID(); replacements.set(entity.id, id);
    return { ...entity, id, revision: 1, parameters: { ...entity.parameters } };
  });
  for (const update of patch.updates) {
    if (!update || typeof update.type !== 'string' || typeof update.code !== 'string' || typeof update.parameter !== 'string' || update.parameter === 'code') throw new Error('Update must identify a known type/code/parameter');
    const key = `${update.type}\0${update.code}\0${update.parameter}`;
    if (seen.has(key)) throw new Error('Duplicate balance update'); seen.add(key);
    const matches = entities.filter(entity => entity.type === update.type && entity.parameters.code === update.code);
    if (matches.length !== 1 || !Object.hasOwn(matches[0].parameters, update.parameter)) throw new Error('Unknown balance parameter');
    if (!['string', 'number', 'boolean'].includes(typeof update.value) || (typeof update.value === 'number' && !Number.isFinite(update.value))) throw new Error('Only finite scalar balance values are allowed');
    const dataType = parameterTypes.get(`${update.type}\0${update.parameter}`);
    let value = update.value;
    if (dataType === 'integer') { if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error('Integer balance values must be safe integers'); }
    else if (dataType === 'numeric') { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Numeric balance values must be finite numbers'); value = String(value); }
    else if (dataType === 'boolean') { if (typeof value !== 'boolean') throw new Error('Boolean balance values must be booleans'); }
    else if (dataType === 'text') { if (typeof value !== 'string') throw new Error('Text balance values must be strings'); }
    else throw new Error('Only existing scalar balance parameter types are supported');
    matches[0].parameters[update.parameter] = value;
  }
  entities.sort((a, b) => a.id.localeCompare(b.id));
  const projection = { ...source, contentVersion: version, sourceRevision: 1, entities };
  // Core validates map/type/count/tick semantics before the draft can be published.
  parseContentProjection(projection);
  const projectionHash = createHash('sha256').update(canonicalJson(projection)).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); await client.query("SET LOCAL lock_timeout = '5s'"); await client.query("SET LOCAL statement_timeout = '60s'");
    const header = (await client.query("SELECT * FROM last_throne.content_releases WHERE content_version=$1 AND status='published'", [sourceVersion])).rows[0];
    await client.query(`INSERT INTO last_throne.content_releases(id,content_version,schema_version,metadata_schema_version,core_compatibility,asset_manifest_hash,projection_hash)
      VALUES($1,$1,$2,$3,$4,$5,$6)`, [version, header.schema_version, header.metadata_schema_version, header.core_compatibility, header.asset_manifest_hash, projectionHash]);
    const oldEntities = (await client.query('SELECT id,entity_type_id,metadata_schema_version FROM last_throne.entities WHERE release_id=$1 AND status=\'published\' ORDER BY id', [header.id])).rows;
    for (const original of oldEntities) {
      const id = replacements.get(original.id); if (!id) throw new Error('Projection/source entity mismatch');
      await client.query(`INSERT INTO last_throne.entities(id,entity_type_id,metadata_schema_version,release_id,pinned_release_id) VALUES($1,$2,$3,$4,$4)`, [id, original.entity_type_id, original.metadata_schema_version, version]);
      const values = (await client.query(`SELECT v.*,p.code AS parameter_code FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters p ON p.id=v.parameter_id WHERE v.entity_id=$1 ORDER BY v.parameter_id,v.ordinal`, [original.id])).rows;
      const projected = entities.find(entity => entity.id === id);
      for (const value of values) {
        const field = column[value.data_type]; if (!field) throw new Error('R3 balance publisher accepts scalar text/integer/numeric/boolean rows only');
        if (value.ordinal !== 0 || Array.isArray(projected.parameters[value.parameter_code])) throw new Error('R3 balance publisher does not change multiple/reference parameters');
        await client.query(`INSERT INTO last_throne.entity_parameter_values(entity_id,entity_type_id,parameter_id,data_type,ordinal,${field}) VALUES($1,$2,$3,$4,0,$5)`, [id, original.entity_type_id, value.parameter_id, value.data_type, projected.parameters[value.parameter_code]]);
      }
    }
    await client.query('SELECT last_throne.publish_content_release($1)', [version]);
    // Compare the actual typed SQL projection (including numeric/string normalization) before commit.
    const published = await readContent(client, version); parseContentProjection(published);
    if (createHash('sha256').update(canonicalJson(published)).digest('hex') !== projectionHash) throw new Error('Published typed projection differs from validated balance');
    await client.query('COMMIT'); return { contentVersion: version, metadataSchemaVersion: 'r3-meta-1', projectionHash };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [version, patchFile, sourceVersion] = process.argv.slice(2);
  if (!process.env.DATABASE_MIGRATION_URL) throw new Error('Controlled DATABASE_MIGRATION_URL required');
  if (!patchFile) throw new Error('Usage: publish-r3-content.mjs NEW_VERSION PATCH_JSON [SOURCE_VERSION]');
  const patch = JSON.parse(await readFile(resolve(patchFile), 'utf8'));
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_MIGRATION_URL, max: 1, connectionTimeoutMillis: 5000 });
  try { console.log(JSON.stringify(await publishR3Content(pool, version, patch, sourceVersion), null, 2)); } finally { await pool.end(); }
}
