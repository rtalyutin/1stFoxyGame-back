import {readFileSync,writeFileSync} from 'node:fs';
import {forgeSeedSql} from './seed.js';
const path=new URL('../../migrations/006-forge.sql',import.meta.url),sql=forgeSeedSql();
if(process.argv.slice(2).join(' ')==='--write')writeFileSync(path,sql);else if(readFileSync(path,'utf8')!==sql)throw new Error('Forge migration drift.');
