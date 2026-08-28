import {
  importTypes,
  type ColumnMapping,
  type ImportFieldSchema,
  type ImportSchema,
  type ImportType,
} from './types.ts';

const field = (
  standardField: string,
  rawColumn: string,
  aliases: readonly string[],
): ImportFieldSchema => ({ standardField, rawColumn, aliases });

const schemas: Record<ImportType, ImportSchema> = {
  usage_history: {
    type: 'usage_history',
    rawTable: 'usage_history',
    fields: [
      field('usage_id', 'usage_id', ['사용이력번호', '사용번호', 'usage_id']),
      field('item_id', 'item_id', ['품목코드', '품목', 'item_id', 'item code']),
      field('use_date', 'use_date', ['출고일', '사용일', 'use_date', 'usage date']),
      field('qty', 'qty', ['출고수량', '사용수량', '수량', 'qty', 'quantity']),
      field('warehouse', 'warehouse', ['창고', '출고창고', 'warehouse']),
      field('note', 'note', ['비고', '메모', 'note', 'remark']),
    ],
    requiredFields: ['item_id', 'use_date', 'qty'],
    naturalKey: ['item_id', 'use_date', 'warehouse'],
    itemReferenceFields: ['item_id'],
    supplierReferenceFields: [],
    affectsDemand: true,
  },
  inventory: {
    type: 'inventory',
    rawTable: 'inventory',
    fields: [
      field('item_id', '품목코드', ['품목코드', '품목', 'item_id', 'item code']),
      field('warehouse', '창고', ['창고', 'warehouse']),
      field('current_stock', '현재고', ['현재고', '재고수량', 'current_stock', 'stock']),
      field('as_of_date', '기준일자', ['기준일자', '재고기준일', 'as_of_date', 'snapshot date']),
      field('safety_stock', '안전재고', ['안전재고', 'safety_stock']),
    ],
    requiredFields: ['item_id', 'warehouse', 'current_stock', 'as_of_date'],
    naturalKey: ['item_id', 'warehouse', 'as_of_date'],
    itemReferenceFields: ['item_id'],
    supplierReferenceFields: [],
    affectsDemand: false,
  },
  item_master: {
    type: 'item_master',
    rawTable: 'item_master',
    fields: [
      field('item_id', '품목코드', ['품목코드', '품목', 'item_id', 'item code']),
      field('item_name', '품목명', ['품목명', 'item_name', 'item name']),
      field('item_type', '품목구분', ['품목구분', '품목유형', 'item_type', 'item type']),
      field('unit', '단위', ['단위', 'unit']),
      field('standard_price', '표준단가', ['표준단가', '단가', 'standard_price', 'unit price']),
      field('is_active', '사용여부', ['사용여부', '활성여부', 'is_active', 'active']),
      field('supplier_id', 'supplier_id', ['공급업체코드', 'supplier_id', 'supplier code']),
    ],
    requiredFields: ['item_id', 'item_name'],
    naturalKey: ['item_id'],
    itemReferenceFields: [],
    supplierReferenceFields: ['supplier_id'],
    affectsDemand: false,
  },
  supplier_master: {
    type: 'supplier_master',
    rawTable: 'supplier_master',
    fields: [
      field('supplier_id', '공급업체코드', ['공급업체코드', 'supplier_id', 'supplier code']),
      field('supplier_name', '공급업체명', ['공급업체명', '공급업체', 'supplier_name', 'supplier name']),
      field('country', '국가', ['국가', 'country']),
      field('standard_lead_time_days', '표준리드타임(일)', ['표준리드타임(일)', '표준리드타임', 'standard_lead_time_days', 'lead time']),
      field('manager', '담당자', ['담당자', 'manager', 'contact']),
      field('is_active', '사용여부', ['사용여부', '활성여부', 'is_active', 'active']),
    ],
    requiredFields: ['supplier_id', 'supplier_name'],
    naturalKey: ['supplier_id'],
    itemReferenceFields: [],
    supplierReferenceFields: [],
    affectsDemand: false,
  },
  purchase_order: {
    type: 'purchase_order',
    rawTable: 'purchase_order',
    fields: [
      field('po_no', '발주번호', ['발주번호', 'po_no', 'po number']),
      field('order_date', '발주일', ['발주일', 'order_date', 'po date']),
      field('supplier_name', '공급업체', ['공급업체', '공급업체명', 'supplier_name', 'supplier']),
      field('item_id', '품목코드', ['품목코드', '품목', 'item_id', 'item code']),
      field('qty', '발주수량', ['발주수량', '수량', 'qty', 'quantity']),
      field('unit_price', '단가', ['단가', 'unit_price', 'price']),
      field('due_date', '납기예정일', ['납기예정일', '납기일', 'due_date', 'due date']),
      field('buyer', '발주담당', ['발주담당', '담당자', 'buyer']),
    ],
    requiredFields: ['po_no', 'order_date', 'supplier_name', 'item_id', 'qty'],
    naturalKey: ['po_no', 'item_id'],
    itemReferenceFields: ['item_id'],
    supplierReferenceFields: ['supplier_name'],
    affectsDemand: false,
  },
  goods_receipt: {
    type: 'goods_receipt',
    rawTable: 'goods_receipt',
    fields: [
      field('receipt_no', '입고번호', ['입고번호', 'receipt_no', 'receipt number']),
      field('po_no', '발주번호', ['발주번호', 'po_no', 'po number']),
      field('item_id', '품목코드', ['품목코드', '품목', 'item_id', 'item code']),
      field('qty', '입고수량', ['입고수량', '수량', 'qty', 'quantity']),
      field('receipt_date', '입고일', ['입고일', 'receipt_date', 'receipt date']),
      field('warehouse', '입고창고', ['입고창고', '창고', 'warehouse']),
    ],
    requiredFields: ['receipt_no', 'po_no', 'item_id', 'qty', 'receipt_date'],
    naturalKey: ['receipt_no', 'item_id'],
    itemReferenceFields: ['item_id'],
    supplierReferenceFields: [],
    affectsDemand: false,
  },
  sales_order: {
    type: 'sales_order',
    rawTable: 'sales_order',
    fields: [
      field('order_no', 'order_no', ['수주번호', '주문번호', 'order_no', 'sales order']),
      field('line_no', 'line_no', ['라인번호', '순번', 'line_no', 'line number']),
      field('order_date', 'order_date', ['수주일', '주문일', 'order_date', 'order date']),
      field('requested_date', 'requested_date', ['납품요청일', 'requested_date', 'requested date']),
      field('item_id', 'item_id', ['품목코드', '품목', 'item_id', 'item code']),
      field('qty', 'qty', ['수주수량', '주문수량', '수량', 'qty', 'quantity']),
      field('status', 'status', ['상태', 'status']),
      field('customer_name', 'customer_name', ['고객명', '거래처', 'customer_name', 'customer']),
    ],
    requiredFields: ['order_no', 'line_no', 'order_date', 'item_id', 'qty'],
    naturalKey: ['order_no', 'line_no'],
    itemReferenceFields: ['item_id'],
    supplierReferenceFields: [],
    affectsDemand: true,
  },
  business_event: {
    type: 'business_event',
    rawTable: 'business_event',
    fields: [
      field('event_date', 'event_date', ['행사일', '이벤트일', 'event_date', 'event date']),
      field('event_type', 'event_type', ['행사유형', '이벤트유형', 'event_type', 'event type']),
      field('item_id', 'item_id', ['품목코드', '품목', 'item_id', 'item code']),
      field('qty', 'qty', ['수량', 'qty', 'quantity']),
      field('note', 'note', ['비고', '메모', 'note', 'remark']),
    ],
    requiredFields: ['event_date', 'event_type'],
    naturalKey: ['event_date', 'event_type', 'item_id'],
    itemReferenceFields: ['item_id'],
    supplierReferenceFields: [],
    affectsDemand: true,
  },
};

