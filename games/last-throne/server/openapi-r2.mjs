import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openapiR1 } from './openapi-r1.mjs';
import { createGame, createSnapshot } from '../core/game-core-r2.ts';
import { defaultR2Content } from '../core/content-r2.ts';

const object = properties => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const text = { type: 'string' }, nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const json = schema => ({ description: 'JSON response', content: { 'application/json': { schema } } });
function inferred(value) {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) return { type: 'array', items: value.length ? inferred(value[0]) : {} };
  if (typeof value === 'object') return object(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, inferred(item)])));
  return { type: typeof value === 'number' && Number.isInteger(value) ? 'integer' : typeof value };
}
function exactPins(family) {
  return object({ core: { const: `${family}-core-1` }, content: { type: 'string', pattern: `^${family}-content-` }, metadataSchema: { const: `${family}-meta-1` } });
}

/** Current API1 contract; R1 is one retained variant, without upgrading its snapshots. */
export const openapiR2 = structuredClone(openapiR1);
openapiR2.info = { ...openapiR2.info, title: 'Last Throne R2 API with retained R1', version: '2.0.0' };
const r1Snapshot = openapiR2.components.schemas.GameSnapshot;
r1Snapshot.properties.versions = exactPins('r1');
const r2Snapshot = inferred(createSnapshot(createGame(defaultR2Content, 42)));
r2Snapshot.properties.schemaVersion = { const: 3 };
r2Snapshot.properties.phase = { const: 'preparation' };
r2Snapshot.properties.versions = exactPins('r2');
r2Snapshot.properties.heroes.items.properties.kind = { type: 'string', enum: ['pudge', 'shaman', 'undying', 'rubick', 'sniper'] };
r2Snapshot.properties.heroes.items.properties.stolenSpell = nullable({ type: 'string', enum: ['area_heal', 'area_strike', 'temporary_shield'] });
r2Snapshot.properties.heroes.items.properties.stealCooldown = { type: 'integer', minimum: 0 };
r2Snapshot.properties.heroes.items.properties.priority = { type: 'string', enum: ['nearest', 'strongest', 'commander'] };
r2Snapshot.properties.buildings = structuredClone(r1Snapshot.properties.buildings);
r2Snapshot.properties.buildings.items.properties.kind = { type: 'string', enum: ['ballista', 'magic_tower', 'slow_totem'] };
openapiR2.components.schemas.R1Snapshot = r1Snapshot;
openapiR2.components.schemas.R2Snapshot = r2Snapshot;
openapiR2.components.schemas.GameSnapshot = { oneOf: [r1Snapshot, r2Snapshot] };
const run = openapiR2.components.schemas.Run;
run.properties.snapshotSchemaVersion = { type: 'integer', enum: [2, 3] };
const checkpointBase = openapiR2.components.schemas.Checkpoint;
const checkpoint = { oneOf: [2, 3].map(format => ({ ...structuredClone(checkpointBase), properties: {
  ...structuredClone(checkpointBase.properties), snapshotSchemaVersion: { const: format }, snapshot: format === 2 ? r1Snapshot : r2Snapshot,
} })) };
openapiR2.components.schemas.Checkpoint = checkpoint;
openapiR2.paths['/runs'].post.responses[201] = json(run);
openapiR2.paths['/runs'].get.responses[200] = json(object({ runs: { type: 'array', items: run }, nextCursor: nullable(text) }));
openapiR2.paths['/runs/{id}'].get.responses[200] = json(run);
openapiR2.paths['/runs/{id}/checkpoint'].get.responses[200] = json(nullable(checkpoint));
openapiR2.paths['/runs/{id}/checkpoint'].put.summary = 'Atomic checkpoint: full run pins select R1/save2 or R2/save3 only after the locked repeat check';

const versionPins = object({ frontend: text, backend: text, core: text, content: text, metadataSchema: text,
  saveFormat: { type: 'integer', enum: [1, 2, 3] }, api: { const: 1 } });
const ready = object({ ready: { type: 'boolean' }, status: { type: 'string', enum: ['ready', 'not_ready'] }, releaseId: text });
openapiR2.paths['/ready'].get.responses[200] = json(ready);
openapiR2.paths['/ready'].get.responses[503] = json(ready);
openapiR2.paths['/version'].get.responses[200] = json(object({ releaseId: text, versions: versionPins, pid: { type: 'integer' },
  stage: { type: 'string', enum: ['R0', 'R1', 'R2'] }, compatibleClientReleases: { type: 'array', items: text },
  compatibleSaveFormats: { type: 'array', items: { type: 'integer' } }, compatibleMetadataSchemas: { type: 'array', items: text } }));
openapiR2.paths['/bootstrap'].get.responses[200] = json(object({ clientReleaseId: text, apiReleaseId: text, versions: versionPins,
  capabilities: object({ battle: { type: 'boolean' }, profiles: { type: 'boolean' }, cloudSaves: { type: 'boolean' } }),
  profile: nullable(openapiR2.components.schemas.Profile), contentUrl: text }));
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await writeFile(new URL('./openapi-r2.json', import.meta.url), JSON.stringify(openapiR2, null, 2) + '\n');
}
