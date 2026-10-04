import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
// @ts-expect-error The disposable PostgreSQL harness is an executable JS test aid.
import {startPostgresFixture} from './data-pg-helper.mjs';
import {createDatabase,type Database} from '../server/database.ts';
import {R1Store,type RunDTO} from '../server/r1-store.ts';
import {seedR1Metadata} from '../server/r1-metadata.ts';
import {BUILD_CONTEXT} from '../src/snapshot-v1.ts';

let fixture:any,db:Database,store:R1Store,runA:RunDTO,runB:RunDTO;
const ownerA='security-synthetic-a',ownerB='security-synthetic-b';
before(async()=>{
  fixture=await startPostgresFixture();
  await fixture.admin.query('BEGIN');
  try{await seedR1Metadata({exec:async sql=>{await fixture.admin.query(sql);},query:(sql,params)=>fixture.admin.query(sql,params)});await fixture.admin.query('COMMIT');}
  catch(error){await fixture.admin.query('ROLLBACK');throw error;}
  db=await createDatabase({databaseUrl:fixture.runtimeUrl});store=new R1Store(db);
  const start=()=>({client_build_id:BUILD_CONTEXT.client_build_id,level_id:BUILD_CONTEXT.level_id,content_version:BUILD_CONTEXT.content_version,request_id:randomUUID()});
  runA=await store.start(ownerA,start());runB=await store.start(ownerB,start());
});
after(async()=>{await store?.close();await fixture?.close();});

test('SEC-02 cross-account API Store reads and mutations are denied without changing owner data',async()=>{
  await assert.rejects(store.get(ownerB,runA.run_id),{code:'NOT_FOUND'});
  await assert.rejects(store.save(ownerB,{run_id:runA.run_id,expected_revision:runA.revision,request_id:randomUUID(),snapshot:runA.checkpoint}),{code:'NOT_FOUND'});
  await assert.rejects(store.abandon(ownerB,{run_id:runA.run_id,expected_revision:runA.revision,request_id:randomUUID()}),{code:'NOT_FOUND'});
  assert.deepEqual(await store.get(ownerA,runA.run_id),runA);
});

test('SEC-02 direct runtime RLS filters every private row from another owner',async()=>{
  await db.transaction(ownerB,async tx=>{
    assert.equal((await tx.query('SELECT id FROM syezzhaem.entities WHERE id=$1',[runA.run_id])).rows.length,0);
    assert.equal((await tx.query('SELECT entity_id FROM syezzhaem.entity_parameter_values WHERE entity_id=$1',[runA.run_id])).rows.length,0);
    assert.equal((await tx.query('SELECT run_id FROM syezzhaem.active_run_index WHERE user_id=$1',[ownerA])).rows.length,0);
    assert.equal((await tx.query('SELECT response FROM syezzhaem.request_dedup WHERE user_id=$1',[ownerA])).rows.length,0);
  });
});

test('SEC-02 runtime owner context is cleared after commit and rollback',async()=>{
  await db.transaction(ownerA,async tx=>{assert.equal((await tx.query('SELECT id FROM syezzhaem.entities WHERE id=$1',[runA.run_id])).rows.length,1);});
  for(let i=0;i<12;i++)assert.equal((await db.query('SELECT id FROM syezzhaem.entities WHERE owner_user_id IS NOT NULL')).rows.length,0);
  await assert.rejects(db.transaction(ownerA,async()=>{throw new Error('synthetic rollback');}),/synthetic rollback/);
  for(let i=0;i<12;i++)assert.equal((await db.query('SELECT id FROM syezzhaem.entities WHERE owner_user_id IS NOT NULL')).rows.length,0);
});

test('SEC-02 cross-owner parent and typed checkpoint references are rejected by SQL',async()=>{
  const a=(await fixture.admin.query("SELECT id FROM syezzhaem.entities WHERE parent_id=$1 AND entity_type_id='checkpoint'",[runA.run_id])).rows[0].id;
  const b=(await fixture.admin.query("SELECT id FROM syezzhaem.entities WHERE parent_id=$1 AND entity_type_id='checkpoint'",[runB.run_id])).rows[0].id;
  await assert.rejects(db.transaction(ownerB,tx=>tx.query("INSERT INTO syezzhaem.entities(id,entity_type_id,owner_user_id,parent_id) VALUES($1,'actor_state',$2,$3)",[randomUUID(),ownerB,a])),/Parent type or owner mismatch|row-level security/);
  const actorB=(await fixture.admin.query("SELECT id FROM syezzhaem.entities WHERE parent_id=$1 AND entity_type_id='actor_state'",[b])).rows[0].id;
  await assert.rejects(db.transaction(ownerB,tx=>tx.query("UPDATE syezzhaem.entity_parameter_values SET value_reference=$1 WHERE entity_id=$2 AND parameter_id='actor_state.checkpoint_ref'",[a,actorB])),/Reference type or owner mismatch|row-level security/);
});

test('SEC-03 aggregate key projections reject cross-owner entity links',async()=>{
  const a=(await fixture.admin.query("SELECT id FROM syezzhaem.entities WHERE owner_user_id=$1 AND entity_type_id='actor_state'",[ownerA])).rows[0].id;
  const b=(await fixture.admin.query("SELECT id FROM syezzhaem.entities WHERE parent_id=$1 AND entity_type_id='checkpoint'",[runB.run_id])).rows[0].id;
  await assert.rejects(db.transaction(ownerB,tx=>tx.query('INSERT INTO syezzhaem.aggregate_keys(checkpoint_id,key_kind,key_value,entity_id,owner_user_id) VALUES($1,$2,$3,$4,$5)',[b,'actor','synthetic-invalid-owner-link',a,ownerB])),/owner|projection|row-level security|reference/i);
});

test('SEC-03 active-run projection cannot point to another owner after their slot clears',async()=>{
  await store.abandon(ownerA,{run_id:runA.run_id,expected_revision:runA.revision,request_id:randomUUID()});
  await assert.rejects(db.transaction(ownerB,tx=>tx.query('UPDATE syezzhaem.active_run_index SET run_id=$1 WHERE user_id=$2',[runA.run_id,ownerB])),/owner|projection|row-level security|reference/i);
  assert.equal((await store.bootstrap(ownerB)).active_run?.run_id,runB.run_id);
});

test('SEC-03 profile identity projection cannot point to an unindexed profile of another owner',async()=>{
  const profileA=(await store.bootstrap(ownerA)).profile.profile_id;
  await db.transaction(ownerA,tx=>tx.query('DELETE FROM syezzhaem.profile_identity_index WHERE user_id=$1',[ownerA]));
  await assert.rejects(db.transaction(ownerB,tx=>tx.query('UPDATE syezzhaem.profile_identity_index SET profile_id=$1 WHERE user_id=$2',[profileA,ownerB])),/owner|projection|row-level security|reference/i);
});
