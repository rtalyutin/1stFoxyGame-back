/** Version-aware typed projection of transport DTOs. No opaque save JSON is stored. */
import {randomUUID} from 'node:crypto';
import type {SnapshotV1} from '../src/snapshot-v1.ts';
import {INTRO_CONTENT_IDS,R2_CONTENT_IDS,materialId,materialCode} from './r1-metadata.ts';
export interface AggregateEntity {type:string;values:Record<string,unknown>}
export interface ChildEntity {id:string;type:string;parent:string;values:Record<string,unknown>;keys?:[string,string][]}
const supportValues=(s:SnapshotV1['player']['support'])=>({support_space:s?.coordinate_space,support_x:s?.x,support_y:s?.y,support_block_id:s?.block_id});
const supportDTO=(v:Record<string,unknown>)=>v.support_space===undefined?null:{coordinate_space:v.support_space,x:v.support_x,y:v.support_y,block_id:v.support_block_id};
export function checkpointEntities(runId:string,s:SnapshotV1):ChildEntity[]{
 const checkpoint=randomUUID(),r2=s.content_version==='r2-map-1';
 const actorIds=new Map(s.actors.map(a=>[a.actor_key,randomUUID()]));
 const children:ChildEntity[]=[
  {id:checkpoint,type:'checkpoint',parent:runId,values:{run_ref:runId,schema_version:s.schema_version,sim_tick:s.sim_tick,rng_state:s.rng_state,outcome:s.outcome,reason:s.reason,...s.counters,...(r2?{lava_x:s.lava!.x,player_damage_ticks:s.lava!.player_damage_ticks,core_damage_ticks:s.lava!.core_damage_ticks}:{})}},
  {id:randomUUID(),type:'actor_state',parent:checkpoint,values:{checkpoint_ref:checkpoint,actor_key:'player',actor_kind:'player',x:s.player.x,y:s.player.y,vx:s.player.vx,vy:s.player.vy,hp:s.player.hp,state:'active',...supportValues(s.player.support),...(r2?{held_actor_ref:s.player.held_actor_key?actorIds.get(s.player.held_actor_key):undefined,action_cooldown_ticks:s.player.timers.action_cooldown_ticks}:{})},keys:[['actor','player']]},
  {id:randomUUID(),type:'house_state',parent:checkpoint,values:{checkpoint_ref:checkpoint,...s.house,support_loss_ticks:s.content_version==='r1-map-2'?0:s.house.support_loss_ticks,support_loss_ticks_v2:s.content_version==='r1-map-2'?s.house.support_loss_ticks:undefined}},
 ];
 for(const [material,quantity] of Object.entries(s.inventory)){
  const ref=materialId(s.content_version,material);
  children.push({id:randomUUID(),type:'inventory_item',parent:checkpoint,values:{checkpoint_ref:checkpoint,material_ref:ref,quantity},keys:[['material',ref]]});
 }
 for(const a of s.actors)children.push({id:actorIds.get(a.actor_key)!,type:'actor_state',parent:checkpoint,values:{checkpoint_ref:checkpoint,actor_key:a.actor_key,actor_kind:a.kind,x:a.x,y:a.y,vx:a.vx,vy:a.vy,hp:a.hp,state:a.state,...supportValues(a.support),direction:a.direction,fuse_ticks:a.fuse_ticks,explosion_applied:a.explosion_applied},keys:[['actor',a.actor_key]]});
 for(const space of ['house','world'] as const)for(const c of s[`${space}_cells`])children.push({id:randomUUID(),type:'cell_override',parent:checkpoint,values:{checkpoint_ref:checkpoint,coordinate_space:space,x:c.x,y:c.y,operation:c.operation,base_block_id:c.base_block_id,block_definition_ref:c.material?materialId(s.content_version,c.material):undefined,block_id:c.block_id,original_block_id:c.original_block_id,...(r2?{durability:c.durability,burn_ticks:c.burn_ticks}:{})},keys:[['cell',`${space}:${c.x}:${c.y}`],...(c.block_id?[['block',c.block_id] as [string,string]]:[])]});
 return children;
}
export function checkpointDTO(id:string,map:Map<string,AggregateEntity>):unknown{
 const run=map.get(id)!.values,r2=run.content_version==='r2-map-1';
 const all=(type:string)=>[...map.values()].filter(e=>e.type===type).map(e=>e.values);
 const c=all('checkpoint')[0],p=all('actor_state').find(a=>a.actor_key==='player'),h=all('house_state')[0],inventories=all('inventory_item');
 if(!c||!p||!h||!inventories.length)throw new Error('Incomplete EAV run aggregate');
 const cells=(space:string)=>all('cell_override').filter(v=>v.coordinate_space===space).map(v=>({x:v.x,y:v.y,operation:v.operation,base_block_id:v.base_block_id??null,block_id:v.block_id??null,original_block_id:v.original_block_id??null,material:v.block_definition_ref?materialCode(run.content_version as string,v.block_definition_ref):null,...(r2?{durability:v.durability??null,burn_ticks:v.burn_ticks??null}:{})}));
 const actors=all('actor_state').filter(a=>a.actor_key!=='player').sort((a,b)=>String(a.actor_key).localeCompare(String(b.actor_key)));
 const held=p.held_actor_ref===undefined?null:map.get(p.held_actor_ref as string)?.values.actor_key;
 if(p.held_actor_ref!==undefined&&typeof held!=='string')throw new Error('Held actor reference unavailable');
 return {schema_version:c.schema_version,run_id:id,client_build_id:run.client_build_id,content_version:run.content_version,rules_version:run.rules_version,level_id:run.level_ref===R2_CONTENT_IDS.level?'house-full-route':run.level_ref===INTRO_CONTENT_IDS.level?'house-bridge-portal-intro':'house-bridge-portal',sim_tick:c.sim_tick,rng_state:c.rng_state,outcome:c.outcome,reason:c.reason??null,
  player:{x:p.x,y:p.y,vx:p.vx,vy:p.vy,hp:p.hp,support:supportDTO(p),held_actor_key:r2?held:null,timers:r2?{action_cooldown_ticks:p.action_cooldown_ticks}:{}},
  house:{x:h.x,y:h.y,core_hp:h.core_hp,movement_state:h.movement_state,support_loss_ticks:run.content_version==='r1-map-2'?h.support_loss_ticks_v2:h.support_loss_ticks},house_cells:cells('house'),world_cells:cells('world'),inventory:Object.fromEntries(inventories.map(v=>[materialCode(run.content_version as string,v.material_ref),v.quantity])),
  actors:r2?actors.map(a=>({actor_key:a.actor_key,kind:a.actor_kind,x:a.x,y:a.y,vx:a.vx,vy:a.vy,hp:a.hp,state:a.state,support:supportDTO(a),direction:a.direction,fuse_ticks:a.fuse_ticks,explosion_applied:a.explosion_applied})):[],
  lava:r2?{x:c.lava_x,player_damage_ticks:c.player_damage_ticks,core_damage_ticks:c.core_damage_ticks}:null,counters:{distance:c.distance,placed_sequence:c.placed_sequence,...(r2?{tutorial_placements:c.tutorial_placements,destroyed_wood:c.destroyed_wood,destroyed_stone:c.destroyed_stone,destroyed_slime:c.destroyed_slime}:{})},
 };
}
