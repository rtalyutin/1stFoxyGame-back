import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';

export type TypedValue =
  | {type:'text';value:string} | {type:'integer';value:bigint} | {type:'decimal';value:string}
  | {type:'boolean';value:boolean} | {type:'timestamp';value:Date} | {type:'reference';value:string};

// The store works with a transaction-owned Client. DB constraints and deferred
// triggers remain authoritative for direct writes and metadata migrations as well.
export class EntityStore {
  constructor(private readonly client: Client) {}
  async create(typeCode: string, id=randomUUID()): Promise<string> {
    const result = await this.client.query<{id:string}>('INSERT INTO entities(id,entity_type_id) SELECT $1,id FROM entity_types WHERE code=$2 AND archived_at IS NULL RETURNING id',[id,typeCode]);
    if (!result.rowCount) throw new Error('Unknown or archived entity type');
    return id;
  }
  async set(entityId: string, parameterCode: string, value: TypedValue, position=0): Promise<void> {
    const found = await this.client.query<{id:string;entity_type_id:string;data_type:string;is_multiple:boolean;is_unique:boolean;reference_type_id:string|null}>(
      `SELECT p.id,p.entity_type_id,p.data_type,p.is_multiple,p.is_unique,p.reference_type_id
       FROM entities e JOIN entity_parameters p ON p.entity_type_id=e.entity_type_id
       WHERE e.id=$1 AND p.code=$2 AND p.archived_at IS NULL`,[entityId,parameterCode]);
    const p=found.rows[0];
    if (!p || p.data_type!==value.type) throw new Error('Unknown parameter or wrong value type');
    // Column identifier comes only from this closed union, never from caller text.
    const columns = {text:'value_text',integer:'value_integer',decimal:'value_decimal',boolean:'value_boolean',timestamp:'value_timestamp',reference:'value_reference'} as const;
    if (!(value.type in columns)) throw new Error('Unknown value type');
    await this.client.query(
      `INSERT INTO entity_parameter_values(entity_id,parameter_id,entity_type_id,data_type,is_multiple,is_unique,position,${columns[value.type]},reference_type_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(entity_id,parameter_id,position) DO UPDATE SET
         value_text=EXCLUDED.value_text,value_integer=EXCLUDED.value_integer,value_decimal=EXCLUDED.value_decimal,
         value_boolean=EXCLUDED.value_boolean,value_timestamp=EXCLUDED.value_timestamp,value_reference=EXCLUDED.value_reference,
         reference_type_id=EXCLUDED.reference_type_id`,
      [entityId,p.id,p.entity_type_id,p.data_type,p.is_multiple,p.is_unique,position,value.type==='integer'?value.value.toString():value.value,p.reference_type_id]);
  }
  async publish(entityId: string): Promise<void> {
    const result=await this.client.query("UPDATE entities SET state='active',revision=revision+1,updated_at=now() WHERE id=$1 AND state='draft'",[entityId]);
    if (!result.rowCount) throw new Error('Object is missing or not a draft');
  }
}
