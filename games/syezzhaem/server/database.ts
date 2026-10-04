import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
export interface QueryResult<T> { rows: T[] }
export interface Sql { exec(sql: string): Promise<void>; query<T=Record<string,unknown>>(sql:string,params?:unknown[]):Promise<QueryResult<T>> }
export interface Database extends Sql {
 mode:'postgres'|'pglite';
 transaction<T>(owner:string,work:(tx:Sql)=>Promise<T>,readOnly?:boolean):Promise<T>;
 close():Promise<void>;
}
export interface DatabaseOptions { databaseUrl?:string; dataDir?:string; allowPrivilegedForTests?:boolean; localMigrate?:boolean }
export async function createDatabase(options:DatabaseOptions):Promise<Database> {
 if(options.databaseUrl){
  const pool=new pg.Pool({connectionString:options.databaseUrl,max:8});
  const check=await pool.query(`SELECT r.rolsuper,r.rolbypassrls,
   EXISTS(SELECT 1 FROM pg_roles elevated WHERE (elevated.rolsuper OR elevated.rolbypassrls) AND pg_has_role(r.oid,elevated.oid,'MEMBER')) AS elevated_membership,
   EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='syezzhaem' AND pg_has_role(r.oid,c.relowner,'MEMBER')) AS owns_tables
   FROM pg_roles r WHERE r.rolname=current_user`);
  if(!options.allowPrivilegedForTests&&(check.rows[0]?.rolsuper||check.rows[0]?.rolbypassrls||check.rows[0]?.elevated_membership||check.rows[0]?.owns_tables)){
   await pool.end();throw new Error('Game runtime connection must be non-owner, NOSUPERUSER and NOBYPASSRLS');
  }
  return {mode:'postgres',async exec(sql){await pool.query(sql)},async query<T>(sql:string,params:unknown[]=[]){return {rows:(await pool.query(sql,params)).rows as T[]}},
   async transaction<T>(owner:string,work:(tx:Sql)=>Promise<T>,readOnly=false){
    const client=await pool.connect();
    try{
     await client.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
     await client.query("SELECT set_config('syezzhaem.user_id',$1,true)",[owner]);
     const result=await work({async exec(sql){await client.query(sql)},async query<T>(sql:string,params:unknown[]=[]){return {rows:(await client.query(sql,params)).rows as T[]}}});
     await client.query('COMMIT');return result;
    }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
   },close:()=>pool.end()};
 }
 if(!options.localMigrate)throw new Error('DATABASE_URL required; local PGlite must be explicitly enabled');
 const db=new PGlite(options.dataDir==='memory://'?undefined:(options.dataDir??'.r1-data'));
 await db.waitReady;
 await db.exec(await readFile(new URL('../db/001-r1.sql',import.meta.url),'utf8'));
 return {mode:'pglite',async exec(sql){await db.exec(sql)},query:(sql,params=[])=>db.query(sql,params),
  transaction:(owner,work)=>db.transaction(async tx=>{await tx.query("SELECT set_config('syezzhaem.user_id',$1,true)",[owner]);return work({async exec(sql){await tx.exec(sql)},query:(sql,params=[])=>tx.query(sql,params)})}),
  close:()=>db.close()};
}
/** Operator-only migration helper. Never called by HTTP startup for PostgreSQL. */
export async function migrateGame(database:Sql):Promise<void>{
 await database.exec(await readFile(new URL('../db/001-r1.sql',import.meta.url),'utf8'));
}