export function getImportSchema(type: ImportType): ImportSchema {
  if (!(type in schemas)) {
    throw new Error(`지원하지 않는 Import 타입: ${type}`);
  }

  return schemas[type];
}

const normalizeHeader = (header: string) => header.trim().toLocaleLowerCase('ko-KR');

export function suggestColumnMapping(type: ImportType, headers: readonly string[]): ColumnMapping {
  const headerByNormalizedValue = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const mapping: ColumnMapping = {};

  for (const importField of getImportSchema(type).fields) {
    const matchedAlias = importField.aliases.find((alias) => headerByNormalizedValue.has(normalizeHeader(alias)));
    if (matchedAlias) {
      mapping[importField.standardField] = headerByNormalizedValue.get(normalizeHeader(matchedAlias))!;
    }
  }

  return mapping;
}

/**
 * 검증 전 동일한 source header가 둘 이상의 표준 필드에 연결되었는지 확인한다.
 * 공백과 대소문자만 다른 header는 같은 source header로 취급한다.
 */
export function findDuplicateSourceHeaders(mapping: ColumnMapping): string[] {
  const sourceHeaders = new Map<string, string>();
  const duplicates = new Set<string>();

  for (const sourceHeader of Object.values(mapping)) {
    const normalizedHeader = normalizeHeader(sourceHeader);
    const firstHeader = sourceHeaders.get(normalizedHeader);

    if (firstHeader) {
      duplicates.add(firstHeader);
    } else {
      sourceHeaders.set(normalizedHeader, sourceHeader);
    }
  }

  return Array.from(duplicates);
}

export { importTypes };
