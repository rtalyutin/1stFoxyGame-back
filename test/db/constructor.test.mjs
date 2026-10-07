import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {test} from 'node:test';
import {Client} from 'pg';
import {migrate,readMigrations} from '../../dist/db/migrate.js';
import {EntityStore} from '../../dist/db/entity-store.js';
import {contentId,contentSeedSql} from '../../dist/db/content-seed.js';
import {catalog,validateCatalog} from '../../dist/game/catalog.js';

const url=process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required: DB integration is never replaced by mocks or skipped.');
const migrations=readMigrations();
const schemas=new Set();
const schemaName=()=>`foxy_test_${randomUUID().replaceAll('-','')}`;
const ident=s=>`"${s.replaceAll('"','""')}"`;
async function connect(schema) {const c=new Client({connectionString:url,connectionTimeoutMillis:10_000});await c.connect();if(schema) await c.query(`SET search_path TO ${ident(schema)},public`);return c;}
async function fresh(admin) {const schema=schemaName();schemas.add(schema);await admin.query(`CREATE SCHEMA ${ident(schema)}`);return {schema,client:await connect(schema)};}
async function transaction(c,fn) {await c.query('BEGIN');try {const result=await fn();await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}}
async function reject(c,fn,codes=['23514','23503','23505']) {await assert.rejects(transaction(c,fn),e=>codes.includes(e.code), 'Expected PostgreSQL integrity error');}
async function fixture(c) {
  const type=randomUUID(),otherType=randomUUID(),parameter=randomUUID(),entity=randomUUID();
  await c.query('INSERT INTO entity_types(id,code) VALUES($1,$2),($3,$4)',[type,`test-${type}`,otherType,`test-${otherType}`]);
  await c.query("INSERT INTO entity_parameters(id,entity_type_id,code,label,data_type) VALUES($1,$2,'name','Name','text')",[parameter,type]);
  await c.query('INSERT INTO entities(id,entity_type_id) VALUES($1,$2)',[entity,type]);
  return {type,otherType,parameter,entity};
}
async function value(c,f,text='a',extra={}) {
  const x={entity:f.entity,parameter:f.parameter,type:f.type,data_type:'text',is_multiple:false,is_unique:false,position:0,value_text:text,value_integer:null,...extra};
  return c.query(`INSERT INTO entity_parameter_values(entity_id,parameter_id,entity_type_id,data_type,is_multiple,is_unique,position,value_text,value_integer)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[x.entity,x.parameter,x.type,x.data_type,x.is_multiple,x.is_unique,x.position,x.value_text,x.value_integer]);
}
function execute(command,args,input,env=process.env) {
  return new Promise((resolve,rejectPromise)=>{
    const child=spawn(command,args,{env,stdio:['pipe','pipe','pipe']});const output=[],errors=[];
    child.stdout.on('data',b=>output.push(b));child.stderr.on('data',b=>errors.push(b));child.on('error',rejectPromise);
    child.on('close',code=>code===0?resolve(Buffer.concat(output)):rejectPromise(new Error(`Backup/restore tool failed (${code}); ${Buffer.concat(errors).toString().slice(0,300)}`)));
    child.stdin.end(input);
  });
}
async function backupRestore(schema) {
  const db=new URL(url),dbName=decodeURIComponent(db.pathname.slice(1)),user=decodeURIComponent(db.username);
  let dump;
  if (process.env.PG_TEST_CONTAINER) {
    const prefix=['exec','-i',process.env.PG_TEST_CONTAINER];
    const connection=['-h','127.0.0.1','-p','5432','-U',user,'-d',dbName];
    dump=await execute('docker',[...prefix,'pg_dump',...connection,'-Fc','--schema',schema,'--no-owner']);
    const c=await connect();try {await c.query(`DROP SCHEMA ${ident(schema)} CASCADE`);}finally{await c.end();}
    await execute('docker',[...prefix,'pg_restore',...connection,'--no-owner','--exit-on-error'],dump);
  } else {
    const env={...process.env,PGPASSWORD:decodeURIComponent(db.password)};
    const connection=['-h',db.hostname,'-p',db.port||'5432','-U',user,'-d',dbName];
    dump=await execute(process.env.PG_DUMP_BIN||'pg_dump',[...connection,'-Fc','--schema',schema,'--no-owner'],undefined,env);
    const c=await connect();try{await c.query(`DROP SCHEMA ${ident(schema)} CASCADE`);}finally{await c.end();}
    await execute(process.env.PG_RESTORE_BIN||'pg_restore',[...connection,'--no-owner','--exit-on-error'],dump,env);
  }
  assert.ok(dump.length>1000,'A real custom-format database dump is required');
}

test('PostgreSQL 18 constructor and versioned migrations',async t=>{
  const admin=await connect();
  t.after(async()=>{for(const s of schemas)await admin.query(`DROP SCHEMA IF EXISTS ${ident(s)} CASCADE`);await admin.end();});
  const version=(await admin.query('SHOW server_version_num')).rows[0].server_version_num;
  assert.ok(Number(version)>=180000&&Number(version)<190000,`PostgreSQL18 required, found ${version}`);
  const {schema,client:c}=await fresh(admin);t.after(()=>c.end());

  await t.test('clean/repeated/concurrent migration, typed catalog and technical journal',async()=>{
    assert.deepEqual(await migrate(c),['001-constructor.sql','002-content.sql','003-profile.sql','004-economy.sql','005-balance.sql','006-forge.sql']);assert.deepEqual(await migrate(c),[]);
    assert.equal((await c.query('SELECT count(*)::int AS n FROM applied_migrations')).rows[0].n,6);
    assert.equal((await c.query("SELECT count(*)::int AS n FROM entities WHERE state='active'")).rows[0].n,15);
    const boss=(await c.query(`SELECT value_integer::int AS hits FROM entity_parameter_values WHERE entity_id=$1 AND parameter_id=$2`,[contentId('entity:enemy-definition:r2.1:boss'),contentId('parameter:enemy-definition:required-hits')])).rows[0];
    assert.equal(boss.hits,3);
    const other=await connect(schema);try{assert.deepEqual(await Promise.all([migrate(c),migrate(other)]),[[],[]]);}finally{await other.end();}
  });
  await t.test('new catalog snapshot preserves old definitions with the same enemy/weapon codes',async()=>{
    const next=structuredClone(catalog);next.catalogVersion='r2.2';next.rulesVersion='r2.2';next.enemies[2].worldSpeed=0.6;
    validateCatalog(next);await transaction(c,()=>c.query(contentSeedSql(next,false)));
    const speed=async(version)=>(await c.query('SELECT value_decimal FROM entity_parameter_values WHERE entity_id=$1 AND parameter_id=$2',[contentId(`entity:enemy-definition:${version}:boss`),contentId('parameter:enemy-definition:world-speed')])).rows[0].value_decimal;
    assert.equal(await speed('r2.1'),'0.5');assert.equal(await speed('r2.2'),'0.6');
    assert.equal((await c.query("SELECT count(*)::int AS n FROM entity_parameter_values WHERE parameter_id=$1 AND value_text='boss'",[contentId('parameter:enemy-definition:code')])).rows[0].n,2);
    await reject(c,()=>c.query(contentSeedSql(next,false))); // Snapshot IDs/version stay unique.
  });
  await t.test('prior constructor schema upgrades while preserving optional objects',async()=>{
    const previous=await fresh(admin);try{
      await migrate(previous.client,migrations.slice(0,1));const f=await fixture(previous.client);await value(previous.client,f,'before-upgrade');
      assert.deepEqual(await migrate(previous.client),['002-content.sql','003-profile.sql','004-economy.sql','005-balance.sql','006-forge.sql']);
      assert.equal((await previous.client.query('SELECT value_text FROM entity_parameter_values WHERE entity_id=$1',[f.entity])).rows[0].value_text,'before-upgrade');
    }finally{await previous.client.end();}
  });
  await t.test('checksum drift, missing migrations and failed DDL cannot partially commit',async()=>{
    const drift=migrations.map((m,i)=>i?m:{...m,sql:m.sql+'\n',checksum:createHash('sha256').update(m.sql+'\n').digest('hex')});
    await assert.rejects(migrate(c,drift),/Migration drift/);await assert.rejects(migrate(c,migrations.slice(1)),/Migration drift/);
    const sql='CREATE TABLE must_rollback(id integer); SELECT missing_function_for_test();';
    await assert.rejects(migrate(c,[...migrations,{id:'003-fail.sql',sql,checksum:createHash('sha256').update(sql).digest('hex')} ]));
    assert.equal((await c.query("SELECT to_regclass('must_rollback') AS table")).rows[0].table,null);
    assert.equal((await c.query('SELECT count(*)::int AS n FROM applied_migrations')).rows[0].n,6);
  });
  await t.test('empty objects and additional metadata require no domain DDL',async()=>{
    const f=await fixture(c);const before=(await c.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=$1 AND table_name='entities'",[schema])).rows[0].n;
    await c.query("UPDATE entities SET state='active' WHERE id=$1",[f.entity]);
    await c.query("INSERT INTO entity_parameters(id,entity_type_id,code,label,data_type) VALUES($1,$2,'optional','Optional','boolean')",[randomUUID(),f.type]);
    assert.equal((await c.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=$1 AND table_name='entities'",[schema])).rows[0].n,before);
  });
  await t.test('unknown IDs, cross-type parameters, typed column and copied flags are enforced by PostgreSQL',async()=>{
    const f=await fixture(c);
    await reject(c,()=>value(c,f,'x',{entity:randomUUID()}));await reject(c,()=>value(c,f,'x',{parameter:randomUUID()}));
    const other=randomUUID();await c.query('INSERT INTO entities(id,entity_type_id) VALUES($1,$2)',[other,f.otherType]);
    await reject(c,()=>value(c,f,'x',{entity:other,type:f.otherType}));
    await reject(c,()=>value(c,f,null,{value_integer:1}));await reject(c,()=>value(c,f,'x',{value_integer:1}));
    await reject(c,()=>value(c,f,'x',{is_unique:true}));await reject(c,()=>value(c,f,'x',{is_multiple:true}));
    await reject(c,()=>value(c,f,'x',{position:1}));await value(c,f);await reject(c,()=>value(c,f));
  });
  await t.test('references validate target type/existence and restrict deletion',async()=>{
    const f=await fixture(c),p=randomUUID(),target=randomUUID();
    await c.query("INSERT INTO entity_parameters(id,entity_type_id,code,label,data_type,reference_type_id) VALUES($1,$2,'link','Link','reference',$3)",[p,f.type,f.otherType]);
    await c.query('INSERT INTO entities(id,entity_type_id) VALUES($1,$2)',[target,f.otherType]);
    const write=(id,type=f.otherType)=>c.query("INSERT INTO entity_parameter_values(entity_id,parameter_id,entity_type_id,data_type,is_multiple,is_unique,value_reference,reference_type_id) VALUES($1,$2,$3,'reference',false,false,$4,$5)",[f.entity,p,f.type,id,type]);
    await reject(c,()=>write(randomUUID()));await reject(c,()=>write(f.entity,f.type));await write(target);
    // PG18 ON DELETE RESTRICT raises restrict_violation (23001), distinct from
    // the foreign_key_violation (23503) of an invalid inserted reference.
    await reject(c,()=>c.query('DELETE FROM entities WHERE id=$1',[target]),['23001']);
    await reject(c,()=>c.query('DELETE FROM entity_parameters WHERE id=$1',[p]),['23001']);
    await reject(c,()=>c.query('DELETE FROM entity_types WHERE id=$1',[f.type]),['23001']);
    assert.equal((await c.query('SELECT count(*)::int AS n FROM entities WHERE id=$1',[target])).rows[0].n,1);
    assert.equal((await c.query('SELECT count(*)::int AS n FROM entity_parameters WHERE id=$1',[p])).rows[0].n,1);
    assert.equal((await c.query('SELECT count(*)::int AS n FROM entity_types WHERE id=$1',[f.type])).rows[0].n,1);
  });
  await t.test('active completeness is deferred and enforced on deletion and metadata changes',async()=>{
    const f=await fixture(c);await c.query('UPDATE entity_parameters SET is_required=true WHERE id=$1',[f.parameter]);
    await reject(c,()=>c.query("UPDATE entities SET state='active' WHERE id=$1",[f.entity]));
    await transaction(c,async()=>{await c.query("UPDATE entities SET state='active' WHERE id=$1",[f.entity]);await value(c,f,'ready');});
    await reject(c,()=>c.query('DELETE FROM entity_parameter_values WHERE entity_id=$1',[f.entity]));
    await reject(c,()=>c.query("INSERT INTO entity_parameters(id,entity_type_id,code,label,data_type,is_required) VALUES($1,$2,'new-required','Required','text',true)",[randomUUID(),f.type]));
    await reject(c,()=>c.query('UPDATE entity_parameters SET text_min_length=100 WHERE id=$1',[f.parameter]));
    await reject(c,()=>c.query("UPDATE entity_parameters SET data_type='integer' WHERE id=$1",[f.parameter]));
    await c.query('UPDATE entity_parameters SET text_max_length=20 WHERE id=$1',[f.parameter]);
  });
  await t.test('typed ranges/counts are checked for writes and tightening metadata',async()=>{
    const f=await fixture(c),p=randomUUID();await c.query("INSERT INTO entity_parameters(id,entity_type_id,code,label,data_type,is_multiple,integer_min,integer_max,min_count,max_count,is_required) VALUES($1,$2,'numbers','Numbers','integer',true,0,10,2,3,true)",[p,f.type]);
    const write=(n,pos)=>c.query("INSERT INTO entity_parameter_values(entity_id,parameter_id,entity_type_id,data_type,is_multiple,is_unique,position,value_integer) VALUES($1,$2,$3,'integer',true,false,$4,$5)",[f.entity,p,f.type,pos,n]);
    await reject(c,()=>write(-1,0));await reject(c,()=>write(11,0));
    await transaction(c,async()=>{await write(0,0);await write(10,1);await c.query("UPDATE entities SET state='active' WHERE id=$1",[f.entity]);});
    await reject(c,()=>c.query('DELETE FROM entity_parameter_values WHERE entity_id=$1 AND parameter_id=$2 AND position=1',[f.entity,p]));
    await write(5,2);await reject(c,()=>write(5,3));
    await reject(c,()=>c.query('UPDATE entity_parameters SET max_count=2 WHERE id=$1',[p]));
    await reject(c,()=>c.query('UPDATE entity_parameters SET integer_max=9 WHERE id=$1',[p]));
  });
  await t.test('transactional EntityStore handles all physical types without string coercion',async()=>{
    const f=await fixture(c),defs=[['integer','count'],['decimal','amount'],['boolean','enabled'],['timestamp','created']];
    for(const[kind,code]of defs)await c.query('INSERT INTO entity_parameters(id,entity_type_id,code,label,data_type) VALUES($1,$2,$3,$3,$4)',[randomUUID(),f.type,code,kind]);
    const store=new EntityStore(c);await transaction(c,async()=>{
      await store.set(f.entity,'name',{type:'text',value:'typed'});await store.set(f.entity,'count',{type:'integer',value:9007199254740993n});
      await store.set(f.entity,'amount',{type:'decimal',value:'123.125'});await store.set(f.entity,'enabled',{type:'boolean',value:false});
      await store.set(f.entity,'created',{type:'timestamp',value:new Date('2026-10-03T00:00:00Z')});await store.publish(f.entity);
    });
    const rows=(await c.query('SELECT data_type,value_integer,value_decimal,value_boolean FROM entity_parameter_values WHERE entity_id=$1',[f.entity])).rows;
    assert.equal(rows.find(r=>r.data_type==='integer').value_integer,'9007199254740993');assert.equal(rows.find(r=>r.data_type==='decimal').value_decimal,'123.125');
    assert.equal(rows.find(r=>r.data_type==='boolean').value_boolean,false);
    await assert.rejects(store.set(f.entity,'count',{type:'text',value:'wrong'}),/wrong value type/);
  });
  await t.test('archiving preserves history but prevents new values/objects',async()=>{
    const f=await fixture(c);await value(c,f,'kept');await c.query('UPDATE entity_parameters SET archived_at=now() WHERE id=$1',[f.parameter]);
    assert.equal((await c.query('SELECT value_text FROM entity_parameter_values WHERE entity_id=$1',[f.entity])).rows[0].value_text,'kept');
    await reject(c,()=>c.query('UPDATE entity_parameter_values SET value_text=$1 WHERE entity_id=$2',['new',f.entity]));
    await c.query('UPDATE entity_types SET archived_at=now() WHERE id=$1',[f.type]);
    await reject(c,()=>c.query('INSERT INTO entities(id,entity_type_id) VALUES($1,$2)',[randomUUID(),f.type]));
  });
  await t.test('concurrent business uniqueness is not a client-side check',async()=>{
    const f=await fixture(c);await c.query('UPDATE entity_parameters SET is_unique=true WHERE id=$1',[f.parameter]);
    const e2=randomUUID();await c.query('INSERT INTO entities(id,entity_type_id) VALUES($1,$2)',[e2,f.type]);
    const other=await connect(schema);try {
      await c.query('BEGIN');await value(c,f,'same',{is_unique:true});
      const competing=transaction(other,()=>value(other,f,'same',{entity:e2,is_unique:true}));
      // Attach rejection before completing the first transaction.
      const outcome=assert.rejects(competing,e=>e.code==='23505');await c.query('COMMIT');await outcome;
      assert.equal((await c.query('SELECT count(*)::int AS n FROM entity_parameter_values WHERE parameter_id=$1',[f.parameter])).rows[0].n,1);
    }finally{await other.end();}
  });
  await t.test('real pg_dump/pg_restore preserves typed values, metadata and repeated migration',async()=>{
    const before=(await c.query('SELECT count(*)::int AS n FROM entity_parameter_values')).rows[0].n;
    await backupRestore(schema);
    assert.equal((await c.query('SELECT count(*)::int AS n FROM entity_parameter_values')).rows[0].n,before);
    assert.deepEqual(await migrate(c),[]);
    const f=await fixture(c);await reject(c,()=>value(c,f,null,{value_integer:1}));
  });
});
