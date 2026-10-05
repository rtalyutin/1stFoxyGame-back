-- Run as the schema/migration owner after migrations. Usage:
-- psql "$TD_DATABASE_MIGRATION_URL" -v api_role=last_throne_api -f db/r1-runtime-grants.sql
-- api_role must be dedicated, non-owner, NOSUPERUSER, NOINHERIT.
BEGIN;
-- Remove the R0 blanket read grants, including grants that would reach future tables.
REVOKE ALL ON ALL TABLES IN SCHEMA last_throne FROM :"api_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA last_throne REVOKE SELECT ON TABLES FROM :"api_role";
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA last_throne FROM :"api_role";
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA last_throne FROM PUBLIC;
-- PostgreSQL's built-in PUBLIC function EXECUTE is a global owner default.
-- A schema-local REVOKE cannot remove it. This owner belongs only to Last Throne.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
GRANT USAGE ON SCHEMA last_throne TO :"api_role";
GRANT SELECT ON TABLE
 last_throne.entity_types,
 last_throne.entity_parameters,
 last_throne.entities,
 last_throne.entity_parameter_values,
 last_throne.metadata_schema_versions,
 last_throne.metadata_schema_types,
 last_throne.content_releases,
 last_throne.content_release_channels
TO :"api_role";
GRANT EXECUTE ON FUNCTION
 last_throne.r1_guest(text),
 last_throne.r1_create_guest(text,timestamptz),
 last_throne.r1_profile(uuid),
 last_throne.r1_patch_profile(uuid,integer,jsonb),
 last_throne.r1_run(uuid,uuid),
 last_throne.r1_create_run(uuid,jsonb,jsonb,text),
 last_throne.r1_list_runs(uuid,jsonb),
 last_throne.r1_prepare_save(uuid,uuid,text,text,integer),
 last_throne.r1_commit_checkpoint(uuid,uuid,text,text,integer,jsonb),
 last_throne.r1_checkpoint(uuid,uuid),
 last_throne.r1_finish(uuid,uuid,text,text,integer,jsonb)
TO :"api_role";
COMMIT;
-- guest_sessions, save_operations, run_client_keys and schema_migrations have no direct API access.
-- Reapply this file after future migrations when a new bounded operation is intentionally allowed.
-- Do not grant INSERT/UPDATE/DELETE on EAV/auth/metadata tables or generic helper EXECUTE.
