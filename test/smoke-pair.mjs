// Run against the packaged backend, optionally through the packaged frontend.
// Credentials are generated for this isolated CI database and never printed.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from '../dist/profile/auth.js';
import { PgRepository } from '../dist/profile/repository.js';

const origin = process.env.SMOKE_ORIGIN;
const database = process.env.DATABASE_URL;
if (!origin || !database) throw new Error('SMOKE_ORIGIN and DATABASE_URL are required.');
const repository = new PgRepository(database);
const accountId = randomUUID(), login = `smoke.${randomUUID()}`, password = randomBytes(24).toString('base64url');
try {
  await repository.provision([{ accountId, login, passwordHash: await hashPassword(password) }]);
} finally { await repository.close(); }
const headers = { Origin: origin, 'Content-Type': 'application/json' };
const authenticated = await fetch(`${origin}/api/v1/auth/login`, { method: 'POST', headers, body: JSON.stringify({ login, password }) });
assert.equal(authenticated.status, 200, 'Same-origin login through the packaged proxy must succeed.');
const session = await authenticated.json();
const cookieHeader = authenticated.headers.get('set-cookie');
assert.ok(cookieHeader?.includes('HttpOnly') && cookieHeader.includes('SameSite=Strict') && cookieHeader.includes('Secure'));
const cookie = cookieHeader.split(';')[0];
const profileResponse = await fetch(`${origin}/api/v1/profile`, { headers: { Cookie: cookie } });
assert.equal(profileResponse.status, 200);
const profile = await profileResponse.json();
assert.equal(profile.accountId, accountId);
const clientId = randomUUID();
const command = { operationId: randomUUID(), expectedRevision: profile.revision, clientId, type: 'start_run', payload: {} };
const mutationHeaders = { ...headers, Cookie: cookie, 'X-CSRF-Token': session.csrfToken };
const operation = await fetch(`${origin}/api/v1/operations`, { method: 'POST', headers: mutationHeaders, body: JSON.stringify(command) });
assert.equal(operation.status, 200, 'Same-origin CSRF-protected mutation through proxy must succeed.');
const result = await operation.json();
assert.equal(result.run.control, 'owner');
assert.equal(result.run.snapshot.state.phase, 'paused');
assert.equal(result.run.loot.goldMilli, '0');
assert.equal(result.run.runId, result.run.snapshot.state.runId);
const receipt = await fetch(`${origin}/api/v1/operations/${command.operationId}`, { headers: { Cookie: cookie } });
assert.equal(receipt.status, 200);
assert.equal((await receipt.json()).profile.revision, profile.revision + 1);
const invalidLogout = await fetch(`${origin}/api/v1/auth/logout`, { method: 'POST', headers: { ...headers, Cookie: cookie }, body: '{}' });
assert.equal(invalidLogout.status, 403);
const logout = await fetch(`${origin}/api/v1/auth/logout`, { method: 'POST', headers: mutationHeaders, body: '{}' });
assert.equal(logout.status, 200);
assert.equal((await fetch(`${origin}/api/v1/profile`, { headers: { Cookie: cookie } })).status, 401);
console.log('Packaged pair: provisioned login, cookie, profile, run, receipt, CSRF and logout passed.');
