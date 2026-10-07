import { randomUUID } from 'node:crypto';
import type { PoolClient, Client } from 'pg';
import { EntityStore } from '../db/entity-store.js';
import { BALANCE_PARAMETERS, LEGACY_BALANCE_PARAMETERS, BALANCE_TYPE_ID, BALANCE_POINTER_TYPE_ID, BALANCE_POINTER_ID, parameterCode, balanceDocument, BalanceError, validateBalanceValues, type BalanceDocument, type BalanceValue } from './model.js';

export async function readBalance(c:PoolClient,revision?:string):Promise<BalanceDocument> {
 const id=revision??(await c.query<{value_reference:string}>(`SELECT v.value_reference FROM entity_parameter_values v JOIN entities e ON e.id=v.entity_id AND e.state='active' JOIN entity_parameters p ON p.id=v.parameter_id WHERE e.id=$1 AND p.code='active-revision'`,[BALANCE_POINTER_ID])).rows[0]?.value_reference;
 if(!id)throw new BalanceError('BALANCE_STORAGE_UNAVAILABLE',503);
 const schema=(await c.query<{value_text:string}>(`SELECT v.value_text FROM entity_parameter_values v JOIN entity_parameters p ON p.id=v.parameter_id WHERE v.entity_id=$1 AND p.code='schema-version'`,[id])).rows[0]?.value_text;
 if(schema!=='runner-balance.1'&&schema!=='runner-balance.2')throw new BalanceError('BALANCE_STORAGE_UNAVAILABLE',503);
 const legacy=schema==='runner-balance.1';
 const rows=(await c.query<{code:string;data_type:string;value_decimal:string|null;value_integer:string|null;value_boolean:boolean|null}>(`SELECT p.code,v.data_type,v.value_decimal,v.value_integer,v.value_boolean FROM entity_parameter_values v JOIN entity_parameters p ON p.id=v.parameter_id JOIN entities e ON e.id=v.entity_id WHERE e.id=$1 AND e.entity_type_id=$2 AND e.state='active'`,[id,BALANCE_TYPE_ID])).rows;
 const expected=new Map((legacy?LEGACY_BALANCE_PARAMETERS:BALANCE_PARAMETERS).map(p=>[parameterCode(p.key),p]));
 const values:Record<string,BalanceValue>={};
 for(const row of rows){const p=expected.get(row.code);if(!p)continue;if(p.key in values)throw new BalanceError('BALANCE_STORAGE_UNAVAILABLE',503);
  const type=p.type==='boolean'?'boolean':p.type==='integer'?'integer':'decimal';
  if(row.data_type!==type)throw new BalanceError('BALANCE_STORAGE_UNAVAILABLE',503);
  values[p.key]=p.type==='boolean'?row.value_boolean as boolean:p.type==='goldMilli'?String(row.value_decimal).replace(/\.0+$/,''):Number(p.type==='integer'?row.value_integer:row.value_decimal);
 }
 try{return balanceDocument(id,values,legacy);}catch{throw new BalanceError('BALANCE_STORAGE_UNAVAILABLE',503);}
}
export async function accountIsBalanceAdmin(c:PoolClient,accountId:string):Promise<boolean> {
 const result=await c.query<{value_boolean:boolean}>(`SELECT v.value_boolean FROM entities e JOIN entity_parameter_values v ON v.entity_id=e.id JOIN entity_parameters p ON p.id=v.parameter_id WHERE e.id=$1 AND e.state='active' AND p.code='balance-admin'`,[accountId]);
 return result.rows.length===1&&result.rows[0]?.value_boolean===true;
}
export async function publishBalance(c:PoolClient,actorId:string,expectedRevision:string,input:unknown):Promise<BalanceDocument> {
 const values=validateBalanceValues(input);
 // Validate the entire candidate before writing any authority. Type locks also fence constructor mutations.
 const id=randomUUID(),candidate=balanceDocument(id,values);
 await c.query('SELECT id FROM entity_types WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[[BALANCE_TYPE_ID,BALANCE_POINTER_TYPE_ID,'ca5d0000-0000-5000-a000-000000000001']]);
 if(!await accountIsBalanceAdmin(c,actorId))throw new BalanceError('BALANCE_FORBIDDEN',403);
 const active=await readBalance(c);
 if(active.revision!==expectedRevision)throw new BalanceError('BALANCE_REVISION_CONFLICT',409,'Another balance revision was published. Reload before publishing.');
 const store=new EntityStore(c as unknown as Client);await store.create('runner-balance',id);
 await store.set(id,'schema-version',{type:'text',value:'runner-balance.2'});
 await store.set(id,'published-by',{type:'reference',value:actorId});
 const publication=(await c.query<{now:string;last:string|null;last_order:string|null}>(`SELECT date_trunc('milliseconds',clock_timestamp()) AS now,max(v.value_timestamp) AS last,max(o.value_integer) AS last_order FROM entities e JOIN entity_parameter_values v ON v.entity_id=e.id JOIN entity_parameters p ON p.id=v.parameter_id AND p.code='published-at' LEFT JOIN entity_parameter_values o ON o.entity_id=e.id AND o.parameter_id=(SELECT id FROM entity_parameters WHERE entity_type_id=$1 AND code='publication-order') WHERE e.entity_type_id=$1 AND e.state='active'`,[BALANCE_TYPE_ID])).rows[0]!;
 const publishedAt=new Date(publication.now);if(publication.last&&publishedAt.getTime()<new Date(publication.last).getTime())throw new BalanceError('BALANCE_CLOCK_ROLLBACK',503);
 const order=BigInt(publication.last_order??'0')+1n;if(order>BigInt(Number.MAX_SAFE_INTEGER))throw new BalanceError('BALANCE_STORAGE_UNAVAILABLE',503);
 await store.set(id,'published-at',{type:'timestamp',value:publishedAt});await store.set(id,'publication-order',{type:'integer',value:order});
 for(const p of BALANCE_PARAMETERS){const value=values[p.key]!;await store.set(id,parameterCode(p.key),p.type==='boolean'?{type:'boolean',value:value as boolean}:p.type==='integer'?{type:'integer',value:BigInt(value as number)}:{type:'decimal',value:String(value)});}
 await store.publish(id);
 await store.set(BALANCE_POINTER_ID,'active-revision',{type:'reference',value:id});
 return candidate;
}

export async function readForgeHistory(c:PoolClient,settledAtMs?:number,cache?:Map<string,import('../forge/economy.js').ForgeConfig>):Promise<import('../forge/economy.js').ForgeBalanceHistoryEntry[]>{
 const entries=(await c.query<{id:string;published_at:string}>(`SELECT e.id,v.value_timestamp AS published_at FROM entities e JOIN entity_parameter_values v ON v.entity_id=e.id JOIN entity_parameters p ON p.id=v.parameter_id AND p.code='published-at' JOIN entity_parameter_values s ON s.entity_id=e.id JOIN entity_parameters sp ON sp.id=s.parameter_id AND sp.code='schema-version' WHERE e.entity_type_id=$1 AND e.state='active' AND s.value_text='runner-balance.2' ORDER BY (SELECT ov.value_integer FROM entity_parameter_values ov JOIN entity_parameters op ON op.id=ov.parameter_id WHERE ov.entity_id=e.id AND op.code='publication-order')`,[BALANCE_TYPE_ID])).rows;
 if(!entries.length)throw new BalanceError('BALANCE_STORAGE_UNAVAILABLE',503);
 // Only the revision active at the marker and later publications can affect
 // this settlement. Same-timestamp publications retain their immutable order.
 let start=0;
 if(settledAtMs!==undefined)for(let i=0;i<entries.length&&new Date(entries[i]!.published_at).getTime()<=settledAtMs;i++)start=i;
 const result=[];for(const row of entries.slice(start)){
  let config=cache?.get(row.id);
  if(!config){config=(await readBalance(c,row.id)).compiled.forge;if(!config)throw new BalanceError('BALANCE_STORAGE_UNAVAILABLE',503);
   if(cache){if(cache.size>=256)cache.delete(cache.keys().next().value!);cache.set(row.id,structuredClone(config));}}
  result.push({revision:row.id,publishedAtMs:new Date(row.published_at).getTime(),config:structuredClone(config)});
 }return result;
}
