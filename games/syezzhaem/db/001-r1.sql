-- Additive R1 constructor. Apply using a migration connection; runtime never runs DDL.
CREATE SCHEMA IF NOT EXISTS syezzhaem;
REVOKE ALL ON SCHEMA syezzhaem FROM PUBLIC;
CREATE TABLE IF NOT EXISTS syezzhaem.schema_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS syezzhaem.entity_types (
 id text PRIMARY KEY, code text NOT NULL UNIQUE, schema_version integer NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'published' CHECK(status IN('published','archived')),
 parent_type_id text REFERENCES syezzhaem.entity_types(id), global_type boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS syezzhaem.entity_parameters (
 id text PRIMARY KEY,entity_type_id text NOT NULL REFERENCES syezzhaem.entity_types(id),code text NOT NULL,label text NOT NULL,
 data_type text NOT NULL CHECK(data_type IN('text','integer','number','boolean','timestamp','reference')),
 required boolean NOT NULL DEFAULT true,multiple boolean NOT NULL DEFAULT false,reference_type_id text REFERENCES syezzhaem.entity_types(id),
 min_number double precision,max_number double precision,max_length integer NOT NULL DEFAULT 256 CHECK(max_length BETWEEN 1 AND 4096),
 schema_version integer NOT NULL DEFAULT 1,archived boolean NOT NULL DEFAULT false,
 UNIQUE(entity_type_id,code),UNIQUE(id,entity_type_id,data_type),CHECK((data_type='reference')=(reference_type_id IS NOT NULL)),
 CHECK(min_number IS NULL OR max_number IS NULL OR min_number<=max_number)
);
CREATE TABLE IF NOT EXISTS syezzhaem.entities (
 id uuid PRIMARY KEY,entity_type_id text NOT NULL REFERENCES syezzhaem.entity_types(id),owner_user_id text,parent_id uuid REFERENCES syezzhaem.entities(id) ON DELETE CASCADE,
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),status text NOT NULL DEFAULT 'active',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,entity_type_id),CHECK(owner_user_id IS NULL OR length(owner_user_id) BETWEEN 1 AND 128)
);
CREATE INDEX IF NOT EXISTS r1_entities_parent ON syezzhaem.entities(parent_id);
CREATE INDEX IF NOT EXISTS r1_entities_history ON syezzhaem.entities(owner_user_id,entity_type_id,created_at,id);
CREATE TABLE IF NOT EXISTS syezzhaem.entity_parameter_values (
 entity_id uuid NOT NULL,entity_type_id text NOT NULL,parameter_id text NOT NULL,data_type text NOT NULL,element_no integer NOT NULL DEFAULT 0 CHECK(element_no>=0),
 value_text text,value_integer bigint,value_number double precision,value_boolean boolean,value_timestamp timestamptz,value_reference uuid REFERENCES syezzhaem.entities(id) DEFERRABLE INITIALLY DEFERRED,
 PRIMARY KEY(entity_id,parameter_id,element_no),
 FOREIGN KEY(entity_id,entity_type_id) REFERENCES syezzhaem.entities(id,entity_type_id) ON DELETE CASCADE,
 FOREIGN KEY(parameter_id,entity_type_id,data_type) REFERENCES syezzhaem.entity_parameters(id,entity_type_id,data_type),
 CHECK(num_nonnulls(value_text,value_integer,value_number,value_boolean,value_timestamp,value_reference)=1),
 CHECK((data_type='text' AND value_text IS NOT NULL) OR(data_type='integer' AND value_integer IS NOT NULL) OR
  (data_type='number' AND value_number IS NOT NULL AND value_number NOT IN('NaN'::float8,'Infinity'::float8,'-Infinity'::float8)) OR
  (data_type='boolean' AND value_boolean IS NOT NULL) OR(data_type='timestamp' AND value_timestamp IS NOT NULL) OR(data_type='reference' AND value_reference IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS r1_values_reference ON syezzhaem.entity_parameter_values(value_reference);
CREATE TABLE IF NOT EXISTS syezzhaem.profile_identity_index(user_id text PRIMARY KEY,profile_id uuid NOT NULL UNIQUE REFERENCES syezzhaem.entities(id));
CREATE TABLE IF NOT EXISTS syezzhaem.active_run_index(user_id text PRIMARY KEY,run_id uuid NOT NULL UNIQUE REFERENCES syezzhaem.entities(id));
-- Reconstructible key projections. Gameplay values remain canonical EAV.
CREATE TABLE IF NOT EXISTS syezzhaem.aggregate_keys (
 checkpoint_id uuid NOT NULL REFERENCES syezzhaem.entities(id) ON DELETE CASCADE,key_kind text NOT NULL,key_value text NOT NULL,
 entity_id uuid NOT NULL REFERENCES syezzhaem.entities(id) ON DELETE CASCADE,owner_user_id text NOT NULL,
 PRIMARY KEY(checkpoint_id,key_kind,key_value)
);
CREATE TABLE IF NOT EXISTS syezzhaem.request_dedup(
 user_id text NOT NULL,request_id uuid NOT NULL,operation text NOT NULL,body_hash text NOT NULL CHECK(length(body_hash)=64),
 response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(user_id,request_id)
);
CREATE OR REPLACE FUNCTION syezzhaem.current_owner() RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT nullif(current_setting('syezzhaem.user_id',true),'')
$$;
CREATE OR REPLACE FUNCTION syezzhaem.check_parent() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,syezzhaem AS $$
DECLARE typ syezzhaem.entity_types;par syezzhaem.entities;
BEGIN
 SELECT * INTO typ FROM syezzhaem.entity_types WHERE id=NEW.entity_type_id;
 IF typ.global_type <> (NEW.owner_user_id IS NULL) THEN RAISE EXCEPTION 'Entity ownership scope invalid' USING ERRCODE='23514'; END IF;
 IF typ.parent_type_id IS NULL THEN
  IF NEW.parent_id IS NOT NULL THEN RAISE EXCEPTION 'Root parent invalid' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO par FROM syezzhaem.entities WHERE id=NEW.parent_id;
  IF par.id IS NULL OR par.entity_type_id<>typ.parent_type_id OR par.owner_user_id IS DISTINCT FROM NEW.owner_user_id THEN
   RAISE EXCEPTION 'Parent type or owner mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id OR NEW.entity_type_id<>OLD.entity_type_id OR NEW.parent_id IS DISTINCT FROM OLD.parent_id) THEN
  RAISE EXCEPTION 'Entity identity is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS r1_parent_guard ON syezzhaem.entities;
CREATE TRIGGER r1_parent_guard BEFORE INSERT OR UPDATE ON syezzhaem.entities FOR EACH ROW EXECUTE FUNCTION syezzhaem.check_parent();
CREATE OR REPLACE FUNCTION syezzhaem.guard_global_value() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,syezzhaem AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM syezzhaem.entities WHERE id=OLD.entity_id AND owner_user_id IS NULL) THEN RAISE EXCEPTION 'Published content values immutable' USING ERRCODE='23514'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS r1_global_values_immutable ON syezzhaem.entity_parameter_values;
CREATE TRIGGER r1_global_values_immutable BEFORE UPDATE OR DELETE ON syezzhaem.entity_parameter_values FOR EACH ROW EXECUTE FUNCTION syezzhaem.guard_global_value();

CREATE OR REPLACE FUNCTION syezzhaem.check_value() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,syezzhaem AS $$
DECLARE p syezzhaem.entity_parameters;e syezzhaem.entities;r syezzhaem.entities;n float8;
BEGIN
 SELECT * INTO p FROM syezzhaem.entity_parameters WHERE id=NEW.parameter_id;
 IF NOT p.multiple AND NEW.element_no<>0 THEN RAISE EXCEPTION 'Single parameter element must be zero' USING ERRCODE='23514'; END IF;
 IF NEW.value_text IS NOT NULL AND length(NEW.value_text)>p.max_length THEN RAISE EXCEPTION 'Text exceeds metadata range' USING ERRCODE='23514'; END IF;
 n=coalesce(NEW.value_number,NEW.value_integer::float8);
 IF n IS NOT NULL AND ((p.min_number IS NOT NULL AND n<p.min_number) OR(p.max_number IS NOT NULL AND n>p.max_number)) THEN RAISE EXCEPTION 'Number exceeds metadata range' USING ERRCODE='23514'; END IF;
 IF NEW.value_reference IS NOT NULL THEN
  SELECT * INTO e FROM syezzhaem.entities WHERE id=NEW.entity_id;
  SELECT * INTO r FROM syezzhaem.entities WHERE id=NEW.value_reference;
  IF r.id IS NULL OR r.entity_type_id<>p.reference_type_id OR(r.owner_user_id IS NOT NULL AND r.owner_user_id IS DISTINCT FROM e.owner_user_id) OR (p.code IN('checkpoint_ref','run_ref') AND r.id IS DISTINCT FROM e.parent_id) OR (p.code='held_actor_ref' AND r.parent_id IS DISTINCT FROM e.parent_id) THEN
   RAISE EXCEPTION 'Reference type or owner mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS r1_value_guard ON syezzhaem.entity_parameter_values;
CREATE TRIGGER r1_value_guard BEFORE INSERT OR UPDATE ON syezzhaem.entity_parameter_values FOR EACH ROW EXECUTE FUNCTION syezzhaem.check_value();
CREATE OR REPLACE FUNCTION syezzhaem.validate_required(entity uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,syezzhaem AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM syezzhaem.entities e JOIN syezzhaem.entity_parameters p ON p.entity_type_id=e.entity_type_id AND p.required
 LEFT JOIN syezzhaem.entity_parameter_values v ON v.entity_id=e.id AND v.parameter_id=p.id WHERE e.id=entity AND v.entity_id IS NULL) THEN
 RAISE EXCEPTION 'Missing required parameter' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM syezzhaem.entities WHERE id=entity AND entity_type_id='actor_state') AND (SELECT count(*) FROM syezzhaem.entity_parameter_values WHERE entity_id=entity AND parameter_id IN('actor_state.support_space','actor_state.support_x','actor_state.support_y','actor_state.support_block_id')) NOT IN(0,4) THEN RAISE EXCEPTION 'Incomplete actor support' USING ERRCODE='23514'; END IF;
END $$;
CREATE OR REPLACE FUNCTION syezzhaem.check_required_deferred() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,syezzhaem AS $$
BEGIN
 IF TG_TABLE_NAME='entities' THEN PERFORM syezzhaem.validate_required(NEW.id);
 ELSE PERFORM syezzhaem.validate_required(coalesce(NEW.entity_id,OLD.entity_id)); END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS r1_required_entities ON syezzhaem.entities;
CREATE CONSTRAINT TRIGGER r1_required_entities AFTER INSERT OR UPDATE ON syezzhaem.entities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION syezzhaem.check_required_deferred();
DROP TRIGGER IF EXISTS r1_required_values ON syezzhaem.entity_parameter_values;
CREATE CONSTRAINT TRIGGER r1_required_values AFTER INSERT OR UPDATE OR DELETE ON syezzhaem.entity_parameter_values DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION syezzhaem.check_required_deferred();
-- Metadata mutations require a new version if existing objects would become invalid.

CREATE UNIQUE INDEX IF NOT EXISTS r1_profile_owner_unique ON syezzhaem.entities(owner_user_id) WHERE entity_type_id='player_profile';
CREATE UNIQUE INDEX IF NOT EXISTS r1_checkpoint_run_unique ON syezzhaem.entities(parent_id) WHERE entity_type_id='checkpoint';
CREATE OR REPLACE FUNCTION syezzhaem.check_projection() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,syezzhaem AS $$
DECLARE e syezzhaem.entities;c syezzhaem.entities;canon text;
BEGIN
 IF TG_TABLE_NAME='aggregate_keys' THEN
  SELECT * INTO e FROM syezzhaem.entities WHERE id=NEW.entity_id;
  SELECT * INTO c FROM syezzhaem.entities WHERE id=NEW.checkpoint_id;
  IF e.id IS NULL OR c.id IS NULL OR c.entity_type_id<>'checkpoint' OR e.parent_id IS DISTINCT FROM c.id OR e.owner_user_id IS DISTINCT FROM NEW.owner_user_id OR c.owner_user_id IS DISTINCT FROM NEW.owner_user_id THEN RAISE EXCEPTION 'Projection entity owner or parent mismatch' USING ERRCODE='23514'; END IF;
  IF NEW.key_kind='actor' AND e.entity_type_id='actor_state' THEN
   SELECT value_text INTO canon FROM syezzhaem.entity_parameter_values WHERE entity_id=e.id AND parameter_id='actor_state.actor_key';
  ELSIF NEW.key_kind='material' AND e.entity_type_id='inventory_item' THEN
   SELECT value_reference::text INTO canon FROM syezzhaem.entity_parameter_values WHERE entity_id=e.id AND parameter_id='inventory_item.material_ref';
  ELSIF NEW.key_kind='block' AND e.entity_type_id='cell_override' THEN
   SELECT value_text INTO canon FROM syezzhaem.entity_parameter_values WHERE entity_id=e.id AND parameter_id='cell_override.block_id';
  ELSIF NEW.key_kind='cell' AND e.entity_type_id='cell_override' THEN
   SELECT concat(s.value_text,':',x.value_integer,':',y.value_integer) INTO canon FROM syezzhaem.entity_parameter_values s JOIN syezzhaem.entity_parameter_values x ON x.entity_id=s.entity_id AND x.parameter_id='cell_override.x' JOIN syezzhaem.entity_parameter_values y ON y.entity_id=s.entity_id AND y.parameter_id='cell_override.y' WHERE s.entity_id=e.id AND s.parameter_id='cell_override.coordinate_space';
  ELSE RAISE EXCEPTION 'Projection kind invalid' USING ERRCODE='23514'; END IF;
  IF canon IS NULL OR canon<>NEW.key_value THEN RAISE EXCEPTION 'Projection key differs from canonical EAV' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='profile_identity_index' THEN
  SELECT * INTO e FROM syezzhaem.entities WHERE id=NEW.profile_id;
  IF e.id IS NULL OR e.entity_type_id<>'player_profile' OR e.owner_user_id IS DISTINCT FROM NEW.user_id THEN RAISE EXCEPTION 'Profile projection owner mismatch' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO e FROM syezzhaem.entities WHERE id=NEW.run_id;
  SELECT value_text INTO canon FROM syezzhaem.entity_parameter_values WHERE entity_id=e.id AND parameter_id='game_run.lifecycle';
  IF e.id IS NULL OR e.entity_type_id<>'game_run' OR e.owner_user_id IS DISTINCT FROM NEW.user_id OR canon IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Active projection owner or lifecycle mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS r1_projection_keys ON syezzhaem.aggregate_keys;
CREATE TRIGGER r1_projection_keys BEFORE INSERT OR UPDATE ON syezzhaem.aggregate_keys FOR EACH ROW EXECUTE FUNCTION syezzhaem.check_projection();
DROP TRIGGER IF EXISTS r1_projection_profile ON syezzhaem.profile_identity_index;
CREATE TRIGGER r1_projection_profile BEFORE INSERT OR UPDATE ON syezzhaem.profile_identity_index FOR EACH ROW EXECUTE FUNCTION syezzhaem.check_projection();
DROP TRIGGER IF EXISTS r1_projection_active ON syezzhaem.active_run_index;
CREATE TRIGGER r1_projection_active BEFORE INSERT OR UPDATE ON syezzhaem.active_run_index FOR EACH ROW EXECUTE FUNCTION syezzhaem.check_projection();

CREATE OR REPLACE FUNCTION syezzhaem.check_metadata_change() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,syezzhaem AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM syezzhaem.entities WHERE entity_type_id=OLD.entity_type_id) AND
 (NEW.data_type<>OLD.data_type OR NEW.entity_type_id<>OLD.entity_type_id OR NEW.reference_type_id IS DISTINCT FROM OLD.reference_type_id OR NEW.required IS DISTINCT FROM OLD.required OR NEW.multiple IS DISTINCT FROM OLD.multiple OR NEW.min_number IS DISTINCT FROM OLD.min_number OR NEW.max_number IS DISTINCT FROM OLD.max_number OR NEW.max_length IS DISTINCT FROM OLD.max_length) THEN
 RAISE EXCEPTION 'Populated parameter contract immutable; migrate a version' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS r1_metadata_guard ON syezzhaem.entity_parameters;
