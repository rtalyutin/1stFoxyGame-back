import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import SwaggerParser from '@apidevtools/swagger-parser';
import { buildApp } from '../dist/app.js';

const contractUrl = new URL('../contracts/openapi.json', import.meta.url);
const contract = JSON.parse(readFileSync(contractUrl, 'utf8'));
const ajv = new Ajv({ strict: false });
addFormats(ajv);

test('health matches the public schema, uses fresh UTC time and cannot be cached', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  const validate = ajv.compile(contract.components.schemas.HealthResponse);
  const before = Date.now();
  const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
  const after = Date.now();
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.match(response.headers['content-type'], /^application\/json/);
  const payload = response.json();
  assert.ok(validate(payload), JSON.stringify(validate.errors));
  assert.ok(Date.parse(payload.serverTime) >= before && Date.parse(payload.serverTime) <= after);
});

test('liveness alias implements its documented response', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  const response = await app.inject('/healthz');
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().apiVersion, '1');
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('no public registration endpoint exists and unrelated methods remain unavailable', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  const validate = ajv.compile(contract.components.schemas.ApiError);
  for (const [url, operation] of Object.entries(contract['x-planned-paths'])) {
    const response = await app.inject({ method: operation.method, url });
    assert.equal(response.statusCode, 404, url);
    assert.ok(validate(response.json()), url);
  }
  for (const url of ['/api/v1/auth/register', '/api/v1/register', '/register']) {
    assert.equal((await app.inject({ method: 'POST', url })).statusCode, 404);
  }
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/health' })).statusCode, 404);
});

test('invalid JSON has a bounded error envelope without echoing the payload', async (t) => {
  const app = buildApp();
  t.after(() => app.close());
  const response = await app.inject({
    method: 'POST', url: '/api/v1/health',
    headers: { 'content-type': 'application/json' }, payload: '{"password":"do-not-echo"',
  });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { error: { code: 'INVALID_REQUEST', message: 'Request is invalid.' } });
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('OpenAPI validates and any remaining future schema references resolve', async () => {
  await SwaggerParser.validate(fileURLToPath(contractUrl));
  for (const operation of Object.values(contract['x-planned-paths'])) {
    assert.equal(operation.implemented, false);
    assert.equal(operation.release, 'R3');
    for (const key of ['requestSchema', 'responseSchema']) {
      if (operation[key]) assert.ok(contract.components.schemas[operation[key]], operation[key]);
    }
  }
});

test('legacy run request and current profile schemas reject malformed trusted data', async () => {
  const dereferenced = await SwaggerParser.dereference(fileURLToPath(contractUrl));
  const validate = ajv.compile(dereferenced.components.schemas.RunStartRequest);
  const valid = {
    operationId: '45f3d533-943b-4dc1-aade-34e6b283a5ca', expectedRevision: 0,
    heroId: 'pudge', abilityId: 'hook', rulesVersion: 'r1.0',
  };
  assert.ok(validate(valid));
  assert.equal(validate({ ...valid, operationId: 'not-a-uuid' }), false);
  assert.equal(validate({ ...valid, expectedRevision: -1 }), false);
  assert.equal(validate({ ...valid, gold: 99999 }), false);
  const profile = ajv.compile(dereferenced.components.schemas.Profile);
  assert.equal(profile({ accountId: valid.operationId, revision: 0, gold: -1, components: [], equipment: [], consumables: [] }), false);
});
