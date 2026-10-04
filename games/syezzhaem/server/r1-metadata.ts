import { createHash } from 'node:crypto';
import {readFile} from 'node:fs/promises';
import { RULES } from '../src/contracts.ts';
import type { Sql } from './database.ts';
export interface Parameter { code:string;type:'text'|'integer'|'number'|'boolean'|'timestamp'|'reference';optional?:boolean;ref?:string;min?:number;max?:number;length?:number }
const t=(code:string,optional=false,length=256):Parameter=>({code,type:'text',optional,length});
const n=(code:string,min=-10000,max=10000,optional=false):Parameter=>({code,type:'number',min,max,optional});
const i=(code:string,min=0,max=100000000,optional=false):Parameter=>({code,type:'integer',min,max,optional});
const b=(code:string):Parameter=>({code,type:'boolean'});
const r=(code:string,ref:string,optional=false):Parameter=>({code,type:'reference',ref,optional});
const dt=(code:string,optional=false):Parameter=>({code,type:'timestamp',optional});
export const TYPES:Record<string,{global?:boolean;parent?:string;params:Parameter[]}>= {
 player_profile:{params:[t('display_name',false,64),b('sound_enabled'),n('sound_volume',0,1),t('quality'),b('controls_hint_seen')]},
 game_run:{params:[r('level_ref','level_definition'),t('client_build_id'),t('content_version'),t('rules_version'),t('lifecycle'),dt('started_at'),dt('finished_at',true),i('active_tick'),i('result_score'),t('outcome_reason',true,300)]},
 checkpoint:{parent:'game_run',params:[r('run_ref','game_run'),i('schema_version',1,1),i('sim_tick'),i('rng_state',1,1),t('outcome'),t('reason',true,300),n('distance',0,1000),i('placed_sequence',1)]},
 actor_state:{parent:'checkpoint',params:[r('checkpoint_ref','checkpoint'),t('actor_key'),t('actor_kind'),n('x'),n('y'),n('vx',-100,100),n('vy',-100,100),n('hp',0,100),t('state'),t('support_space',true),i('support_x',-10000,10000,true),i('support_y',-10000,10000,true),t('support_block_id',true),r('held_actor_ref','actor_state',true)]},
 house_state:{parent:'checkpoint',params:[r('checkpoint_ref','checkpoint'),n('x'),n('y'),n('core_hp',0,100),t('movement_state'),i('support_loss_ticks',0,90)]},
 cell_override:{parent:'checkpoint',params:[r('checkpoint_ref','checkpoint'),t('coordinate_space'),i('x',-10000,10000),i('y',-10000,10000),t('operation'),t('base_block_id',true),r('block_definition_ref','block_definition',true),t('block_id',true),t('original_block_id',true)]},
 inventory_item:{parent:'checkpoint',params:[r('checkpoint_ref','checkpoint'),r('material_ref','block_definition'),i('quantity',0,12)]},
 asset_definition:{global:true,params:[t('code'),t('kind'),t('relative_path'),t('sha256',false,64),t('source'),t('license'),t('attribution'),t('version')]},
 block_definition:{global:true,params:[t('code'),r('texture_asset_ref','asset_definition'),i('durability',1,1000),b('combustible'),i('burn_duration',0,100000),n('bounce_speed',0,100),b('transferable')]},
 ruleset:{global:true,params:[t('code'),t('version'),i('tick_rate',60,60),n('house_speed',0,10),n('move_speed',0,20),n('jump_speed',0,50),n('gravity',0,100),i('support_grace_ticks',0,600),i('victory_base',0),i('retained_bonus',0),i('time_bonus',0)]},
 level_definition:{global:true,params:[t('code'),t('title'),t('content_version'),r('map_asset_ref','asset_definition'),r('house_blueprint_ref','asset_definition'),r('ruleset_ref','ruleset'),t('publication_state')]},
};
export const CONTENT_IDS={map:'c4b902a6-1532-4212-8b21-000000000001',blueprint:'c4b902a6-1532-4212-8b21-000000000002',texture:'c4b902a6-1532-4212-8b21-000000000003',wood:'c4b902a6-1532-4212-8b21-000000000004',rules:'c4b902a6-1532-4212-8b21-000000000005',level:'c4b902a6-1532-4212-8b21-000000000006'};
const columns={text:'value_text',integer:'value_integer',number:'value_number',boolean:'value_boolean',timestamp:'value_timestamp',reference:'value_reference'};
export async function writeValues(tx:Sql,id:string,type:string,values:Record<string,unknown>):Promise<void>{
 for(const p of TYPES[type].params){const v=values[p.code];if(v===undefined||v===null)continue;
  await tx.query(`INSERT INTO syezzhaem.entity_parameter_values(entity_id,entity_type_id,parameter_id,data_type,${columns[p.type]}) VALUES($1,$2,$3,$4,$5)`,[id,type,`${type}.${p.code}`,p.type,v]);
 }
}
export async function seedR1Metadata(tx:Sql):Promise<void>{
 // Insert roots first, then parented types, satisfying metadata FK order.
 for(const [type,spec]of Object.entries(TYPES).sort((a,b)=>Number(!!a[1].parent)-Number(!!b[1].parent))){
  await tx.query('INSERT INTO syezzhaem.entity_types(id,code,global_type) VALUES($1,$1,$2) ON CONFLICT DO NOTHING',[type,!!spec.global]);
 }
 for(const[type,spec]of Object.entries(TYPES)){
  if(spec.parent)await tx.query('UPDATE syezzhaem.entity_types SET parent_type_id=$2 WHERE id=$1 AND parent_type_id IS NULL',[type,spec.parent]);
  for(const p of spec.params)await tx.query(`INSERT INTO syezzhaem.entity_parameters(id,entity_type_id,code,label,data_type,required,reference_type_id,min_number,max_number,max_length) VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,[`${type}.${p.code}`,type,p.code,p.type,!p.optional,p.ref??null,p.min??null,p.max??null,p.length??256]);
 }
 for(const[type,spec]of Object.entries(TYPES)){
  const row=(await tx.query<{global_type:boolean;parent_type_id:string|null}>('SELECT global_type,parent_type_id FROM syezzhaem.entity_types WHERE id=$1',[type])).rows[0];
  if(!row||row.global_type!==!!spec.global||row.parent_type_id!==(spec.parent??null))throw new Error(`Type metadata mismatch: ${type}`);
  for(const p of spec.params){const actual=(await tx.query<Record<string,unknown>>('SELECT data_type,required,multiple,reference_type_id,min_number,max_number,max_length FROM syezzhaem.entity_parameters WHERE id=$1',[`${type}.${p.code}`])).rows[0];const expected={data_type:p.type,required:!p.optional,multiple:false,reference_type_id:p.ref??null,min_number:p.min??null,max_number:p.max??null,max_length:p.length??256};if(!actual||Object.entries(expected).some(([k,v])=>actual[k]!==v))throw new Error(`Parameter metadata mismatch: ${type}.${p.code}`)}
 }
 const assetHash=async(name:string)=>createHash('sha256').update(await readFile(new URL(`../public/content/${name}.json`,import.meta.url))).digest('hex');
 const global:{id:string;type:string;values:Record<string,unknown>}[]=[
  {id:CONTENT_IDS.map,type:'asset_definition',values:{code:'r1-map-1',kind:'procedural-map',relative_path:'content/r1-map-1.json',sha256:await assetHash('r1-map-1'),source:'FoxyGames',license:'project-original',attribution:'FoxyGames',version:'r1-map-1'}},
  {id:CONTENT_IDS.blueprint,type:'asset_definition',values:{code:'r1-house-1',kind:'procedural-blueprint',relative_path:'content/r1-house-1.json',sha256:await assetHash('r1-house-1'),source:'FoxyGames',license:'project-original',attribution:'FoxyGames',version:'r1-map-1'}},
  {id:CONTENT_IDS.texture,type:'asset_definition',values:{code:'r1-wood-1',kind:'procedural-texture',relative_path:'content/r1-wood-1.json',sha256:await assetHash('r1-wood-1'),source:'FoxyGames',license:'project-original',attribution:'FoxyGames',version:'r1-map-1'}},
  {id:CONTENT_IDS.wood,type:'block_definition',values:{code:'wood',texture_asset_ref:CONTENT_IDS.texture,durability:100,combustible:true,burn_duration:0,bounce_speed:0,transferable:true}},
  {id:CONTENT_IDS.rules,type:'ruleset',values:{code:'r1-rules-1',version:'r1-rules-1',tick_rate:RULES.tickRate,house_speed:RULES.houseSpeed,move_speed:RULES.moveSpeed,jump_speed:RULES.jumpSpeed,gravity:RULES.gravity,support_grace_ticks:Math.round(RULES.supportGrace*RULES.tickRate),victory_base:1000,retained_bonus:400,time_bonus:300}},
  {id:CONTENT_IDS.level,type:'level_definition',values:{code:'house-bridge-portal',title:'Дом — мост — портал',content_version:'r1-map-1',map_asset_ref:CONTENT_IDS.map,house_blueprint_ref:CONTENT_IDS.blueprint,ruleset_ref:CONTENT_IDS.rules,publication_state:'published'}},
 ];
 for(const e of global){const existing=await tx.query('SELECT id FROM syezzhaem.entities WHERE id=$1',[e.id]);if(existing.rows.length){for(const[code,value]of Object.entries(e.values)){const parameter=TYPES[e.type].params.find(p=>p.code===code)!;const stored=await tx.query<Record<string,unknown>>(`SELECT ${columns[parameter.type]} AS value FROM syezzhaem.entity_parameter_values WHERE entity_id=$1 AND parameter_id=$2`,[e.id,`${e.type}.${code}`]);const actual=stored.rows[0]?.value;if(parameter.type==='integer'?Number(actual)!==value:actual!==value)throw new Error(`Immutable content mismatch: ${e.type}.${code}`)}continue;}await tx.query('INSERT INTO syezzhaem.entities(id,entity_type_id,owner_user_id) VALUES($1,$2,NULL)',[e.id,e.type]);await writeValues(tx,e.id,e.type,e.values);}
}
