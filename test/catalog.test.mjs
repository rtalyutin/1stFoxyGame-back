import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import Ajv from 'ajv';
import {buildApp} from '../dist/app.js';
import {catalog,validateCatalog} from '../dist/game/catalog.js';
import {contentSeedSql} from '../dist/db/content-seed.js';

test('catalog GET is an exact validated versioned snapshot with no account data',async t=>{
  const app=buildApp();t.after(()=>app.close());
  const response=await app.inject('/api/v1/catalog');
  assert.equal(response.statusCode,200);assert.equal(response.headers['cache-control'],'no-store');
  assert.deepEqual(response.json(),catalog);
  const schema=JSON.parse(readFileSync(new URL('../contracts/openapi.json',import.meta.url),'utf8')).components.schemas.ContentCatalog;
  const valid=new Ajv({strict:false}).compile(schema);
  assert.ok(valid(response.json()),JSON.stringify(valid.errors));
  assert.equal((await app.inject({method:'POST',url:'/api/v1/catalog'})).statusCode,404);
});

test('content rejects dead references, unknown modifiers, forged fields and incompatible one-shot/boss rules',()=>{
  for (const change of [
    c=>c.enemies[1].weaponCode='missing', c=>c.enemies[0].requiredHits=2,
    c=>c.enemies[2].requiredHits=2, c=>c.enemies[2].requiredHits=3.5,
    c=>c.enemies[1].modifiers.push('unimplemented'),c=>c.modifiers.push('unimplemented'),
    c=>c.weapons[1].code=c.weapons[0].code,c=>c.rules.maxBosses=2,
    c=>c.rules.gold=9999,c=>c.weapons[0].projectileSpeed=Infinity,
    c=>c.rules.bossMinInterval=c.rules.bossMaxInterval+1,
  ]) {const c=structuredClone(catalog);change(c);assert.throws(()=>validateCatalog(c));}
});

test('content source produces precisely the reviewed typed migration',()=>{
  assert.equal(contentSeedSql(catalog),readFileSync(new URL('../migrations/002-content.sql',import.meta.url),'utf8'));
  const clone=validateCatalog(catalog);clone.enemies[0].requiredHits=99;
  assert.equal(catalog.enemies[0].requiredHits,1);
});
