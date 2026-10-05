import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../scripts/migrate.mjs';
import { createApp } from '../server/app.mjs';
import { fixtureRelease } from './fixtures.mjs';
import { publishR0Content } from '../ops/publish-r0-content.mjs';
test('real EAV bootstrap pins old tabs and handles database/content/validation failures',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'td-api-')),db=new PGlite();
 const query=async(sql,params)=>{
  if(!params && sql.includes(';')) return (await db.exec(sql)).at(-1) || {rows:[]};
  return db.query(sql,params);
 };
 let unavailable=false;
 const client={query,release(){}};
 const pool={connect:async()=>client,query:(...args)=>unavailable?Promise.reject(Error('postgres://secret-password')):query(...args)};
 let app;
 try{
  await migrate(pool);await fixtureRelease(dir,'r0-old');
  await publishR0Content(pool,'r0-content-2','Последний трон · новое издание');
  await fixtureRelease(dir,'r0-new',{versions:{frontend:'r0-web-1',backend:'r0-api-1',core:'r0-core-1',content:'r0-content-2',metadataSchema:'r0-meta-1',saveFormat:1,api:1}});
  app=await createApp({pool,releasesDir:dir,releaseId:'r0-new'});
  const ready=await app.inject('/api/v1/ready');assert.equal(ready.statusCode,200);assert.equal(ready.json().ready,true);
  const bootstrap=await app.inject('/api/v1/bootstrap?clientReleaseId=r0-old');assert.equal(bootstrap.statusCode,200);
  assert.equal(bootstrap.json().clientReleaseId,'r0-old');assert.equal(bootstrap.json().apiReleaseId,'r0-new');assert.equal(bootstrap.json().capabilities.battle,false);
  const content=await app.inject(bootstrap.json().contentUrl.replace('/td',''));assert.equal(content.statusCode,200);assert.equal(content.json().contentVersion,'r0-content-1');assert.ok(content.json().entities.length>0);
  const newContent=await app.inject('/api/v1/content?clientReleaseId=r0-new');assert.equal(newContent.json().contentVersion,'r0-content-2');assert.equal(newContent.json().entities[0].parameters.title,'Последний трон · новое издание');assert.equal(content.json().entities[0].parameters.title,'Последний трон');
  assert.equal((await app.inject('/api/v1/bootstrap')).statusCode,400);
  assert.equal((await app.inject('/api/v1/bootstrap?clientReleaseId=../../bad')).statusCode,400);
  assert.equal((await app.inject('/api/v1/bootstrap?clientReleaseId=unknown')).statusCode,409);
  await fixtureRelease(dir,'r1-client',{versions:{frontend:'r1-web',backend:'r1-api',core:'r1-core-1',content:'r1-content-1',metadataSchema:'r0-meta-1',saveFormat:1,api:1}});
  assert.equal((await app.inject('/api/v1/bootstrap?clientReleaseId=r1-client')).json().error.code,'CLIENT_VERSION_UNSUPPORTED');
  unavailable=true;
  assert.equal((await app.inject('/api/v1/ready')).statusCode,503);
  const failed=await app.inject('/api/v1/bootstrap?clientReleaseId=r0-old');assert.equal(failed.statusCode,503);assert.ok(!failed.body.includes('secret-password'));
  unavailable=false;
  assert.equal((await app.inject('/api/v1/ready')).statusCode,200);
 }finally{await app?.close();await db.close();await rm(dir,{recursive:true,force:true});}
});
