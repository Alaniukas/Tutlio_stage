import ExcelJS from 'exceljs';
import { buildConsultationExportRows, consultationExportHeaders } from './schoolConsultationsExport.js';

export async function downloadSchoolConsultationsXlsx(input: {
  students: Array<Record<string, unknown>>;
  consultations: Array<Record<string, unknown>>;
  schoolYear: string;
  t: (key: string) => string;
  orgName?: string;
}) {
  const rows = buildConsultationExportRows({
    students: input.students as any,
    consultations: input.consultations,
    schoolYear: input.schoolYear,
  });
  const headers = consultationExportHeaders(input.t);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Konsultacijos');
  sheet.addRow(headers);
  for (const r of rows) {
    sheet.addRow([
      r.studentName,
      r.grade,
      r.usLimit,
      r.usUsed,
      r.usReserved,
      r.usRemaining,
      `${r.speechUsed}/${r.speechQuota}`,
      `${r.psychologistUsed}/${r.psychologistQuota}`,
      `${r.specialPedagogueUsed}/${r.specialPedagogueQuota}`,
      `${r.additionalHelpUsed}/${r.additionalHelpQuota}`,
      r.paidHelpVisits,
      r.lateCancels,
    ]);
  }
  sheet.getRow(1).font = { bold: true };
  const buf = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `konsultacijos-${input.schoolYear.replace('/', '-')}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
