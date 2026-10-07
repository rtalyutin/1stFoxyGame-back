import { createHash } from 'node:crypto';
import { LEGACY_BALANCE_PARAMETERS, LEGACY_DEFAULT_BALANCE_VALUES, BALANCE_TYPE_ID, BALANCE_POINTER_TYPE_ID, BALANCE_POINTER_ID, INITIAL_BALANCE_REVISION, parameterCode } from './model.js';
const q=(value:string):string=>`'${value.replaceAll("'","''")}'`;
const id=(key:string):string=>createHash('md5').update('runner-balance.1:'+key).digest('hex').replace(/^(........)(....)(....)(....)(............)$/,'$1-$2-$3-$4-$5');
export function balanceSeedSql():string {
 const lines=[`-- Generated from src/balance/model.ts. Additive: existing run rows remain legacy (NULL revision).`,
 `INSERT INTO entity_types(id,code) VALUES (${q(BALANCE_TYPE_ID)},'runner-balance'),(${q(BALANCE_POINTER_TYPE_ID)},'runner-balance-pointer');`,
 `INSERT INTO entity_parameters(id,entity_type_id,code,label,data_type,is_required,reference_type_id,text_pattern,text_max_length) VALUES (${q(id('schema-version'))},${q(BALANCE_TYPE_ID)},'schema-version','Balance schema','text',true,NULL,'^runner-balance[.]1$',32),(${q(id('published-by'))},${q(BALANCE_TYPE_ID)},'published-by','Publisher','reference',false,'ca5d0000-0000-5000-a000-000000000001',NULL,NULL),(${q(id('published-at'))},${q(BALANCE_TYPE_ID)},'published-at','Published at','timestamp',true,NULL,NULL,NULL),(${q(id('active-revision'))},${q(BALANCE_POINTER_TYPE_ID)},'active-revision','Active revision','reference',true,${q(BALANCE_TYPE_ID)},NULL,NULL),(${q(id('balance-admin'))},'ca5d0000-0000-5000-a000-000000000001','balance-admin','May publish balance','boolean',false,NULL,NULL,NULL);`];
 for(const p of LEGACY_BALANCE_PARAMETERS){const dataType=p.type==='boolean'?'boolean':p.type==='integer'?'integer':'decimal',min=p.type==='goldMilli'?'0':String(p.min??0),max=p.type==='goldMilli'?'9223372036854775807':String(p.max??0);lines.push(`INSERT INTO entity_parameters(id,entity_type_id,code,label,data_type,is_required,integer_min,integer_max,decimal_min,decimal_max) VALUES (${q(id(p.key))},${q(BALANCE_TYPE_ID)},${q(parameterCode(p.key))},${q(p.group+' · '+p.label)},${q(dataType)},true,${dataType==='integer'?min:'NULL'},${dataType==='integer'?max:'NULL'},${dataType==='decimal'?min:'NULL'},${dataType==='decimal'?max:'NULL'});`);}
 lines.push(`INSERT INTO entities(id,entity_type_id) VALUES (${q(INITIAL_BALANCE_REVISION)},${q(BALANCE_TYPE_ID)}),(${q(BALANCE_POINTER_ID)},${q(BALANCE_POINTER_TYPE_ID)});`);
 for(const p of LEGACY_BALANCE_PARAMETERS){const type=p.type==='boolean'?'boolean':p.type==='integer'?'integer':'decimal',value=LEGACY_DEFAULT_BALANCE_VALUES[p.key]!,column=type==='boolean'?'value_boolean':type==='integer'?'value_integer':'value_decimal';lines.push(`INSERT INTO entity_parameter_values(entity_id,parameter_id,entity_type_id,data_type,is_multiple,is_unique,${column}) VALUES (${q(INITIAL_BALANCE_REVISION)},${q(id(p.key))},${q(BALANCE_TYPE_ID)},${q(type)},false,false,${String(value)});`);}
 lines.push(`INSERT INTO entity_parameter_values(entity_id,parameter_id,entity_type_id,data_type,is_multiple,is_unique,value_text) VALUES (${q(INITIAL_BALANCE_REVISION)},${q(id('schema-version'))},${q(BALANCE_TYPE_ID)},'text',false,false,'runner-balance.1');`,
 `INSERT INTO entity_parameter_values(entity_id,parameter_id,entity_type_id,data_type,is_multiple,is_unique,value_timestamp) VALUES (${q(INITIAL_BALANCE_REVISION)},${q(id('published-at'))},${q(BALANCE_TYPE_ID)},'timestamp',false,false,now());`,
 `UPDATE entities SET state='active',revision=1 WHERE id=${q(INITIAL_BALANCE_REVISION)};`,
 `INSERT INTO entity_parameter_values(entity_id,parameter_id,entity_type_id,data_type,is_multiple,is_unique,value_reference,reference_type_id) VALUES (${q(BALANCE_POINTER_ID)},${q(id('active-revision'))},${q(BALANCE_POINTER_TYPE_ID)},'reference',false,false,${q(INITIAL_BALANCE_REVISION)},${q(BALANCE_TYPE_ID)});`,
 `UPDATE entities SET state='active',revision=1 WHERE id=${q(BALANCE_POINTER_ID)};`,
 `ALTER TABLE profile_runs ADD COLUMN balance_revision uuid, ADD COLUMN balance_type_id uuid NOT NULL DEFAULT ${q(BALANCE_TYPE_ID)} CHECK(balance_type_id=${q(BALANCE_TYPE_ID)}), ADD FOREIGN KEY(balance_revision,balance_type_id) REFERENCES entities(id,entity_type_id) ON DELETE RESTRICT;`,
 `CREATE FUNCTION balance_protect_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE typ uuid; obj uuid; st text;
BEGIN
 IF TG_TABLE_NAME='entity_parameter_values' THEN
  IF TG_OP IN ('UPDATE','DELETE') THEN
   IF OLD.entity_type_id=${q(BALANCE_TYPE_ID)} AND EXISTS(SELECT 1 FROM entities WHERE id=OLD.entity_id AND state='active') THEN RAISE EXCEPTION 'Published balance source is immutable' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='entity_types' THEN typ:=OLD.id;
 ELSIF TG_TABLE_NAME='entity_parameters' THEN typ:=CASE WHEN TG_OP='DELETE' THEN OLD.entity_type_id ELSE NEW.entity_type_id END;
 ELSE typ:=CASE WHEN TG_OP='DELETE' THEN OLD.entity_type_id ELSE NEW.entity_type_id END;
 END IF;
 IF typ IN (${q(BALANCE_TYPE_ID)},${q(BALANCE_POINTER_TYPE_ID)}) AND TG_TABLE_NAME IN ('entity_types','entity_parameters') AND EXISTS(SELECT 1 FROM entities WHERE entity_type_id=typ AND state='active') THEN RAISE EXCEPTION 'Published balance metadata is immutable' USING ERRCODE='23514'; END IF;
 IF typ=${q(BALANCE_TYPE_ID)} THEN
  IF TG_TABLE_NAME IN ('entity_types','entity_parameters') THEN
   IF EXISTS(SELECT 1 FROM entities WHERE entity_type_id=typ AND state='active') THEN RAISE EXCEPTION 'Published balance metadata is immutable' USING ERRCODE='23514'; END IF;
  ELSE
   IF TG_TABLE_NAME='entities' THEN obj:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END; st:=CASE WHEN TG_OP='INSERT' THEN 'draft' ELSE OLD.state END;
   ELSE obj:=CASE WHEN TG_OP='DELETE' THEN OLD.entity_id ELSE NEW.entity_id END; SELECT state INTO st FROM entities WHERE id=obj;
   END IF;
   IF st='active' THEN RAISE EXCEPTION 'Published balance revision is immutable' USING ERRCODE='23514'; END IF;
  END IF;
 ELSIF typ=${q(BALANCE_POINTER_TYPE_ID)} AND TG_TABLE_NAME='entities' THEN
  obj:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
  IF obj<>${q(BALANCE_POINTER_ID)} OR TG_OP='DELETE' OR TG_OP='UPDATE' AND NEW.state<>'active' THEN RAISE EXCEPTION 'Balance pointer identity is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER balance_protect_history BEFORE INSERT OR UPDATE OR DELETE ON entity_parameter_values FOR EACH ROW EXECUTE FUNCTION balance_protect_history();
CREATE TRIGGER balance_protect_history BEFORE INSERT OR UPDATE OR DELETE ON entities FOR EACH ROW EXECUTE FUNCTION balance_protect_history();
CREATE TRIGGER balance_protect_history BEFORE INSERT OR UPDATE OR DELETE ON entity_parameters FOR EACH ROW EXECUTE FUNCTION balance_protect_history();
CREATE TRIGGER balance_protect_history BEFORE UPDATE OR DELETE ON entity_types FOR EACH ROW EXECUTE FUNCTION balance_protect_history();
CREATE FUNCTION balance_validate_pin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('foxy.balance_writer',true) IS DISTINCT FROM 'runner-balance.1' THEN RAISE EXCEPTION 'Compatible balance writer is required' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.balance_revision IS NOT NULL AND (NEW.snapshot->>'version' IS DISTINCT FROM 'r34.2' OR NOT (NEW.snapshot ? 'runtimeBalance')) THEN RAISE EXCEPTION 'Balanced run requires the pinned runtime snapshot' USING ERRCODE='23514'; END IF;
 IF NEW.balance_revision IS NOT NULL AND NOT EXISTS(SELECT 1 FROM entities WHERE id=NEW.balance_revision AND entity_type_id=${q(BALANCE_TYPE_ID)} AND state='active') THEN RAISE EXCEPTION 'Run balance must be published' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND NEW.run_id=OLD.run_id AND NEW.balance_revision IS DISTINCT FROM OLD.balance_revision THEN RAISE EXCEPTION 'Existing run balance pin is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER balance_validate_pin BEFORE INSERT OR UPDATE OR DELETE ON profile_runs FOR EACH ROW EXECUTE FUNCTION balance_validate_pin();
CREATE FUNCTION balance_number(revision_id uuid,parameter_key text) RETURNS numeric LANGUAGE sql STABLE AS $fn$
 SELECT coalesce(v.value_decimal,v.value_integer::numeric) FROM entity_parameter_values v JOIN entity_parameters p ON p.id=v.parameter_id WHERE v.entity_id=revision_id AND p.code='b-'||md5(parameter_key)
$fn$;
CREATE FUNCTION balance_validate_revision() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE obj uuid; typ uuid; st text;
BEGIN
 IF TG_TABLE_NAME='entities' THEN obj:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END; ELSE obj:=CASE WHEN TG_OP='DELETE' THEN OLD.entity_id ELSE NEW.entity_id END; END IF;
 SELECT entity_type_id,state INTO typ,st FROM entities WHERE id=obj;
 IF typ=${q(BALANCE_TYPE_ID)} AND st='active' THEN
  IF EXISTS(SELECT 1 FROM entity_parameter_values WHERE entity_id=obj AND data_type='decimal' AND value_decimal<>trunc(value_decimal) AND parameter_id IN (SELECT id FROM entity_parameters WHERE entity_type_id=typ AND code IN (${LEGACY_BALANCE_PARAMETERS.filter(p=>p.type==='goldMilli').map(p=>q(parameterCode(p.key))).join(',')}))) THEN RAISE EXCEPTION 'Balance GoldMilli must be integral' USING ERRCODE='23514'; END IF;
  IF balance_number(obj,'runtime.shopMinDistance')>balance_number(obj,'runtime.shopMaxDistance') OR balance_number(obj,'runtime.shooterChanceStart')>balance_number(obj,'runtime.shooterChanceMax') OR balance_number(obj,'config.spawnMinSeconds')>balance_number(obj,'config.spawnMaxSeconds') OR balance_number(obj,'config.bossMinInterval')>balance_number(obj,'config.bossMaxInterval') OR balance_number(obj,'config.shooterTelegraph')>balance_number(obj,'config.shooterInterval') OR balance_number(obj,'config.bossTelegraph')>balance_number(obj,'config.bossInterval') OR balance_number(obj,'config.maxShooters')>balance_number(obj,'config.maxEnemies') THEN RAISE EXCEPTION 'Balance cross-field values invalid' USING ERRCODE='23514'; END IF;
 ELSIF typ=${q(BALANCE_POINTER_TYPE_ID)} AND st='active' THEN
  IF NOT EXISTS(SELECT 1 FROM entity_parameter_values v JOIN entity_parameters p ON p.id=v.parameter_id JOIN entities r ON r.id=v.value_reference WHERE v.entity_id=obj AND p.code='active-revision' AND r.entity_type_id=${q(BALANCE_TYPE_ID)} AND r.state='active') THEN RAISE EXCEPTION 'Balance pointer must reference a published revision' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $fn$;
CREATE CONSTRAINT TRIGGER balance_validate_revision AFTER INSERT OR UPDATE OR DELETE ON entities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION balance_validate_revision();
CREATE CONSTRAINT TRIGGER balance_validate_revision AFTER INSERT OR UPDATE OR DELETE ON entity_parameter_values DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION balance_validate_revision();
REVOKE ALL ON FUNCTION balance_protect_history(),balance_validate_pin(),balance_number(uuid,text),balance_validate_revision() FROM PUBLIC;`);
 return lines.join('\n')+'\n';
}
