import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
// @ts-expect-error Native disposable PostgreSQL helper intentionally uses JS.
import {startPostgresFixture} from './data-pg-helper.mjs';
import {createDatabase,type Database,type Sql} from '../server/database.ts';
import {R1Store,type RunDTO} from '../server/r1-store.ts';
import {seedR1Metadata,R2_CONTENT_IDS} from '../server/r1-metadata.ts';
import {BUILD_CONTEXT,INTRO_BUILD_CONTEXT,CURRENT_BUILD_CONTEXT,fromSnapshotV1,toSnapshotV1} from '../src/snapshot-v1.ts';
import {step,take,place,pickActor,targetAt} from '../src/core.ts';
import {exportGame,restoreGame} from '../server/r1-recovery.ts';
let fixture:any,db:Database,store:R1Store;
async function seed(pool:any){const c=await pool.connect();try{await c.query('BEGIN');await seedR1Metadata({exec:async sql=>{await c.query(sql)},query:(sql,params)=>c.query(sql,params)});await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
const body=(build=CURRENT_BUILD_CONTEXT)=>({client_build_id:build.client_build_id,content_version:build.content_version,level_id:build.level_id,request_id:randomUUID()});
function startRoute(run:RunDTO){
 const s=fromSnapshotV1(run.checkpoint);
 for(const [wall,cell] of [[1,9],[2,10]]){
  const b=s.blocks.find(b=>b.space==='house'&&b.x===7&&b.y===wall)!;
  assert.ok(b);assert.equal(take(s,targetAt(s,'house',7,wall)).ok,true);
  assert.equal(place(s,targetAt(s,'world',cell,0),b.material).ok,true);
 }
 assert.equal(s.tutorialPlacements,2);
 for(let i=0;i<12;i++)step(s,{left:false,right:false,jump:false});
 return s;
}
before(async()=>{fixture=await startPostgresFixture();await seed(fixture.admin);db=await createDatabase({databaseUrl:fixture.runtimeUrl});store=new R1Store(db)});
after(async()=>{await store?.close();await fixture?.close()});

test('R2 additive metadata seed preserves populated R1/intro runs and all immutable values',async()=>{
 // Recreate the actual populated pre-R2 shape in this disposable database.
 await fixture.admin.query('BEGIN');
 try{
  await fixture.admin.query('DELETE FROM syezzhaem.entities WHERE id=ANY($1::uuid[])',[Object.values(R2_CONTENT_IDS)]);
  const additions=['checkpoint.tutorial_placements','checkpoint.destroyed_wood','checkpoint.destroyed_stone','checkpoint.destroyed_slime','checkpoint.lava_x','checkpoint.player_damage_ticks','checkpoint.core_damage_ticks','actor_state.action_cooldown_ticks','actor_state.direction','actor_state.fuse_ticks','actor_state.explosion_applied','cell_override.durability','cell_override.burn_ticks','ruleset.configuration_asset_ref','level_definition.actors_asset_ref','level_definition.materials_asset_ref','level_definition.level_asset_ref'];
  await fixture.admin.query('DELETE FROM syezzhaem.entity_parameters WHERE id=ANY($1::text[])',[additions]);await fixture.admin.query('COMMIT');
 }catch(e){await fixture.admin.query('ROLLBACK');throw e}
 const legacy=await store.start('r2-old',body(BUILD_CONTEXT),BUILD_CONTEXT),intro=await store.start('r2-intro',body(INTRO_BUILD_CONTEXT),INTRO_BUILD_CONTEXT);
 const globalsBefore=(await fixture.admin.query("SELECT v.* FROM syezzhaem.entity_parameter_values v JOIN syezzhaem.entities e ON e.id=v.entity_id WHERE e.owner_user_id IS NULL AND e.id<>ALL($1::uuid[]) ORDER BY v.entity_id,v.parameter_id",[Object.values(R2_CONTENT_IDS)])).rows;
 await seed(fixture.admin);await seed(fixture.admin);await store.check();
 const after=(await fixture.admin.query("SELECT v.* FROM syezzhaem.entity_parameter_values v JOIN syezzhaem.entities e ON e.id=v.entity_id WHERE e.owner_user_id IS NULL AND e.id<>ALL($1::uuid[]) ORDER BY v.entity_id,v.parameter_id",[Object.values(R2_CONTENT_IDS)])).rows;
 assert.deepEqual(after,globalsBefore);assert.deepEqual(await store.get('r2-old',legacy.run_id),legacy);assert.deepEqual(await store.get('r2-intro',intro.run_id),intro);
 assert.equal(Number((await fixture.admin.query("SELECT max_number FROM syezzhaem.entity_parameters WHERE id='house_state.support_loss_ticks'")).rows[0].max_number),90);
 const run=await store.start('r2-start',body(),CURRENT_BUILD_CONTEXT);
 assert.equal(run.checkpoint.content_version,'r2-map-1');assert.deepEqual(run.checkpoint.inventory,{wood:0,stone:0,slime:0});assert.equal(run.checkpoint.actors.length,3);assert.ok(run.checkpoint.lava);
 const materialRefs=(await fixture.admin.query("SELECT v.value_reference FROM syezzhaem.entity_parameter_values v JOIN syezzhaem.entities e ON e.id=v.entity_id WHERE e.owner_user_id='r2-start' AND v.parameter_id='inventory_item.material_ref'")).rows.map((r:any)=>r.value_reference).sort();
 assert.deepEqual(materialRefs,[R2_CONTENT_IDS.wood,R2_CONTENT_IDS.stone,R2_CONTENT_IDS.slime].sort());
});

test('R2 typed EAV roundtrip preserves carried actor, flight, burn, stone HP and fuse; retry one revision',async()=>{
 const run=await store.start('r2-state',body(),CURRENT_BUILD_CONTEXT),s=startRoute(run);
 assert.equal(pickActor(s,'cat:companion').ok,true);
 step(s,{left:false,right:false,jump:true});assert.equal(s.player.support,null);assert.ok(s.player.vy>0);
 const wood=s.blocks.find(b=>b.space==='house'&&b.material==='wood')!;wood.burnTicks=120;
 const stone=s.blocks.find(b=>b.space==='house'&&b.material==='stone')!;stone.durability=1;
 const mob=s.actors!.find(a=>a.kind==='mob')!;mob.state='armed';mob.fuseTicks=37;
 const snapshot=toSnapshotV1(s,run.checkpoint),request={run_id:run.run_id,expected_revision:0,request_id:randomUUID(),snapshot};
 const saved=await store.save('r2-state',request);assert.deepEqual(saved.checkpoint,snapshot);assert.deepEqual(await store.save('r2-state',request),saved);assert.equal((await store.get('r2-state',run.run_id)).revision,1);
 assert.equal(saved.checkpoint.player.held_actor_key,'cat:companion');assert.equal(saved.checkpoint.actors.find(a=>a.kind==='mob')!.fuse_ticks,37);
 const held=(await fixture.admin.query("SELECT v.value_reference FROM syezzhaem.entity_parameter_values v JOIN syezzhaem.entities e ON e.id=v.entity_id WHERE e.owner_user_id='r2-state' AND v.parameter_id='actor_state.held_actor_ref'")).rows;assert.equal(held.length,1);assert.match(held[0].value_reference,/^[0-9a-f-]{36}$/);
 const unknown=structuredClone(snapshot);unknown.actors.at(-1)!.fuse_ticks=85;
 await assert.rejects(store.save('r2-state',{...request,expected_revision:1,request_id:randomUUID(),snapshot:unknown}),{code:'VALIDATION_FAILED'});
 assert.deepEqual(await store.get('r2-state',run.run_id),saved);
 const denied=await fixture.admin.query("SELECT count(*) AS n FROM syezzhaem.entity_parameter_values WHERE parameter_id='cell_override.burn_ticks' AND value_integer=120");assert.equal(Number(denied.rows[0].n),1);
 const reloaded=fromSnapshotV1(saved.checkpoint),direct=fromSnapshotV1(snapshot);step(reloaded,{left:false,right:false,jump:false});step(direct,{left:false,right:false,jump:false});assert.deepEqual(toSnapshotV1(reloaded,run.checkpoint),toSnapshotV1(direct,run.checkpoint));
});

test('R2 EAV recovery restores material definitions, actor references, timers and legacy saves together',async()=>{
 const before=(await store.bootstrap('r2-state')).active_run!;
 const backup=await fixture.admin.connect().then(async(c:any)=>{try{await c.query('BEGIN');const value=await exportGame({exec:async sql=>{await c.query(sql)},query:(sql,params)=>c.query(sql,params)});await c.query('COMMIT');return value}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}});
 const second=await startPostgresFixture();let secondDb:Database|undefined;
 try{await second.admin.query('BEGIN');await restoreGame({exec:async sql=>{await second.admin.query(sql)},query:(sql,params)=>second.admin.query(sql,params)},backup);await second.admin.query('COMMIT');secondDb=await createDatabase({databaseUrl:second.runtimeUrl});const restored=new R1Store(secondDb);await restored.check();assert.deepEqual(await restored.get('r2-state',before.run_id),before);assert.equal((await restored.bootstrap('r2-old')).active_run!.checkpoint.content_version,'r1-map-1');assert.equal((await restored.bootstrap('r2-intro')).active_run!.checkpoint.content_version,'r1-map-2');}
 finally{await secondDb?.close();await second.close()}
});
