import {readFileSync} from 'node:fs';
import {hashPassword,isUuid,readProtectedJson} from './auth.js';
import {PgRepository} from './repository.js';

async function main():Promise<void>{
 const args=process.argv.slice(2);if(args.length!==3||args[0]!=='--rotate'||args[1]!=='--file'||!args[2])throw new Error('Password rotation requires --rotate --file protected.json.');
 const value=readProtectedJson(args[2]);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid rotation input.');
 const v=value as Record<string,unknown>;if(Object.keys(v).sort().join(',')!=='accountId,password'||!isUuid(v.accountId)||typeof v.password!=='string')throw new Error('Invalid rotation input.');
 const {DATABASE_URL,DATABASE_URL_FILE}=process.env;if(Boolean(DATABASE_URL)===Boolean(DATABASE_URL_FILE))throw new Error('Set exactly one database connection input.');
 const connection=DATABASE_URL_FILE?readFileSync(DATABASE_URL_FILE,'utf8').trim():DATABASE_URL;if(!connection)throw new Error('Database connection is empty.');
 const hash=await hashPassword(v.password),repo=new PgRepository(connection);
 try{await repo.rotatePassword(v.accountId,hash);console.log('Password rotated; prior sessions revoked.');}finally{await repo.close();}
}
try{await main();}catch{console.error('Password rotation failed. Check explicit rotation input and account identity.');process.exitCode=1;}
