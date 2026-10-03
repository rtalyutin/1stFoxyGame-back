import { createHash } from 'node:crypto';
import { REWARD_CATALOG, validateRewardCatalog, type RewardCatalog } from '../game/rewards.js';
import { GOLD_MAX_MILLI } from '../profile/equipment.js';

export function economyId(key: string): string {
  const hash = createHash('sha1').update(`foxy-r34-economy:${key}`).digest('hex').slice(0, 32);
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20)}`;
}
export const ECONOMY_TYPES = ['component-definition', 'reward-definition'] as const;
export const ECONOMY_PARAMETERS = [
  { type: 'component-definition', code: 'code', kind: 'text', pattern: '^(steel|ember|core)$' },
  { type: 'component-definition', code: 'label', kind: 'text' },
  { type: 'component-definition', code: 'version', kind: 'text', pattern: '^r[0-9]+[.][0-9]+$' },
  { type: 'reward-definition', code: 'code', kind: 'text', pattern: '^(normal|strong|boss)$' },
  { type: 'reward-definition', code: 'version', kind: 'text', pattern: '^r[0-9]+[.][0-9]+$' },
  { type: 'reward-definition', code: 'base-gold-milli', kind: 'decimal', minimum: '0', maximum: GOLD_MAX_MILLI },
  { type: 'reward-definition', code: 'common-drops', kind: 'integer', minimum: 0, maximum: 2 },
  { type: 'reward-definition', code: 'core-drops', kind: 'integer', minimum: 0, maximum: 1 },
  { type: 'reward-definition', code: 'steel-probability', kind: 'decimal', minimum: '0', maximum: '1' },
] as const;
const literal = (value: string | number | boolean | null) => value === null ? 'NULL' : typeof value === 'string' ? `'${value.replaceAll("'", "''")}'` : String(value);

/** Immutable migration 004 is generated from the validated source catalog. */
export function economySeedSql(input: RewardCatalog = REWARD_CATALOG, includeMetadata = true): string {
  const catalog = validateRewardCatalog(input);
  const lines = ['-- Generated from content/rewards.json by economy-generate-cli. Do not edit applied migrations.'];
  if (includeMetadata) for (const type of ECONOMY_TYPES) lines.push(`INSERT INTO entity_types(id,code) VALUES(${literal(economyId(`type:${type}`))},${literal(type)});`);
  if (includeMetadata) for (const parameter of ECONOMY_PARAMETERS) {
    const range = parameter.kind === 'text' ? ['text_min_length','text_max_length','text_pattern'] : [`${parameter.kind}_min`,`${parameter.kind}_max`];
    const bounds = parameter.kind === 'text' ? [1,128,'pattern' in parameter ? parameter.pattern : null] : [parameter.minimum, parameter.maximum];
    lines.push(`INSERT INTO entity_parameters(id,entity_type_id,code,label,data_type,is_required,is_multiple,is_unique,${range.join(',')}) VALUES(${[
      economyId(`parameter:${parameter.type}:${parameter.code}`), economyId(`type:${parameter.type}`), parameter.code, parameter.code,
      parameter.kind, true, false, false, ...bounds,
    ].map(literal).join(',')});`);
  }
  const objects = [...catalog.components.map((component) => ({ type: 'component-definition', code: component.id })), ...catalog.rewards.map((reward) => ({ type: 'reward-definition', code: reward.kind }))];
  const objectId = (type: string, code: string) => economyId(`entity:${type}:${catalog.version}:${code}`);
  for (const entity of objects) lines.push(`INSERT INTO entities(id,entity_type_id) VALUES(${literal(objectId(entity.type,entity.code))},${literal(economyId(`type:${entity.type}`))});`);
  const value = (type: string, code: string, key: string, input: string | number) => {
    const parameter = ECONOMY_PARAMETERS.find((candidate) => candidate.type === type && candidate.code === key);
    if (!parameter) throw new Error('Unknown economy parameter');
    lines.push(`INSERT INTO entity_parameter_values(entity_id,parameter_id,entity_type_id,data_type,is_multiple,is_unique,position,value_${parameter.kind}) VALUES(${[
      objectId(type,code), economyId(`parameter:${type}:${key}`), economyId(`type:${type}`), parameter.kind, false, false, 0, input,
    ].map(literal).join(',')});`);
  };
  for (const component of catalog.components) {
    value('component-definition',component.id,'code',component.id); value('component-definition',component.id,'label',component.label); value('component-definition',component.id,'version',catalog.version);
  }
  for (const reward of catalog.rewards) {
    value('reward-definition',reward.kind,'code',reward.kind); value('reward-definition',reward.kind,'version',catalog.version);
    value('reward-definition',reward.kind,'base-gold-milli',reward.baseGoldMilli);
    value('reward-definition',reward.kind,'common-drops',reward.commonDrops); value('reward-definition',reward.kind,'core-drops',reward.coreDrops); value('reward-definition',reward.kind,'steel-probability',reward.steelProbability);
  }
  // Numeric is exact but can otherwise accept fractions. Guard the money field
  // independently of callers, including a direct EntityStore/SQL write.
  if (includeMetadata) lines.push(`CREATE FUNCTION economy_validate_money() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_entity uuid; reward_value numeric;
BEGIN
  target_entity := CASE WHEN TG_OP='DELETE' THEN OLD.entity_id ELSE NEW.entity_id END;
  SELECT v.value_decimal INTO reward_value FROM entity_parameter_values v WHERE v.entity_id=target_entity AND v.parameter_id=${literal(economyId('parameter:reward-definition:base-gold-milli'))};
  IF reward_value IS NOT NULL AND (reward_value<>trunc(reward_value) OR reward_value<0 OR reward_value>${GOLD_MAX_MILLI}) THEN RAISE EXCEPTION 'Reward gold must be an exact nonnegative milli integer' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER economy_integer_gold AFTER INSERT OR UPDATE OR DELETE ON entity_parameter_values DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION economy_validate_money();
REVOKE ALL ON FUNCTION economy_validate_money() FROM PUBLIC;`);
  for (const entity of objects) lines.push(`UPDATE entities SET state='active' WHERE id=${literal(objectId(entity.type,entity.code))};`);
  return `${lines.join('\n')}\n`;
}
