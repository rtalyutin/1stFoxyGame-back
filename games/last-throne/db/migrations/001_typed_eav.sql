-- Additive, isolated foundation. Application data stays in typed EAV tables.
CREATE SCHEMA IF NOT EXISTS last_throne;

CREATE TABLE last_throne.entity_types (
  id uuid PRIMARY KEY,
  code text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{0,63}$'),
  label text NOT NULL,
  schema_revision integer NOT NULL CHECK (schema_revision > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  UNIQUE (code, schema_revision)
);

CREATE TABLE last_throne.entity_parameters (
  id uuid PRIMARY KEY,
  entity_type_id uuid NOT NULL REFERENCES last_throne.entity_types(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{0,63}$'),
  label text NOT NULL,
  data_type text NOT NULL CHECK (data_type IN ('text','integer','numeric','boolean','timestamp','reference')),
  required boolean NOT NULL DEFAULT false,
  multiple boolean NOT NULL DEFAULT false,
  target_type_id uuid REFERENCES last_throne.entity_types(id) ON DELETE RESTRICT,
  reference_policy text CHECK (reference_policy IN ('same_owner','same_run','same_checkpoint','pinned_release')),
  constraints jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(constraints) = 'object'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  UNIQUE (entity_type_id, code),
  UNIQUE (id, entity_type_id, data_type),
  CHECK ((data_type = 'reference' AND target_type_id IS NOT NULL AND reference_policy IS NOT NULL)
      OR (data_type <> 'reference' AND target_type_id IS NULL AND reference_policy IS NULL))
);

CREATE TABLE last_throne.metadata_schema_versions (
  version text PRIMARY KEY CHECK (version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  manifest_hash text CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CHECK (status = 'draft' OR (manifest_hash IS NOT NULL AND published_at IS NOT NULL))
);

CREATE TABLE last_throne.metadata_schema_types (
  metadata_schema_version text NOT NULL REFERENCES last_throne.metadata_schema_versions(version) ON DELETE RESTRICT,
  entity_type_id uuid NOT NULL REFERENCES last_throne.entity_types(id) ON DELETE RESTRICT,
  PRIMARY KEY (metadata_schema_version, entity_type_id)
);

CREATE TABLE last_throne.content_releases (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'),
  content_version text NOT NULL UNIQUE,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  metadata_schema_version text NOT NULL REFERENCES last_throne.metadata_schema_versions(version) ON DELETE RESTRICT,
  core_compatibility text[] NOT NULL CHECK (cardinality(core_compatibility) > 0 AND array_position(core_compatibility,NULL) IS NULL AND NOT ('' = ANY(core_compatibility))),
  asset_manifest_hash text NOT NULL CHECK (asset_manifest_hash ~ '^[a-f0-9]{64}$'),
  projection_hash text NOT NULL CHECK (projection_hash ~ '^[a-f0-9]{64}$'),
  source_revision integer NOT NULL DEFAULT 1 CHECK (source_revision > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CHECK (status = 'draft' OR published_at IS NOT NULL)
);

CREATE TABLE last_throne.entities (
  id uuid PRIMARY KEY,
  entity_type_id uuid NOT NULL REFERENCES last_throne.entity_types(id) ON DELETE RESTRICT,
  metadata_schema_version text NOT NULL,
  owner_id uuid,
  run_id uuid,
  checkpoint_id uuid,
  release_id text REFERENCES last_throne.content_releases(id) ON DELETE RESTRICT,
  pinned_release_id text REFERENCES last_throne.content_releases(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','frozen')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, entity_type_id),
  FOREIGN KEY (metadata_schema_version, entity_type_id)
    REFERENCES last_throne.metadata_schema_types(metadata_schema_version, entity_type_id) ON DELETE RESTRICT,
  CHECK ((release_id IS NOT NULL AND owner_id IS NULL AND run_id IS NULL AND checkpoint_id IS NULL AND pinned_release_id IS NOT NULL AND pinned_release_id = release_id)
      OR (release_id IS NULL AND owner_id IS NOT NULL)),
  CHECK (checkpoint_id IS NULL OR run_id IS NOT NULL)
);

CREATE TABLE last_throne.entity_parameter_values (
  entity_id uuid NOT NULL,
  entity_type_id uuid NOT NULL,
  parameter_id uuid NOT NULL,
  data_type text NOT NULL,
  ordinal integer NOT NULL DEFAULT 0 CHECK (ordinal >= 0),
  text_value text,
  integer_value bigint,
  numeric_value numeric,
  boolean_value boolean,
  timestamp_value timestamptz,
  reference_value uuid REFERENCES last_throne.entities(id) ON DELETE RESTRICT,
  PRIMARY KEY (entity_id, parameter_id, ordinal),
  FOREIGN KEY (entity_id, entity_type_id)
    REFERENCES last_throne.entities(id, entity_type_id) ON DELETE RESTRICT,
  FOREIGN KEY (parameter_id, entity_type_id, data_type)
    REFERENCES last_throne.entity_parameters(id, entity_type_id, data_type) ON DELETE RESTRICT,
  CHECK (num_nonnulls(text_value, integer_value, numeric_value, boolean_value, timestamp_value, reference_value) = 1),
  CHECK ((data_type = 'text' AND text_value IS NOT NULL)
      OR (data_type = 'integer' AND integer_value IS NOT NULL)
      OR (data_type = 'numeric' AND numeric_value IS NOT NULL AND numeric_value::text NOT IN ('NaN','Infinity','-Infinity'))
      OR (data_type = 'boolean' AND boolean_value IS NOT NULL)
      OR (data_type = 'timestamp' AND timestamp_value IS NOT NULL AND isfinite(timestamp_value))
      OR (data_type = 'reference' AND reference_value IS NOT NULL))
);
CREATE INDEX entities_type_release_idx ON last_throne.entities(entity_type_id, release_id);
CREATE INDEX entities_owner_type_idx ON last_throne.entities(owner_id, entity_type_id);
CREATE INDEX values_references_idx ON last_throne.entity_parameter_values(parameter_id, reference_value) WHERE reference_value IS NOT NULL;

CREATE TABLE last_throne.content_release_channels (
  channel text PRIMARY KEY CHECK (channel ~ '^[a-z][a-z0-9_-]{0,31}$'),
  release_id text NOT NULL REFERENCES last_throne.content_releases(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Serialize metadata editing/publication, including changes made directly by a migration role.
CREATE FUNCTION last_throne.guard_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE type_id uuid; schema_version text;
BEGIN
  PERFORM pg_advisory_xact_lock(8411201);
  IF TG_TABLE_NAME = 'metadata_schema_versions' THEN
    IF TG_OP <> 'INSERT' AND OLD.status = 'published' THEN
      RAISE EXCEPTION 'METADATA_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF TG_OP <> 'DELETE' AND NEW.status='published' THEN
      IF NOT EXISTS (SELECT 1 FROM last_throne.metadata_schema_types WHERE metadata_schema_version=NEW.version)
        OR EXISTS (SELECT 1 FROM last_throne.metadata_schema_types s JOIN last_throne.entity_types t ON t.id=s.entity_type_id WHERE s.metadata_schema_version=NEW.version GROUP BY t.code HAVING count(*)>1)
        OR EXISTS (SELECT 1 FROM last_throne.entity_parameters p JOIN last_throne.metadata_schema_types s ON s.entity_type_id=p.entity_type_id WHERE s.metadata_schema_version=NEW.version AND p.target_type_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM last_throne.metadata_schema_types target WHERE target.metadata_schema_version=NEW.version AND target.entity_type_id=p.target_type_id)) THEN
        RAISE EXCEPTION 'METADATA_SCHEMA_INVALID' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'metadata_schema_types' THEN
    schema_version := CASE WHEN TG_OP = 'DELETE' THEN OLD.metadata_schema_version ELSE NEW.metadata_schema_version END;
    IF EXISTS (SELECT 1 FROM last_throne.metadata_schema_versions WHERE version = schema_version AND status = 'published')
      OR (TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM last_throne.metadata_schema_versions WHERE version = OLD.metadata_schema_version AND status = 'published')) THEN
      RAISE EXCEPTION 'METADATA_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  ELSE
    type_id := ((CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END)->>
      CASE WHEN TG_TABLE_NAME='entity_types' THEN 'id' ELSE 'entity_type_id' END)::uuid;
    IF EXISTS (SELECT 1 FROM last_throne.metadata_schema_types t JOIN last_throne.metadata_schema_versions m ON m.version=t.metadata_schema_version WHERE t.entity_type_id=type_id AND m.status='published') THEN
      RAISE EXCEPTION 'METADATA_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF TG_OP <> 'INSERT' AND EXISTS (
      SELECT 1 FROM last_throne.metadata_schema_types t JOIN last_throne.metadata_schema_versions m ON m.version=t.metadata_schema_version
      WHERE t.entity_type_id=((to_jsonb(OLD)->>CASE WHEN TG_TABLE_NAME='entity_types' THEN 'id' ELSE 'entity_type_id' END)::uuid) AND m.status='published'
    ) THEN RAISE EXCEPTION 'METADATA_IMMUTABLE' USING ERRCODE='23514'; END IF;
    IF TG_OP <> 'INSERT' AND TG_TABLE_NAME = 'entity_parameters' AND (TG_OP='DELETE' OR (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status')) THEN
      IF EXISTS (SELECT 1 FROM last_throne.entity_parameter_values WHERE parameter_id = OLD.id) THEN
        RAISE EXCEPTION 'PARAMETER_HAS_VALUES_CREATE_REVISION' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF TG_OP <> 'INSERT' AND TG_TABLE_NAME = 'entity_types' AND (TG_OP='DELETE' OR (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status')) THEN
      IF EXISTS (SELECT 1 FROM last_throne.entities WHERE entity_type_id = OLD.id) THEN
        RAISE EXCEPTION 'TYPE_HAS_ENTITIES_CREATE_REVISION' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER entity_types_immutable BEFORE INSERT OR UPDATE OR DELETE ON last_throne.entity_types FOR EACH ROW EXECUTE FUNCTION last_throne.guard_metadata();
CREATE TRIGGER parameters_immutable BEFORE INSERT OR UPDATE OR DELETE ON last_throne.entity_parameters FOR EACH ROW EXECUTE FUNCTION last_throne.guard_metadata();
CREATE TRIGGER metadata_versions_immutable BEFORE INSERT OR UPDATE OR DELETE ON last_throne.metadata_schema_versions FOR EACH ROW EXECUTE FUNCTION last_throne.guard_metadata();
CREATE TRIGGER metadata_types_immutable BEFORE INSERT OR UPDATE OR DELETE ON last_throne.metadata_schema_types FOR EACH ROW EXECUTE FUNCTION last_throne.guard_metadata();

CREATE FUNCTION last_throne.validate_parameter_constraints() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE key text;
BEGIN
  FOR key IN SELECT jsonb_object_keys(NEW.constraints) LOOP
    IF key NOT IN ('min','max','enum','minLength','maxLength') THEN
      RAISE EXCEPTION 'UNKNOWN_PARAMETER_CONSTRAINT: %', key USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF (NEW.constraints ? 'min' OR NEW.constraints ? 'max') AND NEW.data_type NOT IN ('integer','numeric') THEN
    RAISE EXCEPTION 'NUMERIC_CONSTRAINT_TYPE' USING ERRCODE = '23514';
  END IF;
  IF (NEW.constraints ? 'minLength' OR NEW.constraints ? 'maxLength') AND NEW.data_type <> 'text' THEN
    RAISE EXCEPTION 'TEXT_CONSTRAINT_TYPE' USING ERRCODE = '23514';
  END IF;
  FOR key IN SELECT jsonb_object_keys(NEW.constraints) LOOP
    IF key IN ('min','max','minLength','maxLength') AND jsonb_typeof(NEW.constraints->key) <> 'number' THEN
      RAISE EXCEPTION 'CONSTRAINT_NUMBER_REQUIRED' USING ERRCODE = '23514';
    END IF;
    IF key IN ('minLength','maxLength') AND ((NEW.constraints->>key)::numeric < 0 OR (NEW.constraints->>key)::numeric <> trunc((NEW.constraints->>key)::numeric)) THEN
      RAISE EXCEPTION 'CONSTRAINT_LENGTH_INVALID' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF (NEW.constraints ? 'min' AND NEW.constraints ? 'max' AND (NEW.constraints->>'min')::numeric > (NEW.constraints->>'max')::numeric)
    OR (NEW.constraints ? 'minLength' AND NEW.constraints ? 'maxLength' AND (NEW.constraints->>'minLength')::integer > (NEW.constraints->>'maxLength')::integer) THEN
    RAISE EXCEPTION 'CONSTRAINT_RANGE_INVALID' USING ERRCODE = '23514';
  END IF;
  IF NEW.constraints ? 'enum' AND (jsonb_typeof(NEW.constraints->'enum') <> 'array' OR jsonb_array_length(NEW.constraints->'enum') = 0 OR NEW.data_type = 'reference') THEN
    RAISE EXCEPTION 'CONSTRAINT_ENUM_INVALID' USING ERRCODE = '23514';
  END IF;
  IF NEW.constraints ? 'enum' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.constraints->'enum') member WHERE
      (NEW.data_type IN ('text','timestamp') AND jsonb_typeof(member)<>'string')
      OR (NEW.data_type='boolean' AND jsonb_typeof(member)<>'boolean')
      OR (NEW.data_type IN ('integer','numeric') AND jsonb_typeof(member)<>'number')
  ) THEN RAISE EXCEPTION 'CONSTRAINT_ENUM_TYPE' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER parameters_constraints BEFORE INSERT OR UPDATE ON last_throne.entity_parameters FOR EACH ROW EXECUTE FUNCTION last_throne.validate_parameter_constraints();

CREATE FUNCTION last_throne.guard_entity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE release_row last_throne.content_releases;
BEGIN
  PERFORM pg_advisory_xact_lock(8411201);
  IF TG_OP <> 'INSERT' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'ENTITY_IMMUTABLE' USING ERRCODE = '23514'; END IF;
    IF TG_OP = 'UPDATE' AND ROW(NEW.id,NEW.entity_type_id,NEW.metadata_schema_version,NEW.owner_id,NEW.run_id,NEW.checkpoint_id,NEW.release_id,NEW.pinned_release_id)
      IS DISTINCT FROM ROW(OLD.id,OLD.entity_type_id,OLD.metadata_schema_version,OLD.owner_id,OLD.run_id,OLD.checkpoint_id,OLD.release_id,OLD.pinned_release_id)
      AND (EXISTS (SELECT 1 FROM last_throne.entity_parameter_values WHERE entity_id=OLD.id)
        OR EXISTS (SELECT 1 FROM last_throne.entity_parameter_values WHERE reference_value=OLD.id)) THEN
      RAISE EXCEPTION 'ENTITY_SCOPE_IMMUTABLE_AFTER_VALUES' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.release_id IS NOT NULL THEN
    SELECT * INTO release_row FROM last_throne.content_releases WHERE id=NEW.release_id FOR UPDATE;
    IF release_row.status <> 'draft' THEN RAISE EXCEPTION 'RELEASE_IMMUTABLE' USING ERRCODE = '23514'; END IF;
    IF release_row.metadata_schema_version <> NEW.metadata_schema_version THEN
      RAISE EXCEPTION 'METADATA_VERSION_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.pinned_release_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM last_throne.content_releases WHERE id=NEW.pinned_release_id AND status='published') THEN
      RAISE EXCEPTION 'PINNED_RELEASE_NOT_PUBLISHED' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.status <> 'draft' THEN
    IF NOT EXISTS (SELECT 1 FROM last_throne.metadata_schema_versions WHERE version=NEW.metadata_schema_version AND status='published') THEN
      RAISE EXCEPTION 'METADATA_NOT_PUBLISHED' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'INSERT' OR EXISTS (
      SELECT 1 FROM last_throne.entity_parameters p WHERE p.entity_type_id=NEW.entity_type_id AND p.required
        AND NOT EXISTS (SELECT 1 FROM last_throne.entity_parameter_values v WHERE v.entity_id=NEW.id AND v.parameter_id=p.id)
    ) THEN RAISE EXCEPTION 'REQUIRED_PARAMETER_MISSING' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER entities_guard BEFORE INSERT OR UPDATE OR DELETE ON last_throne.entities FOR EACH ROW EXECUTE FUNCTION last_throne.guard_entity();

CREATE FUNCTION last_throne.guard_value() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source last_throne.entities; target last_throne.entities; param last_throne.entity_parameters; scalar jsonb; numeric_scalar numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(8411201);
  SELECT * INTO source FROM last_throne.entities WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.entity_id ELSE NEW.entity_id END FOR UPDATE;
  IF source.status <> 'draft' THEN RAISE EXCEPTION 'ENTITY_IMMUTABLE' USING ERRCODE = '23514'; END IF;
  IF TG_OP='UPDATE' AND NEW.entity_id<>OLD.entity_id THEN
    PERFORM 1 FROM last_throne.entities WHERE id=OLD.entity_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM last_throne.entities WHERE id=OLD.entity_id AND status<>'draft') THEN
      RAISE EXCEPTION 'ENTITY_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF source.release_id IS NOT NULL THEN
    PERFORM 1 FROM last_throne.content_releases WHERE id=source.release_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM last_throne.content_releases WHERE id=source.release_id AND status<>'draft') THEN
      RAISE EXCEPTION 'RELEASE_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  SELECT * INTO param FROM last_throne.entity_parameters WHERE id=NEW.parameter_id;
  IF NOT param.multiple AND NEW.ordinal<>0 THEN RAISE EXCEPTION 'SINGLE_VALUE_ORDINAL' USING ERRCODE='23514'; END IF;
  scalar := CASE NEW.data_type WHEN 'text' THEN to_jsonb(NEW.text_value) WHEN 'integer' THEN to_jsonb(NEW.integer_value) WHEN 'numeric' THEN to_jsonb(NEW.numeric_value) WHEN 'boolean' THEN to_jsonb(NEW.boolean_value) WHEN 'timestamp' THEN to_jsonb(NEW.timestamp_value) ELSE NULL END;
  numeric_scalar := CASE NEW.data_type WHEN 'integer' THEN NEW.integer_value WHEN 'numeric' THEN NEW.numeric_value ELSE NULL END;
  IF (param.constraints ? 'min' AND numeric_scalar<(param.constraints->>'min')::numeric)
    OR (param.constraints ? 'max' AND numeric_scalar>(param.constraints->>'max')::numeric)
    OR (param.constraints ? 'minLength' AND char_length(NEW.text_value)<(param.constraints->>'minLength')::integer)
    OR (param.constraints ? 'maxLength' AND char_length(NEW.text_value)>(param.constraints->>'maxLength')::integer)
    OR (param.constraints ? 'enum' AND NOT param.constraints->'enum' @> jsonb_build_array(scalar)) THEN
    RAISE EXCEPTION 'VALUE_CONSTRAINT_FAILED' USING ERRCODE = '23514';
  END IF;
  IF NEW.data_type='reference' THEN
    SELECT * INTO target FROM last_throne.entities WHERE id=NEW.reference_value FOR UPDATE;
    IF target.id IS NULL OR target.entity_type_id<>param.target_type_id THEN
      RAISE EXCEPTION 'REFERENCE_TARGET_TYPE' USING ERRCODE='23514';
    END IF;
    IF (param.reference_policy='same_owner' AND (source.owner_id IS NULL OR target.owner_id IS DISTINCT FROM source.owner_id))
      OR (param.reference_policy='same_run' AND (source.owner_id IS NULL OR source.run_id IS NULL OR target.owner_id IS DISTINCT FROM source.owner_id OR target.run_id IS DISTINCT FROM source.run_id))
      OR (param.reference_policy='same_checkpoint' AND (source.owner_id IS NULL OR source.run_id IS NULL OR source.checkpoint_id IS NULL OR target.owner_id IS DISTINCT FROM source.owner_id OR target.run_id IS DISTINCT FROM source.run_id OR target.checkpoint_id IS DISTINCT FROM source.checkpoint_id))
      OR (param.reference_policy='pinned_release' AND (source.pinned_release_id IS NULL OR target.owner_id IS NOT NULL OR target.release_id IS DISTINCT FROM source.pinned_release_id OR (target.status<>'published' AND source.release_id IS DISTINCT FROM target.release_id))) THEN
      RAISE EXCEPTION 'REFERENCE_SCOPE' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER values_guard BEFORE INSERT OR UPDATE OR DELETE ON last_throne.entity_parameter_values FOR EACH ROW EXECUTE FUNCTION last_throne.guard_value();

-- Deferred closure supports mutually referenced entities published in one transaction.
-- A finalized source must never retain a reference to an editable draft target.
CREATE FUNCTION last_throne.validate_final_reference_closure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM last_throne.entities source
    JOIN last_throne.entity_parameter_values v ON v.entity_id=source.id
    JOIN last_throne.entities target ON target.id=v.reference_value
    WHERE source.id=NEW.id AND source.status<>'draft' AND target.status='draft'
  ) THEN RAISE EXCEPTION 'FINAL_REFERENCE_TARGET_IS_DRAFT' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER final_reference_closure AFTER INSERT OR UPDATE ON last_throne.entities
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION last_throne.validate_final_reference_closure();

CREATE FUNCTION last_throne.guard_release() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.status='published' THEN RAISE EXCEPTION 'RELEASE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NEW.status='published' THEN
    IF TG_OP='INSERT' THEN RAISE EXCEPTION 'RELEASE_MUST_BEGIN_DRAFT' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS (SELECT 1 FROM last_throne.metadata_schema_versions WHERE version=NEW.metadata_schema_version AND status='published') THEN
      RAISE EXCEPTION 'METADATA_NOT_PUBLISHED' USING ERRCODE='23514';
    END IF;
    IF EXISTS (SELECT 1 FROM last_throne.entities WHERE release_id=NEW.id AND (status<>'published' OR metadata_schema_version<>NEW.metadata_schema_version)) THEN
      RAISE EXCEPTION 'RELEASE_ENTITIES_NOT_VALIDATED' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER releases_guard BEFORE INSERT OR UPDATE OR DELETE ON last_throne.content_releases FOR EACH ROW EXECUTE FUNCTION last_throne.guard_release();

CREATE FUNCTION last_throne.guard_channel() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM last_throne.content_releases WHERE id=NEW.release_id AND status='published') THEN
    RAISE EXCEPTION 'RELEASE_NOT_PUBLISHED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER channels_guard BEFORE INSERT OR UPDATE ON last_throne.content_release_channels FOR EACH ROW EXECUTE FUNCTION last_throne.guard_channel();

CREATE FUNCTION last_throne.publish_metadata_schema(schema_version text, hash text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(8411201);
  PERFORM 1 FROM last_throne.metadata_schema_versions WHERE version=schema_version AND status='draft' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'METADATA_DRAFT_NOT_FOUND'; END IF;
  IF NOT EXISTS (SELECT 1 FROM last_throne.metadata_schema_types WHERE metadata_schema_version=schema_version) THEN
    RAISE EXCEPTION 'METADATA_SCHEMA_EMPTY' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM last_throne.entity_parameters p JOIN last_throne.metadata_schema_types s ON s.entity_type_id=p.entity_type_id
    WHERE s.metadata_schema_version=schema_version AND p.target_type_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM last_throne.metadata_schema_types target WHERE target.metadata_schema_version=schema_version AND target.entity_type_id=p.target_type_id)
  ) THEN RAISE EXCEPTION 'REFERENCE_TYPE_OUTSIDE_METADATA_SCHEMA' USING ERRCODE='23514'; END IF;
  UPDATE last_throne.entity_parameters SET status='published' WHERE entity_type_id IN (SELECT entity_type_id FROM last_throne.metadata_schema_types WHERE metadata_schema_version=schema_version) AND status='draft';
  UPDATE last_throne.entity_types SET status='published' WHERE id IN (SELECT entity_type_id FROM last_throne.metadata_schema_types WHERE metadata_schema_version=schema_version) AND status='draft';
  UPDATE last_throne.metadata_schema_versions SET status='published', manifest_hash=hash, published_at=now() WHERE version=schema_version;
END $$;

CREATE FUNCTION last_throne.publish_content_release(release_identifier text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE current_release last_throne.content_releases;
BEGIN
  PERFORM pg_advisory_xact_lock(8411201);
  SELECT * INTO current_release FROM last_throne.content_releases WHERE id=release_identifier FOR UPDATE;
  IF current_release.id IS NULL OR current_release.status<>'draft' THEN RAISE EXCEPTION 'RELEASE_DRAFT_NOT_FOUND'; END IF;
  IF NOT EXISTS (SELECT 1 FROM last_throne.metadata_schema_versions WHERE version=current_release.metadata_schema_version AND status='published') THEN
    RAISE EXCEPTION 'METADATA_NOT_PUBLISHED' USING ERRCODE='23514';
  END IF;
  PERFORM 1 FROM last_throne.entities WHERE release_id=release_identifier FOR UPDATE;
  UPDATE last_throne.entities SET status='published' WHERE release_id=release_identifier;
  UPDATE last_throne.content_releases SET status='published', published_at=now() WHERE id=release_identifier;
END $$;

CREATE FUNCTION last_throne.activate_content_release(channel_name text, release_identifier text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO last_throne.content_release_channels(channel,release_id) VALUES(channel_name,release_identifier)
    ON CONFLICT(channel) DO UPDATE SET release_id=EXCLUDED.release_id, updated_at=now();
END $$;

-- Migrations own the schema. Runtime roles receive read access only (see db/README.md).
REVOKE ALL ON SCHEMA last_throne FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA last_throne FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA last_throne FROM PUBLIC;
