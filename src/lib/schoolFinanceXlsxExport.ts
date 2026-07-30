import ExcelJS from 'exceljs';
import type { SchoolFinanceExportRow, SchoolFinanceSummary } from './schoolFinanceExport';
import { schoolFinanceTableData } from './schoolFinanceExport';

const EURO_FMT = '#,##0.00 "€"';
const PCT_FMT = '0%';

const BORDER_THIN = { style: 'thin' as const, color: { argb: 'FFD1D5DB' } };
const FILL_HEADER = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF047857' } };
const FILL_SECTION = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFECFDF5' } };
const FILL_ZEBRA = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF9FAFB' } };

function styleCellBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: BORDER_THIN,
    left: BORDER_THIN,
    bottom: BORDER_THIN,
    right: BORDER_THIN,
  };
}

function addSummarySheet(
  workbook: ExcelJS.Workbook,
  summary: SchoolFinanceSummary,
  t: (key: string, vars?: Record<string, string | number>) => string,
  orgName?: string,
) {
  const ws = workbook.addWorksheet('Suvestinė', {
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: 20 },
  });

  ws.columns = [
    { width: 36 },
    { width: 18 },
    { width: 14 },
  ];

  const paidPct = summary.totalInstallmentCount > 0
    ? summary.paidCount / summary.totalInstallmentCount
    : 0;
  const amountPct = summary.totalDue > 0 ? summary.totalPaid / summary.totalDue : 0;

  const title = orgName || t('school.financeExportTitle');
  const generatedAt = new Date().toLocaleDateString('lt-LT', { dateStyle: 'long' });

  ws.mergeCells('A1:C1');
  const orgCell = ws.getCell('A1');
  orgCell.value = title;
  orgCell.font = { bold: true, size: 16, color: { argb: 'FF111827' } };
  orgCell.alignment = { vertical: 'middle' };

  ws.mergeCells('A2:C2');
  const subtitleCell = ws.getCell('A2');
  subtitleCell.value = t('school.financeExportTitle');
  subtitleCell.font = { size: 12, color: { argb: 'FF4B5563' } };

  ws.mergeCells('A3:C3');
  const dateCell = ws.getCell('A3');
  dateCell.value = `${t('school.financeExcelGeneratedAt')}: ${generatedAt}`;
  dateCell.font = { size: 10, italic: true, color: { argb: 'FF6B7280' } };

  ws.getRow(1).height = 28;
  ws.getRow(2).height = 22;
  ws.getRow(3).height = 18;
  ws.getRow(4).height = 8;

  let rowNum = 5;
  let dataRowIdx = 0;
  const writeSection = (label: string) => {
    ws.mergeCells(rowNum, 1, rowNum, 3);
    const cell = ws.getCell(rowNum, 1);
    cell.value = label;
    cell.font = { bold: true, size: 11, color: { argb: 'FF065F46' } };
    cell.fill = FILL_SECTION;
    cell.alignment = { vertical: 'middle' };
    styleCellBorder(cell);
    ws.getRow(rowNum).height = 24;
    rowNum += 1;
  };

  const writeHeader = () => {
    const headers = [t('school.financeExcelMetric'), t('school.financeExcelValue'), t('school.financeExcelNote')];
    headers.forEach((h, idx) => {
      const cell = ws.getCell(rowNum, idx + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = FILL_HEADER;
      cell.alignment = { horizontal: idx === 1 ? 'right' : 'left', vertical: 'middle' };
      styleCellBorder(cell);
    });
    ws.getRow(rowNum).height = 22;
    rowNum += 1;
  };

  const writeRow = (
    label: string,
    value: string | number,
    note?: string | number,
    opts?: { money?: boolean; percent?: boolean },
  ) => {
    const labelCell = ws.getCell(rowNum, 1);
    const valueCell = ws.getCell(rowNum, 2);
    const noteCell = ws.getCell(rowNum, 3);

    labelCell.value = label;
    valueCell.value = value;
    noteCell.value = note ?? '';

    [labelCell, valueCell, noteCell].forEach((cell, idx) => {
      cell.alignment = {
        vertical: 'middle',
        horizontal: idx === 1 ? 'right' : 'left',
      };
      if (dataRowIdx % 2 === 1) cell.fill = FILL_ZEBRA;
      styleCellBorder(cell);
    });

    if (opts?.money) valueCell.numFmt = EURO_FMT;
    if (opts?.percent) noteCell.numFmt = PCT_FMT;

    labelCell.font = { size: 11, color: { argb: 'FF374151' } };
    valueCell.font = { bold: true, size: 11, color: { argb: 'FF111827' } };
    noteCell.font = { size: 10, color: { argb: 'FF6B7280' } };

    ws.getRow(rowNum).height = 22;
    rowNum += 1;
    dataRowIdx += 1;
  };

  writeSection(t('school.financeExcelSectionInstallments'));
  writeHeader();
  writeRow(t('school.financeSummaryInstallmentCount'), summary.totalInstallmentCount);
  writeRow(t('school.financeSummaryPaidInstallments'), summary.paidCount, paidPct, { percent: true });
  writeRow(t('school.financeSummaryUnpaidCount'), summary.unpaidCount);
  writeRow(t('school.financeFilterOverdue'), summary.overdueCount);

  rowNum += 1;
  writeSection(t('school.financeExcelSectionAmounts'));
  writeHeader();
  writeRow(t('school.financeSummaryTotalDue'), summary.totalDue, undefined, { money: true });
  writeRow(t('school.financeSummaryTotalPaid'), summary.totalPaid, amountPct, { money: true, percent: true });
  writeRow(t('school.financeSummaryOutstanding'), summary.totalOutstanding, undefined, { money: true });

  if (summary.contractsWithoutSchedule > 0) {
    rowNum += 1;
    writeSection(t('school.financeExcelSectionOther'));
    writeHeader();
    writeRow(t('school.financeSummaryNoSchedule'), summary.contractsWithoutSchedule);
  }
}

