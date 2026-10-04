/** Game-data operator recovery, excluding Auth credentials. Never invoked by HTTP. */
import pg from 'pg';
import {readFile,open,link,unlink} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {exportGame,restoreGame,rebuildProjections,type GameBackup} from './r1-recovery.ts';
const [action,filename]=process.argv.slice(2),url=process.env.RECOVERY_DATABASE_URL;
if(!url||!['export','restore','rebuild'].includes(action)||action!=='rebuild'&&!filename)throw new Error('Usage: RECOVERY_DATABASE_URL=… node --import tsx server/recovery-cli.ts export|restore FILE or rebuild');
if(url===process.env.DATABASE_URL||url===process.env.AUTH_DATABASE_URL)throw new Error('Recovery requires separate operator credentials');
const pool=new pg.Pool({connectionString:url,max:1}),client=await pool.connect();
let temporary:string|undefined;
try{
 await client.query(action==='export'?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
 if(action!=='export')await client.query("SELECT pg_advisory_xact_lock(hashtextextended('syezzhaem-migrations',0))");
 const tx={async exec(sql:string){await client.query(sql)},async query<T>(sql:string,params:unknown[]=[]){return{rows:(await client.query(sql,params)).rows as T[]}}};
 if(action==='export'){
  const backup=await exportGame(tx),path=resolve(filename);temporary=`${path}.partial-${process.pid}`;
  const file=await open(temporary,'wx',0o600);try{await file.writeFile(JSON.stringify(backup));await file.sync()}finally{await file.close()}
  // Hard-link publication refuses an existing target and exposes only a complete file.
  await link(temporary,path);await unlink(temporary);temporary=undefined;const directory=await open(dirname(path),'r');try{await directory.sync()}finally{await directory.close()}
 }else if(action==='restore')await restoreGame(tx,JSON.parse(await readFile(resolve(filename),'utf8')) as GameBackup);
 else await rebuildProjections(tx);
 await client.query('COMMIT');console.log(`Game EAV ${action} completed; Auth and release catalog must be backed up separately`);
}catch(error){await client.query('ROLLBACK');throw error}finally{if(temporary)await unlink(temporary).catch(()=>{});client.release();await pool.end()}
