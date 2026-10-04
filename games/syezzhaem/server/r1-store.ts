import { createHash,randomUUID } from 'node:crypto';
import { BUILD_CONTEXT,createSnapshotV1,validateSnapshotV1,scoreSnapshot,type SnapshotV1,type BuildContext } from '../src/snapshot-v1.ts';
import type { Database,Sql } from './database.ts';
import { CONTENT_IDS,INTRO_CONTENT_IDS,contentIds,TYPES,writeValues,seedR1Metadata } from './r1-metadata.ts';
export class DomainError extends Error {constructor(public code:string,message:string,public status=400,public path?:string,public details?:unknown){super(message)}}
export interface ProfileDTO{profile_id:string;revision:number;display_name:string;sound_enabled:boolean;sound_volume:number;quality:'low'|'medium';controls_hint_seen:boolean}
export interface RunDTO{run_id:string;revision:number;lifecycle:'active'|'won'|'lost'|'abandoned';checkpoint:SnapshotV1;updated_at:string;started_at:string;result?:ReturnType<typeof scoreSnapshot>}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const record=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new DomainError('VALIDATION_FAILED','Object required');return v as Record<string,unknown>};
const exact=(v:unknown,keys:string[],optional:string[]=[]):Record<string,unknown>=>{const r=record(v);for(const k of Object.keys(r))if(!keys.includes(k)&&!optional.includes(k))throw new DomainError('VALIDATION_FAILED','Unexpected field',400,k);for(const k of keys)if(!Object.hasOwn(r,k))throw new DomainError('VALIDATION_FAILED','Missing field',400,k);return r};
const norm=(v:unknown):unknown=>Array.isArray(v)?v.map(norm):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,value])=>[k,norm(value)])):v;
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(norm(v))).digest('hex');
const time=(v:unknown)=>new Date(v as string).toISOString();
const request=(r:Record<string,unknown>)=>{if(!uuid(r.request_id))throw new DomainError('VALIDATION_FAILED','UUID required',400,'request_id');return r.request_id};
const revision=(r:Record<string,unknown>)=>{if(typeof r.expected_revision!=='number'||!Number.isInteger(r.expected_revision)||r.expected_revision<0)throw new DomainError('VALIDATION_FAILED','Nonnegative revision required',400,'expected_revision');return r.expected_revision};
const runId=(r:Record<string,unknown>)=>{if(!uuid(r.run_id))throw new DomainError('VALIDATION_FAILED','UUID required',400,'run_id');return r.run_id};
interface Root{id:string;revision:number;created_at:string;updated_at:string;entity_type_id:string}
interface AggregateEntity{type:string;values:Record<string,unknown>}
export class R1Store {
 constructor(public db:Database){}
 /** Explicit local/dev initializer only; PostgreSQL startup never invokes it. */
 async seedForLocalTests(){await this.db.transaction('',tx=>seedR1Metadata(tx))}
 async check(){const r=await this.db.query('SELECT version FROM syezzhaem.schema_migrations WHERE version=1');if(!r.rows.length)throw new Error('R1 migration unavailable');const c=await this.db.query('SELECT id FROM syezzhaem.entities WHERE id=ANY($1::uuid[])',[[CONTENT_IDS.level,INTRO_CONTENT_IDS.level]]);if(c.rows.length!==2)throw new Error('R1 immutable content unavailable')}
 private owner(owner:string){if(typeof owner!=='string'||!owner.length||owner.length>128)throw new DomainError('NOT_FOUND','Authenticated user required',401)}
 private async profile(tx:Sql,owner:string,lock=true):Promise<{id:string;dto:ProfileDTO}>{
  if(lock)await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`syezzhaem-profile:${owner}`]);
  let row=(await tx.query<{profile_id:string}>('SELECT profile_id FROM syezzhaem.profile_identity_index WHERE user_id=$1',[owner])).rows[0];
  if(!row){const id=randomUUID();await tx.query("INSERT INTO syezzhaem.entities(id,entity_type_id,owner_user_id) VALUES($1,'player_profile',$2)",[id,owner]);await writeValues(tx,id,'player_profile',{display_name:'',sound_enabled:true,sound_volume:.7,quality:'medium',controls_hint_seen:false});await tx.query('INSERT INTO syezzhaem.profile_identity_index(user_id,profile_id) VALUES($1,$2)',[owner,id]);row={profile_id:id};}
  const root=(await tx.query<Root>('SELECT * FROM syezzhaem.entities WHERE id=$1 AND owner_user_id=$2 FOR UPDATE',[row.profile_id,owner])).rows[0];
  if(!root)throw new DomainError('NOT_FOUND','Profile unavailable',404);
  const entities=await this.aggregate(tx,root.id,owner);const v=entities.get(root.id)!.values;
  return{id:root.id,dto:{profile_id:root.id,revision:root.revision,display_name:v.display_name as string,sound_enabled:v.sound_enabled as boolean,sound_volume:v.sound_volume as number,quality:v.quality as ProfileDTO['quality'],controls_hint_seen:v.controls_hint_seen as boolean}};
 }
 private async prior(tx:Sql,owner:string,operation:string,body:Record<string,unknown>):Promise<unknown|undefined>{
  const key=request(body);const old=(await tx.query<{operation:string;body_hash:string;response:unknown}>('SELECT operation,body_hash,response FROM syezzhaem.request_dedup WHERE user_id=$1 AND request_id=$2',[owner,key])).rows[0];
  if(!old)return undefined;
  if(old.operation!==operation||old.body_hash!==digest(body))throw new DomainError('IDEMPOTENCY_MISMATCH','Request key has another successful command',409);
  const response=old.response as Record<string,unknown>;
  if(typeof response.run_id==='string')await this.root(tx,owner,response.run_id,false);
  return response;
 }
 private async ack(tx:Sql,owner:string,operation:string,body:Record<string,unknown>,response:unknown){await tx.query('INSERT INTO syezzhaem.request_dedup(user_id,request_id,operation,body_hash,response) VALUES($1,$2,$3,$4,$5::jsonb)',[owner,request(body),operation,digest(body),JSON.stringify(response)]);return response}
 async bootstrap(owner:string,client_build:unknown=BUILD_CONTEXT.client_build_id,activeBuild:BuildContext=BUILD_CONTEXT){this.owner(owner);return this.db.transaction(owner,async tx=>{
  const p=await this.profile(tx,owner);const active=(await tx.query<{run_id:string}>('SELECT run_id FROM syezzhaem.active_run_index WHERE user_id=$1',[owner])).rows[0];
  const builds=await tx.query<{value_text:string}>("SELECT DISTINCT v.value_text FROM syezzhaem.entity_parameter_values v JOIN syezzhaem.entities e ON e.id=v.entity_id WHERE e.owner_user_id=$1 AND v.parameter_id='game_run.client_build_id'",[owner]);
  return{user_id:owner,profile:p.dto,active_run:active?await this.readRun(tx,owner,active.run_id):null,catalog:[{level_id:activeBuild.level_id,title:'Дом — мост — портал',content_version:activeBuild.content_version,rules_version:activeBuild.rules_version,client_build_id:activeBuild.client_build_id}],compatible_versions:[...new Set([activeBuild.client_build_id,...builds.rows.map(b=>b.value_text)])],client_build};
 })}
 async updateProfile(owner:string,input:unknown):Promise<ProfileDTO>{this.owner(owner);const body=exact(input,['expected_revision','request_id'],['settings']);const settings=exact(body.settings??{},[],['display_name','sound_enabled','sound_volume','quality','controls_hint_seen']);
  for(const[k,v]of Object.entries(settings)){if(k==='display_name'&&(typeof v!=='string'||v.length>64)||['sound_enabled','controls_hint_seen'].includes(k)&&typeof v!=='boolean'||k==='sound_volume'&&(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)||k==='quality'&&!['low','medium'].includes(v as string))throw new DomainError('VALIDATION_FAILED','Setting invalid',400,`settings.${k}`)}
  request(body);revision(body);return this.db.transaction(owner,async tx=>{const p=await this.profile(tx,owner);const prior=await this.prior(tx,owner,'profile_update_v1',body);if(prior)return prior as ProfileDTO;if(p.dto.revision!==body.expected_revision)throw new DomainError('REVISION_CONFLICT','Profile changed',409,undefined,{revision:p.dto.revision});
   for(const[k,v]of Object.entries(settings)){await tx.query('DELETE FROM syezzhaem.entity_parameter_values WHERE entity_id=$1 AND parameter_id=$2',[p.id,`player_profile.${k}`]);await writeValues(tx,p.id,'player_profile',{[k]:v})}
   await tx.query('UPDATE syezzhaem.entities SET revision=revision+1,updated_at=now() WHERE id=$1',[p.id]);const dto={...p.dto,...settings,revision:p.dto.revision+1} as ProfileDTO;await this.ack(tx,owner,'profile_update_v1',body,dto);return dto;
  })
 }
 async start(owner:string,input:unknown,activeBuildSource:BuildContext|(()=>Promise<BuildContext>)=BUILD_CONTEXT):Promise<RunDTO>{this.owner(owner);const body=exact(input,['client_build_id','level_id','content_version','request_id']);request(body);return this.db.transaction(owner,async tx=>{
  await this.profile(tx,owner);const old=await this.prior(tx,owner,'run_start_v1',body);if(old)return old as RunDTO;
  const activeBuild=typeof activeBuildSource==='function'?await activeBuildSource():activeBuildSource;
  if(body.client_build_id!==activeBuild.client_build_id)throw new DomainError('CLIENT_UPDATE_REQUIRED','Open the current launcher before a new run',409,undefined,{active_build_id:activeBuild.client_build_id});
  if(body.level_id!==activeBuild.level_id||body.content_version!==activeBuild.content_version)throw new DomainError('CONTENT_INCOMPATIBLE','Build/content/level mismatch',409);
  const active=(await tx.query<{run_id:string}>('SELECT run_id FROM syezzhaem.active_run_index WHERE user_id=$1',[owner])).rows[0];if(active)throw new DomainError('ACTIVE_RUN_EXISTS','Continue or abandon the active run',409,undefined,{run_id:active.run_id});
  const id=randomUUID(),checkpoint=createSnapshotV1(id,activeBuild),now=new Date().toISOString();
  await tx.query("INSERT INTO syezzhaem.entities(id,entity_type_id,owner_user_id) VALUES($1,'game_run',$2)",[id,owner]);
  await writeValues(tx,id,'game_run',{level_ref:contentIds(activeBuild.content_version).level,client_build_id:activeBuild.client_build_id,content_version:activeBuild.content_version,rules_version:activeBuild.rules_version,lifecycle:'active',started_at:now,active_tick:0,result_score:0});
  await this.writeCheckpoint(tx,owner,id,checkpoint);await tx.query('INSERT INTO syezzhaem.active_run_index(user_id,run_id) VALUES($1,$2)',[owner,id]);
  const dto=await this.readRun(tx,owner,id);await this.ack(tx,owner,'run_start_v1',body,dto);return dto;
 })}
 async get(owner:string,id:unknown):Promise<RunDTO>{this.owner(owner);if(!uuid(id))throw new DomainError('VALIDATION_FAILED','UUID required',400,'run_id');return this.db.transaction(owner,tx=>this.readRun(tx,owner,id),true)}
 async save(owner:string,input:unknown):Promise<RunDTO>{return this.change(owner,input,'checkpoint_save_v1')}
 async finish(owner:string,input:unknown):Promise<RunDTO>{return this.change(owner,input,'run_finish_v1')}
 async abandon(owner:string,input:unknown):Promise<RunDTO>{return this.change(owner,input,'run_abandon_v1')}
 private async change(owner:string,input:unknown,operation:string):Promise<RunDTO>{
  this.owner(owner);const body=exact(input,['run_id','expected_revision','request_id',...(operation==='run_abandon_v1'?[]:['snapshot']),...(operation==='run_finish_v1'?['outcome']:[])]);const id=runId(body);revision(body);request(body);
  return this.db.transaction(owner,async tx=>{
   await this.profile(tx,owner);const prior=await this.prior(tx,owner,operation,body);if(prior)return prior as RunDTO;
   const root=await this.root(tx,owner,id,true),current=await this.readRun(tx,owner,id);
   if(current.lifecycle!=='active')throw new DomainError('RUN_TERMINAL','Terminal run cannot change',409);
   if(root.revision!==body.expected_revision)throw new DomainError('REVISION_CONFLICT','Server revision changed',409,undefined,{revision:root.revision,updated_at:current.updated_at});
   let snapshot=current.checkpoint;
   if(operation!=='run_abandon_v1'){
    try{snapshot=validateSnapshotV1(body.snapshot,{client_build_id:current.checkpoint.client_build_id,content_version:current.checkpoint.content_version,rules_version:current.checkpoint.rules_version,level_id:current.checkpoint.level_id})}catch(e){const message=e instanceof Error?e.message:'Invalid snapshot';throw new DomainError(message.includes('incompatible')?'CONTENT_INCOMPATIBLE':'VALIDATION_FAILED',message,400,message.split(':')[0])}
    if(snapshot.run_id!==id)throw new DomainError('VALIDATION_FAILED','Snapshot belongs to another run',400,'snapshot.run_id');
    if(snapshot.sim_tick<current.checkpoint.sim_tick)throw new DomainError('VALIDATION_FAILED','Simulation tick cannot move backwards',400,'snapshot.sim_tick');
   }
   if(operation==='checkpoint_save_v1'){
    if(snapshot.outcome!=='playing')throw new DomainError('VALIDATION_FAILED','Terminal snapshot requires finish',400,'snapshot.outcome');
    const count=(await tx.query<{n:string|number}>("SELECT count(*) AS n FROM syezzhaem.request_dedup WHERE user_id=$1 AND operation='checkpoint_save_v1' AND created_at>clock_timestamp()-interval '1 second'",[owner])).rows[0];if(Number(count.n)>=2)throw new DomainError('RATE_LIMITED','At most two checkpoints per second',429);
   }
   let lifecycle:RunDTO['lifecycle']='active',result=scoreSnapshot(snapshot);
   if(operation==='run_finish_v1'){
    if(!['won','lost'].includes(body.outcome as string)||result.outcome!==body.outcome)throw new DomainError('VALIDATION_FAILED','Final outcome must match validated snapshot',400,'outcome');lifecycle=body.outcome as 'won'|'lost';
   }else if(operation==='run_abandon_v1')lifecycle='abandoned';
   await tx.query('DELETE FROM syezzhaem.entities WHERE parent_id=$1',[id]);await this.writeCheckpoint(tx,owner,id,snapshot);
   const fields:Record<string,unknown>={lifecycle,active_tick:snapshot.sim_tick,result_score:lifecycle==='won'?result.score:0};if(lifecycle!=='active')fields.finished_at=new Date().toISOString();if(snapshot.reason)fields.outcome_reason=snapshot.reason;
   for(const[k,v]of Object.entries(fields)){await tx.query('DELETE FROM syezzhaem.entity_parameter_values WHERE entity_id=$1 AND parameter_id=$2',[id,`game_run.${k}`]);await writeValues(tx,id,'game_run',{[k]:v})}
   await tx.query('UPDATE syezzhaem.entities SET revision=revision+1,updated_at=now() WHERE id=$1',[id]);if(lifecycle!=='active')await tx.query('DELETE FROM syezzhaem.active_run_index WHERE user_id=$1 AND run_id=$2',[owner,id]);
   const dto=await this.readRun(tx,owner,id);await this.ack(tx,owner,operation,body,dto);return dto;
  });
 }
 private async root(tx:Sql,owner:string,id:string,lock:boolean):Promise<Root>{const root=(await tx.query<Root>(`SELECT * FROM syezzhaem.entities WHERE id=$1 AND owner_user_id=$2 AND entity_type_id='game_run' ${lock?'FOR UPDATE':''}`,[id,owner])).rows[0];if(!root)throw new DomainError('NOT_FOUND','Run unavailable',404);return root}
 private async writeCheckpoint(tx:Sql,owner:string,id:string,s:SnapshotV1){
  const checkpoint=randomUUID();const children:{id:string;type:string;parent:string;values:Record<string,unknown>;keys?:[string,string][]}[]=[
   {id:checkpoint,type:'checkpoint',parent:id,values:{run_ref:id,schema_version:s.schema_version,sim_tick:s.sim_tick,rng_state:s.rng_state,outcome:s.outcome,reason:s.reason,distance:s.counters.distance,placed_sequence:s.counters.placed_sequence}},
   {id:randomUUID(),type:'actor_state',parent:checkpoint,values:{checkpoint_ref:checkpoint,actor_key:'player',actor_kind:'player',x:s.player.x,y:s.player.y,vx:s.player.vx,vy:s.player.vy,hp:s.player.hp,state:'active',support_space:s.player.support?.coordinate_space,support_x:s.player.support?.x,support_y:s.player.support?.y,support_block_id:s.player.support?.block_id},keys:[['actor','player']]},
   {id:randomUUID(),type:'house_state',parent:checkpoint,values:{checkpoint_ref:checkpoint,...s.house,support_loss_ticks:s.content_version==='r1-map-2'?0:s.house.support_loss_ticks,support_loss_ticks_v2:s.content_version==='r1-map-2'?s.house.support_loss_ticks:undefined}},
   {id:randomUUID(),type:'inventory_item',parent:checkpoint,values:{checkpoint_ref:checkpoint,material_ref:CONTENT_IDS.wood,quantity:s.inventory.wood},keys:[['material',CONTENT_IDS.wood]]},
  ];
  for(const space of['house','world']as const)for(const c of s[`${space}_cells`])children.push({id:randomUUID(),type:'cell_override',parent:checkpoint,values:{checkpoint_ref:checkpoint,coordinate_space:space,x:c.x,y:c.y,operation:c.operation,base_block_id:c.base_block_id,block_definition_ref:c.material?CONTENT_IDS.wood:undefined,block_id:c.block_id,original_block_id:c.original_block_id},keys:[['cell',`${space}:${c.x}:${c.y}`],...(c.block_id?[['block',c.block_id]as[string,string]]:[])]});
  for(const e of children){await tx.query('INSERT INTO syezzhaem.entities(id,entity_type_id,owner_user_id,parent_id) VALUES($1,$2,$3,$4)',[e.id,e.type,owner,e.parent]);await writeValues(tx,e.id,e.type,e.values);for(const[kind,value]of e.keys??[])await tx.query('INSERT INTO syezzhaem.aggregate_keys(checkpoint_id,key_kind,key_value,entity_id,owner_user_id) VALUES($1,$2,$3,$4,$5)',[checkpoint,kind,value,e.id,owner]);}
 }
 private async aggregate(tx:Sql,id:string,owner:string):Promise<Map<string,AggregateEntity>>{
  const rows=await tx.query<{id:string;entity_type_id:string;code:string;data_type:string;value_text:string|null;value_integer:string|number|null;value_number:number|null;value_boolean:boolean|null;value_timestamp:Date|string|null;value_reference:string|null}>(`WITH RECURSIVE tree AS(SELECT id,entity_type_id FROM syezzhaem.entities WHERE id=$1 AND owner_user_id=$2 UNION ALL SELECT e.id,e.entity_type_id FROM syezzhaem.entities e JOIN tree t ON e.parent_id=t.id WHERE e.owner_user_id=$2) SELECT t.id,t.entity_type_id,p.code,v.data_type,v.value_text,v.value_integer,v.value_number,v.value_boolean,v.value_timestamp,v.value_reference FROM tree t LEFT JOIN syezzhaem.entity_parameter_values v ON v.entity_id=t.id LEFT JOIN syezzhaem.entity_parameters p ON p.id=v.parameter_id ORDER BY t.id,p.code`,[id,owner]);
  const map=new Map<string,AggregateEntity>();for(const row of rows.rows){if(!map.has(row.id))map.set(row.id,{type:row.entity_type_id,values:{}});if(!row.code)continue;const value=row.data_type==='integer'?Number(row.value_integer):row.data_type==='number'?row.value_number:row.data_type==='boolean'?row.value_boolean:row.data_type==='timestamp'?time(row.value_timestamp):row.data_type==='reference'?row.value_reference:row.value_text;map.get(row.id)!.values[row.code]=value;}return map;
 }
 private async readRun(tx:Sql,owner:string,id:string):Promise<RunDTO>{
  const root=await this.root(tx,owner,id,false),map=await this.aggregate(tx,id,owner),all=(type:string)=>[...map.values()].filter(e=>e.type===type).map(e=>e.values);
  const run=map.get(id)!.values,c=all('checkpoint')[0],p=all('actor_state')[0],h=all('house_state')[0],inv=all('inventory_item')[0];if(!c||!p||!h||!inv)throw new Error('Incomplete EAV run aggregate');
  const cells=(space:string)=>all('cell_override').filter(v=>v.coordinate_space===space).map(v=>({x:v.x,y:v.y,operation:v.operation,base_block_id:v.base_block_id??null,block_id:v.block_id??null,original_block_id:v.original_block_id??null,material:v.block_definition_ref?'wood':null}));
  const snapshot=validateSnapshotV1({schema_version:c.schema_version,run_id:id,client_build_id:run.client_build_id,content_version:run.content_version,rules_version:run.rules_version,level_id:run.level_ref===INTRO_CONTENT_IDS.level?'house-bridge-portal-intro':'house-bridge-portal',sim_tick:c.sim_tick,rng_state:c.rng_state,outcome:c.outcome,reason:c.reason??null,
   player:{x:p.x,y:p.y,vx:p.vx,vy:p.vy,hp:p.hp,support:p.support_space===undefined?null:{coordinate_space:p.support_space,x:p.support_x,y:p.support_y,block_id:p.support_block_id},held_actor_key:null,timers:{}},
   house:{x:h.x,y:h.y,core_hp:h.core_hp,movement_state:h.movement_state,support_loss_ticks:run.content_version==='r1-map-2'?h.support_loss_ticks_v2:h.support_loss_ticks},house_cells:cells('house'),world_cells:cells('world'),inventory:{wood:inv.quantity},actors:[],lava:null,counters:{distance:c.distance,placed_sequence:c.placed_sequence}});
  const dto:RunDTO={run_id:id,revision:root.revision,lifecycle:run.lifecycle as RunDTO['lifecycle'],checkpoint:snapshot,updated_at:time(root.updated_at),started_at:time(run.started_at)};if(dto.lifecycle==='won'||dto.lifecycle==='lost')dto.result=scoreSnapshot(snapshot);return dto;
 }
 async history(owner:string,input:unknown={}){this.owner(owner);const body=exact(input,[],['cursor','page_size']);const size=body.page_size??10;if(typeof size!=='number'||!Number.isInteger(size)||size<1||size>30)throw new DomainError('VALIDATION_FAILED','Page size 1..30 required',400,'page_size');let cursor:{created_at:string;id:string}|null=null;
  if(body.cursor!==undefined&&body.cursor!==null){try{const raw=JSON.parse(Buffer.from(body.cursor as string,'base64url').toString());if(!uuid(raw.id)||!Number.isFinite(Date.parse(raw.created_at)))throw 0;cursor=raw}catch{throw new DomainError('VALIDATION_FAILED','Invalid history cursor',400,'cursor')}}
  return this.db.transaction(owner,async tx=>{const rows=await tx.query<Root>(`SELECT e.* FROM syezzhaem.entities e JOIN syezzhaem.entity_parameter_values v ON v.entity_id=e.id AND v.parameter_id='game_run.lifecycle' WHERE e.owner_user_id=$1 AND e.entity_type_id='game_run' AND v.value_text<>'active' ${cursor?'AND (e.created_at,e.id)<($3::timestamptz,$4::uuid)':''} ORDER BY e.created_at DESC,e.id DESC LIMIT $2`,cursor?[owner,size+1,cursor.created_at,cursor.id]:[owner,size+1]);const chosen=rows.rows.slice(0,size),runs=[];for(const row of chosen)runs.push(await this.readRun(tx,owner,row.id));const last=chosen.at(-1);return{items:runs,next_cursor:rows.rows.length>size&&last?Buffer.from(JSON.stringify({created_at:time(last.created_at),id:last.id})).toString('base64url'):null};},true);
 }
 close(){return this.db.close()}
}
