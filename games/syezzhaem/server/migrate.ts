/** Operator entry point: explicit separate credentials, one atomic additive migration. */
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {seedR1Metadata} from './r1-metadata.ts';
const url=process.env.MIGRATION_DATABASE_URL;
if(!url)throw new Error('MIGRATION_DATABASE_URL is required for explicit operator migration');
if(url===process.env.DATABASE_URL||url===process.env.AUTH_DATABASE_URL)throw new Error('Migration credentials must be separate from runtime credentials');
const pool=new pg.Pool({connectionString:url,max:1}),client=await pool.connect();
try{
 await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtextextended('syezzhaem-migrations',0))");
 const namespaces=await client.query(`SELECT nspname FROM pg_namespace WHERE nspname IN('syezzhaem','syezzhaem_auth')`);
 for(const {nspname}of namespaces.rows){const known=await client.query('SELECT to_regclass($1) AS marker',[`${nspname}.schema_migrations`]);if(!known.rows[0]?.marker)throw new Error(`Refusing existing unrecognized namespace: ${nspname}`)}
 for(const name of ['000-roles.sql','001-r1.sql','002-auth.sql'])await client.query(await readFile(new URL(`../db/${name}`,import.meta.url),'utf8'));
 await seedR1Metadata({async exec(sql){await client.query(sql)},async query<T>(sql:string,params:unknown[]=[]){return{rows:(await client.query(sql,params)).rows as T[]}}});
 await client.query('COMMIT');console.log('R1/R2 additive game/Auth metadata and immutable content verified');
}catch(error){await client.query('ROLLBACK');throw error}finally{client.release();await pool.end()}
