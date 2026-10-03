import { createHash } from 'node:crypto';
import { catalog, type ContentCatalog } from '../game/catalog.js';

export function contentId(key: string): string {
  const h = createHash('sha1').update(`foxy-r2-content:${key}`).digest('hex').slice(0, 32);
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20)}`;
}
const literal = (v: string | number | boolean | null): string => v === null ? 'NULL' : typeof v === 'string' ? `'${v.replaceAll("'", "''")}'` : String(v);
type Kind = 'text' | 'integer' | 'decimal' | 'reference';
interface Parameter { type: string; code: string; kind: Kind; multiple?: boolean; target?: string; unique?: boolean; minimum?: number; maximum?: number }

// The output is reviewed and checked in as immutable migration 002. Validation rejects
// a content-file edit which does not have a matching new migration/release decision.
export function contentSeedSql(c: ContentCatalog = catalog, includeMetadata = true): string {
  const lines = ['-- Generated from content/catalog.json by npm run content:generate. Do not edit applied migrations.'];
  const types = ['content-catalog','enemy-definition','weapon-definition','modifier-definition'];
  if (includeMetadata) for (const type of types) lines.push(`INSERT INTO entity_types(id,code) VALUES(${literal(contentId(`type:${type}`))},${literal(type)});`);
  const parameters: Parameter[] = [
    {type:'content-catalog',code:'catalog-version',kind:'text',unique:true},
    {type:'content-catalog',code:'rules-version',kind:'text'},
    {type:'content-catalog',code:'enemies',kind:'reference',multiple:true,target:'enemy-definition'},
    {type:'content-catalog',code:'weapons',kind:'reference',multiple:true,target:'weapon-definition'},
  ];
  const fieldCode = (key: string) => key.replace(/[A-Z]/g, x => `-${x.toLowerCase()}`);
  for (const key of Object.keys(c.rules)) parameters.push({type:'content-catalog',code:fieldCode(key),kind:['maxEnemies','maxShooters','maxBosses','maxProjectiles','bossMinKills'].includes(key)?'integer':'decimal',minimum:0});
  for (const type of ['enemy-definition','weapon-definition','modifier-definition']) parameters.push(
    {type,code:'code',kind:'text'},
    {type,code:'catalog',kind:'reference',target:'content-catalog'},
  );
  parameters.push(
    {type:'enemy-definition',code:'required-hits',kind:'integer',minimum:1},
    {type:'enemy-definition',code:'radius',kind:'decimal',minimum:0},
    {type:'enemy-definition',code:'world-speed',kind:'decimal',minimum:0},
    {type:'enemy-definition',code:'weapon',kind:'reference',target:'weapon-definition'},
    {type:'enemy-definition',code:'modifiers',kind:'reference',multiple:true,target:'modifier-definition'},
  );
  for (const key of ['telegraphSeconds','projectileSpeed','projectileRadius','projectileLifetimeSeconds','shotIntervalSeconds']) parameters.push({type:'weapon-definition',code:fieldCode(key),kind:'decimal',minimum:0});
  parameters.push({type:'weapon-definition',code:'angles-degrees',kind:'decimal',multiple:true,minimum:-90,maximum:90});
  const optional = new Set(['enemy-definition:weapon','enemy-definition:modifiers']);
  if (includeMetadata) for (const p of parameters) {
    lines.push(`INSERT INTO entity_parameters(id,entity_type_id,code,label,data_type,is_required,is_multiple,is_unique,reference_type_id,${p.kind==='integer'?'integer':'decimal'}_min,${p.kind==='integer'?'integer':'decimal'}_max) VALUES(${[
      contentId(`parameter:${p.type}:${p.code}`),contentId(`type:${p.type}`),p.code,p.code,p.kind,!optional.has(`${p.type}:${p.code}`),p.multiple??false,p.unique??false,p.target?contentId(`type:${p.target}`):null,p.minimum??null,p.maximum??null,
    ].map(literal).join(',')});`);
  }
  const objects = [{type:'content-catalog',code:c.catalogVersion},...c.enemies.map(e=>({type:'enemy-definition',code:e.code})),...c.weapons.map(w=>({type:'weapon-definition',code:w.code}))];
  const objectId = (type:string, objectCode:string) => contentId(`entity:${type}:${type==='content-catalog'?objectCode:`${c.catalogVersion}:${objectCode}`}`);
  for (const e of objects) lines.push(`INSERT INTO entities(id,entity_type_id) VALUES(${literal(objectId(e.type,e.code))},${literal(contentId(`type:${e.type}`))});`);
  function value(type: string, objectCode: string, key: string, v: string | number | boolean, position=0) {
    const p = parameters.find(x=>x.type===type&&x.code===key);
    if (!p) throw new Error(`Unknown seeded parameter ${key}`);
    const targetId = p.kind==='reference'?objectId(p.target!,String(v)):v;
    lines.push(`INSERT INTO entity_parameter_values(entity_id,parameter_id,entity_type_id,data_type,is_multiple,is_unique,position,value_${p.kind},reference_type_id) VALUES(${[
      objectId(type,objectCode),contentId(`parameter:${type}:${key}`),contentId(`type:${type}`),p.kind,p.multiple??false,p.unique??false,position,targetId,p.target?contentId(`type:${p.target}`):null,
    ].map(literal).join(',')});`);
  }
  value('content-catalog',c.catalogVersion,'catalog-version',c.catalogVersion);
  value('content-catalog',c.catalogVersion,'rules-version',c.rulesVersion);
  for (const [key,v] of Object.entries(c.rules)) value('content-catalog',c.catalogVersion,fieldCode(key),v);
  c.enemies.forEach((e,i)=>value('content-catalog',c.catalogVersion,'enemies',e.code,i));
  c.weapons.forEach((w,i)=>value('content-catalog',c.catalogVersion,'weapons',w.code,i));
  for (const e of c.enemies) {
    value('enemy-definition',e.code,'catalog',c.catalogVersion);
    value('enemy-definition',e.code,'code',e.code); value('enemy-definition',e.code,'required-hits',e.requiredHits);
    value('enemy-definition',e.code,'radius',e.radius); value('enemy-definition',e.code,'world-speed',e.worldSpeed);
    if (e.weaponCode) value('enemy-definition',e.code,'weapon',e.weaponCode);
  }
  for (const w of c.weapons) {
    value('weapon-definition',w.code,'catalog',c.catalogVersion);
    value('weapon-definition',w.code,'code',w.code);
    for (const key of ['telegraphSeconds','projectileSpeed','projectileRadius','projectileLifetimeSeconds','shotIntervalSeconds'] as const) value('weapon-definition',w.code,fieldCode(key),w[key]);
    w.anglesDegrees.forEach((a,i)=>value('weapon-definition',w.code,'angles-degrees',a,i));
  }
  for (const e of objects) lines.push(`UPDATE entities SET state='active' WHERE id=${literal(objectId(e.type,e.code))};`);
  return `${lines.join('\n')}\n`;
}
