import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { ImportType, ParsedImportRow } from './types.ts';

export type ImportParseErrorCode =
  | 'UNSUPPORTED_FILE_TYPE'
  | 'EMPTY_HEADER'
  | 'PARSE_ERROR';

export class ImportParseError extends Error {
  readonly code: ImportParseErrorCode;

  constructor(
    code: ImportParseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ImportParseError';
    this.code = code;
  }
}

type ServerImportFile = Pick<File, 'arrayBuffer' | 'name' | 'text'>;

export async function parseImportFile(
  file: ServerImportFile,
  _type: ImportType,
): Promise<ParsedImportRow[]> {
  const extension = file.name.toLocaleLowerCase('en-US').split('.').pop();
  const matrix = extension === 'csv'
    ? await parseCsv(file)
    : extension === 'xlsx'
      ? await parseXlsx(file)
      : null;

  if (!matrix) {
    throw new ImportParseError('UNSUPPORTED_FILE_TYPE', 'CSV 또는 XLSX 파일만 업로드할 수 있습니다.');
  }

  const headers = readHeaders(matrix);
  return matrix.slice(1).map((values, index) => ({
    rowNumber: index + 2,
    values: Object.fromEntries(headers.map((header, columnIndex) => [
      header,
      values[columnIndex] ?? null,
    ])),
  }));
}

async function parseCsv(file: ServerImportFile): Promise<string[][]> {
  const parsed = Papa.parse<string[]>(await file.text(), {
    skipEmptyLines: 'greedy',
  });

  if (parsed.errors.length > 0) {
    throw new ImportParseError('PARSE_ERROR', `CSV를 읽을 수 없습니다: ${parsed.errors[0]!.message}`);
  }

  return parsed.data.map((row) => row.map((value) => value ?? ''));
}

async function parseXlsx(file: ServerImportFile): Promise<string[][]> {
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: false, type: 'array' });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new ImportParseError('EMPTY_HEADER', '업로드 파일에 헤더 행이 없습니다.');
    }

    return XLSX.utils
      .sheet_to_json<unknown[]>(workbook.Sheets[firstSheetName]!, {
        header: 1,
        raw: false,
        defval: '',
      })
      .map((row) => row.map((value) => String(value)));
  } catch (error) {
    if (error instanceof ImportParseError) {
      throw error;
    }

    throw new ImportParseError('PARSE_ERROR', 'XLSX 파일을 읽을 수 없습니다.');
  }
}

function readHeaders(matrix: string[][]): string[] {
  const headerRow = matrix[0];
  if (!headerRow || headerRow.length === 0) {
    throw new ImportParseError('EMPTY_HEADER', '업로드 파일에 헤더 행이 없습니다.');
  }

  const headers = headerRow.map((header, index) => index === 0 ? header.replace(/^\uFEFF/, '') : header);
  if (headers.some((header) => header.trim().length === 0)) {
    throw new ImportParseError('EMPTY_HEADER', '비어 있는 헤더 컬럼은 사용할 수 없습니다.');
  }

  return headers;
}
