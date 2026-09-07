export type PvmLessonDetail = {
  subject: string;
  price: number;
  datetime: string;
};

export type PvmInvoicePdfMeta = {
  layout: 'pvm_education';
  notes: string[];
  lessonDetails: PvmLessonDetail[];
  hidePlatformFooter: true;
};

export function orgHasPvmEducationInvoice(features: unknown): boolean {
  return !!features && typeof features === 'object' && !Array.isArray(features)
    && (features as Record<string, unknown>).pvm_education_invoice === true;
}

export function formatLessonDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

export function formatStudentGradeNote(grade: string | null | undefined): string | null {
  const g = (grade || '').trim();
  if (!g) return null;
  if (/klas/i.test(g)) return g;
  return `${g} klasė`;
}

export function buildEducationNotes(studentName: string, grade?: string | null): string[] {
  const name = (studentName || '').trim() || 'mokinys';
  const gradePart = formatStudentGradeNote(grade);
  const studentClause = gradePart ? `${name} (${gradePart})` : name;
  return [
    `Pastaba: Mokymo paslaugos pagal bendrojo ugdymo programas suteiktos mokiniui ${studentClause}.`,
    'Sąskaita išrašyta vadovaujantis LR PVM įstatymo 22 straipsniu.',
  ];
}

export function buildLessonDetails(sessions: Array<{
  start_time?: string;
  price?: number;
  subjects?: { name?: string } | null;
}>): PvmLessonDetail[] {
  return [...sessions]
    .sort((a, b) => new Date(a.start_time || 0).getTime() - new Date(b.start_time || 0).getTime())
    .map((s) => ({
      subject: (s.subjects as { name?: string } | null)?.name || 'Pamoka',
      price: Math.round((Number(s.price) || 0) * 100) / 100,
      datetime: formatLessonDateTime(String(s.start_time || '')),
    }));
}

export function groupSessionsByStudent<T extends { student_id?: string | null }>(
  sessions: T[],
): T[][] {
  const map = new Map<string, T[]>();
  for (const s of sessions) {
    const key = s.student_id || '_none';
    const list = map.get(key);
    if (list) list.push(s);
    else map.set(key, [s]);
  }
  return [...map.values()];
}

export function buildPvmPdfMeta(
  studentName: string,
  grade: string | null | undefined,
  sessions: Array<{ start_time?: string; price?: number; subjects?: { name?: string } | null }>,
): PvmInvoicePdfMeta {
  return {
    layout: 'pvm_education',
    notes: buildEducationNotes(studentName, grade),
    lessonDetails: buildLessonDetails(sessions),
    hidePlatformFooter: true,
  };
}

export function parsePvmPdfMeta(raw: unknown): PvmInvoicePdfMeta | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.layout !== 'pvm_education') return null;
  return {
    layout: 'pvm_education',
    notes: Array.isArray(obj.notes) ? obj.notes.map((n) => String(n)) : [],
    lessonDetails: Array.isArray(obj.lessonDetails)
      ? obj.lessonDetails.map((row) => {
          const r = (row || {}) as Record<string, unknown>;
          return {
            subject: String(r.subject || 'Pamoka'),
            price: Number(r.price) || 0,
            datetime: String(r.datetime || ''),
          };
        })
      : [],
    hidePlatformFooter: true,
  };
}

/** MK-1629 → "Serija MK Nr. 1629" */
export function pvmInvoiceNumberLabel(storedNumber: string): string {
  const m = String(storedNumber || '').trim().match(/^([A-Za-zĀ-ž]+)-0*(\d+)$/i);
  if (m) return `Serija ${m[1].toUpperCase()} Nr. ${parseInt(m[2], 10)}`;
  return `Nr. ${storedNumber}`;
}
