// Stable IDs for new R2 revision2 metadata/content.
import {createHash} from 'node:crypto';
export function stableId(key){const d=createHash('sha256').update('last-throne:r2:'+key).digest().subarray(0,16);d[6]=(d[6]&15)|80;d[8]=(d[8]&63)|128;const h=d.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
