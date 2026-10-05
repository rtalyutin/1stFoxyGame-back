/** Deterministic build-time seed compiler. Writes a new additive migration, no server access. */
import { readFile,writeFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { contentRows } from '../core/content-r2.ts';
import { seedR2 } from './seed-r2.mjs';
const db=new PGlite();const query=async(sql,params=[])=>params.length?db.query(sql,params):(await db.exec(sql)).at(-1);
const pool={query,connect:async()=>({query,release(){}})};
try{
 for(const name of ['001_typed_eav.sql','002_r0_catalog.sql','003_r1_persistence.sql','004_r1_catalog.sql','005_r2_persistence.sql'])await db.exec(await readFile(new URL(`./migrations/${name}`,import.meta.url),'utf8'));
 const statements=['-- Generated from core/content-r2.ts contentRows; regenerate only before publication.','-- Full r2-meta membership is completed and frozen together with the immutable R2 catalog.'];
 const result=await seedR2(pool,contentRows(),{recordSql:sql=>statements.push(sql)});
 await writeFile(new URL('./migrations/006_r2_catalog.sql',import.meta.url),statements.join('\n')+'\n');
 console.log(JSON.stringify(result));
}finally{await db.close();}
