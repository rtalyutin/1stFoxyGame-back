import {createHash,randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {closeSync,constants,fstatSync,openSync,readFileSync} from 'node:fs';

export interface ProvisionAccount {accountId:string;login:string;passwordHash:string}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PASSWORD_HASH_PATTERN=/^scrypt:16384:8:1:[0-9a-f]{32}:[0-9a-f]{128}$/;
export const isUuid=(value:unknown):value is string=>typeof value==='string'&&uuid.test(value);
export const hashToken=(token:string):string=>createHash('sha256').update(token).digest('hex');
export const newSessionToken=():string=>randomBytes(32).toString('hex');
export const newCsrfToken=():string=>randomBytes(32).toString('hex');
function derive(password:string,salt:Buffer):Promise<Buffer> {
 return new Promise((resolve,reject)=>scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));
}
export async function hashPassword(password:string):Promise<string> {
 if(typeof password!=='string'||password.length<12||password.length>256)throw new Error('Password must contain 12 to 256 characters.');
 const salt=randomBytes(16);return `scrypt:16384:8:1:${salt.toString('hex')}:${(await derive(password,salt)).toString('hex')}`;
}
export async function verifyPassword(password:string,passwordHash:string):Promise<boolean> {
 if(typeof password!=='string'||password.length<12||password.length>256||!PASSWORD_HASH_PATTERN.test(passwordHash))return false;
 const parts=passwordHash.split(':');const actual=await derive(password,Buffer.from(parts[4]!,'hex'));
 return timingSafeEqual(actual,Buffer.from(parts[5]!,'hex'));
}
export async function verifyDummyPassword(password:string):Promise<false> {
 await derive(typeof password==='string'&&password.length<=256?password:'',Buffer.alloc(16));return false;
}
// The operator's input is not logged and cannot be a symlink or readable by
// another OS user. Both 0600 and read-only 0400 are accepted.
export function readProtectedJson(path:string):unknown {
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try {
  const stat=fstatSync(fd);
  if(!stat.isFile()||(stat.mode&0o077)!==0||(stat.mode&0o700)!==0o600&&(stat.mode&0o700)!==0o400)throw new Error('Credential input must be a regular protected file (0600 or 0400).');
  if(stat.size>1024*1024)throw new Error('Credential input is too large.');
  return JSON.parse(readFileSync(fd,'utf8')) as unknown;
 } finally {closeSync(fd);}
}
export function validateProvisionAccount(value:unknown):ProvisionAccount {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid provision account.');
 const v=value as Record<string,unknown>;
 if(Object.keys(v).sort().join(',')!=='accountId,login,passwordHash'||!isUuid(v.accountId)||typeof v.login!=='string'||! /^[a-z0-9][a-z0-9._-]{2,63}$/.test(v.login)||typeof v.passwordHash!=='string'||!PASSWORD_HASH_PATTERN.test(v.passwordHash))throw new Error('Invalid provision account.');
 return {accountId:v.accountId,login:v.login,passwordHash:v.passwordHash};
}
export function readProtectedProvisionFile(path:string):ProvisionAccount[] {
 const raw=readProtectedJson(path);if(!Array.isArray(raw)||raw.length<1||raw.length>1000)throw new Error('Provision input must be an account array.');
 const entries=raw.map(validateProvisionAccount);
 if(new Set(entries.map(v=>v.accountId)).size!==entries.length||new Set(entries.map(v=>v.login)).size!==entries.length)throw new Error('Duplicate provision account identity or login.');
 return entries;
}
