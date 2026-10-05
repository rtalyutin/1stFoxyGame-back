/** Read immutable published content from EAV truth, including explicit false/zero. */
export async function readContent(pool, version) {
  const release = await pool.query(`SELECT id, content_version, metadata_schema_version, schema_version,
    core_compatibility, projection_hash, source_revision FROM last_throne.content_releases
    WHERE content_version=$1 AND status='published'`, [version]);
  if (!release.rows.length) return null;
  const selected = release.rows[0];
  const rows = await pool.query(`SELECT e.id, t.code AS type_code, t.schema_revision, e.revision,
    p.code AS parameter_code, p.multiple, v.data_type, v.ordinal,
    v.text_value, v.integer_value, v.numeric_value, v.boolean_value, v.timestamp_value, v.reference_value
    FROM last_throne.entities e JOIN last_throne.entity_types t ON t.id=e.entity_type_id
    LEFT JOIN last_throne.entity_parameter_values v ON v.entity_id=e.id
    LEFT JOIN last_throne.entity_parameters p ON p.id=v.parameter_id
    WHERE e.release_id=$1 AND e.status='published'
    ORDER BY e.id, p.code, v.ordinal`, [selected.id]);
  const entities = new Map();
  for (const row of rows.rows) {
    if (!entities.has(row.id)) entities.set(row.id, {
      id: row.id, type: row.type_code, schemaRevision: row.schema_revision,
      revision: row.revision, parameters: Object.create(null),
    });
    if (!row.parameter_code) continue;
    let value = row[`${row.data_type}_value`];
    if (row.data_type === 'integer') {
      const number = Number(value);
      value = Number.isSafeInteger(number) ? number : String(value);
    }
    if (row.data_type === 'numeric') value = String(value);
    if (row.data_type === 'timestamp') value = new Date(value).toISOString();
    const parameters = entities.get(row.id).parameters;
    if (row.multiple) (parameters[row.parameter_code] ??= []).push({ ordinal: row.ordinal, value });
    else parameters[row.parameter_code] = value;
  }
  return {
    contentVersion: selected.content_version,
    metadataSchemaVersion: selected.metadata_schema_version,
    schemaVersion: selected.schema_version,
    coreCompatibility: selected.core_compatibility,
    sourceRevision: selected.source_revision,
    entities: [...entities.values()],
  };
}

/** Exact immutable metadata manifest, independent of SQL column order/status timestamps. */
export async function readMetadataSchema(pool, version) {
  const exists = await pool.query(`SELECT version FROM last_throne.metadata_schema_versions WHERE version=$1 AND status='published'`, [version]);
  if (!exists.rows.length) return null;
  const rows = await pool.query(`SELECT t.id,t.code,t.label,t.schema_revision,
    p.id AS parameter_id,p.code AS parameter_code,p.label AS parameter_label,p.data_type,
    p.required,p.multiple,p.target_type_id,p.reference_policy,p.constraints
    FROM last_throne.metadata_schema_types s JOIN last_throne.entity_types t ON t.id=s.entity_type_id
    LEFT JOIN last_throne.entity_parameters p ON p.entity_type_id=t.id
    WHERE s.metadata_schema_version=$1 ORDER BY t.code,t.schema_revision,p.code`, [version]);
  const types = new Map();
  for (const row of rows.rows) {
    if (!types.has(row.id)) types.set(row.id, { id: row.id, code: row.code, label: row.label, schemaRevision: row.schema_revision, parameters: [] });
    if (row.parameter_id) types.get(row.id).parameters.push({
      id: row.parameter_id, code: row.parameter_code, label: row.parameter_label,
      dataType: row.data_type, required: row.required, multiple: row.multiple,
      targetTypeId: row.target_type_id, referencePolicy: row.reference_policy, constraints: row.constraints,
    });
  }
  return { version, types: [...types.values()] };
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
