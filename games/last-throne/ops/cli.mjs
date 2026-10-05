import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function controlRequest(socketPath, command, releaseId) {
  const body = command === 'status' ? null : JSON.stringify({ command, releaseId });
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath, method: body ? 'POST' : 'GET', path: body ? '/operation' : '/status', headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {} }, res => {
      let data = ''; res.setEncoding('utf8'); res.on('data', x => data += x);
      res.on('end', () => { try { const result = JSON.parse(data); if (res.statusCode !== 200) throw new Error(result.error ?? `HTTP ${res.statusCode}`); resolve(result); } catch (error) { reject(error); } });
    });
    req.on('error', reject); if (body) req.write(body); req.end();
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command = 'status', releaseId] = process.argv.slice(2);
  if (!['status', 'update', 'rollback', 'content', 'recover'].includes(command) || (['update', 'rollback', 'content'].includes(command) && !releaseId)) {
    console.error('Usage: node ops/cli.mjs status | update RELEASE_ID | content RELEASE_ID | rollback RELEASE_ID | recover'); process.exitCode = 2;
  } else {
    try { console.log(JSON.stringify(await controlRequest(path.join(process.env.STATE_DIR ?? '/state', 'control.sock'), command, releaseId), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
