import { readFileSync } from 'node:fs';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { catalog } from './game/catalog.js';

// The checked-in OpenAPI file is the source of wire schemas for this release.
const contract = JSON.parse(readFileSync(new URL('../contracts/openapi.json', import.meta.url), 'utf8'));

export interface HealthResponse {
  status: 'ok';
  apiVersion: '1';
  serverTime: string;
}

export function buildApp(options: FastifyServerOptions = {}) {
  const app = Fastify({
    ...options,
    bodyLimit: 16_384,
    requestTimeout: 10_000,
    exposeHeadRoutes: false,
    logger: options.logger ?? false,
  });

  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  const health = (): HealthResponse => ({
    status: 'ok',
    apiVersion: '1',
    serverTime: new Date().toISOString(),
  });
  for (const url of ['/api/v1/health', '/healthz']) {
    app.get<{ Reply: HealthResponse }>(url, {
      schema: { response: { 200: contract.components.schemas.HealthResponse } },
    }, health);
  }
  app.get('/api/v1/catalog', {
    schema: { response: { 200: contract.components.schemas.ContentCatalog } },
  }, () => catalog);

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Endpoint is not available in this release.' } });
  });

  app.setErrorHandler((error, request, reply) => {
    const suppliedStatus = typeof error === 'object' && error !== null && 'statusCode' in error
      ? error.statusCode : undefined;
    const status = typeof suppliedStatus === 'number' && suppliedStatus >= 400 && suppliedStatus < 500
      ? suppliedStatus : 500;
    if (status >= 500) request.log.error({ err: error }, 'Request failed');
    reply.code(status).send({ error: {
      code: status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      message: status === 500 ? 'Request could not be completed.' : 'Request is invalid.',
    } });
  });

  return app;
}
