export interface ArchivedSchoolContract {
  id: string;
  contractNumber: string;
  archivedAt: string;
  studentName: string;
  payerName: string;
  payerEmail: string;
  hasFile: boolean;
}

export function filterArchivedSchoolContracts(rows: ArchivedSchoolContract[], search: string): ArchivedSchoolContract[] {
  const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const query = normalize(search.trim());
  if (!query) return rows;
  return rows.filter(row => normalize([
    row.contractNumber, row.studentName, row.payerName, row.payerEmail,
  ].join(' ')).includes(query));
}
