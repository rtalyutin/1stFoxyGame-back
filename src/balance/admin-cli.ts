import {readFileSync} from 'node:fs';
import {PgRepository} from '../profile/repository.js';
import {isUuid} from '../profile/auth.js';
let repository:PgRepository|undefined;
try {
 const [action,accountId,...extra]=process.argv.slice(2);
 if(!['grant','revoke'].includes(action??'')||!isUuid(accountId)||extra.length)throw new Error('INVALID_ARGUMENTS');
 const {DATABASE_URL,DATABASE_URL_FILE}=process.env;
 if(Boolean(DATABASE_URL)===Boolean(DATABASE_URL_FILE))throw new Error('DATABASE_CONFIGURATION_REQUIRED');
 const connection=DATABASE_URL_FILE?readFileSync(DATABASE_URL_FILE,'utf8').trim():DATABASE_URL;
 if(!connection)throw new Error('DATABASE_CONFIGURATION_REQUIRED');
 repository=new PgRepository(connection);
 await repository.setBalanceAdmin(accountId,action==='grant');
 console.log(`Balance privilege ${action==='grant'?'granted':'revoked'} for ${accountId}.`);
} catch {
 console.error('Balance privilege change failed. Usage: balance:admin grant|revoke ACCOUNT_UUID; set exactly one owner DATABASE_URL or DATABASE_URL_FILE.');
 process.exitCode=1;
} finally {await repository?.close();}
