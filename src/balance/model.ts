import { createHash } from 'node:crypto';
import { DEFAULT_CONFIG, DEFAULT_SHOP_ZONE, type SimulationConfig, type ShopZoneConfig } from '../combat/config.js';
import { RunSimulation, type SimulationRuntimeBalance } from '../combat/simulation.js';
import { EQUIPMENT_CATALOG, BASE_MODIFIERS, validateCatalog as validateEquipmentCatalog, parseGoldMilli } from '../profile/equipment.js';
import type { EquipmentCatalog, EquipmentModifiers } from '../profile/contracts.js';
import { DEFAULT_FORGE_CONFIG, validateForgeConfig, type ForgeConfig } from '../forge/economy.js';
import { REWARD_CATALOG, validateRewardCatalog, type RewardCatalog } from '../game/rewards.js';

export const BALANCE_SCHEMA = 'runner-balance.1' as const;
export const INITIAL_BALANCE_REVISION = 'ca5b0000-0000-5000-a000-000000000001';
export const BALANCE_TYPE_ID = 'ca5b0000-0000-5000-a000-000000000002';
export const BALANCE_POINTER_TYPE_ID = 'ca5b0000-0000-5000-a000-000000000003';
export const BALANCE_POINTER_ID = 'ca5b0000-0000-5000-a000-000000000004';
export type BalanceValue = number | boolean | string;
export interface BalanceParameter { key: string; label: string; group: string; unit: string; type: 'number'|'integer'|'boolean'|'goldMilli'; min?: number; max?: number; step?: number; }
export interface CompiledBalance { config: SimulationConfig; shopZone: ShopZoneConfig; equipment: EquipmentCatalog; rewards: RewardCatalog; baseModifiers: EquipmentModifiers; runtime?: SimulationRuntimeBalance; forge?: ForgeConfig & {clockEveryKills:number;clockSeconds:number}; }
export interface PinnedBalance { schemaVersion: typeof BALANCE_SCHEMA; revision: string; compiled: CompiledBalance; }
export interface BalanceDocument extends PinnedBalance { values: Record<string,BalanceValue>; parameters: readonly BalanceParameter[]; }
export class BalanceError extends Error { constructor(readonly code: string, readonly statusCode: number, message='Balance could not be processed.') { super(message); } }
const labels: Record<string,string> = {"heroSpeed": "Скорость героя", "lateralSpeed": "Скорость бокового движения", "heroRadius": "Радиус героя", "lateralLimit": "Половина ширины пути", "enemySpeed": "Скорость крипов", "enemyRadius": "Радиус обычного крипа", "breachOffset": "Расстояние прорыва за героя", "spawnDistance": "Появление впереди героя", "spawnMinSeconds": "Минимальный интервал крипов", "spawnMaxSeconds": "Максимальный интервал крипов", "maxEnemies": "Лимит врагов", "spawning": "Появление врагов и магазинов включено", "hookRange": "Дальность крюка", "hookOutboundSpeed": "Скорость полёта крюка", "hookReturnSpeed": "Скорость возврата крюка", "hookCooldown": "Базовая перезарядка крюка", "hookRadius": "Радиус крюка", "strongRadius": "Радиус стрелка", "bossRadius": "Радиус босса", "bossEnemySpeed": "Скорость босса", "bossRequiredHits": "Попадания для убийства босса", "projectileRadius": "Радиус снаряда", "projectileSpeed": "Скорость снаряда", "projectileLifetime": "Время жизни снаряда", "shooterTelegraph": "Предупреждение стрелка", "shooterInterval": "Интервал выстрелов стрелка", "bossTelegraph": "Предупреждение босса", "bossInterval": "Интервал выстрелов босса", "bossVolleyDegrees": "Угол веера босса", "maxShooters": "Лимит стрелков", "maxBosses": "Лимит боссов", "maxProjectiles": "Лимит снарядов", "shooterUnlockSeconds": "Разблокировка стрелков", "bossFirstSeconds": "Первый босс", "bossMinKills": "Убийства до первого босса", "bossMinInterval": "Минимальный интервал боссов", "bossMaxInterval": "Максимальный интервал боссов", "spawnSafetySeconds": "Запас времени для врага", "spawnRetrySeconds": "Повтор попытки появления", "lateralRadius": "Поперечное окно входа", "longitudinalRadius": "Продольное окно входа", "shopMinDistance": "Минимум между появлениями магазинов", "shopMaxDistance": "Максимум между появлениями магазинов", "shopRightProbability": "Вероятность магазина справа", "shooterChanceStart": "Начальная вероятность стрелка", "shooterChanceMax": "Максимальная вероятность стрелка", "shooterChanceRampSeconds": "Время роста вероятности на единицу", "rangeMultiplier": "Множитель дальности", "outboundSpeedMultiplier": "Множитель скорости полёта", "returnSpeedMultiplier": "Множитель скорости возврата", "cooldown": "Перезарядка крюка", "lateralSpeedMultiplier": "Множитель боковой скорости", "pierceTargets": "Цели на полёте вперёд", "returnHitTargets": "Цели на возврате", "goldMultiplierMilli": "Множитель золота ×1000", "goldMilli": "Цена в тысячных золота", "baseGoldMilli": "Золото за убийство в тысячных", "steel": "Сталь", "ember": "Жар", "core": "Ядро", "durationSeconds": "Длительность замедления", "speedMultiplier": "Множитель скорости замедленных целей", "kills": "Убийства до окончания эффекта", "commonDrops": "Обычные компоненты за убийство", "coreDrops": "Ядра за убийство", "steelProbability": "Вероятность стали среди обычных компонентов"};
const parameters: BalanceParameter[] = [];
const defaults: Record<string,BalanceValue> = {};
const integers = new Set(['maxEnemies','maxShooters','maxBosses','maxProjectiles','bossRequiredHits','bossMinKills','pierceTargets','returnHitTargets','goldMultiplierMilli','commonDrops','coreDrops','kills']);
function add(key:string,value:BalanceValue,group:string,unit:string,min=0,max=10000):void {
 const field=key.split('.').at(-1)!;
 const type=typeof value==='boolean'?'boolean':typeof value==='string'?'goldMilli':integers.has(field)||key.includes('.components.')?'integer':'number';
 const label=labels[field]??field;
 parameters.push({key,label,group,unit,type,...(type==='boolean'||type==='goldMilli'?{}:{min,max,step:type==='integer'?1:0.01})});defaults[key]=value;
}
for(const [key,value] of Object.entries(DEFAULT_CONFIG)) {
 if(key==='shopMinInterval'||key==='shopMaxInterval')continue;
 const positive=['heroSpeed','lateralSpeed','heroRadius','enemyRadius','strongRadius','bossRadius','lateralLimit','spawnDistance','spawnMinSeconds','spawnMaxSeconds','hookRange','hookOutboundSpeed','hookReturnSpeed','hookCooldown','projectileRadius','projectileSpeed','projectileLifetime','shooterTelegraph','bossTelegraph','shooterInterval','bossInterval','spawnRetrySeconds'].includes(key);
 const min=key==='bossRequiredHits'?3:key==='maxEnemies'?1:key==='maxProjectiles'?3:positive?0.01:0;
 const max=key==='projectileLifetime'?30:key==='shooterTelegraph'||key==='bossTelegraph'?10:key==='maxBosses'?1:key==='bossVolleyDegrees'?90:key==='maxEnemies'?64:key==='maxProjectiles'?256:key==='maxShooters'?64:key==='lateralLimit'?12:key.includes('Radius')?10:key==='hookCooldown'?2:1000;
 const unit=key.includes('Speed')?'м/с':key.includes('Seconds')||key.includes('Interval')||key.includes('Telegraph')||key==='projectileLifetime'||key==='hookCooldown'?'с':key.includes('Radius')||key.includes('Distance')||key.includes('Range')||key==='lateralLimit'||key==='breachOffset'?'м':key==='bossVolleyDegrees'?'°':'';
 add(`config.${key}`,value,'Движение и бой',unit,min,max);
}
for(const [key,value] of Object.entries(DEFAULT_SHOP_ZONE))add(`shopZone.${key}`,value,'Магазин','м',0.01,10);
add('runtime.shopMinDistance',250,'Магазин','м',1,100000);
add('runtime.shopMaxDistance',250,'Магазин','м',1,100000);
add('runtime.shopRightProbability',0.5,'Магазин','вероятность',0,1);
add('runtime.shooterChanceStart',0.2,'Появление стрелков','вероятность',0,1);
add('runtime.shooterChanceMax',0.45,'Появление стрелков','вероятность',0,1);
add('runtime.shooterChanceRampSeconds',1080,'Появление стрелков','с',0.01,100000);
for(const [key,value] of Object.entries(BASE_MODIFIERS)) {
 if(key==='cooldown')continue;
 add(`baseModifiers.${key}`,value,'Базовые модификаторы','',key==='returnHitTargets'?0:key==='goldMultiplierMilli'?1000:key==='pierceTargets'?1:0.01,key==='pierceTargets'?2:key==='returnHitTargets'?1:key==='goldMultiplierMilli'?2000:2);
}
function recipe(prefix:string,entry:{goldMilli:string;components:Record<string,number>},group:string):void {add(`${prefix}.goldMilli`,entry.goldMilli,group,'тысячные золота');for(const [key,value] of Object.entries(entry.components))add(`${prefix}.components.${key}`,value,group,'шт.',0,2147483647);}
for(const item of EQUIPMENT_CATALOG.items.filter(i=>i.id!=='debt_clock'))for(const level of item.levels) {
 const prefix=`items.${item.id}.levels.${level.level}`,group=`Предметы · ${item.name} · уровень ${level.level}`;
 recipe(`${prefix}.recipe`,level.recipe,group);
 for(const [key,value] of Object.entries(level.modifiers))add(`${prefix}.modifiers.${key}`,value,group,'',key==='returnHitTargets'?0:key==='goldMultiplierMilli'?1000:key==='cooldown'?0.1:1,key==='pierceTargets'?2:key==='returnHitTargets'?1:key==='goldMultiplierMilli'?2000:2);
}
for(const item of EQUIPMENT_CATALOG.consumables) {
 const prefix=`consumables.${item.id}`,group=`Расходники · ${item.name}`;recipe(`${prefix}.recipe`,item.recipe,group);
 for(const [key,value] of Object.entries(item.effect))if(key!=='type')add(`${prefix}.effect.${key}`,value as number,group,key==='durationSeconds'?'с':key==='kills'?'убийства':'',key==='durationSeconds'||key==='speedMultiplier'?0.1:key==='goldMultiplierMilli'?1000:1,key==='durationSeconds'?30:key==='speedMultiplier'?1:key==='goldMultiplierMilli'?2000:100);
}
for(const reward of REWARD_CATALOG.rewards)for(const [key,value] of Object.entries(reward))if(key!=='kind')add(`rewards.${reward.kind}.${key}`,value,'Награды · '+reward.kind,key==='baseGoldMilli'?'тысячные золота':key==='steelProbability'?'вероятность':'шт.',0,key==='commonDrops'?2:key==='coreDrops'||key==='steelProbability'?1:10000);
export const LEGACY_BALANCE_PARAMETERS: readonly BalanceParameter[] = Object.freeze(parameters.map(p=>Object.freeze({...p})));
export const LEGACY_DEFAULT_BALANCE_VALUES = Object.freeze({...defaults});
for(const item of EQUIPMENT_CATALOG.items.filter(i=>i.id==='debt_clock'))for(const level of item.levels)recipe(`items.${item.id}.levels.${level.level}.recipe`,level.recipe,`Предметы · ${item.name} · уровень ${level.level}`);
function forgeParameter(key:string,value:string|number,label:string,unit:string,min=0,max=1000000000):void{
 const type=typeof value==='string'?'goldMilli':'integer';parameters.push({key:'forge.'+key,label,group:'Мастерская',unit,type,...(type==='integer'?{min,max,step:1}:{})});defaults['forge.'+key]=value;
}
const productionNames:Record<string,string>={apprentice:'Подмастерье',smelter:'Плавильня',press:'Золотой пресс',alchemy:'Алхимическая линия'};
for(const [id,p] of Object.entries(DEFAULT_FORGE_CONFIG.productions)){
 forgeParameter(`productions.${id}.baseCostGoldMilli`,p.baseCostGoldMilli,'Базовая цена · '+productionNames[id],'тысячные золота');
 forgeParameter(`productions.${id}.rateGoldMilliPerSecond`,p.rateGoldMilliPerSecond,'Доход в секунду · '+productionNames[id],'тысячные золота/с');
}
forgeParameter('priceGrowthPermille',DEFAULT_FORGE_CONFIG.priceGrowthPermille,'Рост цены','×1000',1000,10000);
forgeParameter('offlineCapSeconds',DEFAULT_FORGE_CONFIG.offlineCapSeconds,'Лимит офлайн дохода','с',1,604800);
for(const [field,array] of Object.entries({tapGoldMilli:DEFAULT_FORGE_CONFIG.tapGoldMilli,tapUpgradeCostGoldMilli:DEFAULT_FORGE_CONFIG.tapUpgradeCostGoldMilli,organizationPermille:DEFAULT_FORGE_CONFIG.organizationPermille,organizationUpgradeCostGoldMilli:DEFAULT_FORGE_CONFIG.organizationUpgradeCostGoldMilli}))for(const [i,v] of array.entries()){
 const titles:Record<string,string>={tapGoldMilli:'Золото за удар',tapUpgradeCostGoldMilli:'Цена усиления удара',organizationPermille:'Множитель производства',organizationUpgradeCostGoldMilli:'Цена организации'};
 const level=field==='tapUpgradeCostGoldMilli'||field==='organizationUpgradeCostGoldMilli'?`уровень ${i+1}`:i===0?'базовый':`уровень ${i}`;
 forgeParameter(`${field}.${i}`,v,titles[field]+' · '+level,field==='organizationPermille'?'×1000':'тысячные золота',field==='organizationPermille'?1000:0,100000);
}
forgeParameter('clockEveryKills',10,'Убийств между бонусами Часов','убийства',1,1000);
forgeParameter('clockSeconds',30,'Доход за бонус Часов','с',1,3600);
export const BALANCE_PARAMETERS: readonly BalanceParameter[] = Object.freeze(parameters.map(p=>Object.freeze(p)));
export const DEFAULT_BALANCE_VALUES = Object.freeze(defaults);
export function parameterCode(key:string):string {return 'b-'+createHash('md5').update(key).digest('hex');}
export function validateBalanceValues(input:unknown,legacy=false):Record<string,BalanceValue> {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new BalanceError('INVALID_BALANCE',422);
 const raw=input as Record<string,unknown>,keys=Object.keys(raw);
 if(keys.length!==(legacy?LEGACY_BALANCE_PARAMETERS:parameters).length||keys.some(key=>!(key in (legacy?LEGACY_DEFAULT_BALANCE_VALUES:defaults))))throw new BalanceError('INVALID_BALANCE',422,'Missing or unknown balance parameter.');
 for(const p of legacy?LEGACY_BALANCE_PARAMETERS:parameters) {
  const value=raw[p.key];
  if(p.type==='boolean'){if(typeof value!=='boolean')throw new BalanceError('INVALID_BALANCE',422,p.key);}
  else if(p.type==='goldMilli'){try{parseGoldMilli(value);}catch{throw new BalanceError('INVALID_BALANCE',422,p.key);}}
  else if(typeof value!=='number'||!Number.isFinite(value)||value<p.min!||value>p.max!||p.type==='integer'&&!Number.isSafeInteger(value))throw new BalanceError('INVALID_BALANCE',422,p.key);
 }
 return structuredClone(raw) as Record<string,BalanceValue>;
}
export function compileBalance(input:unknown,legacy=false):CompiledBalance {
 const values=validateBalanceValues(input,legacy),config={...DEFAULT_CONFIG},shopZone={...DEFAULT_SHOP_ZONE},equipment=structuredClone({...EQUIPMENT_CATALOG,items:EQUIPMENT_CATALOG.items.filter(i=>!legacy||i.id!=='debt_clock')}),rewards=structuredClone(REWARD_CATALOG),baseModifiers={...BASE_MODIFIERS};
 for(const [key,value] of Object.entries(values)) {
  const parts=key.split('.');
  if(parts[0]==='config')(config as unknown as Record<string,unknown>)[parts[1]!]=value;
  if(parts[0]==='shopZone')(shopZone as unknown as Record<string,unknown>)[parts[1]!]=value;
  if(parts[0]==='baseModifiers')(baseModifiers as unknown as Record<string,unknown>)[parts[1]!]=value;
  if(parts[0]==='items') {
   const item=equipment.items.find(i=>i.id===parts[1])!,level=item.levels.find(l=>l.level===Number(parts[3]))!;
   if(parts[4]==='modifiers')(level.modifiers as Record<string,unknown>)[parts[5]!]=value;
   else if(parts[5]==='components')(level.recipe.components as Record<string,unknown>)[parts[6]!]=value;
   else level.recipe.goldMilli=value as string;
  }
  if(parts[0]==='consumables') {
   const item=equipment.consumables.find(i=>i.id===parts[1])!;
   if(parts[2]==='effect')(item.effect as unknown as Record<string,unknown>)[parts[3]!]=value;
   else if(parts[3]==='components')(item.recipe.components as Record<string,unknown>)[parts[4]!]=value;
   else item.recipe.goldMilli=value as string;
  }
  if(parts[0]==='rewards')(rewards.rewards.find(r=>r.kind===parts[1])! as unknown as Record<string,unknown>)[parts[2]!]=value;
 }
 baseModifiers.cooldown=config.hookCooldown;
 const slow=equipment.consumables.find(i=>i.id==='slow_dust')!.effect,collector=equipment.consumables.find(i=>i.id==='collector_vial')!.effect;
 if(slow.type!=='slow'||collector.type!=='collector')throw new BalanceError('INVALID_BALANCE',422);
 const runtime:SimulationRuntimeBalance={shopMinDistance:Number(values['runtime.shopMinDistance']),shopMaxDistance:Number(values['runtime.shopMaxDistance']),shopRightProbability:Number(values['runtime.shopRightProbability']),shooterChanceStart:Number(values['runtime.shooterChanceStart']),shooterChanceMax:Number(values['runtime.shooterChanceMax']),shooterChanceRampSeconds:Number(values['runtime.shooterChanceRampSeconds']),slowDurationSeconds:slow.durationSeconds,slowSpeedMultiplier:slow.speedMultiplier,collectorKills:collector.kills,collectorGoldMultiplierMilli:collector.goldMultiplierMilli};
 try {
  validateEquipmentCatalog(equipment);validateRewardCatalog(rewards,true);const validationSimulation=new RunSimulation('balance-validation',1,{config,shopZone,runtimeBalance:runtime});
  if(config.maxShooters>config.maxEnemies||config.maxBosses>config.maxEnemies||runtime.shopMinDistance>runtime.shopMaxDistance||runtime.shooterChanceStart>runtime.shooterChanceMax)throw new Error('Invalid cross-field values');
  if(baseModifiers.pierceTargets>1&&baseModifiers.returnHitTargets>0)throw new Error('Mutually exclusive hook effects');
  // Validate every possible equipped combination, rather than rejecting an account only after publishing.
  const choices=['weapon','body','legs','talisman'].map(slot=>[null,...equipment.items.filter(i=>i.slot===slot).flatMap(i=>i.levels.map(l=>l.modifiers))]);
  for(const weapon of choices[0]!)for(const body of choices[1]!)for(const legs of choices[2]!)for(const talisman of choices[3]!) {
   const mods={...baseModifiers};
   for(const effect of [weapon,body,legs,talisman])if(effect){for(const key of ['rangeMultiplier','outboundSpeedMultiplier','returnSpeedMultiplier','lateralSpeedMultiplier'] as const)mods[key]*=effect[key]??1;mods.cooldown=effect.cooldown??mods.cooldown;mods.pierceTargets=effect.pierceTargets??mods.pierceTargets;mods.returnHitTargets=effect.returnHitTargets??mods.returnHitTargets;mods.goldMultiplierMilli=Number(BigInt(mods.goldMultiplierMilli)*BigInt(effect.goldMultiplierMilli??1000)/1000n);}
   validationSimulation.setEquipment(mods);
  }
 }catch(error){throw new BalanceError('INVALID_BALANCE',422,error instanceof Error?error.message:'Invalid cross-field values');}
 return {config,shopZone,equipment,rewards,baseModifiers,runtime,...(legacy?{}:{forge:compileForge(values)})};
}
export function balanceDocument(revision:string,values:Record<string,BalanceValue>,legacy=false):BalanceDocument {return{schemaVersion:BALANCE_SCHEMA,revision,values:validateBalanceValues(values,legacy),parameters:legacy?LEGACY_BALANCE_PARAMETERS:BALANCE_PARAMETERS,compiled:compileBalance(values,legacy)};}
export function pinnedBalance(document:BalanceDocument):PinnedBalance {return structuredClone({schemaVersion:document.schemaVersion,revision:document.revision,compiled:document.compiled});}
export const LEGACY_BALANCE:PinnedBalance={schemaVersion:BALANCE_SCHEMA,revision:'legacy-r34.1',compiled:{config:structuredClone(DEFAULT_CONFIG),shopZone:structuredClone(DEFAULT_SHOP_ZONE),equipment:structuredClone({...EQUIPMENT_CATALOG,items:EQUIPMENT_CATALOG.items.filter(i=>i.id!=='debt_clock')}),rewards:structuredClone(REWARD_CATALOG),baseModifiers:structuredClone(BASE_MODIFIERS)}};

function compileForge(values:Record<string,BalanceValue>):ForgeConfig&{clockEveryKills:number;clockSeconds:number}{
 const config=structuredClone(DEFAULT_FORGE_CONFIG) as ForgeConfig&{clockEveryKills:number;clockSeconds:number};
 for(const [key,value] of Object.entries(values))if(key.startsWith('forge.')){
  const parts=key.slice(6).split('.');let obj=config as unknown as Record<string,unknown>;
  for(const part of parts.slice(0,-1))obj=obj[part] as Record<string,unknown>;obj[parts.at(-1)!]=value;
 }
 try{const checked=validateForgeConfig(config);return {...checked,clockEveryKills:Number(values['forge.clockEveryKills']),clockSeconds:Number(values['forge.clockSeconds'])};}catch(error){throw new BalanceError('INVALID_BALANCE',422,error instanceof Error?error.message:'Invalid workshop balance');}
}