CREATE TRIGGER r1_metadata_guard BEFORE UPDATE ON syezzhaem.entity_parameters FOR EACH ROW EXECUTE FUNCTION syezzhaem.check_metadata_change();
ALTER TABLE syezzhaem.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE syezzhaem.entity_parameter_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE syezzhaem.profile_identity_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE syezzhaem.active_run_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE syezzhaem.aggregate_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE syezzhaem.request_dedup ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS r1_entities_read ON syezzhaem.entities;
CREATE POLICY r1_entities_read ON syezzhaem.entities FOR SELECT USING(owner_user_id IS NULL OR owner_user_id=syezzhaem.current_owner());
DROP POLICY IF EXISTS r1_entities_write ON syezzhaem.entities;
CREATE POLICY r1_entities_write ON syezzhaem.entities FOR ALL USING(owner_user_id=syezzhaem.current_owner()) WITH CHECK(owner_user_id=syezzhaem.current_owner());
DROP POLICY IF EXISTS r1_values_read ON syezzhaem.entity_parameter_values;
CREATE POLICY r1_values_read ON syezzhaem.entity_parameter_values FOR SELECT USING(EXISTS(SELECT 1 FROM syezzhaem.entities e WHERE e.id=entity_id AND(e.owner_user_id IS NULL OR e.owner_user_id=syezzhaem.current_owner())));
DROP POLICY IF EXISTS r1_values_write ON syezzhaem.entity_parameter_values;
CREATE POLICY r1_values_write ON syezzhaem.entity_parameter_values FOR ALL USING(EXISTS(SELECT 1 FROM syezzhaem.entities e WHERE e.id=entity_id AND e.owner_user_id=syezzhaem.current_owner())) WITH CHECK(EXISTS(SELECT 1 FROM syezzhaem.entities e WHERE e.id=entity_id AND e.owner_user_id=syezzhaem.current_owner()));
DO $$ DECLARE tab text; col text; BEGIN
 FOREACH tab IN ARRAY ARRAY['profile_identity_index','active_run_index','aggregate_keys','request_dedup'] LOOP
  col=CASE WHEN tab='aggregate_keys' THEN 'owner_user_id' ELSE 'user_id' END;
  EXECUTE format('DROP POLICY IF EXISTS r1_owner ON syezzhaem.%I',tab);
  EXECUTE format('CREATE POLICY r1_owner ON syezzhaem.%I USING(%I=syezzhaem.current_owner()) WITH CHECK(%I=syezzhaem.current_owner())',tab,col,col);
 END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA syezzhaem FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA syezzhaem FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='syezzhaem_runtime') THEN
  GRANT USAGE ON SCHEMA syezzhaem TO syezzhaem_runtime;
  GRANT SELECT ON syezzhaem.entity_types,syezzhaem.entity_parameters,syezzhaem.schema_migrations TO syezzhaem_runtime;
  GRANT SELECT,INSERT,UPDATE,DELETE ON syezzhaem.entities,syezzhaem.entity_parameter_values,syezzhaem.profile_identity_index,syezzhaem.active_run_index,syezzhaem.aggregate_keys,syezzhaem.request_dedup TO syezzhaem_runtime;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA syezzhaem TO syezzhaem_runtime;
 END IF;
END $$;
INSERT INTO syezzhaem.schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
