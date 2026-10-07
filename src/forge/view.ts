import { productionRate, productionPriceGoldMilli, FORGE_COUNT_MAX, type ProductionId, type ForgeConfig, type ForgeState } from './economy.js';
export interface SettlementView {elapsedMs:number;creditedMs:number;discardedMs:number;goldMilli:string}
export interface WorkshopView {
 schemaVersion:'runner-workshop.1';balanceRevision:string;serverNowMs:number;settledAtMs:number;offlineCapSeconds:number;
 tapLevel:number;organizationLevel:number;tapGoldMilli:string;organizationPermille:number;productionRate:{numerator:string;denominator:1000};
 productions:{id:ProductionId;name:string;owned:number;rateGoldMilliPerSecond:string;nextCostGoldMilli:string|null}[];
 upgrades:{tap:{costGoldMilli:string|null;nextGoldMilli:string|null};organization:{costGoldMilli:string|null;nextPermille:number|null}};
 lastSettlement?:SettlementView;
}
const names:Record<ProductionId,string>={apprentice:'Подмастерье',smelter:'Плавильня',press:'Золотой пресс',alchemy:'Алхимическая линия'};
export function workshopView(state:ForgeState,config:ForgeConfig,revision:string,nowMs:number,settlement?:SettlementView):WorkshopView{
 return {schemaVersion:'runner-workshop.1',balanceRevision:revision,serverNowMs:nowMs,settledAtMs:state.settledAtMs,offlineCapSeconds:config.offlineCapSeconds,tapLevel:state.tapLevel,organizationLevel:state.organizationLevel,tapGoldMilli:config.tapGoldMilli[state.tapLevel]!,organizationPermille:config.organizationPermille[state.organizationLevel]!,productionRate:productionRate(config,state),
 productions:(Object.keys(names) as ProductionId[]).map(id=>({id,name:names[id],owned:state.counts[id],rateGoldMilliPerSecond:config.productions[id].rateGoldMilliPerSecond,nextCostGoldMilli:state.counts[id]>=FORGE_COUNT_MAX?null:productionPriceGoldMilli(config,id,state.counts[id])})),
 upgrades:{tap:{costGoldMilli:config.tapUpgradeCostGoldMilli[state.tapLevel]??null,nextGoldMilli:config.tapGoldMilli[state.tapLevel+1]??null},organization:{costGoldMilli:config.organizationUpgradeCostGoldMilli[state.organizationLevel]??null,nextPermille:config.organizationPermille[state.organizationLevel+1]??null}},...(settlement?{lastSettlement:settlement}:{})};
}
