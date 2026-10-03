import {writeFileSync} from 'node:fs';
import {hashPassword,isUuid,readProtectedJson,validateProvisionAccount} from './auth.js';

async function main():Promise<void>{
 const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--input-file'||args[2]!=='--output-file'||!args[1]||!args[3])throw new Error('Use --input-file and --output-file.');
 const raw=readProtectedJson(args[1]);if(!Array.isArray(raw)||raw.length<1||raw.length>1000)throw new Error('Invalid account input array.');
 const out=[];
 for(const value of raw){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid account input.');const v=value as Record<string,unknown>;if(Object.keys(v).sort().join(',')!=='accountId,login,password'||!isUuid(v.accountId)||typeof v.login!=='string'||typeof v.password!=='string')throw new Error('Invalid account input.');out.push(validateProvisionAccount({accountId:v.accountId,login:v.login,passwordHash:await hashPassword(v.password)}));}
 if(new Set(out.map(a=>a.accountId)).size!==out.length||new Set(out.map(a=>a.login)).size!==out.length)throw new Error('Duplicate account identity.');
 writeFileSync(args[3],JSON.stringify(out,null,2)+'\n',{mode:0o600,flag:'wx'});console.log(`Protected provision file prepared: ${out.length} account identities.`);
}
try{await main();}catch{console.error('Credential preparation failed. Check protected input, identities and output path.');process.exitCode=1;}
