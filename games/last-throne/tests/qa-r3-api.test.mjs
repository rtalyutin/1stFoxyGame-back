// Independent R3 HTTP/EAV acceptance on fresh real PGlite. No network/VPS or multi-session claim.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../scripts/migrate.mjs';
import {createApp} from '../server/app.mjs';
import {fixtureRelease} from './fixtures.mjs';
import {readContent,readMetadataSchema,canonicalJson} from '../db/content.mjs';
import {seedR3} from '../db/seed-r3.mjs';
import {parseContentProjection,contentRows} from '../core/content-r3.ts';
import {createGame,createSnapshot,restoreSnapshot,submitCommand} from '../core/game-core-r3.ts';
import {parseContentProjection as parseR1} from '../core/content-r1.ts';
import {createGame as gameR1,createSnapshot as snapshotR1} from '../core/game-core.ts';
import {parseContentProjection as parseR2} from '../core/content-r2.ts';
import {createGame as gameR2,createSnapshot as snapshotR2} from '../core/game-core-r2.ts';
let db,pool,app,dir,content;
const hash=v=>createHash('sha256').update(canonicalJson(v)).digest('hex');
function serialPool(database){const raw=async(sql,args=[])=>args.length?database.query(sql,args):(await database.exec(sql)).at(-1)||{rows:[]};let tail=Promise.resolve();async function acquire(){const before=tail;let release;tail=new Promise(r=>release=r);await before;return release;}return{query:async(sql,args)=>{const unlock=await acquire();try{return await raw(sql,args);}finally{unlock();}},connect:async()=>{const unlock=await acquire();return{query:raw,release:unlock};}};}
before(async()=>{db=new PGlite();pool=serialPool(db);await migrate(pool);content=parseContentProjection(await readContent(pool,'r3-content-1'));dir=await mkdtemp(join(tmpdir(),'qa-r3-api-'));
 const compatibility={compatibleApi:[1],compatibleSaveFormats:[1,2,3,4],compatibleMetadataSchemas:['r0-meta-1','r1-meta-1','r2-meta-1','r3-meta-1'],compatibleClientReleases:['*','r1-*','r2-*','r3-qa-http'],rollbackMode:'frontend_only'};
 for(const[n,family]of ['r0','r1','r2','r3'].entries())await fixtureRelease(dir,`${family}-qa-http`,{...compatibility,versions:{frontend:`${family}-web-qa`,backend:'r3-api-qa',core:`${family}-core-1`,content:`${family}-content-1`,metadataSchema:`${family}-meta-1`,saveFormat:n+1,api:1}});
 app=await createApp({pool,releasesDir:dir,releaseId:'r3-qa-http',publicOrigin:'http://localhost',secureCookies:false});await app.ready();
});
after(async()=>{await app?.close();await db?.close();if(dir)await rm(dir,{recursive:true,force:true});});
const request=(method,url,cookie,payload)=>app.inject({method,url,headers:{origin:'http://localhost',...(cookie?{cookie}:{})},...(payload===undefined?{}:{payload})});
async function guest(){const r=await request('POST','/api/v1/guest-session',null,{});assert.equal(r.statusCode,201);return r.headers['set-cookie'].split(';')[0];}
async function run(cookie,family='r3'){const r=await request('POST','/api/v1/runs',cookie,{clientRunId:randomUUID(),clientReleaseId:`${family}-qa-http`,coreVersion:`${family}-core-1`,contentVersion:`${family}-content-1`,seed:19031});assert.equal(r.statusCode,201,r.body);return r.json();}
const envelope=snapshot=>({requestId:randomUUID(),expectedRevision:1,snapshotSchemaVersion:snapshot.schemaVersion,snapshot});

