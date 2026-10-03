import { readFileSync, writeFileSync } from 'node:fs';
import { economySeedSql } from './economy-seed.js';

const path = new URL('../../migrations/004-economy.sql', import.meta.url);
const sql = economySeedSql();
if (process.argv.includes('--write')) writeFileSync(path, sql);
else if (readFileSync(path, 'utf8') !== sql) throw new Error('Economy migration differs from validated rewards catalog; create a versioned content migration.');
console.log('Reward source and typed economy seed migration match.');
