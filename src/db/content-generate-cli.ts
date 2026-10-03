import { readFileSync, writeFileSync } from 'node:fs';
import { contentSeedSql } from './content-seed.js';
const path = new URL('../../migrations/002-content.sql', import.meta.url);
const sql = contentSeedSql();
if (process.argv.includes('--write')) writeFileSync(path, sql);
else if (readFileSync(path,'utf8') !== sql) throw new Error('Content seed migration differs from validated catalog; create a versioned content migration.');
console.log('Content source and typed seed migration match.');
