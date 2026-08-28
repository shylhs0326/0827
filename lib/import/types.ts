export const importTypes = [
  'usage_history',
  'inventory',
  'item_master',
  'supplier_master',
  'purchase_order',
  'goods_receipt',
  'sales_order',
  'business_event',
] as const;

export type ImportType = (typeof importTypes)[number];

export const importModes = ['append', 'upsert', 'replace'] as const;
export type ImportMode = (typeof importModes)[number];

export const validationSeverities = ['SUCCESS', 'WARNING', 'ERROR'] as const;
export type ValidationSeverity = (typeof validationSeverities)[number];

export type ParsedImportRow = {
  rowNumber: number;
  values: Record<string, string | null>;
};

export type ColumnMapping = Record<string, string>;

export type ImportFieldSchema = {
  standardField: string;
  rawColumn: string;
  aliases: readonly string[];
};

export type ImportSchema = {
  type: ImportType;
  rawTable: string;
  fields: readonly ImportFieldSchema[];
  requiredFields: readonly string[];
  naturalKey: readonly string[];
  itemReferenceFields: readonly string[];
  supplierReferenceFields: readonly string[];
  affectsDemand: boolean;
};
