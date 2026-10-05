/** Closed owner-only compiler; never runs on API startup. Published seed is SQL006. */
import { createHash } from 'node:crypto';
import { stableId } from './r2-metadata.mjs';
import { canonicalJson,readContent } from './content.mjs';
import {parseContentProjection} from '../core/content-r2.ts';
const hash=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');
const literal=value=>value===null?'NULL':typeof value==='number'?String(value):typeof value==='boolean'?String(value):`'${(typeof value==='object'?JSON.stringify(value):String(value)).replaceAll("'","''")}'`;
async function draftMetadata(client) {
 const {rows}=await client.query(`SELECT t.id,t.code,t.label,t.schema_revision,p.id parameter_id,p.code parameter_code,p.label parameter_label,p.data_type,p.required,p.multiple,p.target_type_id,p.reference_policy,p.constraints FROM last_throne.metadata_schema_types s JOIN last_throne.entity_types t ON t.id=s.entity_type_id LEFT JOIN last_throne.entity_parameters p ON p.entity_type_id=t.id WHERE s.metadata_schema_version='r2-meta-1' ORDER BY t.code,t.schema_revision,p.code`);
 const types=new Map();
 for(const row of rows){if(!types.has(row.id))types.set(row.id,{id:row.id,code:row.code,label:row.label,schemaRevision:row.schema_revision,parameters:[]});if(row.parameter_id)types.get(row.id).parameters.push({id:row.parameter_id,code:row.parameter_code,label:row.parameter_label,dataType:row.data_type,required:row.required,multiple:row.multiple,targetTypeId:row.target_type_id,referencePolicy:row.reference_policy,constraints:row.constraints});}
 return {version:'r2-meta-1',types:[...types.values()]};
}
export async function seedR2(pool,rows,{recordSql}={}) {
 const client=await pool.connect();
 const write=async(sql,params=[])=>{recordSql?.(sql.replace(/\$(\d+)\b/g,(_,n)=>literal(params[Number(n)-1]))+';');return client.query(sql,params);};
 try {
 await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(8411201)');
 const existing=await client.query("SELECT id FROM last_throne.content_releases WHERE id='r2-content-1' AND status='published'");
 if(existing.rows.length){await client.query('COMMIT');return {contentVersion:'r2-content-1',alreadyPublished:true};}
 const definitions=new Map();
 for(const row of rows){if(!/^[a-z][a-z0-9_]{0,63}$/.test(row.type)||typeof row.code!=='string')throw new Error('SEED_ROW_INVALID'); const group=definitions.get(row.type)??new Map();definitions.set(row.type,group);for(const [code,value] of Object.entries(row.parameters)){const type=typeof value==='boolean'?'boolean':typeof value==='string'?'text':Number.isSafeInteger(value)?'integer':'numeric';if(!/^[a-z][a-z0-9_]{0,63}$/.test(code)||!['boolean','string','number'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value))throw new Error('SEED_PARAMETER_INVALID');if(group.has(code)&&group.get(code)!==type)throw new Error('SEED_PARAMETER_TYPE_MISMATCH');group.set(code,type);}}
 for(const [code,params] of [...definitions].sort(([a],[b])=>a.localeCompare(b))){
 const typeId=stableId(`type:${code}`);
 const existingType=await client.query('SELECT id FROM last_throne.entity_types WHERE id=$1',[typeId]);
 if(!existingType.rows.length){await write('INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES($1,$2,$2,2)',[typeId,code]);await write("INSERT INTO last_throne.metadata_schema_types VALUES('r2-meta-1',$1)",[typeId]);}
 for(const [parameter,type]of [...params].sort(([a],[b])=>a.localeCompare(b))){let constraints=type==='text'?{minLength:1,maxLength:256}:type==='integer'?{min:-1000000,max:1000000}:type==='numeric'?{min:0,max:1000000}:{};if(code==='enemy_definition'&&/^spell_[123]$/.test(parameter))constraints={enum:['','area_heal','area_strike','temporary_shield']};if(code==='spell_definition'&&['code','behavior_id'].includes(parameter))constraints={enum:['area_heal','area_strike','temporary_shield']};await write('INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,constraints) VALUES($1,$2,$3,$3,$4,true,$5)',[stableId(`parameter:${code}:${parameter}`),typeId,parameter,type,constraints]);}
 }
 const metadataHash=hash(await draftMetadata(client));
 await write("SELECT last_throne.publish_metadata_schema('r2-meta-1',$1)",[metadataHash]);
 const entities=rows.map(row=>({id:stableId(`content:r2-content-1:${row.type}:${row.code}`),type:row.type,schemaRevision:2,revision:1,parameters:Object.fromEntries(Object.entries(row.parameters).map(([key,value])=>[key,definitions.get(row.type).get(key)==='numeric'?String(value):value]))})).sort((a,b)=>a.id.localeCompare(b.id));
 const projection={contentVersion:'r2-content-1',metadataSchemaVersion:'r2-meta-1',schemaVersion:1,coreCompatibility:['r2-core-1'],sourceRevision:1,entities};
 const projectionHash=hash(projection);
 await write("INSERT INTO last_throne.content_releases(id,content_version,schema_version,metadata_schema_version,core_compatibility,asset_manifest_hash,projection_hash) VALUES('r2-content-1','r2-content-1',1,'r2-meta-1',ARRAY['r2-core-1'],$1,$2)",[hash([]),projectionHash]);
 for(const row of [...rows].sort((a,b)=>stableId(`content:r2-content-1:${a.type}:${a.code}`).localeCompare(stableId(`content:r2-content-1:${b.type}:${b.code}`)))){
 const id=stableId(`content:r2-content-1:${row.type}:${row.code}`),typeId=stableId(`type:${row.type}`);
 await write("INSERT INTO last_throne.entities(id,entity_type_id,metadata_schema_version,release_id,pinned_release_id) VALUES($1,$2,'r2-meta-1','r2-content-1','r2-content-1')",[id,typeId]);
 for(const [code,value]of Object.entries(row.parameters).sort(([a],[b])=>a.localeCompare(b))){const type=definitions.get(row.type).get(code);await write(`INSERT INTO last_throne.entity_parameter_values(entity_id,entity_type_id,parameter_id,data_type,${type}_value) VALUES($1,$2,$3,$4,$5)`,[id,typeId,stableId(`parameter:${row.type}:${code}`),type,value]);}
 }
 // Compile the SQL projection before freezing; unknown handlers and invalid tuning reject.
 const draft={...projection,entities};parseContentProjection(draft);
 await write("SELECT last_throne.publish_content_release('r2-content-1')");
 await write("SELECT last_throne.activate_content_release('stable','r2-content-1')");
 const check=await readContent(client,'r2-content-1');if(hash(check)!==projectionHash)throw new Error('SEED_PROJECTION_HASH_MISMATCH');
 await client.query('COMMIT'); return {contentVersion:'r2-content-1',metadataSchemaVersion:'r2-meta-1',metadataHash,projectionHash};
 } catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
