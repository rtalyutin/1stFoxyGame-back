import {readFileSync} from 'node:fs';
import {readProtectedProvisionFile} from './auth.js';
import {PgRepository} from './repository.js';

async function main():Promise<void>{
 const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--file'||!args[1])throw new Error('Use --file with protected provision JSON.');
 const {DATABASE_URL,DATABASE_URL_FILE}=process.env;if(Boolean(DATABASE_URL)===Boolean(DATABASE_URL_FILE))throw new Error('Set exactly one database connection input.');
 const connection=DATABASE_URL_FILE?readFileSync(DATABASE_URL_FILE,'utf8').trim():DATABASE_URL;if(!connection)throw new Error('Database connection is empty.');
 const accounts=readProtectedProvisionFile(args[1]);const repo=new PgRepository(connection);
 try{await repo.provision(accounts);console.log(`Provision complete: ${accounts.length} account identities verified. Existing balances and passwords preserved.`);}finally{await repo.close();}
}
try{await main();}catch{console.error('Account provision failed. Check protected input identities, database constraints and migrations.');process.exitCode=1;}
