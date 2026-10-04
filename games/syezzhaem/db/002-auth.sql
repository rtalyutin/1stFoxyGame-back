-- Better Auth 1.7.7 core schema, matching the library's stock field names.
-- Applied by syezzhaem_migrator, never by the runtime API.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='syezzhaem_auth') AND
    NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='syezzhaem_auth' AND c.relname='schema_migrations') THEN
   RAISE EXCEPTION 'Existing Auth schema has no Syezzhaem migration identity; operator readback required';
 END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS syezzhaem_auth AUTHORIZATION syezzhaem_migrator;
REVOKE ALL ON SCHEMA syezzhaem_auth FROM PUBLIC;
CREATE TABLE IF NOT EXISTS syezzhaem_auth.schema_migrations (
 version integer PRIMARY KEY, library_version text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS syezzhaem_auth."user" (
 id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
 "emailVerified" boolean NOT NULL DEFAULT false, image text,
 "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS syezzhaem_auth."session" (
 id text PRIMARY KEY, "expiresAt" timestamptz NOT NULL, token text NOT NULL UNIQUE,
 "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL,
 "ipAddress" text, "userAgent" text,
 "userId" text NOT NULL REFERENCES syezzhaem_auth."user"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS auth_session_user_idx ON syezzhaem_auth."session"("userId");
CREATE TABLE IF NOT EXISTS syezzhaem_auth."account" (
 id text PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL,
 "userId" text NOT NULL REFERENCES syezzhaem_auth."user"(id) ON DELETE CASCADE,
 "accessToken" text, "refreshToken" text, "idToken" text,
 "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz,
 scope text, password text, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_account_user_idx ON syezzhaem_auth."account"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS auth_account_provider_identity_idx ON syezzhaem_auth."account"("providerId","accountId");
CREATE TABLE IF NOT EXISTS syezzhaem_auth."verification" (
 id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL,
 "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_verification_identifier_idx ON syezzhaem_auth."verification"(identifier);
CREATE TABLE IF NOT EXISTS syezzhaem_auth."rateLimit" (
 id text PRIMARY KEY, key text NOT NULL UNIQUE, count integer NOT NULL,
 "lastRequest" bigint NOT NULL
);
GRANT USAGE ON SCHEMA syezzhaem_auth TO syezzhaem_auth_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON syezzhaem_auth."user",syezzhaem_auth."session",syezzhaem_auth."account",syezzhaem_auth."verification",syezzhaem_auth."rateLimit" TO syezzhaem_auth_runtime;
REVOKE ALL ON SCHEMA syezzhaem_auth FROM syezzhaem_runtime;
INSERT INTO syezzhaem_auth.schema_migrations(version,library_version) VALUES(1,'1.7.7') ON CONFLICT(version) DO NOTHING;
