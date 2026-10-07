import { isSchoolGroupMeeting, type SchoolTutorPayRow } from './schoolTutorLessonPay.js';

export type SchoolTutorInvoiceActivityRow = Pick<
  SchoolTutorPayRow,
  'class_group_id' | 'subject_is_group' | 'subjects' | 'start_time'
> & {
  class_group?: { name?: string | null; calendar_name?: string | null } | Array<{
    name?: string | null;
    calendar_name?: string | null;
  }> | null;
  group_name?: string | null;
};

function relatedClassGroup(
  row: SchoolTutorInvoiceActivityRow,
): { name?: string | null; calendar_name?: string | null } | null {
  const group = row.class_group;
  if (Array.isArray(group)) return group[0] ?? null;
  return group ?? null;
}

/** Service or group label shown on school teacher pay invoices. */
export function schoolTutorInvoiceActivityName(row: SchoolTutorInvoiceActivityRow): string {
  if (row.class_group_id) {
    const group = relatedClassGroup(row);
    const name = group?.calendar_name || group?.name || row.group_name;
    if (name) return String(name);
  }
  const subject = row.subjects;
  const subjectName = subject && typeof subject === 'object' && 'name' in subject ? subject.name : null;
  return String(subjectName || 'Užsiėmimas');
}

export function schoolTutorInvoiceKindLabel(
  row: Pick<SchoolTutorPayRow, 'class_group_id' | 'subject_is_group' | 'subjects'>,
  labels: { group: string; individual: string },
): string {
  return isSchoolGroupMeeting(row) ? labels.group : labels.individual;
}

export function schoolTutorInvoiceLineDescription(
  row: SchoolTutorInvoiceActivityRow,
  options: {
    includeDate?: boolean;
    dateLocale?: string;
    groupLabel?: string;
    individualLabel?: string;
  } = {},
): string {
  const includeDate = options.includeDate !== false;
  const dateLocale = options.dateLocale || 'lt-LT';
  const kind = schoolTutorInvoiceKindLabel(row, {
    group: options.groupLabel || 'Grupinis užsiėmimas',
    individual: options.individualLabel || 'Individualus užsiėmimas',
  });
  const name = schoolTutorInvoiceActivityName(row);
  const base = `${kind}: ${name}`;
  if (!includeDate) return base;
  const instant = Date.parse(row.start_time || '');
  const date = Number.isFinite(instant)
    ? new Date(instant).toLocaleDateString(dateLocale)
    : '';
  return date ? `${base} (${date})` : base;
}

export function schoolTutorInvoiceLineGroupKey(row: SchoolTutorInvoiceActivityRow): string {
  const kind = isSchoolGroupMeeting(row) ? 'group' : 'individual';
  return `${kind}|${schoolTutorInvoiceActivityName(row)}`;
}
