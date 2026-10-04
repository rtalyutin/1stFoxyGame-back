import type {Sql} from './database.ts';
const columns={
 entity_types:['id','code','schema_version','status','parent_type_id','global_type'],
 entity_parameters:['id','entity_type_id','code','label','data_type','required','multiple','reference_type_id','min_number','max_number','max_length','schema_version','archived'],
 entities:['id','entity_type_id','owner_user_id','parent_id','revision','status','created_at','updated_at'],
 entity_parameter_values:['entity_id','entity_type_id','parameter_id','data_type','element_no','value_text','value_integer','value_number','value_boolean','value_timestamp','value_reference'],
 request_dedup:['user_id','request_id','operation','body_hash','response','created_at'],
} as const;
export type GameBackup={format:'syezzhaem-eav-backup-1';tables:Record<keyof typeof columns,Record<string,unknown>[]>};
/** Use an operator connection in REPEATABLE READ; this backup excludes Auth/SMTP secrets. */
export async function exportGame(tx:Sql):Promise<GameBackup>{const tables={}as GameBackup['tables'];for(const table of Object.keys(columns)as(keyof typeof columns)[])tables[table]=(await tx.query(`SELECT ${columns[table].join(',')} FROM syezzhaem.${table}`)).rows;return{format:'syezzhaem-eav-backup-1',tables}}
/** Restore to a separate empty migrated game schema, within one operator transaction. */
export async function restoreGame(tx:Sql,backup:GameBackup):Promise<void>{
 if(backup.format!=='syezzhaem-eav-backup-1'||!backup.tables)throw new Error('Unsupported backup format');
 const exists=await tx.query('SELECT id FROM syezzhaem.entities LIMIT 1');if(exists.rows.length)throw new Error('Restore target game schema must be empty');
 for(const table of Object.keys(columns)as(keyof typeof columns)[]){
  const fields=columns[table];let rows=backup.tables[table];if(!Array.isArray(rows))throw new Error(`Backup table invalid: ${table}`);
  if(table==='entity_types')rows=[...rows].sort((a,b)=>Number(!!a.parent_type_id)-Number(!!b.parent_type_id));
  if(table==='entities'){
   const byId=new Map(rows.map(row=>[row.id,row]));const depth=(row:Record<string,unknown>,seen=new Set<unknown>()):number=>{if(!row.parent_id)return 0;if(seen.has(row.id))throw new Error('Cyclic backup parent');seen.add(row.id);const p=byId.get(row.parent_id);if(!p)throw new Error('Missing backup parent');return 1+depth(p,seen)};rows=[...rows].sort((a,b)=>depth(a)-depth(b));
  }
  for(const row of rows){if(!row||typeof row!=='object'||fields.some(k=>!Object.hasOwn(row,k)))throw new Error(`Backup row invalid: ${table}`);
   const data=fields.map(k=>row[k]);
   await tx.query(`INSERT INTO syezzhaem.${table}(${fields.join(',')}) VALUES(${fields.map((_,i)=>`$${i+1}`).join(',')})`,data);
  }
 }
 await rebuildProjections(tx);
}
/** All derived indices are reconstructed solely from canonical typed EAV values. */
export async function rebuildProjections(tx:Sql):Promise<void>{
 await tx.query('DELETE FROM syezzhaem.aggregate_keys');await tx.query('DELETE FROM syezzhaem.active_run_index');await tx.query('DELETE FROM syezzhaem.profile_identity_index');
 await tx.query("INSERT INTO syezzhaem.profile_identity_index(user_id,profile_id) SELECT owner_user_id,id FROM syezzhaem.entities WHERE entity_type_id='player_profile'");
 await tx.query("INSERT INTO syezzhaem.active_run_index(user_id,run_id) SELECT e.owner_user_id,e.id FROM syezzhaem.entities e JOIN syezzhaem.entity_parameter_values v ON v.entity_id=e.id AND v.parameter_id='game_run.lifecycle' WHERE e.entity_type_id='game_run' AND v.value_text='active'");
 const rows=await tx.query<{id:string;parent_id:string;owner_user_id:string;entity_type_id:string;code:string;data_type:string;value_text:string;value_integer:string;value_reference:string}>(`SELECT e.id,e.parent_id,e.owner_user_id,e.entity_type_id,p.code,v.data_type,v.value_text,v.value_integer,v.value_reference FROM syezzhaem.entities e JOIN syezzhaem.entity_parameter_values v ON v.entity_id=e.id JOIN syezzhaem.entity_parameters p ON p.id=v.parameter_id WHERE e.entity_type_id IN('actor_state','cell_override','inventory_item')`);
 const entities=new Map<string,{parent:string;owner:string;type:string;values:Record<string,string|number>}>();for(const row of rows.rows){if(!entities.has(row.id))entities.set(row.id,{parent:row.parent_id,owner:row.owner_user_id,type:row.entity_type_id,values:{}});entities.get(row.id)!.values[row.code]=row.data_type==='integer'?Number(row.value_integer):row.data_type==='reference'?row.value_reference:row.value_text;}
 for(const[id,e]of entities){const keys:[string,string][]=[];if(e.type==='actor_state')keys.push(['actor',String(e.values.actor_key)]);if(e.type==='inventory_item')keys.push(['material',String(e.values.material_ref)]);if(e.type==='cell_override'){keys.push(['cell',`${e.values.coordinate_space}:${e.values.x}:${e.values.y}`]);if(e.values.block_id)keys.push(['block',String(e.values.block_id)])}for(const[kind,value]of keys)await tx.query('INSERT INTO syezzhaem.aggregate_keys(checkpoint_id,key_kind,key_value,entity_id,owner_user_id) VALUES($1,$2,$3,$4,$5)',[e.parent,kind,value,id,e.owner]);}
}
