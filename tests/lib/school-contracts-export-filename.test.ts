import { describe, expect, it } from 'vitest';
import { schoolContractsExportFilename } from '@/lib/schoolContractsExport';

const DATE = '2026-08-05';

describe('schoolContractsExportFilename', () => {
  it('names the file after the active filter', () => {
    expect(schoolContractsExportFilename('all', '', DATE)).toBe('sutartys-visos-2026-08-05.xlsx');
    expect(schoolContractsExportFilename('awaiting_school', '', DATE)).toBe('sutartys-nepasirasyta-mokyklos-2026-08-05.xlsx');
    expect(schoolContractsExportFilename('awaiting_parents', '', DATE)).toBe('sutartys-nepasirasyta-tevu-2026-08-05.xlsx');
    expect(schoolContractsExportFilename('incomplete_data', '', DATE)).toBe('sutartys-truksta-duomenu-2026-08-05.xlsx');
    expect(schoolContractsExportFilename('signed', '', DATE)).toBe('sutartys-pasirasytos-2026-08-05.xlsx');
    expect(schoolContractsExportFilename('unsigned', '', DATE)).toBe('sutartys-nepasirasytos-2026-08-05.xlsx');
  });

  it('appends the search term so a surname export is recognisable', () => {
    expect(schoolContractsExportFilename('all', 'serebr', DATE)).toBe('sutartys-visos-serebr-2026-08-05.xlsx');
    expect(schoolContractsExportFilename('all', '  Serebrinskaitė Miglė ', DATE))
      .toBe('sutartys-visos-serebrinskaite-migle-2026-08-05.xlsx');
    expect(schoolContractsExportFilename('signed', 'Ąžuolas', DATE)).toBe('sutartys-pasirasytos-azuolas-2026-08-05.xlsx');
  });

  it('keeps the filename safe and bounded', () => {
    expect(schoolContractsExportFilename('all', '../../etc/passwd', DATE)).toBe('sutartys-visos-etc-passwd-2026-08-05.xlsx');
    expect(schoolContractsExportFilename('all', '???', DATE)).toBe('sutartys-visos-2026-08-05.xlsx');
    const long = schoolContractsExportFilename('all', 'a'.repeat(80), DATE);
    expect(long).toBe(`sutartys-visos-${'a'.repeat(40)}-2026-08-05.xlsx`);
  });
});
