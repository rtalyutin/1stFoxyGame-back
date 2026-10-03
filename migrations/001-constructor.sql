CREATE TABLE entity_types (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9-]{0,63}$'),
  archived_at timestamptz
);
CREATE TABLE entities (
  id uuid PRIMARY KEY,
  entity_type_id uuid NOT NULL REFERENCES entity_types(id) ON DELETE RESTRICT,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id, entity_type_id)
);
CREATE TABLE entity_parameters (
  id uuid PRIMARY KEY,
  entity_type_id uuid NOT NULL REFERENCES entity_types(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code ~ '^[a-z][a-z0-9-]{0,63}$'),
  label text NOT NULL,
  data_type text NOT NULL CHECK (data_type IN ('text','integer','decimal','boolean','timestamp','reference')),
  is_required boolean NOT NULL DEFAULT false,
  is_multiple boolean NOT NULL DEFAULT false,
  is_unique boolean NOT NULL DEFAULT false,
  reference_type_id uuid REFERENCES entity_types(id) ON DELETE RESTRICT,
  integer_min bigint, integer_max bigint,
  decimal_min numeric, decimal_max numeric,
  timestamp_min timestamptz, timestamp_max timestamptz,
  text_min_length integer, text_max_length integer, text_pattern text,
  min_count integer NOT NULL DEFAULT 0 CHECK (min_count >= 0),
  max_count integer CHECK (max_count >= 1),
  archived_at timestamptz,
  UNIQUE(entity_type_id, code),
  UNIQUE(id, entity_type_id, data_type, is_multiple, is_unique),
  UNIQUE(id, reference_type_id),
  CHECK ((data_type = 'reference') = (reference_type_id IS NOT NULL)),
  CHECK ((integer_min IS NULL AND integer_max IS NULL) OR data_type = 'integer'),
  CHECK ((decimal_min IS NULL AND decimal_max IS NULL) OR data_type = 'decimal'),
  CHECK ((timestamp_min IS NULL AND timestamp_max IS NULL) OR data_type = 'timestamp'),
  CHECK ((text_min_length IS NULL AND text_max_length IS NULL AND text_pattern IS NULL) OR data_type = 'text'),
  CHECK (integer_min IS NULL OR integer_max IS NULL OR integer_min <= integer_max),
  CHECK (decimal_min IS NULL OR decimal_max IS NULL OR decimal_min <= decimal_max),
  CHECK (decimal_min IS NULL OR decimal_min NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
  CHECK (decimal_max IS NULL OR decimal_max NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
  CHECK (timestamp_min IS NULL OR timestamp_max IS NULL OR timestamp_min <= timestamp_max),
  CHECK (text_min_length IS NULL OR text_min_length >= 0),
  CHECK (text_max_length IS NULL OR text_max_length >= 0),
  CHECK (text_min_length IS NULL OR text_max_length IS NULL OR text_min_length <= text_max_length),
  CHECK (max_count IS NULL OR min_count <= max_count),
  CHECK (is_multiple OR (min_count <= 1 AND (max_count IS NULL OR max_count = 1)))
);
CREATE TABLE entity_parameter_values (
  entity_id uuid NOT NULL,
  parameter_id uuid NOT NULL,
  entity_type_id uuid NOT NULL,
  data_type text NOT NULL,
  is_multiple boolean NOT NULL,
  is_unique boolean NOT NULL,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  value_text text, value_integer bigint, value_decimal numeric,
  value_boolean boolean, value_timestamp timestamptz, value_reference uuid,
  reference_type_id uuid,
  PRIMARY KEY(entity_id, parameter_id, position),
  FOREIGN KEY(entity_id, entity_type_id) REFERENCES entities(id, entity_type_id) ON DELETE RESTRICT,
  FOREIGN KEY(parameter_id, entity_type_id, data_type, is_multiple, is_unique)
    REFERENCES entity_parameters(id, entity_type_id, data_type, is_multiple, is_unique) ON DELETE RESTRICT,
  FOREIGN KEY(value_reference, reference_type_id) REFERENCES entities(id, entity_type_id) ON DELETE RESTRICT,
  FOREIGN KEY(parameter_id, reference_type_id) REFERENCES entity_parameters(id, reference_type_id) ON DELETE RESTRICT,
  CHECK (is_multiple OR position = 0),
  CHECK (num_nonnulls(value_text,value_integer,value_decimal,value_boolean,value_timestamp,value_reference) = 1),
  CHECK (
    (data_type = 'text' AND value_text IS NOT NULL AND reference_type_id IS NULL) OR
    (data_type = 'integer' AND value_integer IS NOT NULL AND reference_type_id IS NULL) OR
    (data_type = 'decimal' AND value_decimal IS NOT NULL AND reference_type_id IS NULL) OR
    (data_type = 'boolean' AND value_boolean IS NOT NULL AND reference_type_id IS NULL) OR
    (data_type = 'timestamp' AND value_timestamp IS NOT NULL AND reference_type_id IS NULL) OR
    (data_type = 'reference' AND value_reference IS NOT NULL AND reference_type_id IS NOT NULL)
  ),
  CHECK (value_decimal IS NULL OR value_decimal NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric))
);
CREATE UNIQUE INDEX value_single ON entity_parameter_values(entity_id,parameter_id) WHERE NOT is_multiple;
CREATE UNIQUE INDEX value_unique_text ON entity_parameter_values(parameter_id,value_text) WHERE is_unique AND data_type='text';
CREATE UNIQUE INDEX value_unique_integer ON entity_parameter_values(parameter_id,value_integer) WHERE is_unique AND data_type='integer';
CREATE UNIQUE INDEX value_unique_decimal ON entity_parameter_values(parameter_id,value_decimal) WHERE is_unique AND data_type='decimal';
CREATE UNIQUE INDEX value_unique_boolean ON entity_parameter_values(parameter_id,value_boolean) WHERE is_unique AND data_type='boolean';
CREATE UNIQUE INDEX value_unique_timestamp ON entity_parameter_values(parameter_id,value_timestamp) WHERE is_unique AND data_type='timestamp';
CREATE UNIQUE INDEX value_unique_reference ON entity_parameter_values(parameter_id,value_reference) WHERE is_unique AND data_type='reference';
CREATE INDEX entities_type_state ON entities(entity_type_id,state);
CREATE INDEX values_reference ON entity_parameter_values(parameter_id,value_reference) WHERE data_type='reference';

-- Metadata/value mutations take the same type lock BEFORE their write. This deliberately
-- serializes configuration and object changes for one type, including empty objects.
-- Ordered type/object locks avoid a metadata scan racing with a concurrent insertion.
CREATE FUNCTION constructor_lock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE type_ids uuid[]; object_ids uuid[]; t uuid; e uuid; archived timestamptz;
BEGIN
  IF TG_TABLE_NAME = 'entity_types' THEN
    IF TG_OP = 'UPDATE' AND NEW.id <> OLD.id THEN RAISE EXCEPTION 'Type identity is immutable' USING ERRCODE='23514'; END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  ELSIF TG_TABLE_NAME = 'entities' THEN
    type_ids := CASE WHEN TG_OP='INSERT' THEN ARRAY[NEW.entity_type_id] WHEN TG_OP='DELETE' THEN ARRAY[OLD.entity_type_id] ELSE ARRAY[OLD.entity_type_id,NEW.entity_type_id] END;
    IF TG_OP='UPDATE' AND (NEW.id <> OLD.id OR NEW.entity_type_id <> OLD.entity_type_id) THEN RAISE EXCEPTION 'Object identity/type is immutable' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME = 'entity_parameters' THEN
    type_ids := CASE WHEN TG_OP='INSERT' THEN ARRAY[NEW.entity_type_id] WHEN TG_OP='DELETE' THEN ARRAY[OLD.entity_type_id] ELSE ARRAY[OLD.entity_type_id,NEW.entity_type_id] END;
    IF TG_OP='UPDATE' AND (NEW.id <> OLD.id OR NEW.entity_type_id <> OLD.entity_type_id) THEN RAISE EXCEPTION 'Parameter identity/type is immutable' USING ERRCODE='23514'; END IF;
  ELSE
    type_ids := CASE WHEN TG_OP='INSERT' THEN ARRAY[NEW.entity_type_id,NEW.reference_type_id] WHEN TG_OP='DELETE' THEN ARRAY[OLD.entity_type_id,OLD.reference_type_id] ELSE ARRAY[OLD.entity_type_id,NEW.entity_type_id,OLD.reference_type_id,NEW.reference_type_id] END;
    object_ids := CASE WHEN TG_OP='INSERT' THEN ARRAY[NEW.entity_id] WHEN TG_OP='DELETE' THEN ARRAY[OLD.entity_id] ELSE ARRAY[OLD.entity_id,NEW.entity_id] END;
  END IF;
  FOR t IN SELECT DISTINCT x FROM unnest(type_ids) x WHERE x IS NOT NULL ORDER BY x LOOP
    SELECT archived_at INTO archived FROM entity_types WHERE id=t FOR UPDATE;
    IF TG_OP <> 'DELETE' AND archived IS NOT NULL THEN RAISE EXCEPTION 'Type is archived' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF TG_TABLE_NAME='entity_parameters' THEN
    PERFORM id FROM entities WHERE entity_type_id = ANY(type_ids) ORDER BY id FOR UPDATE;
  ELSIF TG_TABLE_NAME='entity_parameter_values' THEN
    FOR e IN SELECT DISTINCT x FROM unnest(object_ids) x ORDER BY x LOOP
      PERFORM id FROM entities WHERE id=e FOR UPDATE;
    END LOOP;
    IF TG_OP <> 'DELETE' AND EXISTS(SELECT 1 FROM entity_parameters WHERE id=NEW.parameter_id AND archived_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Parameter is archived' USING ERRCODE='23514';
    END IF;
    IF TG_OP <> 'DELETE' AND EXISTS(SELECT 1 FROM entities WHERE id=NEW.entity_id AND state='archived') THEN
      RAISE EXCEPTION 'Object is archived' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER constructor_lock BEFORE UPDATE OR DELETE ON entity_types FOR EACH ROW EXECUTE FUNCTION constructor_lock();
CREATE TRIGGER constructor_lock BEFORE INSERT OR UPDATE OR DELETE ON entities FOR EACH ROW EXECUTE FUNCTION constructor_lock();
CREATE TRIGGER constructor_lock BEFORE INSERT OR UPDATE OR DELETE ON entity_parameters FOR EACH ROW EXECUTE FUNCTION constructor_lock();
CREATE TRIGGER constructor_lock BEFORE INSERT OR UPDATE OR DELETE ON entity_parameter_values FOR EACH ROW EXECUTE FUNCTION constructor_lock();

CREATE FUNCTION constructor_validate_object(object_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE obj entities%ROWTYPE; p entity_parameters%ROWTYPE; n bigint;
BEGIN
  SELECT * INTO obj FROM entities WHERE id=object_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  FOR p IN SELECT * FROM entity_parameters WHERE entity_type_id=obj.entity_type_id ORDER BY id LOOP
    SELECT count(*) INTO n FROM entity_parameter_values WHERE entity_id=object_id AND parameter_id=p.id;
    IF p.max_count IS NOT NULL AND n>p.max_count THEN RAISE EXCEPTION 'Maximum element count exceeded' USING ERRCODE='23514'; END IF;
    IF obj.state='active' AND p.archived_at IS NULL AND n < greatest(p.min_count,CASE WHEN p.is_required THEN 1 ELSE 0 END) THEN
      RAISE EXCEPTION 'Required parameter is missing' USING ERRCODE='23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM entity_parameter_values v WHERE v.entity_id=object_id AND v.parameter_id=p.id AND (
        (p.integer_min IS NOT NULL AND v.value_integer<p.integer_min) OR (p.integer_max IS NOT NULL AND v.value_integer>p.integer_max) OR
        (p.decimal_min IS NOT NULL AND v.value_decimal<p.decimal_min) OR (p.decimal_max IS NOT NULL AND v.value_decimal>p.decimal_max) OR
        (p.timestamp_min IS NOT NULL AND v.value_timestamp<p.timestamp_min) OR (p.timestamp_max IS NOT NULL AND v.value_timestamp>p.timestamp_max) OR
        (p.text_min_length IS NOT NULL AND length(v.value_text)<p.text_min_length) OR (p.text_max_length IS NOT NULL AND length(v.value_text)>p.text_max_length) OR
        (p.text_pattern IS NOT NULL AND v.value_text !~ p.text_pattern)
      )
    ) THEN RAISE EXCEPTION 'Parameter range violated' USING ERRCODE='23514'; END IF;
  END LOOP;
END $$;
CREATE FUNCTION constructor_validate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e uuid;
BEGIN
  IF TG_TABLE_NAME='entities' THEN
    PERFORM constructor_validate_object(CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END);
  ELSIF TG_TABLE_NAME='entity_parameter_values' THEN
    IF TG_OP <> 'INSERT' THEN PERFORM constructor_validate_object(OLD.entity_id); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM constructor_validate_object(NEW.entity_id); END IF;
  ELSE
    FOR e IN SELECT id FROM entities WHERE entity_type_id=CASE WHEN TG_OP='DELETE' THEN OLD.entity_type_id ELSE NEW.entity_type_id END ORDER BY id LOOP
      PERFORM constructor_validate_object(e);
    END LOOP;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER constructor_complete AFTER INSERT OR UPDATE OR DELETE ON entities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION constructor_validate();
CREATE CONSTRAINT TRIGGER constructor_complete AFTER INSERT OR UPDATE OR DELETE ON entity_parameter_values DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION constructor_validate();
CREATE CONSTRAINT TRIGGER constructor_complete AFTER INSERT OR UPDATE OR DELETE ON entity_parameters DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION constructor_validate();

REVOKE ALL ON entity_types,entity_parameters,entities,entity_parameter_values FROM PUBLIC;
REVOKE ALL ON FUNCTION constructor_lock(),constructor_validate(),constructor_validate_object(uuid) FROM PUBLIC;

-- Empty type definitions are configuration only; no accounts or profiles are created in R2.
INSERT INTO entity_types(id,code) VALUES
  ('ca5d0000-0000-5000-a000-000000000001','account'),
  ('ca5d0000-0000-5000-a000-000000000002','profile');
