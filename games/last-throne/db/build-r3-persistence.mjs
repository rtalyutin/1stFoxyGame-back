/** Build-time authoring helper. Only writes the new, not-yet-published SQL007. */
import { readFile, writeFile } from 'node:fs/promises';
import { stableId } from './r3-metadata.mjs';
const original = await readFile(new URL('./migrations/005_r2_persistence.sql', import.meta.url),'utf8');
const types = new Map(), ids = new Map();
for (const match of original.matchAll(/INSERT INTO last_throne\.entity_types\([^\n]+VALUES\('([^']+)','([^']+)'/g)) {
  types.set(match[1],match[2]); ids.set(match[1],stableId(`type:${match[2]}`));
}
for (const match of original.matchAll(/INSERT INTO last_throne\.entity_parameters\([^\n]+VALUES\('([^']+)','([^']+)','([^']+)'/g)) ids.set(match[1],stableId(`parameter:${types.get(match[2])}:${match[3]}`));
let sql = original.replaceAll('R2','R3').replaceAll('r2','r3');
sql=sql.replace('immutable R1 SQL001-004','immutable R1/R2 SQL001-006').replace('types use revision2','types use revision3');
for (const [before,after] of ids) sql = sql.replaceAll(before,after);
sql = sql.replace(/(INSERT INTO last_throne\.entity_types[^\n]+,)2(\);)/g,(_all,left,right)=>`${left}3${right}`)
  .replaceAll('"min":3,"max":3','"min":4,"max":4').replaceAll('"max":10','"max":15')
  .replaceAll('snapshotSchemaVersion\')::integer IS DISTINCT FROM 3','snapshotSchemaVersion\')::integer IS DISTINCT FROM 4')
  .replaceAll('snapshot_schema_version\')::integer IS DISTINCT FROM 3','snapshot_schema_version\')::integer IS DISTINCT FROM 4')
  .replaceAll("'snapshot_schema_version','3'","'snapshot_schema_version','4'")
  .replaceAll("schemaVersion')::integer IS DISTINCT FROM 3","schemaVersion')::integer IS DISTINCT FROM 4")
  .replaceAll("'snapshotSchemaVersion',3","'snapshotSchemaVersion',4").replaceAll("'schemaVersion',3","'schemaVersion',4")
  .replaceAll('BETWEEN 0 AND 9','BETWEEN 0 AND 14').replaceAll('final_wave<>10','final_wave<>15');
sql = sql.replace(" IF EXISTS(SELECT 1 FROM last_throne.entities x", " IF EXISTS(SELECT 1 FROM last_throne.entities x WHERE x.id=identifier AND x.owner_id=owner AND x.entity_type_id=last_throne.r2_type('run') AND x.run_id=x.id AND x.metadata_schema_version='r2-meta-1') THEN RETURN last_throne.r2_run(owner,identifier); END IF;\n IF EXISTS(SELECT 1 FROM last_throne.entities x");
sql = sql.replaceAll("IN(last_throne.r1_type('run'),last_throne.r3_type('run'))","IN(last_throne.r1_type('run'),last_throne.r2_type('run'),last_throne.r3_type('run'))");
sql = sql.replace(" IF run->>'metadataSchemaVersion'='r1-meta-1'", " IF run->>'metadataSchemaVersion'='r2-meta-1' THEN RETURN last_throne.r2_checkpoint(owner,identifier); END IF;\n IF run->>'metadataSchemaVersion'='r1-meta-1'");
const quote = value => value===null?'NULL':typeof value==='boolean'?String(value):`'${String(value).replaceAll("'","''")}'`;
const type = code => `INSERT INTO last_throne.entity_types(id,code,label,schema_revision) VALUES('${stableId(`type:${code}`)}','${code}','${code}',3);\nINSERT INTO last_throne.metadata_schema_types VALUES('r3-meta-1','${stableId(`type:${code}`)}');`;
function parameter(entity,code,dataType,{required=true,multiple=false,target=null,policy=null,constraints={}}={}) {
  return `INSERT INTO last_throne.entity_parameters(id,entity_type_id,code,label,data_type,required,multiple,target_type_id,reference_policy,constraints) VALUES(${[stableId(`parameter:${entity}:${code}`),stableId(`type:${entity}`),code,code,dataType,required,multiple,target?stableId(`type:${target}`):null,policy,JSON.stringify(constraints)].map(quote).join(',')});`;
}
const ref=(entity,code,target,required=true,multiple=false,policy='same_checkpoint')=>parameter(entity,code,'reference',{required,multiple,target,policy});
const scalar=(entity,code,type,constraints={})=>parameter(entity,code,type,{constraints});
const extra = ['hero_item_slot','saved_expedition','pending_reward','item_definition','expedition_definition'].map(type);
extra.push(parameter('saved_hero','aegis_token','boolean'),ref('saved_hero','item_slots','hero_item_slot',true,true),ref('saved_hero','expedition','saved_expedition',false),ref('checkpoint','pending_rewards','pending_reward',false,true));
for(const child of ['hero_item_slot','saved_expedition','pending_reward'])extra.push(ref(child,'checkpoint','checkpoint'),ref(child,'hero','saved_hero'));
extra.push(scalar('hero_item_slot','slot','integer',{min:0,max:1}),ref('hero_item_slot','definition','item_definition',false,false,'pinned_release'));
extra.push(ref('saved_expedition','definition','expedition_definition',true,false,'pinned_release'),scalar('saved_expedition','kind','text',{enum:['camp','shop','roshan']}),scalar('saved_expedition','remaining_ticks','integer',{min:1,max:1000000}),scalar('saved_expedition','total_ticks','integer',{min:1,max:1000000}),scalar('saved_expedition','reward_id','text',{minLength:1,maxLength:128}));
extra.push(scalar('pending_reward','runtime_id','text',{minLength:1,maxLength:128}),scalar('pending_reward','kind','text',{enum:['shop']}),ref('pending_reward','options','item_definition',true,true,'pinned_release'));
sql=sql.replace('CREATE FUNCTION last_throne.r3_type',extra.join('\n')+'\nCREATE FUNCTION last_throne.r3_type');
sql=sql.replace('DECLARE gate jsonb; run jsonb; cp uuid; child uuid; item jsonb; pair record; pos integer; pinned text; response jsonb;', 'DECLARE gate jsonb; run jsonb; cp uuid; child uuid; item jsonb; pair record; pos integer; pinned text; response jsonb; nested uuid; definition uuid; slot integer; offered jsonb; reward jsonb; reward_pos integer; hero uuid; duration integer;');
const validate = `
 IF jsonb_typeof(snapshot->'pendingRewards') IS DISTINCT FROM 'array' OR jsonb_array_length(snapshot->'pendingRewards')>1
 OR (SELECT count(DISTINCT r->>'id') FROM jsonb_array_elements(snapshot->'pendingRewards') r)<>jsonb_array_length(snapshot->'pendingRewards')
 OR (SELECT count(*) FROM jsonb_array_elements(snapshot->'heroes') h WHERE h->'expedition' IS DISTINCT FROM 'null'::jsonb)>1
 OR (jsonb_array_length(snapshot->'pendingRewards')>0 AND EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'heroes') h WHERE h->'expedition' IS DISTINCT FROM 'null'::jsonb)) THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'heroes') h WHERE jsonb_typeof(h->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(h->'items')<>2 OR jsonb_typeof(h->'aegisToken') IS DISTINCT FROM 'boolean' OR NOT(h ? 'expedition')) THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
`;
sql=sql.replace(' SELECT pinned_release_id INTO pinned FROM last_throne.entities WHERE id=identifier;\n cp:=',validate+' SELECT pinned_release_id INTO pinned FROM last_throne.entities WHERE id=identifier;\n cp:=');
const writeHero = `
 PERFORM last_throne.r3_set(child,'aegis_token',item->'aegisToken');
 FOR slot IN 0..1 LOOP
  nested:=gen_random_uuid(); PERFORM last_throne.r3_new('hero_item_slot',nested,owner,identifier,cp,pinned);
  PERFORM last_throne.r3_set(nested,'checkpoint',to_jsonb(cp)); PERFORM last_throne.r3_set(nested,'hero',to_jsonb(child)); PERFORM last_throne.r3_set(nested,'slot',to_jsonb(slot));
  IF item->'items'->slot IS DISTINCT FROM 'null'::jsonb THEN
   definition:=last_throne.r3_definition(pinned,'item_definition',item->'items'->>slot);
   IF definition IS NULL OR (last_throne.r3_values(definition)->>('compatible_'||(item->>'kind'))) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
   IF slot=1 AND item->'items'->0 IS DISTINCT FROM 'null'::jsonb AND last_throne.r3_values(definition)->>'behavior_id'=last_throne.r3_values(last_throne.r3_definition(pinned,'item_definition',item->'items'->>0))->>'behavior_id' THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
   PERFORM last_throne.r3_set(nested,'definition',to_jsonb(definition));
  END IF;
  PERFORM last_throne.r3_require(nested); PERFORM last_throne.r3_set(child,'item_slots',to_jsonb(nested),slot);
 END LOOP;
 IF item->'expedition' IS DISTINCT FROM 'null'::jsonb THEN
  offered:=item->'expedition'; definition:=last_throne.r3_definition(pinned,'expedition_definition',offered->>'kind');
  duration:=(last_throne.r3_values(definition)->>'duration_ticks')::integer;
  IF definition IS NULL OR (offered->>'totalTicks')::integer IS DISTINCT FROM duration OR (offered->>'remainingTicks')::integer NOT BETWEEN 1 AND duration OR (item->>'hp')::integer<=0 OR (offered->>'kind'='roshan' AND item->'aegisToken'='true'::jsonb) THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
  nested:=gen_random_uuid(); PERFORM last_throne.r3_new('saved_expedition',nested,owner,identifier,cp,pinned);
  PERFORM last_throne.r3_set(nested,'checkpoint',to_jsonb(cp)); PERFORM last_throne.r3_set(nested,'hero',to_jsonb(child)); PERFORM last_throne.r3_set(nested,'definition',to_jsonb(definition));
  PERFORM last_throne.r3_set(nested,'kind',offered->'kind'); PERFORM last_throne.r3_set(nested,'remaining_ticks',offered->'remainingTicks'); PERFORM last_throne.r3_set(nested,'total_ticks',offered->'totalTicks'); PERFORM last_throne.r3_set(nested,'reward_id',offered->'rewardId');
  PERFORM last_throne.r3_require(nested); PERFORM last_throne.r3_set(child,'expedition',to_jsonb(nested));
 END IF;
`;
sql=sql.replace(" PERFORM last_throne.r3_require(child); PERFORM last_throne.r3_set(cp,'heroes'",writeHero+" PERFORM last_throne.r3_require(child); PERFORM last_throne.r3_set(cp,'heroes'");
const writeRewards = `
 reward_pos:=0;
 FOR reward IN SELECT * FROM jsonb_array_elements(snapshot->'pendingRewards') LOOP
  IF reward->>'kind' IS DISTINCT FROM 'shop' OR jsonb_typeof(reward->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(reward->'options') NOT BETWEEN 1 AND 4
   OR (SELECT count(DISTINCT o) FROM jsonb_array_elements_text(reward->'options') o)<>jsonb_array_length(reward->'options') THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
  offered:=last_throne.r3_values(last_throne.r3_definition(pinned,'expedition_definition','shop'));
  IF reward->'options' IS DISTINCT FROM to_jsonb(ARRAY(SELECT option FROM unnest(ARRAY[offered->>'item_1',offered->>'item_2',offered->>'item_3',offered->>'item_4']) option WHERE option<>'')) THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
  SELECT e.id INTO hero FROM last_throne.entities e WHERE e.checkpoint_id=cp AND e.entity_type_id=last_throne.r3_type('saved_hero') AND last_throne.r3_values(e.id)->>'runtime_id'=reward->>'heroId';
  IF hero IS NULL THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
  nested:=gen_random_uuid(); PERFORM last_throne.r3_new('pending_reward',nested,owner,identifier,cp,pinned);
  PERFORM last_throne.r3_set(nested,'checkpoint',to_jsonb(cp)); PERFORM last_throne.r3_set(nested,'hero',to_jsonb(hero)); PERFORM last_throne.r3_set(nested,'runtime_id',reward->'id'); PERFORM last_throne.r3_set(nested,'kind',reward->'kind');
  slot:=0;
  FOR offered IN SELECT * FROM jsonb_array_elements(reward->'options') LOOP
   definition:=last_throne.r3_definition(pinned,'item_definition',offered#>>'{}'); IF definition IS NULL THEN RAISE EXCEPTION 'SNAPSHOT_INVALID'; END IF;
   PERFORM last_throne.r3_set(nested,'options',to_jsonb(definition),slot); slot:=slot+1;
  END LOOP;
  PERFORM last_throne.r3_require(nested); PERFORM last_throne.r3_set(cp,'pending_rewards',to_jsonb(nested),reward_pos); reward_pos:=reward_pos+1;
 END LOOP;
`;
sql=sql.replace(' -- Complete generation freezes together;',writeRewards+' -- Complete generation freezes together;');
// Reconstruct nested values from typed scalar/reference rows. No stored JSON snapshot.
const readers=`CREATE FUNCTION last_throne.r3_hero_items(hero uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,last_throne AS $$
 SELECT coalesce(jsonb_agg(CASE WHEN s ? 'definition' THEN last_throne.r3_values((s->>'definition')::uuid)->'code' ELSE 'null'::jsonb END ORDER BY ordinal),'[]'::jsonb)
 FROM (SELECT v.ordinal,last_throne.r3_values(v.reference_value) s FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters p ON p.id=v.parameter_id WHERE v.entity_id=hero AND p.code='item_slots') slots
$$;
CREATE FUNCTION last_throne.r3_expedition(id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,last_throne AS $$
 SELECT CASE WHEN id IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('kind',p->'kind','remainingTicks',p->'remaining_ticks','totalTicks',p->'total_ticks','rewardId',p->'reward_id') END FROM (SELECT last_throne.r3_values(id) p) value
$$;
CREATE FUNCTION last_throne.r3_pending_rewards(cp uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,last_throne AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p->'runtime_id','heroId',last_throne.r3_values((p->>'hero')::uuid)->'runtime_id','kind',p->'kind','options',(
 SELECT jsonb_agg(last_throne.r3_values(v.reference_value)->'code' ORDER BY v.ordinal) FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters ep ON ep.id=v.parameter_id WHERE v.entity_id=reward AND ep.code='options')) ORDER BY ordinal),'[]'::jsonb)
 FROM (SELECT v.ordinal,v.reference_value reward,last_throne.r3_values(v.reference_value) p FROM last_throne.entity_parameter_values v JOIN last_throne.entity_parameters ep ON ep.id=v.parameter_id WHERE v.entity_id=cp AND ep.code='pending_rewards') rewards
$$;
`;
sql=sql.replace('CREATE FUNCTION last_throne.r3_checkpoint',()=>readers+'CREATE FUNCTION last_throne.r3_checkpoint');
sql=sql.replace("'priority',s->'priority') ORDER BY ordinal)","'priority',s->'priority','items',last_throne.r3_hero_items(hero),'expedition',last_throne.r3_expedition((s->>'expedition')::uuid),'aegisToken',s->'aegis_token') ORDER BY ordinal)");
sql=sql.replaceAll("SELECT v.ordinal,last_throne.r3_values(v.reference_value) s", "SELECT v.ordinal,v.reference_value hero,last_throne.r3_values(v.reference_value) s");
sql=sql.replace("'scrolls',p->'scrolls','heroes',heroes", "'scrolls',p->'scrolls','pendingRewards',last_throne.r3_pending_rewards(cp),'heroes',heroes");
sql=sql.replace("IF NEW.metadata_schema_version='r3-meta-1' AND NEW.status='published'","IF 'r3-core-1'=ANY(NEW.core_compatibility) AND NEW.status='published'");
sql=sql.replace("FROM last_throne.entities e WHERE e.release_id=NEW.id AND e.entity_type_id=last_throne.r3_type('spell_definition')", "FROM last_throne.entities e JOIN last_throne.entity_types t ON t.id=e.entity_type_id WHERE e.release_id=NEW.id AND t.code='spell_definition'");
const guard = await readFile(new URL('./r3-publication-guard.sql',import.meta.url),'utf8');
sql+='\n'+guard+'\n';
await writeFile(new URL('./migrations/007_r3_persistence.sql',import.meta.url),sql);
