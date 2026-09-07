/**
 * Extra-lessons contract rows in school admin UI — titles, search, fee labels.
 */

import {
  formatScheduleLabel,
  isExtraLessonsContractKind,
  parseExtraLessonsServiceType,
  type ExtraLessonsOrderSnapshot,
} from './extraLessonsContract';

export type ExtraLessonsContractRow = {
  kind?: string | null;
  order_snapshot?: unknown;
  class_group?: {
    name?: string | null;
    tutor?: { full_name?: string | null } | null;
  } | null;
};

export function parseExtraLessonsOrderSnapshot(raw: unknown): ExtraLessonsOrderSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    revision_label: String(o.revision_label || ''),
    service_name: String(o.service_name || '').trim(),
    service_type: parseExtraLessonsServiceType(o.service_type),
    platform: String(o.platform || ''),
    duration_minutes: Number(o.duration_minutes) || 0,
    schedule_slots: Array.isArray(o.schedule_slots) ? o.schedule_slots as ExtraLessonsOrderSnapshot['schedule_slots'] : [],
    schedule_label: String(o.schedule_label || '').trim(),
    start_date: String(o.start_date || ''),
    end_date: String(o.end_date || ''),
    unit_price_eur: Number(o.unit_price_eur) || 0,
    vat_status: String(o.vat_status || ''),
    base_lessons_per_month: Number(o.base_lessons_per_month) || 0,
    indicative_monthly_eur: Number(o.indicative_monthly_eur) || 0,
    individual_cancel_terms: String(o.individual_cancel_terms || ''),
    school_email: String(o.school_email || ''),
    school_phone: String(o.school_phone || ''),
    data_protection_contact: String(o.data_protection_contact || ''),
    group_id: o.group_id != null ? String(o.group_id) : null,
    group_name: o.group_name != null ? String(o.group_name) : null,
    tutor_name: o.tutor_name != null ? String(o.tutor_name) : null,
  };
}

export function extraLessonsServiceTypeLabel(
  serviceType: ExtraLessonsOrderSnapshot['service_type'],
): string {
  if (serviceType === 'individual') return 'individualus užsiėmimas';
  if (serviceType === 'group') return 'grupinis užsiėmimas';
  return '';
}

/** e.g. Emilija Bar – lietuvių kalba – grupinis užsiėmimas */
export function extraLessonsContractListTitle(
  studentName: string,
  row: ExtraLessonsContractRow,
): string {
  const name = String(studentName || '').trim() || '—';
  if (!isExtraLessonsContractKind(row.kind)) return name;
  const order = parseExtraLessonsOrderSnapshot(row.order_snapshot);
  if (!order) return name;
  const subject = order.service_name || order.group_name || row.class_group?.name || '';
  const typeLabel = extraLessonsServiceTypeLabel(order.service_type);
  const parts = [name];
  if (subject) parts.push(subject);
  if (typeLabel) parts.push(typeLabel);
  return parts.join(' – ');
}

export function extraLessonsContractListDetails(
  row: ExtraLessonsContractRow,
): { teacher: string; schedule: string; group: string } {
  const order = parseExtraLessonsOrderSnapshot(row.order_snapshot);
  const teacher = String(
    row.class_group?.tutor?.full_name || order?.tutor_name || '',
  ).trim();
  const schedule = order?.schedule_label
    || (order?.schedule_slots?.length ? formatScheduleLabel(order.schedule_slots) : '');
  const group = String(order?.group_name || row.class_group?.name || '').trim();
  return { teacher, schedule, group };
}

export function extraLessonsContractSearchText(row: ExtraLessonsContractRow): string {
  if (!isExtraLessonsContractKind(row.kind)) return '';
  const order = parseExtraLessonsOrderSnapshot(row.order_snapshot);
  const details = extraLessonsContractListDetails(row);
  return [
    order?.service_name,
    order?.group_name,
    order?.tutor_name,
    details.teacher,
    details.schedule,
    details.group,
    extraLessonsServiceTypeLabel(order?.service_type || ''),
  ].filter(Boolean).join(' ');
}