function addPaymentsSheet(
  workbook: ExcelJS.Workbook,
  rows: SchoolFinanceExportRow[],
  t: (key: string) => string,
) {
  const { headers, body } = schoolFinanceTableData(rows, t);
  const ws = workbook.addWorksheet('Mokėjimai');

  ws.columns = [
    { width: 26 },
    { width: 24 },
    { width: 30 },
    { width: 16 },
    { width: 20 },
    { width: 14 },
    { width: 10 },
    { width: 12 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
    { width: 22 },
  ];

  const headerRow = ws.addRow(headers);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF374151' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    styleCellBorder(cell);
  });

  body.forEach((row, idx) => {
    const dataRow = ws.addRow(row);
    dataRow.height = 20;
    dataRow.eachCell((cell, col) => {
      styleCellBorder(cell);
      cell.alignment = { vertical: 'middle', wrapText: col === 6 || col === 8 };
      if (idx % 2 === 1) {
        cell.fill = FILL_ZEBRA;
      }
    });
    const annualCell = dataRow.getCell(6);
    const amountCell = dataRow.getCell(8);
    if (typeof annualCell.value === 'number') annualCell.numFmt = EURO_FMT;
    if (typeof amountCell.value === 'number') amountCell.numFmt = EURO_FMT;
    dataRow.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
    dataRow.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
  });

  if (body.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: body.length + 1, column: headers.length },
    };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
}

export async function buildSchoolFinanceWorkbook(
  rows: SchoolFinanceExportRow[],
  t: (key: string, vars?: Record<string, string | number>) => string,
  summary: SchoolFinanceSummary,
  orgName?: string,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tutlio';
  workbook.created = new Date();
  addSummarySheet(workbook, summary, t, orgName);
  addPaymentsSheet(workbook, rows, t);
  return workbook;
}

export async function downloadSchoolFinanceXlsx(
  rows: SchoolFinanceExportRow[],
  t: (key: string, vars?: Record<string, string | number>) => string,
  summary: SchoolFinanceSummary,
  filename: string,
  orgName?: string,
): Promise<void> {
  const workbook = await buildSchoolFinanceWorkbook(rows, t, summary, orgName);
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
