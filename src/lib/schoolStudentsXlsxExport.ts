import ExcelJS from 'exceljs';
import type { SchoolStudentExportRow } from './schoolStudentsExport';
import { schoolStudentsTableData } from './schoolStudentsExport';

const BORDER_THIN = { style: 'thin' as const, color: { argb: 'FFD1D5DB' } };
const FILL_HEADER = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF047857' } };
const FILL_ZEBRA = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF9FAFB' } };

function styleCellBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: BORDER_THIN,
    left: BORDER_THIN,
    bottom: BORDER_THIN,
    right: BORDER_THIN,
  };
}

function addStudentsSheet(
  workbook: ExcelJS.Workbook,
  rows: SchoolStudentExportRow[],
  t: (key: string) => string,
  orgName?: string,
) {
  const { headers, body } = schoolStudentsTableData(rows, t);
  const ws = workbook.addWorksheet(t('school.studentExportSheet'), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = [
    { width: 28 },
    { width: 14 },
    { width: 22 },
    { width: 22 },
    { width: 24 },
    { width: 28 },
    { width: 16 },
  ];

  if (orgName) {
    ws.mergeCells(1, 1, 1, headers.length);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = orgName;
    titleCell.font = { bold: true, size: 14 };
    ws.getRow(1).height = 24;

    ws.mergeCells(2, 1, 2, headers.length);
    const subtitleCell = ws.getCell(2, 1);
    subtitleCell.value = t('school.studentExportTitle');
    subtitleCell.font = { size: 11, color: { argb: 'FF4B5563' } };
    ws.getRow(2).height = 20;
    ws.getRow(3).height = 8;
  }

  const headerRowNum = orgName ? 4 : 1;
  const headerRow = ws.getRow(headerRowNum);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = FILL_HEADER;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    styleCellBorder(cell);
  });
  headerRow.height = 28;

  body.forEach((row, idx) => {
    const dataRow = ws.getRow(headerRowNum + 1 + idx);
    row.forEach((val, colIdx) => {
      const cell = dataRow.getCell(colIdx + 1);
      cell.value = val;
      cell.alignment = { vertical: 'middle' };
      if (idx % 2 === 1) cell.fill = FILL_ZEBRA;
      styleCellBorder(cell);
    });
    dataRow.height = 22;
  });

  if (body.length > 0) {
    ws.autoFilter = {
      from: { row: headerRowNum, column: 1 },
      to: { row: headerRowNum + body.length, column: headers.length },
    };
  }
}

export async function downloadSchoolStudentsXlsx(
  rows: SchoolStudentExportRow[],
  t: (key: string) => string,
  filename: string,
  orgName?: string,
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tutlio';
  workbook.created = new Date();
  addStudentsSheet(workbook, rows, t, orgName);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
