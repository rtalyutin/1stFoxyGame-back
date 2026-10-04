-- One-time isolated role setup, executed by an operator with CREATEROLE.
-- Passwords and LOGIN roles are provisioned outside source control.
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='syezzhaem_migrator') THEN
  CREATE ROLE syezzhaem_migrator NOLOGIN NOSUPERUSER NOBYPASSRLS;
 END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='syezzhaem_runtime') THEN
  CREATE ROLE syezzhaem_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
 END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='syezzhaem_auth_runtime') THEN
  CREATE ROLE syezzhaem_auth_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
 END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname IN('syezzhaem_migrator','syezzhaem_runtime','syezzhaem_auth_runtime') AND (rolsuper OR rolbypassrls)) THEN RAISE EXCEPTION 'Existing game roles must be NOSUPERUSER NOBYPASSRLS'; END IF;
 IF pg_has_role('syezzhaem_runtime','syezzhaem_migrator','MEMBER') OR pg_has_role('syezzhaem_auth_runtime','syezzhaem_migrator','MEMBER') THEN RAISE EXCEPTION 'Runtime roles must not inherit migration ownership'; END IF;
END $$;