test('QA R3 mixed-owner HTTP pinned R1/R2/R3 checkpoints preserve original game and scalar expedition/items',async()=>{
 const cookie=await guest(),outsider=await guest();const r0=await request('GET','/api/v1/bootstrap?clientReleaseId=r0-qa-http',cookie);assert.equal(r0.statusCode,200);assert.equal(r0.json().versions.saveFormat,1);assert.equal(r0.json().capabilities.battle,false);
 const s1=snapshotR1(gameR1(parseR1(await readContent(pool,'r1-content-1')),19031)),s2=snapshotR2(gameR2(parseR2(await readContent(pool,'r2-content-1')),19031)),g=createGame(content,19031);
 let sequence=0;for(const [type,payload,actorId]of[['equip_item',{itemId:'sight_gem',slot:0},'sniper'],['equip_item',{itemId:'swift_charm',slot:1},'sniper'],['send_expedition',{kind:'roshan'},'pudge']])assert.equal(submitCommand(g,{commandId:`qa-init-${sequence}`,sequence:sequence++,tick:0,type,payload,actorId}).status,'accepted');
 for(const[family,snapshot]of[['r1',s1],['r2',s2],['r3',createSnapshot(g)]]){const r=await run(cookie,family),url=`/api/v1/runs/${r.id}/checkpoint`,body=envelope(snapshot),saved=await request('PUT',url,cookie,body);assert.equal(saved.statusCode,200,saved.body);assert.equal((await request('GET',url,outsider)).statusCode,404);assert.equal((await request('PUT',url,outsider,body)).statusCode,404);const restored=(await request('GET',url,cookie)).json().snapshot;assert.deepEqual(restored,snapshot);const boot=(await request('GET',`/api/v1/bootstrap?clientReleaseId=${family}-qa-http`,cookie)).json();assert.equal(boot.versions.saveFormat,snapshot.schemaVersion);assert.equal(boot.versions.core,`${family}-core-1`);if(family==='r3'){const loaded=restoreSnapshot(content,restored);assert.equal(loaded.content.waves.length,15);assert.equal(loaded.heroes.find(h=>h.id==='pudge').expedition.remainingTicks,900);assert.deepEqual(loaded.heroes.find(h=>h.id==='sniper').items,['sight_gem','swift_charm']);}else{assert.equal(snapshot.schemaVersion,family==='r1'?2:3);const wrong=await request('PUT',url,cookie,{...envelope(createSnapshot(g)),expectedRevision:2});assert.equal(wrong.statusCode,422);}}
 assert.equal((await request('GET','/api/v1/runs',cookie)).json().runs.length,3);
});

test('QA R3 exact retry before revision and terminal; changed body, malformed generation, crossowner denied',async()=>{
 const cookie=await guest(),r=await run(cookie),snapshot=createSnapshot(createGame(content,19031)),body=envelope(snapshot),url=`/api/v1/runs/${r.id}/checkpoint`;
 const first=await request('PUT',url,cookie,body);assert.equal(first.statusCode,200,first.body);
 const stale=await request('PUT',url,cookie,{...body,requestId:randomUUID()});assert.equal(stale.statusCode,409);assert.equal(stale.json().error.code,'REVISION_CONFLICT');
 const clash=await request('PUT',url,cookie,{...body,snapshot:{...snapshot,gold:snapshot.gold+1}});assert.equal(clash.statusCode,409);assert.equal(clash.json().error.code,'IDEMPOTENCY_CONFLICT');
 const malformed=structuredClone(snapshot);malformed.heroes[0].items=['split_charm',null];const invalid=await request('PUT',url,cookie,{...envelope(malformed),expectedRevision:2});assert.equal(invalid.statusCode,422,invalid.body);assert.equal((await request('GET',url,cookie)).json().checkpointId,first.json().checkpointId);
 const finish={requestId:randomUUID(),expectedRevision:2,result:{outcome:'defeat',wave:1,lastCompletedWave:0,simTick:500,gold:snapshot.gold,throneHp:0,seed:snapshot.seed,versions:snapshot.versions,statistics:snapshot.statistics}};
 const end=await request('POST',`/api/v1/runs/${r.id}/finish`,cookie,finish);assert.equal(end.statusCode,200,end.body);const replay=await request('PUT',url,cookie,body);assert.equal(replay.statusCode,200);assert.deepEqual(replay.json(),first.json());const late=await request('PUT',url,cookie,{...body,requestId:randomUUID(),expectedRevision:3});assert.equal(late.statusCode,409);assert.equal(late.json().error.code,'RUN_FINISHED');assert.deepEqual((await request('POST',`/api/v1/runs/${r.id}/finish`,cookie,finish)).json(),end.json());
});

