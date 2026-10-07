import { paymentReportDay, type PaymentReportRow, type PaymentReportStudent } from './companyPaymentReport';

type Translate = (key: string) => string;
type CellValue = string | number | null;

function studentDates(students: PaymentReportStudent[], field: 'firstLessonAt' | 'trialPaidAt' | 'firstPackagePaidAt'): string {
  if (students.length === 1) return paymentReportDay(students[0][field]) || '';
  return students.map(student => `${student.name}: ${paymentReportDay(student[field]) || '—'}`).join('; ');
}

export function paymentReportTable(rows: PaymentReportRow[], t: Translate): { headers: string[]; values: CellValue[][] } {
  const keys = ['invoiceNumber', 'student', 'payerName', 'payerEmail', 'payerPhone', 'tutor', 'type', 'packageLessons',
    'amount', 'currency', 'issueDate', 'paidAt', 'status', 'firstLesson', 'completedLessons', 'cancelledLessons',
    'noShowLessons', 'trialPaid', 'trialPaidAt', 'firstPackagePurchased', 'firstPackagePaidAt'];
  return {
    headers: keys.map(key => t(`companyPaymentReport.${key}`)),
    values: rows.map(row => [
      row.invoiceNumber || '', row.students.map(student => student.name).join('; '),
      row.payerName, row.payerEmail, row.payerPhone, row.tutors.map(tutor => tutor.name).join('; '),
      t(`companyPaymentReport.type.${row.type}`), row.packageLessons, row.amount, row.currency,
      paymentReportDay(row.issueDate) || '', paymentReportDay(row.paidAt) || '', t(`companyPaymentReport.status.${row.status}`),
      studentDates(row.students, 'firstLessonAt'), row.students.reduce((sum, student) => sum + student.completedLessons, 0),
      row.students.reduce((sum, student) => sum + student.cancelledLessons, 0),
      row.students.reduce((sum, student) => sum + student.noShowLessons, 0),
      row.students.map(student => `${row.students.length > 1 ? `${student.name}: ` : ''}${t(student.trialPaid ? 'common.yes' : 'common.no')}`).join('; '),
      studentDates(row.students, 'trialPaidAt'),
      row.students.map(student => `${row.students.length > 1 ? `${student.name}: ` : ''}${t(student.firstPackagePurchased ? 'common.yes' : 'common.no')}`).join('; '),
      studentDates(row.students, 'firstPackagePaidAt'),
    ]),
  };
}

/** CSV quoting plus formula protection for names, invoice numbers and phone numbers. */
export function paymentReportCsv(rows: PaymentReportRow[], t: Translate): string {
  const { headers, values } = paymentReportTable(rows, t);
  const cell = (value: CellValue) => {
    let text = value === null ? '' : String(value);
    if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + [headers, ...values].map(row => row.map(cell).join(';')).join('\r\n');
}

export async function paymentReportXlsx(rows: PaymentReportRow[], t: Translate): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const { headers, values } = paymentReportTable(rows, t);
  const sheet = workbook.addWorksheet(t('companyPaymentReport.title').slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }],
  });
  const widths = [26, 30, 30, 36, 22, 27, 24, 14, 16, 10, 17, 17, 26, 34, 16, 16, 13, 36, 36, 36, 36];
  const counts = new Set([7, 14, 15, 16]);
  const dates = new Set([10, 11, 13, 18, 20]);
  const horizontalAlignment = (index: number, value?: CellValue | Date) => {
    if (index === 8 || counts.has(index)) return 'right' as const;
    if (index === 9 || (dates.has(index) && (value === undefined || value instanceof Date))) return 'center' as const;
    return 'left' as const;
  };
  // Include room for word wrapping and the cell indent, rather than relying on
  // Excel's different default alignment for text, numbers and dates.
  const lineCount = (value: CellValue, index: number) => {
    const capacity = Math.max(8, widths[index] - 4);
    return String(value ?? '').split('\n').reduce((total, line) => {
      let lines = 1;
      let used = 0;
      for (const word of line.split(/\s+/)) {
        const length = word.length;
        if (used && used + 1 + length > capacity) { lines++; used = 0; }
        if (length > capacity) {
          lines += Math.floor((length - 1) / capacity);
          used = length % capacity || capacity;
        } else used += (used ? 1 : 0) + length;
      }
      return total + lines;
    }, 0);
  };
  sheet.columns = headers.map((header, index) => ({ header, width: widths[index] }));
  for (const valuesRow of values) {
    const row = sheet.addRow(valuesRow.map((value, index) => {
      // Store missing values as blank cells rather than shared empty strings,
      // which some spreadsheet readers display as their shared-string index.
      if (value === '') return null;
      return dates.has(index) && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T00:00:00Z`) : value;
    }));
    row.height = Math.min(409, Math.max(32, Math.max(...valuesRow.map(lineCount)) * 16 + 12));
    for (let index = 0; index < headers.length; index++) {
      const cell = row.getCell(index + 1);
      const horizontal = horizontalAlignment(index, cell.value as CellValue | Date);
      cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF1F2937' } };
      cell.alignment = { horizontal, vertical: 'top', wrapText: true, indent: horizontal === 'center' ? 0 : 1 };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
      if (counts.has(index)) cell.numFmt = '#,##0';
    }
    row.getCell(9).numFmt = '#,##0.00';
    // A date format on an empty or multi-student text cell can make spreadsheet
    // importers interpret its shared-string index as an Excel date serial.
    for (const index of dates) {
      const cell = row.getCell(index + 1);
      if (cell.value instanceof Date) cell.numFmt = 'yyyy-mm-dd';
    }
  }
  sheet.getRow(1).height = Math.max(42, Math.max(...headers.map(lineCount)) * 14 + 10);
  sheet.getRow(1).eachCell((cell, column) => {
    const horizontal = horizontalAlignment(column - 1);
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
    cell.alignment = { horizontal, wrapText: true, vertical: 'middle', indent: horizontal === 'center' ? 0 : 1 };
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: headers.length } };
  return await workbook.xlsx.writeBuffer() as ArrayBuffer;
}

export function downloadPaymentReport(data: BlobPart, type: 'xlsx' | 'csv', filename: string): void {
  const blob = new Blob([data], { type: type === 'xlsx'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filename}.${type}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
