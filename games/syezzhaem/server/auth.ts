import { betterAuth } from 'better-auth';
import pg from 'pg';
import nodemailer from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

export const AUTH_BASE_PATH = '/api/syezzhaem/auth';
export interface AuthMail { to: string; subject: string; text: string }
export interface Mailer { send(mail: AuthMail): Promise<void>; verify(): Promise<void>; close?(): void }
export interface AuthOptions {
  origin: string; secret: string; databaseUrl?: string; pool?: pg.Pool;
  mode?: 'production' | 'development' | 'test'; mailer: Mailer;
  /** Only isolated tests may connect using a migration owner. Never an env switch. */
  allowUnsafeTestRole?: boolean;
}

/** Mail credentials and token-bearing links never reach application logs. */
export function smtpMailer(env: NodeJS.ProcessEnv): Mailer {
  const host = env.SMTP_HOST, from = env.SMTP_FROM;
  if (!host || !from) throw new Error('SMTP_HOST and SMTP_FROM are required');
  const port = Number(env.SMTP_PORT ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SMTP_PORT');
  const transport = nodemailer.createTransport({
    host, port, secure: port === 465, requireTLS: port !== 465,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } } : {}),
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    logger: false, debug: false,
  });
  return {
    async verify() { try {await transport.verify();} catch {throw new Error('SMTP readiness verification failed');} },
    async send(mail) { await transport.sendMail({ from, ...mail }); },
    close() { transport.close(); },
  };
}

/** Explicit local development aid. No public route, no token-bearing console output. */
export function fileMailer(directory: string, mode: string): Mailer {
  if (mode !== 'development') throw new Error('File mail sink is only available in explicit development mode');
  return {
    async verify() { await mkdir(directory, { recursive: true, mode: 0o700 }); },
    async send(mail) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(join(directory, `${Date.now()}-${randomUUID()}.json`), JSON.stringify(mail), { mode: 0o600 });
    },
  };
}

export async function createAuthRuntime(options: AuthOptions) {
  const origin = new URL(options.origin);
  const mode = options.mode ?? 'production';
  if (origin.origin !== options.origin || !['http:', 'https:'].includes(origin.protocol)) throw new Error('AUTH_ORIGIN must be an exact origin');
  if (mode === 'production' && origin.protocol !== 'https:') throw new Error('Production Auth requires HTTPS');
  if (mode !== 'production' && origin.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) throw new Error('Development HTTP Auth is restricted to loopback');
  if (options.secret.length < 32) throw new Error('AUTH_SECRET must contain at least 32 characters and remain stable across API versions');
  if (!options.pool && !options.databaseUrl) throw new Error('AUTH_DATABASE_URL is required');
  if (options.allowUnsafeTestRole && mode !== 'test') throw new Error('Unsafe Auth role injection is restricted to tests');
  const pool = options.pool ?? new pg.Pool({ connectionString: options.databaseUrl, max: 5, options: '-c search_path=syezzhaem_auth', connectionTimeoutMillis: 10000 });
  const pendingMail = new Set<Promise<void>>();
  let failedMail = false;
  const deliver = (mail: AuthMail) => {
    const task = options.mailer.send(mail).catch(() => { failedMail = true; }).finally(() => pendingMail.delete(task));
    pendingMail.add(task);
  };
  try {
    const result = await pool.query<{ safe: boolean }>(`SELECT NOT r.rolsuper AND NOT r.rolbypassrls AND NOT EXISTS (SELECT 1 FROM pg_roles elevated WHERE (elevated.rolsuper OR elevated.rolbypassrls) AND pg_has_role(current_user,elevated.oid,'MEMBER')) AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('syezzhaem','syezzhaem_auth') AND pg_has_role(current_user,c.relowner,'MEMBER')) AS safe FROM pg_roles r WHERE r.rolname=current_user`);
    if (!options.allowUnsafeTestRole && !result.rows[0]?.safe) throw new Error('Auth runtime role must be non-owner, non-superuser and non-BYPASSRLS');
    await options.mailer.verify();
    const auth = betterAuth({
      appName: 'СЪЕЗЖАЕМ!', baseURL: options.origin, basePath: AUTH_BASE_PATH,
      secret: options.secret, database: pool, trustedOrigins: [options.origin],
      emailAndPassword: {
        enabled: true, requireEmailVerification: true, autoSignIn: false,
        minPasswordLength: 10, maxPasswordLength: 128,
        revokeSessionsOnPasswordReset: true,
        sendResetPassword: async ({ user, url }) => { deliver({ to: user.email, subject: 'СЪЕЗЖАЕМ! — восстановление пароля', text: `Откройте ссылку для восстановления пароля: ${url}` }); },
      },
      emailVerification: {
        sendOnSignUp: true, sendOnSignIn: true, autoSignInAfterVerification: false,
        sendVerificationEmail: async ({ user, url }) => { deliver({ to: user.email, subject: 'СЪЕЗЖАЕМ! — подтверждение почты', text: `Подтвердите адрес почты: ${url}` }); },
      },
      session: { cookieCache: { enabled: false } },
      advanced: {
        cookiePrefix: 'syezzhaem', useSecureCookies: origin.protocol === 'https:',
        defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/api/syezzhaem' },
        ipAddress: { ipAddressHeaders: ['x-real-ip'] },
      },
      rateLimit: { enabled: true, storage: 'database', window: 60, max: 100,
        // A save verifies the account before/after transport. Two saves/s already need
        // 240 session reads/min; leave room for menu/resume without weakening login limits.
        customRules: { '/get-session': { window: 60, max: 600 }, '/sign-in/email': { window: 60, max: 10 }, '/sign-up/email': { window: 60, max: 5 }, '/request-password-reset': { window: 60, max: 5 } } },
      logger: { disabled: true },
    });
    const check = async () => {
      await pool.query('SELECT id FROM syezzhaem_auth."user" LIMIT 0');
      await pool.query('SELECT id FROM syezzhaem_auth."session" LIMIT 0');
      await pool.query('SELECT id FROM syezzhaem_auth."account" LIMIT 0');
      await pool.query('SELECT id FROM syezzhaem_auth."verification" LIMIT 0');
      await pool.query('SELECT id FROM syezzhaem_auth."rateLimit" LIMIT 0');
      // The stock API awaits Better Auth's live adapter schema check before its handler.
      await auth.api.getSession({headers:new Headers()});
      if (failedMail) throw new Error('Mail delivery failed');
    };
    await check();
    return { auth, origin: options.origin, pool, check,
      async flushMail() { await Promise.all([...pendingMail]); },
      async close() { await Promise.all([...pendingMail]); options.mailer.close?.(); if (!options.pool) await pool.end(); },
    };
  } catch (error) {
    if (!options.pool) await pool.end();
    if(error instanceof Error&&['Auth runtime role must be non-owner, non-superuser and non-BYPASSRLS','SMTP readiness verification failed','Mail delivery failed'].includes(error.message))throw error;
    // Connection/SMTP failures may contain account names or server reply text.
    throw new Error('Auth initialization failed: verify database schema, runtime role and mail readiness');
  }
}
export type AuthRuntime = Awaited<ReturnType<typeof createAuthRuntime>>;