test('QA R3 A19 optional typed metadata revision publishes and compiles without DDL or old catalog mutation',async()=>{
 const old=await readContent(pool,'r3-content-1'),oldHash=hash(old),meta=await readMetadataSchema(pool,'r3-meta-1');
 // Intentionally permissive future enum: closed runtime handler guard must still apply to this new metadata.
 for(const t of meta.types)for(const p of t.parameters)if(t.code==='item_definition'&&p.code==='behavior_id')p.constraints={minLength:1,maxLength:64};
 const columns=async()=> (await pool.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='last_throne' ORDER BY table_name,ordinal_position")).rows;
 const before=await columns(),version='r3-meta-qa-optional',release='r3-content-qa-optional',typeIds=new Map(meta.types.map(t=>[t.id,randomUUID()])),parameterIds=new Map(meta.types.flatMap(t=>t.parameters.map(p=>[p.id,randomUUID()]))),entityIds=new Map(old.entities.map(e=>[e.id,randomUUID()]));
 await pool.query('INSERT INTO last_throne.metadata_schema_versions(version) VALUES($1)',[version]);
 for(const t of meta.types){await pool.query('INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES($1,$2,$3,103)',[typeIds.get(t.id),t.code,t.label]);await pool.query('INSERT INTO last_throne.metadata_schema_types VALUES($1,$2)',[version,typeIds.get(t.id)]);}
 for(const t of meta.types)for(const p of t.parameters)await pool.query('INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[parameterIds.get(p.id),typeIds.get(t.id),p.code,p.label,p.dataType,p.required,p.multiple,p.targetTypeId?typeIds.get(p.targetTypeId):null,p.referencePolicy,p.constraints]);
 const heroType=meta.types.find(t=>t.code==='hero_definition'),optional=randomUUID();await pool.query("INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES($1,$2,'qa_optional','QA optional integer','integer',false,'{\"min\":0,\"max\":42}')",[optional,typeIds.get(heroType.id)]);
 const extended={version,types:meta.types.map(t=>({...t,id:typeIds.get(t.id),schemaRevision:103,parameters:[...t.parameters.map(p=>({...p,id:parameterIds.get(p.id),targetTypeId:p.targetTypeId?typeIds.get(p.targetTypeId):null})),...(t===heroType?[{id:optional,code:'qa_optional',label:'QA optional integer',dataType:'integer',required:false,multiple:false,targetTypeId:null,referencePolicy:null,constraints:{min:0,max:42}}]:[])].sort((a,b)=>a.code.localeCompare(b.code))}))};
 await pool.query('SELECT last_throne.publish_metadata_schema($1,$2)',[version,hash(extended)]);assert.deepEqual(await readMetadataSchema(pool,version),extended);
 const projection={...old,contentVersion:release,metadataSchemaVersion:version,entities:old.entities.map(e=>({...e,id:entityIds.get(e.id),schemaRevision:103,parameters:{...e.parameters,...(e.type==='hero_definition'&&e.parameters.code==='sniper'?{qa_optional:0}:{})}})).sort((a,b)=>a.id.localeCompare(b.id))};
 await pool.query('INSERT INTO last_throne.content_releases(id,content_version,schema_version,metadata_schema_version,core_compatibility,asset_manifest_hash,projection_hash) VALUES($1,$1,1,$2,$3,$4,$5)',[release,version,['r3-core-1'],hash([]),hash(projection)]);
 for(const e of projection.entities){const t=meta.types.find(t=>t.code===e.type),typeId=typeIds.get(t.id);await pool.query('INSERT INTO last_throne.entities(id,entity_type_id,metadata_schema_version,release_id,pinned_release_id) VALUES($1,$2,$3,$4,$4)',[e.id,typeId,version,release]);for(const[code,value]of Object.entries(e.parameters)){const p=code==='qa_optional'?{id:optional,dataType:'integer'}:t.parameters.find(p=>p.code===code);assert(!p.multiple,'R3 catalog scalar fixture expected');assert.notEqual(p.dataType,'reference','R3 catalog scalar fixture expected');await pool.query(`INSERT INTO last_throne.entity_parameter_values(entity_id,entity_type_id,parameter_id,data_type,${p.dataType}_value) VALUES($1,$2,$3,$4,$5)`,[e.id,typeId,code==='qa_optional'?optional:parameterIds.get(p.id),p.dataType,value]);}}
 await pool.query('SELECT last_throne.publish_content_release($1)',[release]);const read=await readContent(pool,release);assert.equal(hash(read),hash(projection));assert.equal(read.entities.find(e=>e.parameters.code==='sniper').parameters.qa_optional,0);assert(read.entities.filter(e=>e.type==='hero_definition'&&e.parameters.code!=='sniper').every(e=>!('qa_optional'in e.parameters)));const compiled=parseContentProjection(read);assert.equal(compiled.waves.length,15);assert.equal(compiled.heroes.length,5);assert.deepEqual(await columns(),before);assert.equal(hash(await readContent(pool,'r3-content-1')),oldHash);await assert.rejects(()=>pool.query("UPDATE last_throne.entity_parameters SET required=true WHERE id=$1",[optional]),/IMMUTABLE|immutable/i);
 const badRelease='r3-content-qa-unknown',badProjection=structuredClone(projection);badProjection.contentVersion=badRelease;for(const e of badProjection.entities)e.id=randomUUID();badProjection.entities.sort((a,b)=>a.id.localeCompare(b.id));badProjection.entities.find(e=>e.type==='item_definition').parameters.behavior_id='qa_unknown_handler';
 await pool.query('INSERT INTO last_throne.content_releases(id,content_version,schema_version,metadata_schema_version,core_compatibility,asset_manifest_hash,projection_hash) VALUES($1,$1,1,$2,$3,$4,$5)',[badRelease,version,['r3-core-1'],hash([]),hash(badProjection)]);
 for(const e of badProjection.entities){const t=meta.types.find(t=>t.code===e.type),typeId=typeIds.get(t.id);await pool.query('INSERT INTO last_throne.entities(id,entity_type_id,metadata_schema_version,release_id,pinned_release_id) VALUES($1,$2,$3,$4,$4)',[e.id,typeId,version,badRelease]);for(const[code,value]of Object.entries(e.parameters)){const p=code==='qa_optional'?{id:optional,dataType:'integer'}:t.parameters.find(p=>p.code===code);await pool.query(`INSERT INTO last_throne.entity_parameter_values(entity_id,entity_type_id,parameter_id,data_type,${p.dataType}_value) VALUES($1,$2,$3,$4,$5)`,[e.id,typeId,code==='qa_optional'?optional:parameterIds.get(p.id),p.dataType,value]);}}
 assert.throws(()=>parseContentProjection(badProjection));
 await assert.rejects(()=>pool.query('SELECT last_throne.publish_content_release($1)',[badRelease]),/CONTENT_INCOMPATIBLE|UNKNOWN_HANDLER|INVALID_CONTENT/);
 assert.equal((await pool.query('SELECT status FROM last_throne.content_releases WHERE id=$1',[badRelease])).rows[0].status,'draft');assert.equal((await pool.query("SELECT count(*)::int n FROM last_throne.entities WHERE release_id=$1 AND status='published'",[badRelease])).rows[0].n,0);

});

test('QA R3 unknown item and spell handlers fail closed and roll back publication atomically',async()=>{
 const isolated=new PGlite(),p=serialPool(isolated);try{for(const name of ['001_typed_eav.sql','002_r0_catalog.sql','003_r1_persistence.sql','004_r1_catalog.sql','005_r2_persistence.sql','006_r2_catalog.sql','007_r3_persistence.sql'])await isolated.exec(await readFile(new URL('../db/migrations/'+name,import.meta.url),'utf8'));
 for(const type of ['item_definition','spell_definition']){const bad=contentRows();bad.find(r=>r.type===type).parameters.behavior_id='qa_execute_unknown';await assert.rejects(()=>seedR3(p,bad));assert.equal((await p.query("SELECT count(*)::int n FROM last_throne.content_releases WHERE id='r3-content-1'")).rows[0].n,0);assert.equal((await p.query("SELECT status FROM last_throne.metadata_schema_versions WHERE version='r3-meta-1'")).rows[0].status,'draft');}
 await seedR3(p,contentRows());assert.equal(parseContentProjection(await readContent(p,'r3-content-1')).items.length,4);
 }finally{await isolated.close();}
});
