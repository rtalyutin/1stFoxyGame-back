import {readFileSync,writeFileSync} from 'node:fs';
import {balanceSeedSql} from './seed.js';
const path=new URL('../../migrations/005-balance.sql',import.meta.url),sql=balanceSeedSql();
if(process.argv.slice(2).join(' ')==='--write')writeFileSync(path,sql);else if(readFileSync(path,'utf8')!==sql)throw new Error('Balance migration drift.');
