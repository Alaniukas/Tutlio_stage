import { describe, expect, it } from 'vitest';
import {
  GRADE_OPTIONS,
  SCHOOL_YEAR_OPTIONS,
  isArchivedEnrollmentStatus,
  matchesDebtFilter,
  matchesEnrollmentStatusFilter,
  matchesExitDateRange,
  matchesExitReasonFilter,
  matchesMunicipalityFilter,
  matchesSchoolYearFilter,
  studentHasDebt,
  suggestSchoolYear,
} from '@/lib/schoolStudentEnrollment';
import {
  ALL_SCHOOL_STUDENT_EXPORT_COLUMNS,
  buildSchoolStudentExportRows,
  schoolStudentsTableData,
} from '@/lib/schoolStudentsExport';
import { LT_MUNICIPALITIES } from '@/lib/ltMunicipalities';

const t = (key: string) => key;

describe('schoolStudentEnrollment', () => {
  it('suggests school year with Sep–June 13 rule', () => {
    expect(suggestSchoolYear(new Date(2026, 8, 1))).toBe('2026/2027'); // Sep 1
    expect(suggestSchoolYear(new Date(2027, 5, 13))).toBe('2026/2027'); // June 13
    expect(suggestSchoolYear(new Date(2027, 5, 14))).toBe('2027/2028'); // June 14
    expect(suggestSchoolYear(new Date(2027, 0, 15))).toBe('2026/2027'); // Jan
    expect(SCHOOL_YEAR_OPTIONS).toEqual(['2026/2027', '2027/2028']);
  });

  it('exposes grades 0–10 in klasė format', () => {
    expect(GRADE_OPTIONS[0]).toBe('0 klasė');
    expect(GRADE_OPTIONS[5]).toBe('5 klasė');
    expect(GRADE_OPTIONS).toHaveLength(11);
  });

  it('detects debt from manual flag or unpaid counts', () => {
    expect(studentHasDebt({ hasDebtManual: true })).toBe(true);
    expect(studentHasDebt({ unpaidInstallments: 2 })).toBe(true);
    expect(studentHasDebt({ unpaidMonthlyInvoices: 1 })).toBe(true);
    expect(studentHasDebt({ hasDebtManual: false, unpaidInstallments: 0, unpaidMonthlyInvoices: 0 })).toBe(false);
  });

  it('matches enrollment filters', () => {
    expect(matchesEnrollmentStatusFilter('active', 'active')).toBe(true);
    expect(matchesEnrollmentStatusFilter(null, 'active')).toBe(true);
    expect(matchesEnrollmentStatusFilter('left', 'active')).toBe(false);
    expect(matchesEnrollmentStatusFilter('left', 'all')).toBe(true);
    expect(matchesSchoolYearFilter('2026/2027', '2026/2027')).toBe(true);
    expect(matchesSchoolYearFilter(null, '2026/2027')).toBe(false);
    expect(matchesMunicipalityFilter('Vilniaus miesto savivaldybė', 'all')).toBe(true);
    expect(matchesExitReasonFilter('moved_abroad', 'moved_abroad')).toBe(true);
    expect(matchesDebtFilter(true, 'yes')).toBe(true);
    expect(matchesDebtFilter(false, 'no')).toBe(true);
    expect(matchesExitDateRange('2026-05-01', '2026-01-01', '2026-06-01')).toBe(true);
    expect(matchesExitDateRange('2026-07-01', '2026-01-01', '2026-06-01')).toBe(false);
    expect(matchesExitDateRange(null, '2026-01-01', '')).toBe(false);
    expect(isArchivedEnrollmentStatus('left')).toBe(true);
    expect(isArchivedEnrollmentStatus('graduated')).toBe(true);
    expect(isArchivedEnrollmentStatus('active')).toBe(false);
  });

  it('lists all LT municipalities sorted', () => {
    expect(LT_MUNICIPALITIES).toHaveLength(60);
    expect(LT_MUNICIPALITIES).toContain('Vilnius');
    expect(LT_MUNICIPALITIES).toContain('Kaunas');
    expect(LT_MUNICIPALITIES).toContain('Vilniaus raj.');
    expect(LT_MUNICIPALITIES).toContain('Akmenės raj.');
    const sorted = [...LT_MUNICIPALITIES].sort((a, b) => a.localeCompare(b, 'lt'));
    expect(LT_MUNICIPALITIES).toEqual(sorted);
    expect(matchesMunicipalityFilter('Kaunas, Vilniaus raj.', ['Vilniaus raj.'])).toBe(true);
    expect(matchesMunicipalityFilter('Kaunas', ['Vilnius'])).toBe(false);
    expect(matchesMunicipalityFilter('Kaunas', [])).toBe(true);
  });
});

describe('school student export column picker', () => {
  it('keeps default columns when picker omitted', () => {
    const rows = buildSchoolStudentExportRows(
      [
        {
          student: {
            id: 's1',
            full_name: 'Antanas',
            grade: '5 klasė',
            school_year: '2026/2027',
            enrollment_status: 'active',
            municipality: 'Kauno miesto savivaldybė',
          },
          contract: null,
          hasDebt: false,
        },
      ],
      t,
    );
    const { headers, body } = schoolStudentsTableData(rows, t);
    expect(headers).toHaveLength(7);
    expect(headers[0]).toBe('school.studentExportColName');
    expect(body[0]).toHaveLength(7);
    expect(rows[0].schoolYear).toBe('2026/2027');
  });

  it('projects only selected columns in order', () => {
    const rows = buildSchoolStudentExportRows(
      [
        {
          student: {
            id: 's1',
            full_name: 'Antanas',
            grade: '5 klasė',
            school_year: '2026/2027',
            enrollment_status: 'left',
            exit_reason: 'moved_abroad',
            exit_date: '2026-06-01',
            exit_note: 'note',
          },
          hasDebt: true,
        },
      ],
      t,
    );
    const cols = ['studentName', 'hasDebt', 'schoolYear'] as const;
    const { headers, body } = schoolStudentsTableData(rows, t, [...cols]);
    expect(headers).toEqual([
      'school.studentExportColName',
      'school.studentExportColHasDebt',
      'school.studentExportColSchoolYear',
    ]);
    expect(body[0]).toEqual(['Antanas', 'compStu.debtYes', '2026/2027']);
    expect(ALL_SCHOOL_STUDENT_EXPORT_COLUMNS.length).toBeGreaterThan(7);
  });
});
